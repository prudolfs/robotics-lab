# Greenhouse Caretaker

Phase 5 frontend for Robotics Lab's robot-learning project. React Three Fiber and Drei render an authored Blender greenhouse and articulated caretaker using actual Three.js WebGPU; Tailwind and shadcn/ui with Base UI provide the interface. Python runs the authoritative MuJoCo world. Reference and manual teaching controllers can produce versioned demonstrations; a separate PyTorch worker trains saved policies for live learned execution.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm setup:greenhouse
pnpm dev:greenhouse
```

Open `http://127.0.0.1:8086/`. The paired command starts the project-owned FastAPI server on port 8001. Node/pnpm and uv are required; a supported Python interpreter and dependencies are managed locally by uv. No global Laya installation or model credentials are required.

The app connects automatically and creates a ready seed-42 world. **Start collection** runs the reference controller through approach, grasp, lift, delivery, lowering and release. **Pause collection** freezes the Python world; **Resume collection** continues the same run. **Restart seed** restores its initial state and increments the generation; **New seed** chooses a different feasible scenario. **Overview** and **Follow** select the camera. The panel shows stage, elapsed simulated time, delivery, collisions, invalid actions and recent events.

**Reconnect** releases the old session and creates a fresh one. Lost or unavailable servers display retry instructions; disconnecting pauses a running world. A missing WebGPU adapter prevents rendering while connection controls remain usable. The controller, idealized target sensing and abstract grasp are labeled explicitly.

The scene loads six local GLBs: the cutaway greenhouse, Pip caretaker, capsule and three plant variants. **Robot eye** adds inspection from the articulated head mount; it is not controller perception. Head attention/nods, blinking and status lighting are authored. System reduced-motion changes disable decorative head/blink motion and camera easing. **Sound off/on** controls local pickup/delivery cues and defaults off. Asset loading and failure are visible without disabling server reconnection controls. Blender is needed only to rebuild the assets; see the [editable kit guide](../../assets/greenhouse-demo/README.md).

## Teach and review

Choose **Teach manually** while ready/paused, then **Record demonstration** from a reset world. Hold the movement/lift buttons or focus the teaching panel and use W/S, A/D, Q/E, with G/R for close/open. Key release, focus loss and hiding the page clear input; a 250 ms server lease also prevents stale movement. The panel shows measured speed, target range/bearing, lift and holding state. Pause before switching controllers; executed reference/manual transitions are marked as interventions.

Recording captures all executed 20 Hz control steps, before/after observations, actions, physical states, events, both simulated/wall timing, configuration and task outcome. Stop/save retains partial attempts; delivery/failure saves automatically. Reset/disconnect seals the old recording. Live demonstrations start unreviewed and excluded. New random seeds stay within training seeds 0–99.

The library can prepare 20 verified expert demonstrations, load recorded-state playback, scrub frames, inspect actions/observations, save quality notes, include/exclude entries, validate compatibility/splits and export/import portable JSON. Reviews are sidecars and do not rewrite source episodes. Failed/incomplete attempts remain inspectable and cannot be marked usable. Repeating expert collection preserves existing seed episodes and review choices.

Playback uses recorded states and disables live controls; it never re-simulates or sends recorded actions to the robot. The backend separately verifies trajectories by replaying executed actions through MuJoCo. Full local artifacts live under `apps/greenhouse-server/runtime/datasets/v1/`; uploads/exports are limited to 20 MiB, individual episodes to 4 MiB/600 steps, and the store to 200 episodes/256 MiB. `GREENHOUSE_DATASET_DIR` selects another server-side directory. See the [Phase 4 review](../../docs/greenhouse-demo/phase4/README.md) for the workflow, schema, seed rules and current evidence.

## Train and run a learned skill

Prepare reviewed eligible demonstrations, then use **Train policy** in **Teach, train, then watch**. The panel shows persisted progress, fitting loss, complete validation outcomes, corrective sample counts and failures. Defaults are 120 epochs per round and three training-only correction rounds; training is cancellable without blocking the live world.

Choose a saved checkpoint, then **Use selected checkpoint** while ready/paused and **Start collection**. The learned controller and checkpoint ID remain explicit. Learned execution has no reference-controller recovery and cannot be recorded as a Phase 4 demonstration. Validation review plays recorded states independently of live simulation.

The selected local checkpoint delivers on 29/30 validation seeds, 28 clean, compared with 30/30 clean reference runs. Local weights are ignored; a fresh checkout needs data and training. See the [Phase 5 review](../../docs/greenhouse-demo/phase5/README.md) for reproducibility, normalization/loss, remaining failures and screenshots. Reinforcement learning and LangGraph missions remain later phases.

## Development and contracts

```sh
pnpm -C apps/greenhouse-demo dev
pnpm contracts:greenhouse
pnpm test:greenhouse
pnpm build:greenhouse
pnpm test:e2e:greenhouse
```

Vite proxies `/api/v1/greenhouse` to the Python service, including WebSocket upgrades. `GREENHOUSE_SERVER_ORIGIN` changes that server target. Preview uses the same proxy. A deployed static frontend would need a separately hosted Python service and reverse proxy; this phase does not publish either app.

HTTP types come directly from exported Pydantic JSON Schema. A small fetch client validates responses with Ajv. WebSocket types and validation come from separate discriminated message schemas. The frontend uses TypeScript **7.0.2**; no compiler downgrade or OpenAPI generator is needed. Generated files are committed and checked for drift, and are excluded from manual formatting/linting. Regenerate after editing Python contracts.

The connection hook owns transport state, an abortable four-second HTTP startup window, a stream watchdog, bounded pending commands, and generation/session checks. An accepted reset acknowledgment advances the generation barrier before new snapshots arrive. Old connection callbacks cannot change a new connection's state. There is no client-side simulation or silent replay fallback. The renderer interpolates only two authoritative snapshots, snaps on reset/pause/attachment transitions and never extrapolates physics. Wheel angles and lift height come from Python.

## Browser checks and captures

Playwright uses local Chrome with WebGPU support. It starts the paired development command if the app is not already running, and uses graceful shutdown to stop both services afterward. Fourteen checks cover the previous collection/connection/asset/camera/motion/sound cases, plus manual recording, focus/release stopping, source-preserving review, exact recorded playback, expert collection, validation and export/import, learned checkpoint delivery and active-training responsiveness/cancellation. The two checkpoint-dependent cases explicitly skip without a completed local checkpoint. Teaching tests save automated attempts; use a separate `GREENHOUSE_DATASET_DIR` for an isolated test service when keeping them out of your normal library. The root test command also validates GLB geometry/pivots/resources and manifest alignment with compiled MuJoCo geometry.

```sh
GREENHOUSE_CAPTURE=1 pnpm test:e2e:greenhouse
```

This additionally writes current captures and portable demonstration examples to `docs/greenhouse-demo/phase5/`. `node scripts/greenhouse-phase4/review.mjs` prepares/reuses the expert set, imports the explicitly excluded automated manual example, validates the library and captures desktop/mobile review views. Prior Phase 3 asset/performance evidence remains archived. See the [Phase 4 review](../../docs/greenhouse-demo/phase4/README.md), [implementation plan](../../docs/greenhouse-demo.md) and [server guide](../greenhouse-server/README.md).

To check the production bundle, start `pnpm -C apps/greenhouse-server start` and `pnpm -C apps/greenhouse-demo preview` in separate terminals, then run `GREENHOUSE_E2E_URL=http://127.0.0.1:4186 pnpm test:e2e:greenhouse`. Setting that URL skips Playwright's automatic development-server startup.
