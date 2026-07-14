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

## Stress tests on CI

Phases 8 / 9 / 10 / 11 are soak tests whose canonical duration (5–15 min,
30–50 cycles, many toggle rounds) is far too slow for a per-PR CI gate.
They ship with a **CI-minimal default** that still exercises the exact same
leak shape — one or two rounds of the loop, a short session — because the
steady-state signal (counter drift, leak-trend slope) trips on the very first
leaked cleanup, so a single round already surfaces a real regression.

Run the canonical long soak locally or nightly by raising the env var — or
use the convenience script that sets them all at once:

    pnpm test:e2e:soak

| Phase | Env var | CI default | Canonical soak |
| --- | --- | --- | --- |
| 8  | `E2E_MEMORY_DURATION_MS`  | `15000`  | `600000` (5–10 min) |
| 9  | `E2E_RENDER_DURATION_MS`  | `15000`  | `900000` (15 min) |
| 10 | `E2E_MOUNT_COUNT`         | `1`      | `30`–`50` |
| 11 | `E2E_VIZ_ROUNDS`          | `1`      | `8`+ |
| 11 | `E2E_VIZ_TOGGLE_DELAY_MS` | `150`    | `150` |

The CI defaults keep the whole suite fast on a shared runner; the env vars are
the deliberate opt-in for the long soak a leak regression is eventually worth.

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

## World-space interactions

Interaction with the 3D canvas is expressed in **world coordinates**, never
pixel coordinates. The renderer owns projection (`packages/rendering/src/e2e-bridge.tsx`
exposes `window.__E2E__.worldToScreen` / `screenToWorld`), and a `Simulator`
fixture (`e2e/simulator.ts`) turns world points into real browser mouse events
while rejecting clicks that would land under a HUD. See `docs/e2e-world-click.md`
for the full design and the rationale. Tests read like user stories:

```ts
const sim = await launchSimulatorForWorld(page)
await sim.placeGoal({ x: 2, y: -1.5 })
await sim.waitForGoalReached()
```

Pixel coordinates, canvas fractions, and camera assumptions are kept out of
specs by design — changing the camera or HUD layout must not require touching
tests.

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

- [x] Track startup time metric
- [x] Track FPS sanity metric
- [x] Track JS heap size metric
- [x] Track frame time metric
- [x] Record metrics in CI artifacts
- [x] Define soft budgets (warn only) for each metric

---

# Phase 8 — Memory Leak Test

Purpose:

Detect browser memory leaks over a long session.

CI default session length is ~15s via `E2E_MEMORY_DURATION_MS`; raise the env
var for the canonical 5–10 minute soak (see **Stress tests on CI** above).

## Tasks

- [x] Open simulator
- [x] Run for 5–10 minutes
- [x] Periodically drive the robot
- [x] Periodically create / remove goals
- [x] Periodically toggle overlays
- [x] Collect browser memory samples
- [x] Assert memory growth stays below threshold

## Pass criteria

- [x] Memory stabilizes
- [x] Small growth is acceptable
- [x] Continuous linear growth fails the test

---

# Phase 9 — Render Stability

Purpose:

Guarantee the app stays responsive during a long run.

CI default session length is ~15s via `E2E_RENDER_DURATION_MS`; raise the env
var for the canonical 15-minute soak (see **Stress tests on CI** above).

## Tasks

- [x] Run simulation for 15 minutes
- [x] Application stays responsive
- [x] No WebGL context loss
- [x] No crashes
- [x] No unhandled exceptions

---

# Phase 10 — Mount / Unmount Stress

Purpose:

Catch React resource leaks when the scene is torn down.

CI default cycle count is `1` via `E2E_MOUNT_COUNT`; raise the env var for the
canonical 30–50-cycle soak (see **Stress tests on CI** above).

## Tasks

- [x] Open simulator
- [x] Leave page
- [x] Return to page
- [x] Repeat 30–50 times
- [x] Assert no increasing memory
- [x] Assert no duplicate event listeners
- [x] Assert no additional animation loops

---

# Phase 11 — Visualization Toggle Stress

Purpose:

Make sure toggling layers does not leak or crash. The round count is
configurable via the `E2E_VIZ_ROUNDS` env var (**default 1** for the fast CI
gate — the steady-state counter-drift gate trips on the very first leaked
cleanup, so a single round already surfaces a real per-toggle leak) and the
settle between an off and on half of a round via `E2E_VIZ_TOGGLE_DELAY_MS`
(default 150ms) — mirroring Phase 8 / 9 / 10's configurable-long-run
pattern (see **Stress tests on CI** above). Raise the rounds for the
canonical long soak (e.g. nightly).

## Tasks

- [x] Enable / disable lidar in a loop
- [x] Enable / disable occupancy grid in a loop
- [x] Enable / disable debug overlays in a loop
- [x] Enable / disable camera in a loop
- [x] Enable / disable helpers in a loop
- [x] Assert no crashes
- [x] Assert no memory growth

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
