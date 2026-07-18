# Robot Simulator

![Simulator](../../docs/readme-header.gif)

> A browser-first robotics simulator built with React, React Three Fiber and
> TypeScript — differential-drive kinematics, virtual lidar and camera,
> probabilistic occupancy-grid mapping, A* path planning and a live world
> editor.

The goal is to learn robotics fundamentals by building a modular simulation
platform that can later evolve into a robotics playground, integrate with ROS2
and eventually control real hardware. The simulation itself stays
deterministic and framework independent; React and R3F only observe and
visualize it.

See [`../../docs/simulator.md`](../../docs/simulator.md) for the full
milestone plan and [`../../docs/project.md`](../../docs/project.md) for the
repository-wide philosophy.

---

## What it does

| Milestone        | Capability                                                     |
| ---------------- | ------------------------------------------------------------- |
| World            | Floor, walls, boxes, cylinders, JSON map format / loader       |
| Robot Core       | Differential-drive kinematics, pose, velocity, wheel speeds    |
| Simulation Loop  | Fixed timestep, variable render rate, pause / resume / reset   |
| Teleoperation    | WASD keyboard control, speed adjustment, emergency stop         |
| Sensors          | Virtual lidar (range / resolution) + robot camera viewport     |
| Occupancy Grid   | Ray-traced probabilistic mapping with a live 2D minimap        |
| Navigation       | Click-to-drive goal queue, heading + distance controllers      |
| Path Planning     | A* grid search with obstacle avoidance and path smoothing      |
| Coverage         | Boustrophedon coverage with completion + return-to-start        |
| Sensor Noise     | Lidar dropouts, wheel slip, encoder drift, image noise         |
| Localization     | Dead reckoning, odometry history visualization                 |
| Editor           | Add / remove / move / resize walls, spawn + reset robot pose    |
| Playback         | Record, save, load and replay simulation timelines             |
| UI Polish        | Tabbed inspectors, debug toggles, theme support, perf metrics   |

Everything is driven through the browser — keyboard, mouse, and the HUD
controls. There is no backend.

---

## Tech stack

- **React + TypeScript + Vite** — application shell and HUD
- **Three.js, React Three Fiber, Drei** — 3D rendering
- **Zustand** — UI state only (simulation never reads from it)
- **Tailwind + shadcn** — HUD styling
- **Vitest** — unit tests for simulation algorithms
- **Playwright** — browser E2E suite that drives the public UI

The simulator consumes the shared `@robotics-lab/*` workspace packages:
`core`, `geometry`, `maps`, `noise`, `robot`, `sensors`, `occupancy-grid`,
`navigation` and `rendering`.

---

## Run

From the repo root:

```sh
pnpm install
pnpm -C apps/simulator dev      # http://localhost:8080
pnpm -C apps/simulator build
```

### Test

```sh
pnpm -C apps/simulator test          # Vitest unit tests
pnpm -C apps/simulator test:e2e      # Playwright against the preview build
pnpm -C apps/simulator test:e2e:ui   # interactive Playwright UI
```

The Playwright suite boots the Vite preview build, then interacts with the
running app exclusively through its public UI (keyboard, mouse, HUD buttons).
Canvas clicks are expressed in *world* metres via a renderer bridge exposed
in the production build (`window.__E2E__`) — see
[`../../docs/e2e.md`](../../docs/e2e.md) and
[`../../docs/e2e-world-click.md`](../../docs/e2e-world-click.md).

---

## Controls

| Action                | Input                                 |
| --------------------- | ------------------------------------ |
| Drive forward / back  | `W` / `S`                             |
| Turn left / right     | `A` / `D`                             |
| Emergency stop        | `Space` (or the Teleop tab ESTOP)     |
| Drive to a point      | left-click the floor                 |
| Queue extra goals     | Shift + left-click the floor         |
| Orbit camera          | right-drag                            |
| Pan camera            | middle-drag                           |
| Zoom                  | scroll                                |

Goal queues, navigation status, sensor readouts, the occupancy minimap and
the world editor all live in the right-side panel.

---

## Architecture

```
src/
  sim/                 deterministic simulation (no React, no browser)
  store.ts             Zustand — UI state only
  components/          HUD panels, dockable widgets, top bar, footer
  App.tsx              composes R3F <Canvas> + rendering package + HUD
```

Rendering observes simulation state; React owns the HUD and editors. The
fixed-timestep simulation loop is decoupled from the variable render rate, so
it advances identically in the browser, in Node and in tests.

---

## Regenerating the header GIF

The header animation is generated from this app: a Playwright capture spec
boots the preview build, drives an autonomous navigation run and screenshots
six frames, then ffmpeg assembles a looping GIF. Run from the repo root:

```sh
scripts/build-readme-header.sh
```

See the script header for the capture knobs. Output goes to
`../../docs/readme-header.gif` and is shared with the monorepo README until
additional apps land and capture their own headers.
