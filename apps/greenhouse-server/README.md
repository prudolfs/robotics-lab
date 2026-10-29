# Greenhouse server

Project-owned Python service for Greenhouse Caretaker. Phase 2 provides an independent fixed-step MuJoCo world, a scripted collection controller, ephemeral sessions and validated live WebSocket commands. Phase 5 adds separate-process PyTorch training and saved learned policies. Phase 6 adds Gymnasium/PPO practice, a staged curriculum and sealed evaluation; LangGraph missions remain a later phase.

Phase 3 adds Blender-authored presentation in the frontend without changing the simulation or API. The server suite checks the asset manifest against the compiled MuJoCo chassis, wheels, pots, walls and task dimensions. See the [Phase 3 review](../../docs/greenhouse-demo/phase3/README.md).

Phase 4 adds manual control, full-resolution episode recording, a persistent local demonstration library, source-preserving reviews, schema/split/trajectory validation and portable JSON export/import. See the [Phase 4 review](../../docs/greenhouse-demo/phase4/README.md).

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm setup:greenhouse
pnpm dev:greenhouse
```

Prerequisites are Node/pnpm and [uv](https://docs.astral.sh/uv/getting-started/installation/). uv uses `.python-version` to select Python 3.11.15, downloading it if necessary, and installs the locked project environment into `.venv`. Dependencies are not installed globally. No Laya service, NVIDIA GPU, Blender, model-provider account or API key is needed for this phase.

The paired command starts the API at `http://127.0.0.1:8001` and Vite at `http://127.0.0.1:8086`. Ctrl-C stops both processes, including the Python reload process. Existing port conflicts are reported before either app starts. Run `pnpm -C apps/greenhouse-server dev` to start only Python, or `pnpm -C apps/greenhouse-server start` without reload. Keep one API worker: the session registry is local to one process.

## API and contracts

The prefix is `/api/v1/greenhouse`:

| Route | Behavior |
| --- | --- |
| `GET /health` | Status, API version and package version |
| `GET /capabilities` | Simulation and training are enabled; language missions remain false |
| `POST /sessions` | Create a ready seeded world; body `{ "seed": 42 }` |
| `GET /sessions/{session_id}` | Read the current world, counters and generation |
| `DELETE /sessions/{session_id}` | Idempotently close the session |
| `WS /sessions/{session_id}/stream` | Hello, snapshots at up to 10 Hz, command acknowledgments and idle 1 Hz heartbeats |

HTTP models and the two WebSocket unions are Pydantic definitions in `src/greenhouse/api/contracts.py`. `pnpm contracts:greenhouse` exports JSON Schemas and generates TypeScript model types. The browser uses a small typed fetch client and validates HTTP and WebSocket payloads at runtime. It stays on TypeScript 7 and has no OpenAPI client/generator dependency. FastAPI's automatic `/docs` and `/openapi.json` remain useful server inspection tools.

OpenAPI describes HTTP only. The separate `websocket-client.schema.json` and `websocket-server.schema.json` define the streaming protocol. `pnpm check:contracts:greenhouse` fails when either Python-exported schemas or generated TypeScript types are stale.

Every stream envelope has `api_version`, `session_id` and `generation`; server messages also include a simulation `tick`. Each control tick is 50 ms and contains ten 5 ms physics steps. Coordinates are Python Z-up metres with named `{x,y,z}` vectors. The renderer maps these to Three.js `(x,z,-y)`. Snapshots include actual poses, wheel/lift state, delivery status, collision/invalid-action counts and recent events.

Example command after creating a session and receiving its initial state:

```json
{
  "api_version": "1",
  "kind": "reset",
  "session_id": "the-created-session-id",
  "generation": 0,
  "request_id": "reset-1"
}
```

Supported command kinds are `start`, `pause`, `reset`, `new_seed` and `ping`. Start/resume is valid only for ready/paused worlds; pause is valid only while running. Reset restores the current seed; new_seed chooses a different seed. Both increment the generation and return a ready world. Ping only acknowledges connectivity.

Phase 4 adds `set_controller` (`controller: "manual" | "scripted_reference"`) while ready/paused, `record` from a fresh ready world, `stop_recording`, and `manual` with an `action` object. Manual axes `throttle`, `turn`, `lift` lie in `[-1,1]`; `grip` is `hold`, `close` or `open`. Actions renew a 250 ms input lease, and grip requests are consumed once. Pause/reset/disconnect clear inputs. Neutral stop is accepted without waiting for the manual rate gate; stale generations and non-running/manual states still reject input. New random seeds now use the declared training range 0–99. Session views/snapshots include recording state, the latest saved episode ID, save errors and structured observations.

Recordings retain every executed 20 Hz step independently of 10 Hz browser snapshots. Controller transitions mark executed interventions; reference/manual runs are labeled separately or mixed. Successful/failing terminal states auto-save; explicit stop, reset and disconnect seal partial attempts. Save failures remain visible and block destructive reset while retaining the in-memory recording. Empty zero-step attempts are not saved. Successful files persist independently of ephemeral sessions.

Stale generations, mismatched sessions and invalid state transitions are rejected. Request IDs are idempotent within a bounded cache of 64 acknowledgments; reuse means retrying the same operation, not submitting a different command. Accepted commands are rate-limited to 10 Hz. Unknown/oversized/binary input receives a protocol error. Each session allows one stream.

State commands retain the 10 Hz gate. Continuous manual inputs have their own 20 Hz maximum lane (the browser sends at 10 Hz), and do not wait for snapshot publication before the receiver can accept the next input. The publisher streams their resulting physics state independently. The frontend keeps state controls disabled briefly after acknowledgment so a quick mode-selection/record sequence does not violate the state-command interval.

The lifespan clock advances connected running worlds at 20 control Hz. Publication sends latest state at no more than 10 Hz; it does not queue historical frames for slow clients. Sends are serialized, have a two-second timeout, and a failed/closed stream pauses its world. If processing falls behind, simulated time slows instead of skipping steps or accumulating an unbounded catch-up batch.

## Local lifecycle and limits

Sessions are in-memory, capped at 16 and expire after 120 seconds without an attached stream or HTTP activity. A sweep runs every 30 seconds, and creation also prunes idle entries. Closing/deleting a session ends its stream. Reloading/restarting Python loses all sessions; the browser detects closure and offers a fresh connection. Lifespan shutdown cancels both the clock and sweep and clears the registry.

This is a loopback development service with random session IDs, not an authenticated multi-user deployment. Vite proxies HTTP/WebSocket requests to port 8001, so no cross-origin browser HTTP configuration is needed. The stream accepts browser origins on local ports 8086 and 4186. `GREENHOUSE_ALLOWED_ORIGINS` can provide a comma-separated replacement list. Do not run several API workers or expose this development setup as a public service.

`src/greenhouse/simulation` is independent of FastAPI, Pydantic and training libraries. Its `World` exposes reset, observations, fixed-step actions, reward/termination and state snapshots; `Reference` chooses actions solely from declared observations. MuJoCo 3.17.0 and NumPy 2.4.6 are locked dependencies. A compiled immutable model is shared while each world owns independent simulation data.

The base has planar support and velocity servos; wheel angles visualize measured body motion. There is no rolling/slip or actuator-fidelity claim. Pickup is a constrained attachment with measured-speed, alignment and height gates. Floor, wall and pot contacts are real MuJoCo contacts for the applicable collision groups; the base's planar joints support it without wheel/floor traction. The floor-level tray is a delivery region, not a raised receptacle with walls. Camera perception, physical fingers, carried-load force transfer and plant manipulation remain later work.

## Demonstration datasets

| Route | Behavior |
| --- | --- |
| `GET /dataset` | Summaries, source/split/outcome/review state, eligible count and local limits/location |
| `POST /dataset/expert` | Prepare unique training seeds, body `{"seeds":[0,1,2]}`; default 0–19; existing expert episodes/reviews preserved |
| `GET /episodes/{id}` | Versioned source entry and a static scene template for recorded-state playback |
| `PATCH /episodes/{id}/review` | Separate `label`, `excluded`, `note` sidecar; never rewrites the raw episode |
| `POST /dataset/validate` | Re-simulation, schema/configuration, source/completion/split checks; explicit eligible training IDs and skipped/error reasons |
| `GET /dataset/export` | Portable JSON bundle; optional repeated `ids` query parameters select smaller exports |
| `POST /dataset/import` | Bounded streamed JSON upload; full validation before new artifacts are written; identical IDs preserve existing reviews |

Routes use the same `/api/v1/greenhouse` prefix. Models are exported through the existing Pydantic JSON Schema → TypeScript flow. HTTP error details explain incompatible configurations, checksum conflicts, invalid split labels and storage/size limits. Bulk collection, validation and import run in a worker thread; a single dataset-operation lock bounds simultaneous jobs. This is not the future training worker.

Default artifacts are `runtime/datasets/v1/<id>.json` with separate `<id>.review.json`, relative to the server working directory used by pnpm. `GREENHOUSE_DATASET_DIR` overrides the directory. Limits are 600 steps/4 MiB per episode, 20 MiB/100 episodes per import/export, and 200 episodes/256 MiB per store. Raw episodes are immutable through the API; hashes cover canonical episode serialization, while reviews remain mutable. Imports do not overwrite existing conflicting sources or review decisions.

Seeds 0–99 are training, 10000–10029 validation, and 20000–20099 reserved final test. Recording/import refuses final test scenarios; unknown seeds remain unassigned and ineligible. Training readiness requires current configuration, matching seeded action/state trajectories, correct expert/intervention/source and completion labels, a clean successful training episode, usable quality and explicit inclusion. Older Phase 0 feasibility data is incompatible and is not silently converted. Documentation contains a small expert example and an excluded automated manual-input example; they are not claimed as human demonstrations.

Saved datasets persist across restarts; live sessions and an unsaved in-memory recording do not. Keep one API worker and one writer per artifact directory. Phase 5 adds a separate training worker, checkpoints and persisted local jobs; see below. Generated local datasets/experiments belong under ignored `runtime/`; only small schema/review fixtures and evidence are committed in docs.

## Learned policies and training

Phase 5 implements a small CPU PyTorch behavior-cloning policy, training-only corrective labels, complete validation episodes, persisted checkpoints and explicit live learned selection. The selected local checkpoint delivers on 29/30 validation seeds, 28 clean; the reference achieves 30/30 clean. Phase 6 has since evaluated the reserved test suite once under a frozen selection; see below.

The `/training` catalog and `/training/jobs` start/status/cancel routes manage one owned subprocess. `/training/checkpoints/{id}` exposes evaluated metadata and recorded validation states. `set_controller` also accepts `learned_policy` with `checkpoint_id` while ready/paused. Learned execution is separate from the unchanged Phase 4 demonstration schema and cannot be recorded into it. Inference uses no reference recovery.

`GREENHOUSE_TRAINING_DIR` overrides `runtime/training/v1/`. Models are local ignored artifacts, so a fresh checkout must prepare eligible demonstrations and train. Checkpoint activation verifies versions, features, configuration and weights integrity. CPU training is bounded and cancellation/shutdown stops its owned worker. See the [Phase 5 guide](../../docs/greenhouse-demo/phase5/README.md) for commands, model/loss, artifact identities, exact limits, remaining failures and measured evidence.

## PPO practice and comparison

Phase 6 extends training requests with `algorithm: "ppo"`, an explicit BC `parent_checkpoint`, and `ppo_steps` (3,072–98,304 in multiples of 3,072; default 36,864). The UI uses a 240-second budget. A separate CPU worker fine-tunes the exact actor format with hybrid PPO-Clip and a training-only value head; the original remains available, and a regressing job retains its BC parent. Job histories include reward components, losses, KL, steps and curriculum stages. `node scripts/greenhouse-phase6/train.mjs` runs/reuses the documented three-seed experiment through the API.

`POST /api/v1/greenhouse/training/compare` accepts two distinct checkpoint IDs and a validation seed 10000–10029. It measures two independent learned runs and a fresh reference from the same initial world, returning recorded states and outcomes for playback. Training and comparison run outside the API event loop with bounded concurrency.

The Gymnasium wrapper leaves the base physics/configuration unchanged and restricts practice to scenario seeds 0–99. Final-test access is confined to the offline sealed evaluation runner. The selected PPO and BC both deliver on 93/100 final-test seeds, 92 clean; the reference achieves 100/100 clean. PPO reduces rejected actions from 917 to 2 without improving completion. These test seeds are now inspected, so future tuning requires a fresh evaluation suite or explicit disclosure of reuse. See the [Phase 6 guide](../../docs/greenhouse-demo/phase6/README.md) for initialization, PPO/reward settings, budgets, candidate regressions, the audited reference-runner correction and complete evidence.

## Checks

```sh
pnpm test:greenhouse
pnpm build:greenhouse
pnpm test:e2e:greenhouse
pnpm benchmark:greenhouse
node scripts/greenhouse/lifecycle.mjs
```

The benchmark writes a reference report and seed-42 observation/action/state trace under `docs/greenhouse-demo/phase2/`; it uses seeds 0–99 and 10000–10029, leaving final test seeds untouched. It is a scripted-controller benchmark, not a learning result. See the [Phase 2 review](../../docs/greenhouse-demo/phase2/README.md).

The Python wrappers also expose `test`, `lint`, `typecheck`, `build` and `contracts`. The source package builds a wheel and source archive through `uv build`. Tests cover seeded worlds, task preconditions, timeout/freeze, contacts, complete reference episodes, session lifecycle and bounded streaming. Mypy checks our Python modules strictly; the native MuJoCo binding lacks distributed type stubs and is treated as an untyped library boundary.
