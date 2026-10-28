# Greenhouse Caretaker

Phase 2 frontend for Robotics Lab's robot-learning project. React Three Fiber and Drei render an actual Three.js WebGPU scene; Tailwind and shadcn/ui with Base UI provide the interface. Python runs the authoritative MuJoCo world. The current controller is a scripted reference; learned policies arrive in later phases.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm setup:greenhouse
pnpm dev:greenhouse
```

Open `http://127.0.0.1:8086/`. The paired command starts the project-owned FastAPI server on port 8001. Node/pnpm and uv are required; a supported Python interpreter and dependencies are managed locally by uv. No global Laya installation or model credentials are required.

The app connects automatically and creates a ready seed-42 world. **Start collection** runs the reference controller through approach, grasp, lift, delivery, lowering and release. **Pause collection** freezes the Python world; **Resume collection** continues the same run. **Restart seed** restores its initial state and increments the generation; **New seed** chooses a different feasible scenario. **Overview** and **Follow** select the camera. The panel shows stage, elapsed simulated time, delivery, collisions, invalid actions and recent events.

**Reconnect** releases the old session and creates a fresh one. Lost or unavailable servers display retry instructions; disconnecting pauses a running world. A missing WebGPU adapter prevents rendering while connection controls remain usable. The controller, idealized target sensing and abstract grasp are labeled explicitly.

The scene is placeholder geometry from the feasibility work. The floor, robot, capsule and tray share its scale and warm greenhouse palette. Final Blender authoring is Phase 3; the user will be asked to open Blender and enable Blender MCP when that work is needed.

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

Playwright uses local Chrome with WebGPU support. It starts the paired development command if the app is not already running, and uses graceful shutdown to stop both services afterward. Eight checks cover a complete live delivery with pause/resume and following, active-run reset/new seed, keyboard reset, loading, incompatible HTTP responses, missing-server retry, real session closure/reconnect and unavailable WebGPU.

```sh
GREENHOUSE_CAPTURE=1 pnpm test:e2e:greenhouse
```

This additionally writes overview/mobile/failure views, carrying and delivery screenshots, and live browser evidence to `docs/greenhouse-demo/phase2/`. See the [Phase 2 review](../../docs/greenhouse-demo/phase2/README.md), [implementation plan](../../docs/greenhouse-demo.md) and [server guide](../greenhouse-server/README.md).

To check the production bundle, start `pnpm -C apps/greenhouse-server start` and `pnpm -C apps/greenhouse-demo preview` in separate terminals, then run `GREENHOUSE_E2E_URL=http://127.0.0.1:4186 pnpm test:e2e:greenhouse`. Setting that URL skips Playwright's automatic development-server startup.
