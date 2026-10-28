# Greenhouse server

Project-owned Python service for Greenhouse Caretaker. Phase 1 provides HTTP health/capabilities, ephemeral sessions and validated WebSocket commands. It serves a seeded static layout; physics, policies, training jobs and LangGraph missions arrive in later phases.

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
| `GET /capabilities` | Implemented features and supported commands; simulation/training/language missions are false |
| `POST /sessions` | Create a seeded preview session; body `{ "seed": 42 }` |
| `GET /sessions/{session_id}` | Read the current preview and generation |
| `DELETE /sessions/{session_id}` | Idempotently close the session |
| `WS /sessions/{session_id}/stream` | Hello, initial snapshot, command acknowledgments, reset snapshots and 1 Hz heartbeats |

HTTP models and the two WebSocket unions are Pydantic definitions in `src/greenhouse/api/contracts.py`. `pnpm contracts:greenhouse` exports JSON Schemas and generates TypeScript model types. The browser uses a small typed fetch client and validates HTTP and WebSocket payloads at runtime. It stays on TypeScript 7 and has no OpenAPI client/generator dependency. FastAPI's automatic `/docs` and `/openapi.json` remain useful server inspection tools.

OpenAPI describes HTTP only. The separate `websocket-client.schema.json` and `websocket-server.schema.json` define the streaming protocol. `pnpm check:contracts:greenhouse` fails when either Python-exported schemas or generated TypeScript types are stale.

Every stream envelope has `api_version`, `session_id` and `generation`; server messages also include a simulation `tick`. It stays zero in this static phase. Coordinates are Python Z-up metres with named `{x,y,z}` vectors. The renderer maps these to Three.js `(x,z,-y)`.

Example command after creating a session and receiving its initial state:

```json
{
  "api_version": "1",
  "kind": "reset_preview",
  "session_id": "the-created-session-id",
  "generation": 0,
  "request_id": "reset-1",
  "seed": 42
}
```

A reset increments the generation and sends an acknowledgment plus a fresh snapshot. A ping only acknowledges connectivity. Stale generations and mismatched session IDs are rejected. Request IDs are idempotent within a bounded cache of 64 acknowledgments; reuse means retrying the same operation, not submitting a different command. Accepted commands are rate-limited to 10 Hz. Unknown/oversized input receives a protocol error. Each session allows one stream.

## Local lifecycle and limits

Sessions are in-memory, capped at 16 and expire after 120 seconds without an attached stream or HTTP activity. A sweep runs every 30 seconds, and creation also prunes idle entries. Closing/deleting a session ends its stream. Reloading/restarting Python loses all sessions; the browser detects closure and offers a fresh connection. Lifespan shutdown cancels the sweep and clears the registry.

This is a loopback development service with random session IDs, not an authenticated multi-user deployment. Vite proxies HTTP/WebSocket requests to port 8001, so no cross-origin browser HTTP configuration is needed. The stream accepts browser origins on local ports 8086 and 4186. `GREENHOUSE_ALLOWED_ORIGINS` can provide a comma-separated replacement list. Do not run several API workers or expose this development setup as a public service.

The Python package currently imports no simulation or training dependencies. A production simulation module will be independent of FastAPI in Phase 2; workers and persistent experiment artifacts are later phases. Future local outputs belong under the ignored `runtime/` directory, not source control.

## Checks

```sh
pnpm test:greenhouse
pnpm build:greenhouse
pnpm test:e2e:greenhouse
node scripts/greenhouse/lifecycle.mjs
```

The Python wrappers also expose `test`, `lint`, `typecheck`, `build` and `contracts`. The source package builds a wheel and source archive through `uv build`. Tests exercise seeded previews, session capacity/expiry, duplicate requests, validation, stale commands, origin checks and reconnect behavior. Mypy runs without an incremental cache to avoid stale inference for Pydantic's union adapters.
