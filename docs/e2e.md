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

# Selectors

Avoid CSS selectors.

Prefer:

- roles
- labels
- data-testid

Three.js canvas interactions should expose helper elements where possible.

---

# Browser Console

Every test should fail on:

- console.error
- unhandled promise rejection
- WebGL errors

Warnings may be ignored selectively.

---

# Implementation Phases

Each phase builds on the previous one and is only considered done when its entire checklist is complete.

Phases are ordered so that each phase ships a runnable, green test suite before the next phase begins.

External dependencies (Playwright, a CI server, performance tooling) are introduced only when a phase requires them.

---

# Phase 0 — E2E Foundation

Goal:

Bring the E2E toolchain into the repo and prove that a single test can launch the simulator in a real browser.

## Tooling

- [x] Install Playwright in the simulator app
- [x] Add Playwright config
- [x] Configure headless Chromium as the default browser
- [x] Add `test:e2e` script to the app and workspace root
- [x] Configure dev/preview server for tests
- [x] Add Playwright to CI

## Selectors

- [x] Add `data-testid` to the canvas element
- [x] Add `data-testid` to the HUD root
- [x] Add `data-testid` to the FPS counter
- [x] Add `data-testid` to the robot marker

## Smoke Test

- [x] Application opens
- [x] Canvas becomes visible
- [x] HUD renders
- [x] FPS counter appears
- [x] Robot exists

## Console Guard

- [x] Fail test on `console.error`
- [x] Fail test on unhandled promise rejection
- [x] Fail test on WebGL context loss

## Fixtures

- [x] `launchSimulator` fixture
- [x] `resetWorld` fixture
- [x] `waitForIdle` fixture

---

# Phase 1 — Simulation Lifecycle

Goal:

Verify the simulation loop and playback controls work in the browser.

## Tasks

- [x] Simulation clock advances when running
- [x] Pause stops the simulation clock
- [x] Resume restarts the simulation clock
- [x] Reset returns the robot to its initial pose
- [x] Reset syncs the renderer to the new state

## Selectors

- [x] `data-testid` for simulation time readout
- [x] `data-testid` for pause / resume button
- [x] `data-testid` for reset button

---

# Phase 2 — Teleoperation

Goal:

Verify keyboard input drives the simulated robot through the full stack.

## Tasks

- [x] Hold forward key → robot moves
- [x] Release forward key → robot stops
- [x] Hold reverse key → robot moves backward
- [x] Press rotate left → robot rotates left
- [x] Press rotate right → robot rotates right
- [x] Emergency stop halts the robot

## Selectors

- [x] `data-testid` for key hints panel
- [x] Expose a stable way to read robot pose from the UI

---

# Phase 3 — Navigation

Goal:

Verify the end-to-end navigation flow from user click to robot arrival.

## Tasks

- [x] Click destination → goal marker appears
- [x] Robot reaches the goal
- [x] Queued goals are processed in order
- [x] Cancel goal removes the marker

## Selectors

- [x] `data-testid` for goal marker
- [x] `data-testid` for the clear goals button

---

# Phase 4 — Sensor Rendering

Goal:

Verify the simulation-to-rendering pipeline for sensors without asserting exact values.

## Tasks

- [x] Enable lidar → rays appear
- [x] Enable lidar → hit points render
- [x] Disable lidar → visualization is removed
- [x] Robot camera viewport renders

## Selectors

- [x] `data-testid` for lidar toggle
- [x] `data-testid` for camera viewport

---

# Phase 5 — Occupancy Grid

Goal:

Verify the occupancy grid integration only.

## Tasks

- [x] Move robot → occupancy map changes
- [x] Reset → occupancy map clears
- [x] Minimap reflects grid updates

## Selectors

- [x] `data-testid` for occupancy grid overlay
- [x] `data-testid` for minimap

---

# Phase 6 — Console & Error Hygiene

Goal:

Guarantee a clean console across every existing E2E scenario.

## Tasks

- [x] Capture console output globally for every test
- [x] No `console.error` in any scenario
- [x] No unhandled promise rejections
- [x] No WebGL context loss

---

# Phase 7 — Performance Budgets

Goal:

Detect major performance regressions rather than micro-optimize.

## Tasks

- [ ] Track startup time metric
- [ ] Track FPS sanity metric
- [ ] Track JS heap size metric
- [ ] Track frame time metric
- [ ] Record metrics in CI artifacts
- [ ] Define soft budgets (warn only) for each metric

---

# Phase 8 — Memory Leak Test

Purpose:

Detect browser memory leaks over a long session.

## Tasks

- [ ] Open simulator
- [ ] Run for 5–10 minutes
- [ ] Periodically drive the robot
- [ ] Periodically create / remove goals
- [ ] Periodically toggle overlays
- [ ] Collect browser memory samples
- [ ] Assert memory growth stays below threshold

## Pass criteria

- [ ] Memory stabilizes
- [ ] Small growth is acceptable
- [ ] Continuous linear growth fails the test

---

# Phase 9 — Render Stability

Purpose:

Guarantee the app stays responsive during a long run.

## Tasks

- [ ] Run simulation for 15 minutes
- [ ] Application stays responsive
- [ ] No WebGL context loss
- [ ] No crashes
- [ ] No unhandled exceptions

---

# Phase 10 — Mount / Unmount Stress

Purpose:

Catch React resource leaks when the scene is torn down.

## Tasks

- [ ] Open simulator
- [ ] Leave page
- [ ] Return to page
- [ ] Repeat 30–50 times
- [ ] Assert no increasing memory
- [ ] Assert no duplicate event listeners
- [ ] Assert no additional animation loops

---

# Phase 11 — Visualization Toggle Stress

Purpose:

Make sure toggling layers does not leak or crash.

## Tasks

- [ ] Enable / disable lidar in a loop
- [ ] Enable / disable occupancy grid in a loop
- [ ] Enable / disable debug overlays in a loop
- [ ] Enable / disable camera in a loop
- [ ] Enable / disable helpers in a loop
- [ ] Assert no crashes
- [ ] Assert no memory growth

---

# Phase 12 — Test Fixtures Refactor

Goal:

Reduce duplication across the suite once it has stabilized.

The earlier phases intentionally write small inline tests so they read like user stories.

This phase collapses repeated steps into shared fixtures.

## Tasks

- [ ] `launchSimulator` fixture (from Phase 0)
- [ ] `resetWorld` fixture
- [ ] `waitForIdle` fixture
- [ ] `moveRobot` fixture
- [ ] `placeGoal` fixture
- [ ] `toggleVisualization` fixture

Tests should read like user stories rather than automation scripts.

---

# Phase 13 — Performance Budgets (Hard Gates)

Goal:

Promote soft performance budgets into failing CI gates once baselines are stable.

## Tasks

- [ ] Lock baseline startup time
- [ ] Lock baseline JS heap size
- [ ] Lock baseline frame time
- [ ] Lock baseline FPS
- [ ] Fail build on regression beyond budget
- [ ] Allow baseline updates via deliberate PR

---

# Phase 14 — Future Agent Testing

The simulator behaves like a deterministic game.

Agents should interact only through public UI APIs.

Allowed actions:

- keyboard
- mouse
- clicking UI
- dragging
- toggles

The agent should never modify internal state.

## Scenarios

- [ ] Drive robot around obstacles
- [ ] Explore map
- [ ] Build occupancy grid
- [ ] Reach randomly generated goals
- [ ] Complete navigation missions
- [ ] Detect UI regressions
- [ ] Detect stuck robots
- [ ] Detect infinite loops

Because the simulation is deterministic, agent runs become reproducible and useful for regression testing.

---

# Success Criteria

Phases 0–6 are the minimum viable E2E suite.

A healthy build should prove that:

- ✓ Application starts
- ✓ Simulation runs
- ✓ User can control the robot
- ✓ Navigation works
- ✓ Sensors render correctly
- ✓ World can reset
- ✓ Browser remains stable over long sessions
- ✓ No memory leaks are detected
- ✓ No console errors occur

Phases 7–13 harden the suite for long-term maintenance.

Phase 14 opens the door to agent-driven regression testing.

Everything else should be covered by deterministic unit tests.
