# Robotics Lab

![Robotics Lab: robot simulator, drone mission planner and SLAM Studio](docs/readme-header.gif)

> A browser-first robotics platform built with TypeScript, React and Three.js.

The goal of this repository is to learn robotics by building a collection of
simulation, planning and visualization applications that share a common set of
reusable packages. Every application runs in a browser whenever possible —
zero installation, live demos, fast iteration. Desktop runtimes (Electron /
Tauri) will only be introduced once native hardware access (ROS2, USB, Serial)
becomes necessary.

See [`docs/project.md`](./docs/project.md) for the philosophy and long-term
roadmap. The application plans live in
[`docs/simulator.md`](./docs/simulator.md),
[`docs/drone-mission-planner.md`](./docs/drone-mission-planner.md) and
[`docs/slam-demo.md`](./docs/slam-demo.md).

---

## Repository layout

```
robotics-lab/
  apps/
    simulator/          differential-drive robotics playground (React Three Fiber)
    drone-mission-planner/
                        3D planning and simulation for autonomous drone missions
    slam-demo/          visual SLAM explorer (authored lab, sparse mapping and loop closure)
  packages/
    core/               shared types
    drone/              framework-independent drone dynamics and mission logic
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

## Applications

### [Robot Simulator](./apps/simulator)

A differential-drive robotics playground with lidar, occupancy-grid mapping,
A* navigation, coverage planning, localization, editing and playback.

### [Drone Mission Planner](./apps/drone-mission-planner)

A WebGPU-powered 3D planner for composing, validating, simulating and saving
autonomous drone missions. It includes manual flight, virtual lidar/GPS/IMU,
multiple camera modes, route execution and versioned JSON persistence. See the
[full development plan](./docs/drone-mission-planner.md).

### [SLAM Studio](./apps/slam-demo)

A visual SLAM explorer in development. Phase 1 provides a deterministic rover,
guided inspection loop, manual driving, collision handling and encoder-odometry
comparison. Phase 2 adds a Blender-authored lab, articulated rover, PBR materials
and overview/follow/robot-eye inspection views. Phase 3 adds calibrated stereo acquisition, noise/dropout controls and pixel replay.
Phase 4 adds image-derived stereo visual odometry, feature overlays and honest tracking-loss states. Phase 5 adds persistent local mapping, bundle adjustment and selectable reconstruction. Phase 6 adds appearance retrieval, geometrically verified loop closure, pose-graph correction and before/after trajectories. Relocalization remains planned.
See the [implementation plan](./docs/slam-demo.md).

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

Prerequisites: Node, pnpm, and a current browser with WebGL (simulator) or
WebGPU (drone mission planner).

```sh
pnpm install
```

Run the simulator app in dev:

```sh
pnpm -C apps/simulator dev
```

Run the drone mission planner (requires WebGPU):

```sh
pnpm -C apps/drone-mission-planner dev
```

Run SLAM Studio (WebGL2):

```sh
pnpm dev:slam           # http://127.0.0.1:8082
pnpm test:e2e:slam      # dedicated browser tests
```

Build it:

```sh
pnpm -C apps/simulator build
pnpm -C apps/drone-mission-planner build
pnpm build:slam
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

The animated GIF cycles through all three applications: robot navigation,
drone mission execution, and the four SLAM Studio camera views. Regenerate it
from fresh browser captures with:

```sh
scripts/build-readme-header.sh
# or: pnpm readme:gif
```

Requires pnpm, Playwright Chromium, local Google Chrome with WebGPU support,
and ffmpeg. The script builds the apps, starts preview servers on ports 8080,
4194 and 4195, captures one project at a time, and closes the browsers and
servers it starts. The previous GIF is replaced only after all captures and
encoding succeed.

Defaults: eight frames per project, 900 ms between frames, and 1200 px output
width. Override `E2E_FRAME_COUNT`, `E2E_FRAME_MS`, `WIDTH`, or `FRAMERATE` as
needed. An optional output path can be passed to the script. The output is
`docs/readme-header.gif`; `docs/readme-header.json` records the project frame
ranges and playback settings. The simulator README shares this showcase.

For the four 1080×1080 SLAM screenshots, start `pnpm dev:slam`, then run
`pnpm screenshots:slam`. Files are saved in `apps/slam-demo/screenshots`.

---

## Roadmap

The [simulator](./apps/simulator) established the shared packages, and the
[drone mission planner](./apps/drone-mission-planner) now applies them to
aerial robotics. Long-term targets:

- **Robot Simulator** — in progress (world, teleop, sensors, mapping,
  A* navigation, coverage, localization, editor, playback)
- **Drone Mission Planner** — in progress (3D editing, validation, execution,
  sensors and persistence implemented; external formats and replay next)
- **Visual SLAM Demo** — Phases 1–6 implemented (motion, authored lab, stereo acquisition, visual odometry, sparse mapping and verified loop closure);
  [relocalization and guided experiments next](./docs/slam-demo.md)
- **ROS2 Browser Visualization** (and a ROS bridge package)

Every application contributes reusable pieces back into the shared packages so
the next one starts on a stronger foundation.
