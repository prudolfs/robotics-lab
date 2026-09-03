# Robotics Lab

> A browser-first robotics platform built with TypeScript, React and Three.js.

The goal of this repository is to learn robotics by building a collection of simulation, planning and visualization applications while sharing a common set of reusable packages.

---

# Philosophy

## Browser First

Every application should run in a browser whenever possible.

Benefits:

- zero installation
- live demos
- easy sharing
- fast iteration

Desktop applications (Electron/Tauri) should only be introduced when native capabilities become necessary (ROS2, USB, Serial, hardware communication).

---

## Functional TypeScript

Prefer functions and modules over classes.

Prefer:

- modules
- pure functions
- immutable data
- composition

Avoid classes unless they provide significant value.

---

## Types

Prefer `type` over `interface`.

Use interfaces only when TypeScript requires them or when declaration merging is beneficial.

Example:

```ts
type Pose = {
  x: number
  y: number
  heading: number
}
```

---

## Module Design

Prefer deep modules with shallow interfaces.

Good:

```
occupancy-grid/

    index.ts

    update.ts
    raycast.ts
    probability.ts
    serialization.ts
```

Consumers should only need:

```ts
updateGrid(...)
serializeGrid(...)
```

Internal complexity stays hidden.

---

## Function Style

Prefer function declarations for top-level functions.

Good:

```ts
export function updateRobot(...)
```

Avoid:

```ts
export const updateRobot = () => {}
```

Arrow functions are acceptable for callbacks and small local helpers.

---

## Composition

Compose behavior instead of building inheritance hierarchies.

Instead of:

```
Robot
    ^
DifferentialDriveRobot
```

Prefer:

```
Robot State

+

Drive Model

+

Sensors

+

Controller
```

---

## Deterministic Simulation

The simulator should be deterministic.

Simulation code should not depend on:

- React
- Zustand
- Browser APIs

The simulation should be executable from:

- Browser
- Node
- Tests
- ROS adapter (future)

---

## React Responsibilities

React is responsible for:

- rendering
- HUD
- editors
- controls
- inspectors
- settings

React is **not** responsible for simulation.

---

## Global State

Use Zustand only for application state.

Examples:

- selected robot
- camera mode
- editor tools
- UI panels
- visualization toggles
- playback controls

Do not store simulation state in Zustand.

---

## Rendering

Rendering stack:

- React
- React Three Fiber
- Drei

Rendering should observe simulation state rather than own it.

---

## Monorepo

```
robotics-lab/

apps/
    simulator/
    drone-mission-planner/
    ros2-visualizer/
    slam-demo/

packages/

    core/
    geometry/
    math/
    physics/

    robot/

    sensors/

    occupancy-grid/

    navigation/

    rendering/

    maps/
```

Applications compose packages.

Packages should avoid depending on applications.

---

# Initial Stack

Runtime

- Bun

Frontend

- React
- TypeScript
- Vite

Rendering

- Three.js
- React Three Fiber
- Drei

Rendering UI and HUD's

- Tailwind
- Shadcn

State

- Zustand

Testing

- Vitest

Linting

- Biome

Formatting

- Biome

Deployment

- Vercel

---

# Long-Term Goals

Applications

- Robot Simulator
- Drone Mission Planner
- Visual SLAM Demo
- ROS2 Browser Visualization

Reusable packages

- Robot Core
- Sensor Models
- Mapping
- Navigation
- Geometry
- Rendering
- ROS Bridge

---

# Development Philosophy

Build like a game.

1. Build a minimal prototype.
2. Make it work.
3. Add systems.
4. Refactor architecture.
5. Polish visuals.
6. Reuse packages.
7. Build the next application.

Every application should contribute reusable components back into the shared packages.
