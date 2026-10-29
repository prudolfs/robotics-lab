# Workspace, state and UI tools — 2026-10-29

After Phase 7, the interface had become one long page. Reviewing datasets, training and missions scrolled the simulation out of view, while checkpoint selection and three independent replay mechanisms could compete for the displayed state. This update turns the app into a workspace and separates interface state, cached server data and the live simulation stream.

The design takes its tabbed inspector from `apps/simulator` and its split-panel pattern from the sibling `qd-editor` project. There are no detachable or draggable-out panels. Phase 8 remains outside this update.

## Implementation checklist

- [x] Keep the simulation visible while each inspector panel scrolls independently.
- [x] Add Watch, Teach, Train, Compare and Missions tabs; preserve form values when switching tabs.
- [x] Add a resizable desktop split and a vertical split below 900 px, with keyboard-accessible separators.
- [x] Use Zustand for panel/camera selection, layout preferences, checkpoint selection and exclusive replay ownership.
- [x] Preserve an explicit checkpoint choice when background polling finds a newer completed job.
- [x] Ignore stale replay responses after switching source or returning to live.
- [x] Use TanStack Query for REST catalogs, checkpoint details, episode caching and mutation invalidation.
- [x] Keep the existing authoritative WebSocket simulation and generated Pydantic contracts.
- [x] Add a searchable command palette, shortcut hints and TanStack Hotkeys.
- [x] Replace native selects with shadcn/Base UI popup selects.
- [x] Add sortable, searchable, paginated TanStack tables for demonstrations, checkpoint candidates and comparisons.
- [x] Add a shadcn/Recharts supervised fitting-loss chart, keeping task success metrics separate.
- [x] Install the official shadcn skill and record it in `skills-lock.json`.
- [x] Remove the obsolete `.claude/skills` link; retain the actual Laya and shadcn skills under `.agents/skills`.
- [x] Complete final regression checks and record their results below.
- [ ] User review of the updated workspace in the browser.

## Try the workspace

```sh
pnpm dev:greenhouse
```

Open http://127.0.0.1:8086/. The simulation toolbar contains run/pause, restart, new seed, camera and sound controls. Drag the separator or focus it and use the arrow keys to resize. Watch contains connection/controller state and physical counters; Teach contains recording, manual controls and the demonstration library; Train contains imitation training and the shared saved-checkpoint selection; Compare contains PPO practice and same-seed policy comparison; Missions contains structured plans and persistent graph inspection.

Choose **Teach manually** in Watch, then open Teach to record and control the robot. Leaving Teach or opening the command palette releases held teaching controls. Mission and comparison workflows use the same saved-checkpoint choice from Train where applicable. Comparing policy A/B does not change the shared checkpoint choice.

| Action | macOS | Windows/Linux |
| --- | --- | --- |
| Search commands | Cmd+P | Ctrl+P |
| Open Watch / Teach / Train / Compare / Missions | Cmd+1 / 2 / 3 / 4 / 5 | Ctrl+1 / 2 / 3 / 4 / 5 |
| Run or pause the live world | Cmd+Enter | Ctrl+Enter |
| Restart seed | Cmd+Shift+R | Ctrl+Shift+R |
| New seed | Cmd+Shift+N | Ctrl+Shift+N |

Action shortcuts respect the same availability rules as buttons and are ignored while editing inputs. The palette shortcut also works from inputs. Commands that require form choices open their panel; they do not silently replace entered training or mission settings. Unavailable commands show a reason where supplied. Escape closes the palette.

Only interface preferences are persisted in browser storage (`greenhouse-workspace-v1`): panel, camera, split sizes and checkpoint ID. Live sessions, replay payloads and training artifacts are not stored there. A missing saved checkpoint is reconciled against the server catalog. Reloading creates the usual new live session; it does not resume robot motion.

## State ownership

| Owner | Data and responsibilities |
| --- | --- |
| Zustand (`src/state/workspace.ts`) | UI preferences and selections; one discriminated live/episode/validation/comparison source; one replay position and playback flag. Monotonic request tickets reject earlier responses. Session/generation changes invalidate previews. |
| TanStack Query (`src/api/query.ts`) | Validated REST data cached by catalog or artifact ID. Selected checkpoint requests consume cancellation signals. Dataset edits invalidate summaries and training eligibility. Completed checkpoint details remain cached as immutable artifacts. |
| Session hook and WebSocket | Authoritative Python snapshots, command acknowledgement and connection lifecycle. Query does not poll per-frame robot poses or duplicate physics. |
| Python service | MuJoCo state, datasets/reviews, training jobs, model weights and LangGraph mission state. Existing endpoints and artifact formats remain the source of truth. |

Training and mission catalogs poll every five seconds when idle, every second while relevant work is active. Dataset summaries refresh after recording signals and successful dataset operations. Query retries are disabled so a failed mutation is not repeated automatically; existing action messages explain failures. The shared playback timer advances at the recorded control interval, and playback never sends recorded actions to the server.

Base UI remains the component foundation. The project keeps TypeScript 7, React Three Fiber/Drei, Three.js WebGPU and Tailwind. No Node backend replaces FastAPI, and Blender is not required for this GUI update.

## Verification

Workspace unit regressions cover checkpoint stability, removed-artifact reconciliation, exclusive replay ownership, stale responses, session/generation invalidation, review response isolation and playback boundaries. Browser checks exercise command search, shortcut/input behavior, viewport containment, resizing persistence, mobile layout, checkpoint request races and late episode responses, alongside the existing live teaching/training/comparison/mission flows.

Verification completed:

- 10 unit tests passed, including seven workspace regressions and the existing three protocol cases.
- Frontend typechecking and lint passed; the production build passed. Vite still reports large bundle chunks, including the WebGPU renderer.
- The full 20-case Chrome run passed 19 cases and hit one WebGPU startup timeout in the workspace layout test. All three workspace cases then passed together on an isolated rerun; every case passed with no skips. This is a recorded browser-startup flake, not a claim of an uninterrupted 20/20 run.
- The real learned three-capsule mission, pause/resume, persistent graph inspection, learned delivery, training cancellation, recorded replay, comparison and dataset roundtrip all passed.
- Screenshot review recorded no browser errors and a mobile document exactly 390 × 844 px, with no page overflow. See [review metadata](workspace/review.json).
- `git diff --check` passed.

Screenshots: [Watch](workspace/watch.png), [Train and fitting-loss chart](workspace/train.png), [command palette](workspace/commands.png), [mobile split](workspace/mobile.png).

Recreate the screenshots with `node scripts/greenhouse-workspace/review.mjs` against the running normal app; `GREENHOUSE_REVIEW_URL` selects another frontend. It inspects existing data without starting training or collecting demonstrations.

Browser tests use a separate API on port 8005 and frontend on 4190, with copies of local datasets and trained checkpoints under `.temp/greenhouse-workspace/server/`, so they do not modify the normal library on port 8001. Checkpoint-dependent tests require local ignored training artifacts and explicitly skip on a fresh checkout without them.

```sh
pnpm -C apps/greenhouse-demo test
pnpm -C apps/greenhouse-demo typecheck
pnpm -C apps/greenhouse-demo lint
pnpm -C apps/greenhouse-demo build
GREENHOUSE_E2E_URL=http://127.0.0.1:4190 pnpm -C apps/greenhouse-demo test:e2e
```

The browser URL override expects the isolated frontend/backend to be running already. Ordinary `pnpm test:e2e:greenhouse` can start the normal paired development setup. Avoid `GREENHOUSE_CAPTURE=1` for routine regression runs: it refreshes historical phase captures. Workspace screenshots use their own update directory.
