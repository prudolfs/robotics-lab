# Greenhouse server

Project-owned Python service for Greenhouse Caretaker. Phase 2 provides an independent fixed-step MuJoCo world, a scripted collection controller, ephemeral sessions and validated live WebSocket commands. Training jobs and LangGraph missions arrive in later phases.

Phase 3 adds Blender-authored presentation in the frontend without changing the simulation or API. The server suite checks the asset manifest against the compiled MuJoCo chassis, wheels, pots, walls and task dimensions. See the [Phase 3 review](../../docs/greenhouse-demo/phase3/README.md).

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
| `GET /capabilities` | Simulation is enabled; training/language missions remain false |
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

Stale generations, mismatched sessions and invalid state transitions are rejected. Request IDs are idempotent within a bounded cache of 64 acknowledgments; reuse means retrying the same operation, not submitting a different command. Accepted commands are rate-limited to 10 Hz. Unknown/oversized/binary input receives a protocol error. Each session allows one stream.

The lifespan clock advances connected running worlds at 20 control Hz. Publication sends latest state at no more than 10 Hz; it does not queue historical frames for slow clients. Sends are serialized, have a two-second timeout, and a failed/closed stream pauses its world. If processing falls behind, simulated time slows instead of skipping steps or accumulating an unbounded catch-up batch.

## Local lifecycle and limits

Sessions are in-memory, capped at 16 and expire after 120 seconds without an attached stream or HTTP activity. A sweep runs every 30 seconds, and creation also prunes idle entries. Closing/deleting a session ends its stream. Reloading/restarting Python loses all sessions; the browser detects closure and offers a fresh connection. Lifespan shutdown cancels both the clock and sweep and clears the registry.

This is a loopback development service with random session IDs, not an authenticated multi-user deployment. Vite proxies HTTP/WebSocket requests to port 8001, so no cross-origin browser HTTP configuration is needed. The stream accepts browser origins on local ports 8086 and 4186. `GREENHOUSE_ALLOWED_ORIGINS` can provide a comma-separated replacement list. Do not run several API workers or expose this development setup as a public service.

`src/greenhouse/simulation` is independent of FastAPI, Pydantic and training libraries. Its `World` exposes reset, observations, fixed-step actions, reward/termination and state snapshots; `Reference` chooses actions solely from declared observations. MuJoCo 3.17.0 and NumPy 2.4.6 are locked dependencies. A compiled immutable model is shared while each world owns independent simulation data.

The base has planar support and velocity servos; wheel angles visualize measured body motion. There is no rolling/slip or actuator-fidelity claim. Pickup is a constrained attachment with measured-speed, alignment and height gates. Floor, wall and pot contacts are real MuJoCo contacts for the applicable collision groups; the base's planar joints support it without wheel/floor traction. The floor-level tray is a delivery region, not a raised receptacle with walls. Camera perception, physical fingers, carried-load force transfer and plant manipulation remain later work.

Workers and persistent experiment artifacts remain later phases. Future local outputs belong under the ignored `runtime/` directory, not source control.

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
