# End-to-End Testing Strategy

> Goal: verify the application behaves correctly from a user's perspective while keeping the test suite small, deterministic and maintainable.

---

# Philosophy

The simulator already contains deterministic simulation code.

Unit tests (Vitest) verify algorithms.

Playwright verifies:

- application wiring
- browser integration
- rendering lifecycle
- user interaction
- regressions
- memory leaks
- performance sanity

Playwright should **not** duplicate unit tests.

If an algorithm can be tested in Node, it belongs in Vitest.

---

# Principles

## Test the minimum

Prefer:

- one happy path
- one edge case
- one regression

Avoid:

- dozens of similar tests
- testing implementation details
- pixel-perfect screenshots

---

## Test like a user

Tests should interact only through:

- keyboard
- mouse
- UI controls

Never mutate Zustand or simulation state directly.

---

## Stable over exhaustive

One reliable test is worth more than ten flaky tests.

Avoid timing assumptions.

Prefer waiting for observable state.

---

# Test Pyramid

## Vitest

Responsible for:

- math
- geometry
- kinematics
- navigation
- occupancy grid
- lidar
- planners
- serialization

Large amount of tests.

---

## Playwright

Responsible for:

- browser startup
- rendering
- controls
- simulation loop
- integrations
- memory stability

Very small suite.

---

# Core E2E Scenarios

## 1. Application starts

Purpose:

Detect startup regressions.

Flow:

- open simulator
- canvas becomes visible
- HUD renders
- FPS counter appears
- robot exists

Verifies:

- routing
- asset loading
- React
- Three.js initialization

---

## 2. Simulation runs

Purpose:

Ensure simulation loop works.

Flow:

- open app
- wait
- simulation clock advances

Verifies:

- fixed timestep
- render loop
- browser integration

---

## 3. Pause / Resume

Flow:

- pause
- verify simulation time stops
- resume
- verify time advances again

Verifies:

- playback controls
- simulation scheduler

---

## 4. Reset

Flow:

- move robot
- reset
- robot returns to initial pose

Verifies:

- reset pipeline
- renderer synchronization

---

## 5. Keyboard Teleoperation

Flow:

- hold forward key
- robot moves
- release
- robot stops

Repeat for:

- reverse
- rotate left
- rotate right

Verifies:

- keyboard input
- simulation
- rendering

---

## 6. Navigation Goal

Flow:

- click destination
- goal marker appears
- robot reaches goal

Verifies:

- input
- planner
- controller
- renderer

---

## 7. Sensor Rendering

Flow:

Enable lidar.

Verify:

- rays appear
- hit points render
- disabling removes visualization

Verifies:

- simulation → rendering pipeline

Do not verify exact ray distances.

Those belong in Vitest.

---

## 8. Occupancy Grid

Flow:

move robot

verify:

- occupancy map changes
- reset clears map

Verifies:

- integration only

Do not verify probability values.

---

# Long Running Stability Tests

These are the most valuable tests.

---

## Memory Leak Test

Purpose:

Detect browser memory leaks.

Flow:

- open simulator
- run for 5–10 minutes
- periodically drive robot
- create/remove goals
- toggle overlays
- collect browser memory
- verify memory growth stays below threshold

Pass criteria:

Memory should stabilize.

Small growth is acceptable.

Continuous linear growth is a failure.

---

## Render Stability

Run simulation for 15 minutes.

Verify:

- application stays responsive
- no WebGL context loss
- no crashes
- no unhandled exceptions

---

## Mount / Unmount Stress

Purpose:

Catch React resource leaks.

Loop:

- open simulator
- leave page
- return
- repeat 30–50 times

Verify:

- no increasing memory
- no duplicate event listeners
- no additional animation loops

---

## Visualization Toggle Stress

Loop:

Enable/disable:

- lidar
- occupancy grid
- debug overlays
- camera
- helpers

Verify:

- no crashes
- no memory growth

---

# Browser Console

Every test should fail on:

- console.error
- unhandled promise rejection
- WebGL errors

Warnings may be ignored selectively.

---

# Test Fixtures

Create reusable fixtures for:

- launch simulator
- reset world
- wait for simulation idle
- move robot
- place goal
- toggle visualization

Tests should read like user stories rather than automation scripts.

---

# Selectors

Avoid CSS selectors.

Prefer:

- roles
- labels
- data-testid

Three.js canvas interactions should expose helper elements where possible.

---

# Performance Budgets

Track basic metrics:

- startup time
- FPS sanity
- browser memory
- JS heap
- frame time

Tests should detect major regressions rather than optimize benchmarks.

---

# Future Agent Testing

The simulator behaves like a deterministic game.

Agents should interact only through public UI APIs.

Allowed actions:

- keyboard
- mouse
- clicking UI
- dragging
- toggles

The agent should never modify internal state.

Future scenarios:

- drive robot around obstacles
- explore map
- build occupancy grid
- reach randomly generated goals
- complete navigation missions
- detect UI regressions
- detect stuck robots
- detect infinite loops

Because the simulation is deterministic, agent runs become reproducible and useful for regression testing.

---

# What We Will NOT Test

We intentionally avoid E2E tests for:

- differential drive equations
- raycasting math
- occupancy probabilities
- A*
- geometry
- serialization
- planners

Those belong in Vitest.

---

# Success Criteria

A healthy build should prove that:

✓ Application starts

✓ Simulation runs

✓ User can control the robot

✓ Navigation works

✓ Sensors render correctly

✓ World can reset

✓ Browser remains stable over long sessions

✓ No memory leaks are detected

✓ No console errors occur

Everything else should be covered by deterministic unit tests.