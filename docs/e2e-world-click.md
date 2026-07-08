# Deterministic World-Space E2E Interaction

> Replace fragile pixel-based canvas interactions with deterministic world-space interactions built on the simulator's own camera and rendering pipeline.

---

# Problem

Current Playwright tests interact with the simulator by clicking fixed screen coordinates.

Example:

```ts
await page.mouse.click(512, 384)
```

These tests become fragile whenever any of the following changes:

- camera position
- camera zoom
- camera field of view
- canvas size
- browser window size
- device pixel ratio
- HUD layout
- UI scaling
- renderer updates

Even though the simulator itself is deterministic, the E2E interactions are not.

The result is unnecessary maintenance whenever visual changes occur.

---

# Goal

Make every E2E interaction deterministic by expressing interactions in world coordinates rather than screen coordinates.

Instead of:

```ts
await page.mouse.click(512, 384)
```

Tests should read:

```ts
await simulator.clickWorld({
    x: 4,
    y: -2,
})
```

or

```ts
await simulator.placeGoal({
    x: 4,
    y: -2,
})
```

Tests describe user intent rather than renderer implementation.

---

# Design Principles

## Single Source of Truth

The renderer already knows how to project world coordinates onto the screen.

The E2E system should reuse this implementation rather than duplicate projection math.

---

## World Space First

Tests should operate in simulation coordinates.

Pixel coordinates should never appear inside test cases.

---

## User Interaction Only

Tests should continue interacting through the browser.

The E2E API may calculate click positions but should still perform real browser mouse events.

Simulation state must never be modified directly.

---

## Camera Independent

Changing:

- camera position
- orbit controls
- projection
- viewport
- resolution

should not require updating tests.

---

## Deterministic

Given:

- same world
- same camera
- same viewport

the same world coordinate should always generate the same screen coordinate.

---

# Architecture

```
Playwright Test

        │

clickWorld({x,y})

        │

page.evaluate()

        │

window.__E2E__.worldToScreen()

        │

Three.js Camera

        │

Vector.project(camera)

        │

Canvas Coordinates

        │

page.mouse.click()
```

Only the simulator understands projection.

Playwright remains completely renderer agnostic.

---

# Test API

## World Clicks

```ts
await simulator.clickWorld({
    x: 2,
    y: 5,
})
```

---

## World Drag

```ts
await simulator.dragWorld(
    { x: 1, y: 1 },
    { x: 6, y: 2 },
)
```

---

## Goal Placement

```ts
await simulator.placeGoal({
    x: 8,
    y: 3,
})
```

Internally this becomes

```
world position

↓

screen projection

↓

mouse click
```

The test never knows screen coordinates.

---

# Browser Helper

Expose a small test-only API.

```ts
window.__E2E__ = {

    worldToScreen(position)

    screenToWorld(position)

}
```

Responsibilities:

- obtain active camera
- obtain renderer
- obtain canvas bounds
- project world coordinates
- return browser pixel coordinates

This helper should not modify simulation state.

It exists purely to translate coordinate systems.

---

# Projection Pipeline

```
World Position

↓

Camera View Matrix

↓

Projection Matrix

↓

Normalized Device Coordinates

↓

Canvas Coordinates

↓

Browser Mouse Event
```

The existing Three.js camera performs the projection.

No custom projection implementation should exist.

---

# Entity Helpers

Many interactions target entities rather than arbitrary coordinates.

Provide higher-level helpers.

Examples:

```ts
await simulator.clickRobot()

await simulator.clickGoal(0)

await simulator.clickObstacle("wall-2")
```

Internally:

```
Entity

↓

World Transform

↓

Screen Projection

↓

Mouse Click
```

This removes knowledge of object locations from tests.

---

# Visibility Checks

Before clicking, verify that the projected point is valid.

Checks:

- inside canvas
- visible to camera
- not behind camera
- not clipped
- not inside excluded HUD regions

Example:

```
project(world)

↓

visible?

↓

inside canvas?

↓

outside HUD?

↓

click
```

Failures should explain why interaction could not occur.

---

# HUD Safe Zones

Some HUD elements intentionally overlap the renderer.

Expose excluded screen regions.

Example:

```
HUD

+--------------------+

| Sidebar            |

|                    |

|                    |

+--------------------+

Canvas

+-------------------------------------+

|                                     |

|  Safe Click Area                    |

|                                     |

+-------------------------------------+
```

The E2E helper should reject click locations inside excluded regions.

This avoids accidental UI interactions.

---

# Playwright Fixture

Introduce a dedicated fixture.

```ts
const simulator = await launchSimulator()

await simulator.waitForIdle()

await simulator.clickWorld({
    x: 5,
    y: 4,
})

await simulator.expectGoalMarker()

await simulator.waitForGoalReached()
```

Tests become readable user stories.

---

# Future Extensions

## Camera Helpers

```ts
await simulator.focusRobot()

await simulator.resetCamera()

await simulator.lookAt(goal)
```

---

## Coordinate Helpers

```ts
const point = await simulator.worldToScreen({
    x: 3,
    y: 8,
})
```

Useful for assertions.

---

## Entity Queries

```ts
await simulator.clickEntity(robot)

await simulator.hoverEntity(goal)

await simulator.dragEntity(obstacle)
```

---

## Agent Support

Future autonomous agents should also interact through this API.

Allowed operations:

- clickWorld
- dragWorld
- keyboard
- mouse
- UI controls

Agents should never access simulation internals.

---

# Benefits

## Stable Tests

Camera changes no longer require updating every test.

---

## Deterministic

Interactions become reproducible across machines.

---

## Readable

Tests express intent.

Instead of:

```ts
await page.mouse.click(641, 382)
```

they read:

```ts
await simulator.placeGoal({
    x: 6,
    y: 4,
})
```

---

## Renderer Agnostic

Projection logic lives entirely inside the simulator.

Playwright only performs browser interactions.

---

## Easier Maintenance

Projection math exists in exactly one place.

Future rendering changes require updating only the helper implementation.

---

# Success Criteria

- [x] No Playwright test contains hardcoded canvas coordinates
      — the pixel-based `placeGoal(page, fx, fy)` / `queueGoal` helpers were
        removed from `e2e/fixtures.ts`; every interaction now goes through
        `Simulator` in `e2e/simulator.ts` and expresses itself in world
        metres.
- [x] World-space interactions are deterministic
      — `sim.placeGoal({ x: 3, y: -2 })` places the goal at exactly `(3, -2)`,
        round-tripping `worldToScreen` → click → `screenToWorld` to the source
        point (probed in the `probe` migration). Projection comes from the
        live Three.js camera, never from test-side math.
- [x] Camera changes do not require test updates
      — tests never reference the camera; `packages/rendering/src/e2e-bridge.tsx`
        reuses `camera` / `gl` from `useThree`, so moving the camera, changing
        FOV, or resizing the canvas only changes where a world point lands
        on screen, not the test.
- [x] Browser interactions remain realistic
      — every click is a real `page.mouse.click` at the projected client
        coordinate; `placeGoal` / `queueGoal` still exercise the public UI
        (`GoalPicker` `onClick` → store `setGoal` / `addGoal`), never state
        directly.
- [x] HUD overlap is automatically avoided
      — `Simulator.hudRects()` gathers the live bounding boxes of every
        `pointer-events-auto` overlay and `clickWorld` rejects (or, with a
        fallback, nudges) clicks that would land under a HUD, with an
        explanatory error. This turned a silent "goal never placed" into a
        precise failure (and the `probe` proves the `nudge` path).
- [x] Projection logic has a single implementation
      — `E2EBridge` is the only place that turns world ↔ screen; nothing in
        the E2E layer re-implements projection.
- [x] Tests describe user intent rather than pixel locations
      — `navigation.spec.ts` reads `await sim.placeGoal({ x: 2, y: -1.5 })` ≠
        `await page.mouse.click(641, 382)`.
- [x] Future agent testing uses the same interaction API
      — the same headless `window.__E2E__` + `Simulator` fixture is the
        public surface agents may drive; the bridge mutates no state, so it
        is safe to ship to production builds (and the E2E suite already runs
        against the real `vite preview` build).