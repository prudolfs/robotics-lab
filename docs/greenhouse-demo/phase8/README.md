# Phase 8 — Learning experience, reliability and release

Greenhouse Caretaker now has a complete Watch / Teach / Train / Compare / Missions workspace, an optional observation/reward inspector, explicit failure replay, bounded service ownership and a verified fresh-install learning path. This closes the first project scope. The [Later possibilities](../../greenhouse-demo.md#later-possibilities) remain deferred; no deployment or social post has been published.

## Try it

```sh
pnpm install --frozen-lockfile
pnpm setup:greenhouse
pnpm dev:greenhouse
```

Install Node/pnpm, [uv](https://docs.astral.sh/uv/), and a browser with WebGPU. uv installs the locked Python 3.11 environment locally. Open http://127.0.0.1:8086/; FastAPI runs on port 8001. Ctrl-C stops the paired development command. Reference collection, manual teaching and structured missions require no external model provider.

Use Cmd/Ctrl+P to search commands, or Cmd/Ctrl+1–5 for the tabs. Drag the separator or use its arrow-key controls to resize; mobile uses a vertical split. See the [workspace update](../updates/2026-10-29-workspace.md) for shortcuts, Query/Zustand ownership, selection and replay race handling. That workspace was approved before Phase 8.

Watch includes **Inspect observations and rewards**. It exposes the actual idealized robot-local observations with units, demonstration step/action/reward when reviewing a recording, and the latest saved PPO batch reward components. The batch is explicitly labeled separately from the live step: policy inference does not perform reward optimization. Train's saved validation replay buttons identify delivery or failure outcomes; scrub a failed rollout without issuing live actions.

## Fresh checkout and training

A new checkout contains source, assets, JSON evidence and media, but no model weights. First verify reference collection through **Start collection**. To create a learned policy:

1. In Teach, choose **Collect 20 expert demos**, then **Validate dataset**. Training uses reviewed seeds 0–19. For human teaching, choose manual control in Watch, reset, then record in Teach; review your attempts before including them.
2. In Train, keep 120 epochs and three correction rounds, then **Train policy**. It runs a bounded CPU worker with a 180-second budget. This is a compact reproduction run, not a guarantee of identical weights or scores.
3. Select the resulting saved compatible checkpoint, reset the world, choose **Use selected checkpoint**, then start collection. The controller stays learned; no reference substitution repairs failures.
4. Inspect validation outcomes and failed replays before running PPO practice from the BC actor. The [Phase 6 guide](../phase6/README.md) reproduces the historical three-run PPO experiment and describes its separate 240-second-per-run budget.
5. Missions uses the shared checkpoint selection. Structured collection/dock plans work without credentials. Optional language drafts require server-side `GREENHOUSE_MISSION_MODEL` and `OPENAI_API_KEY`, produce a supported plan for explicit review, and never call a model in the motor loop.

For an automated fresh-artifact reproduction after setup/build:

```sh
pnpm build:greenhouse
pnpm verify:greenhouse
```

The verifier starts its own API on 8007 and production preview on 4197, creates empty datasets/training/mission directories under `.temp`, completes reference delivery, collects 20 expert episodes, trains, executes the saved actor live, checks resets, and runs two start/cancel cycles with concurrent-worker rejection. It closes both services and writes `fresh-learning.json` here; raw service logs are retained in its temporary runtime directory. Use `GREENHOUSE_CHECKOUT_ROOT` to verify a separate checkout and `GREENHOUSE_RELEASE_OUTPUT` to redirect evidence. Its output is a learning reproduction, not a sealed final-test evaluation.

This release was checked from a separate local checkout with a new `node_modules`, new `.venv` and empty runtime artifacts. Locked install, `pnpm setup:greenhouse` and production build passed. The verifier produced:

| Measurement | Fresh-install result |
| --- | --- |
| Reference, live seed 42 | Delivered in 218 control ticks; zero collisions/rejected actions |
| BC recipe | 120 epochs/round, three training-only correction rounds, random seed 7 |
| Training cost | 40.57 wall seconds; peak worker RSS 491.05 MiB |
| Selected fresh actor | `4df4d10ba1384048809bbf46c557ab1a-r3` |
| Validation | 27/30 deliveries, all clean; three delivery timeouts |
| Learned actor, live seed 42 | Delivered in 215 ticks; zero collisions/rejected actions |
| Two repeated job cycles | Both cancelled; duplicate start returned HTTP 409 |

[Fresh-install evidence](fresh-learning.json) includes identities, metrics and isolated artifact location. Data episode IDs/order and runtime conditions can change training outcomes despite the same random seed. This new actor does not replace the historical frozen selection. Reproduction was measured on this machine, not a cross-device determinism or speed guarantee.

## Evaluation disclosure

No reward, policy architecture, curriculum or hyperparameter tuning was added in Phase 8. The final-test seed suite 20000–20099 was already inspected in Phase 6. Phase 8 cites that historical report; it does **not** claim a fresh untouched test or reselect a checkpoint from those outcomes. The new smoke actor above is validation-only and was not run against final-test seeds.

| Historical frozen Phase 6 actor | Final deliveries | Clean deliveries |
| --- | ---: | ---: |
| Scripted reference | 100/100 | 100/100 |
| BC parent | 93/100 | 92/100 |
| Selected PPO, seed 27 round 2 | 93/100 | 92/100 |

See the [corrected authoritative report](../phase6/final-test.json) and [audit disclosure](../phase6/README.md#reference-runner-audit-correction). PPO reduced rejected actions but did not improve completion over BC. Historical BC validation was 29/30 delivered, 28 clean; the newly reproduced BC actor scored 27/30 clean and must be read as a separate experiment. Historical PPO fine-tuning cost was 77.83 worker seconds across three runs; initialization, data preparation, rendering and API startup are separate costs.

Ideal target offsets, an abstract constrained attachment/grasp and planar wheeled dynamics remain explicit. Robot-eye images are not learned perception. Head gestures and sound are authored. Docking and mission heading alignment are scripted; collection uses the selected actor. Multi-capsule missions extend the single-object skill beyond its original validation distribution: the [four-scenario mission audit](../phase7/README.md#measured-limits) completed two routines and stopped two carrying failures. These simulations establish no hardware-transfer result.

## Architecture and retention

The browser renders authoritative Python snapshots. REST data uses typed, runtime-validated Pydantic-derived contracts and TanStack Query; WebSocket updates drive motion. Zustand owns UI preferences and one exclusive replay source, with request tickets and session/generation checks. Reviews remain separate from immutable episode sources. Headless training and live execution use the same MuJoCo world; separate workers keep the API responsive. LangGraph/SQLite stores orchestration state, not resumable physics.

| Resource | Bound / lifecycle |
| --- | --- |
| Sessions | 16 sessions, one stream owner each; disconnected sessions expire after 120 s (30-second sweep) |
| Stream | At most 10 snapshots/s; latest state only, no per-frame history queue; 2-second send timeout |
| World / recording | 600 control steps per collection, 16 retained events, 64 cached command acknowledgements |
| Browser interpolation | Two live snapshots; replay frames are bounded by the artifact contracts |
| Dataset | 200 episodes / 256 MiB store, 4 MiB per episode; 20 MiB and 100 episodes per import/export |
| Training | One active worker, 12 retained jobs, 512 MiB creation budget with result reserve, 64 MiB input snapshot; two-policy inference cache |
| Worker shutdown | Request cancellation, allow 3 s; terminate, allow 3 s; kill and reap if still unresponsive |
| Missions | Four active, 32 persisted records / 64 MiB creation-time budget; 3,600 ticks and one bounded recovery per mission |

Budgets check creation/import paths rather than providing automatic archival or a hard filesystem quota. Histories are retained until the user archives them or chooses fresh artifact directories. Do not delete artifacts from an active service. Set `GREENHOUSE_DATASET_DIR`, `GREENHOUSE_TRAINING_DIR` and `GREENHOUSE_MISSION_DIR` to retain experiments outside the checkout. Reset/disconnect pauses or invalidates physical work; an old SQLite checkpoint cannot control a replacement session.

The new release regressions saturate a manual recording at 600 steps, check 64 acknowledgements/16 events, execute repeated resets, and launch a real subprocess that ignores termination to verify forced shutdown and reaping. Existing checks cover capacity, expiry, owner conflicts, stale commands, immutable reviews, failed/cancelled jobs and incompatible weights. The browser fixture deletes test-owned sessions after each test so the full suite respects the same 16-session limit rather than exhausting it. Rendered replay poses are checked to a 1e-12 capsule-coordinate tolerance to allow floating-point presentation roundoff. Async renderer initialization is isolated in its own Suspense boundary, with a delayed-initialization regression that keeps workspace controls usable.

## Local production and deployment requirements

```sh
pnpm build:greenhouse
# two terminals:
pnpm -C apps/greenhouse-server start
pnpm -C apps/greenhouse-demo preview
```

The preview uses port 4186 and proxies API/WebSocket traffic to 8001. Keep **one** API worker: simulation and job ownership are process-local. A persistent local host needs Python/uv, CPU/RAM for PyTorch, writable durable artifact directories and orderly shutdown. A frontend host alone cannot run this application. For a same-origin proxy, forward `/api/v1/greenhouse` including WebSocket upgrade and allow that browser origin through `GREENHOUSE_ALLOWED_ORIGINS`; `GREENHOUSE_SERVER_ORIGIN` configures Vite's development/preview proxy target.

This release is a loopback development/research service. Random session IDs and origin checking are not user authentication. A public multi-user deployment would need explicit authentication, resource isolation and durable ownership design; those are not included or deployed here. A browser refresh creates a new session, and restarting the service retains artifacts but does not resume physical motion.

## Documentation and media

- [Frontend guide](../../../apps/greenhouse-demo/README.md) — controls, recording/review, practice, missions and preview.
- [Server guide](../../../apps/greenhouse-server/README.md) — endpoints, transport ownership, local environment and artifact limits.
- [Editable Blender kit](../../../assets/greenhouse-demo/README.md) — sources, pivots and repeatable exports; no Blender changes were needed for this phase.
- [Phase 4 datasets](../phase4/README.md), [Phase 5 fitting](../phase5/README.md), [Phase 6 PPO](../phase6/README.md), [Phase 7 missions](../phase7/README.md).
- [Five square post screenshots](../../../apps/greenhouse-demo/screenshots/README.md), [preview GIF](../../../apps/greenhouse-demo/media/preview.gif), [7.2-second preview MP4](../../../apps/greenhouse-demo/media/preview.mp4) and [capture identities](../../../apps/greenhouse-demo/media/capture.json).

The comparison screenshot shows BC, PPO and reference on validation seed 10006. Both learned actors fail pickup; reference completes. The preview GIF and MP4 share the global showcase’s eight live scripted-reference collection frames over 7.2 seconds. Separate stills show live learned carrying and a live mission after its first delivery. Regenerate screenshots with `pnpm screenshots:greenhouse` against a running app with the documented BC/PPO artifacts; regenerate both previews with `pnpm readme:gif`. Nothing has been posted to LinkedIn.

The root README describes all five projects; `pnpm readme:gif` builds a five-segment global animation, including reference-driven Greenhouse. It starts an isolated empty-artifact API for that segment, so the global showcase does not require ignored model weights. During clean regeneration, SLAM's worker builder exposed an undeclared root-hoisted esbuild binary dependency; it now declares app-local esbuild and resolves it from SLAM's package. No SLAM algorithm changed.

No offline application showcase is included. The app reports server unavailability and offers reconnect; it does not silently substitute a canned run. The standalone checked-in screenshots/GIF/MP4 can be viewed without Python.

## Verification

- 98 Python tests passed, including real training/mission/worker subprocess checks; Ruff and strict mypy passed.
- 10 frontend unit tests, strict TypeScript, Biome, contract checks and six-GLB asset validation passed; Python wheel/source and Vite production builds passed.
- 214 shared-package tests passed, plus 36 Warehouse, 30 Drone and 19 SLAM tests. All five applications built and ran through the header capture.
- The global animation was decoded and verified at 1200 × 676, 40 frames, 36 seconds; frames 32–39 show Greenhouse. The local preview reuses those eight frames over 7.2 seconds. [Global frame metadata](../../readme-header.json) and [local preview metadata](../../../apps/greenhouse-demo/media/preview.json) record this explicitly.
- All 22 production Chrome/WebGPU browser checks passed together with no skips, covering loading/connection failure, reference and learned delivery, teaching, dataset roundtrip, job cancellation, recorded comparison, three-capsule missions, keyboard/mobile layout, stale-response protection and the observation inspector.

Existing advisories: large Three.js/frontend bundle chunks, the Vite SWC plugin migration suggestion, and Gymnasium's intentionally unbounded observation-space warning. A current WebGPU-capable browser is required. Optional live language-provider access was not exercised; provider behavior is covered with controlled tool tests.
