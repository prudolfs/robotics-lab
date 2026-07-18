# Robotics Lab

![Simulator](docs/readme-header.gif)

> A browser-first robotics platform built with TypeScript, React and Three.js.

The goal of this repository is to learn robotics by building a collection of
simulation, planning and visualization applications that share a common set of
reusable packages. Every application runs in a browser whenever possible —
zero installation, live demos, fast iteration. Desktop runtimes (Electron /
Tauri) will only be introduced once native hardware access (ROS2, USB, Serial)
becomes necessary.

See [`docs/project.md`](./docs/project.md) for the philosophy and long-term
roadmap, and [`docs/simulator.md`](./docs/simulator.md) for the first
application's milestone-by-milestone plan.

---

## Repository layout

```
robotics-lab/
  apps/
    simulator/          differential-drive robotics playground (React Three Fiber)
  packages/
    core/               shared types
    geometry/           geometry primitives
    maps/               JSON world format, loader, serializer
    noise/              deterministic sensor / motion noise
    robot/              pose, velocity, differential-drive kinematics
    sensors/            lidar + camera models (framework independent)
    occupancy-grid/     probabilistic mapping from scans
    navigation/         goal control, A* path planning, coverage
    rendering/          reusable R3F components + the E2E renderer bridge
```

Applications compose packages. Packages never depend on applications. The
simulation itself is deterministic and framework independent (no React, no
Zustand, no browser APIs), so it runs identically in the browser, in Node and
in tests.

---

## Stack

| Concern       | Choice                                       |
| ------------- | -------------------------------------------- |
| Runtime       | pnpm workspaces (`apps/*`, `packages/*`)      |
| Frontend      | React + TypeScript + Vite                    |
| Rendering     | Three.js, React Three Fiber, Drei            |
| UI / HUD      | Tailwind, shadcn                              |
| App state     | Zustand (UI only — never simulation state)    |
| Testing       | Vitest (algorithms) + Playwright (browser)    |
| Lint / format | Biome                                          |

---

## Getting started

Prerequisites: Node, pnpm, and a browser with WebGL.

```sh
pnpm install
```

Run the simulator app in dev:

```sh
pnpm -C apps/simulator dev
```

Build it:

```sh
pnpm -C apps/simulator build
```

### Testing

```sh
pnpm test                  # unit tests (Vitest)
pnpm -C apps/simulator test:e2e   # Playwright against the preview build
pnpm test:e2e:soak                # long-running stability / leak suites
```

The Playwright suite drives the simulator only through its public UI
(keyboard, mouse, HUD controls) and expresses clicks in *world coordinates*
via a renderer bridge shipped in the production build — see
[`docs/e2e.md`](./docs/e2e.md) and
[`docs/e2e-world-click.md`](./docs/e2e-world-click.md).

---

## Regenerating the README header

The animated GIF at the top of this file is produced by capturing screenshots
of the running simulator with Playwright and assembling them with ffmpeg:

```sh
scripts/build-readme-header.sh
```

It writes `docs/readme-header.gif`. See the script header for the available
knobs (`WIDTH`, `E2E_FRAME_COUNT`, `E2E_FRAME_MS`, `FRAMERATE`). The same GIF
is reused by the simulator app README for now; as more apps land, each one
will capture its own.

---

## Roadmap

The first application, the [simulator](./apps/simulator), is the proving
ground for the shared packages. Long-term targets:

- **Robot Simulator** — in progress (world, teleop, sensors, mapping,
  A* navigation, coverage, localization, editor, playback)
- **Drone Mission Planner**
- **Visual SLAM Demo**
- **ROS2 Browser Visualization** (and a ROS bridge package)

Every application contributes reusable pieces back into the shared packages so
the next one starts on a stronger foundation.
