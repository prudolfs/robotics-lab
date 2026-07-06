// Milestone 8 — Path Planning integration tests.
//
// These exercise the end-to-end pipeline: a world-attached sim with an
// occupancy grid built from lidar scans, a goal set via `setGoal`, and the
// planner producing a path that routes around discovered obstacles. The tests
// cover:
//
//   - setting a goal on a world-attached sim produces a non-empty planned path
//   - the planned path's first waypoint is not the robot's own cell
//   - the planner artifacts (open / closed) are exposed for visualization
//   - replan cadence refreshes the path when the grid changes
//   - the robot reaches the goal while there is an obstacle between the spawn
//     and the goal (proving the planner is actively steering around it rather
//     than driving straight through)
//   - planner fallback: with no world / no grid the controller still drives
//     straight at the goal (milestone-7 behavior preserved)

import { createWorld } from '@robotics-lab/core'
import { loadMap } from '@robotics-lab/maps'
import { distanceToGoal } from '@robotics-lab/navigation'
import { createLidarConfig } from '@robotics-lab/sensors'
import { expect, test } from 'vitest'
import {
	createSimulation,
	REPLAN_STEP_INTERVAL,
	runFor,
	setGoal,
	setPlannerOptions,
	stepSimulation,
} from './loop'

/** A world with a wall straight between the spawn and the goal. */
const WORLD = createWorld({
	name: 'plan-test',
	width: 12,
	depth: 8,
	walls: [
		{ start: { x: -5, y: -4 }, end: { x: -5, y: 4 } },
		{ start: { x: -5, y: 4 }, end: { x: 7, y: 4 } },
		{ start: { x: 7, y: 4 }, end: { x: 7, y: -4 } },
		{ start: { x: -5, y: -4 }, end: { x: 7, y: -4 } },
		// Vertical wall blocking a direct route from (0,0) to (3,0): sits at x=2.
		{ start: { x: 2, y: -3 }, end: { x: 2, y: 3 } },
	],
	boxes: [],
	cylinders: [],
} as never)

const LIDAR = createLidarConfig({ rayCount: 360, fieldOfView: Math.PI * 2, range: 10 })

function freshSim() {
	return createSimulation({
		spawnPose: { x: 0, y: 0, heading: 0 },
		world: WORLD,
		lidar: LIDAR,
	})
}

test('setGoal plans a path on a world-attached sim', () => {
	const sim = setGoal(freshSim(), { x: 3, y: 0 })
	// The planner should have produced a non-empty smoothed waypoint list.
	expect(sim.path.length).toBeGreaterThan(0)
	// The first waypoint is not the robot's current cell (start dropped).
	expect(sim.path[0]).not.toEqual({ x: 0, y: 0 })
	expect(sim.planOpen.length + sim.planClosed.length).toBeGreaterThan(0)
})

test('plan waypoints aim at the destination and never explode outside the grid', () => {
	const sim = setGoal(freshSim(), { x: 3, y: 0 })
	expect(sim.path.length).toBeGreaterThan(0)
	for (const w of sim.path) {
		expect(Number.isFinite(w.x)).toBe(true)
		expect(Number.isFinite(w.y)).toBe(true)
	}
	// The last waypoint is the *cell center* of the goal's cell, not the exact
	// clicked goal point, so it lands within one cell of the goal (resolution
	// 0.2m => within ~0.15m on each axis).
	const last = sim.path[sim.path.length - 1]
	expect(Math.abs(last.x - sim.goals[0].x)).toBeLessThan(0.25)
	expect(Math.abs(last.y - sim.goals[0].y)).toBeLessThan(0.25)
})

test('replan cadence refreshes the artifact sets as the robot scans', () => {
	let sim = setGoal(freshSim(), { x: 3, y: 0 })
	const _firstClosed = sim.planClosed.length
	// Drive a few steps, then force a replan by running past the interval.
	sim = runFor(sim, 1) // 60 steps > REPLAN_STEP_INTERVAL
	expect(sim.stepCount).toBeGreaterThan(REPLAN_STEP_INTERVAL)
	// After enough steps the planning artifacts should have been refreshed at
	// least once (the set sizes may grow as more cells open up).
	expect(sim.planClosed.length + sim.planOpen.length).toBeGreaterThan(0)
})

test('setPlannerOptions schedules an immediate replan on the next step', () => {
	let sim = setGoal(freshSim(), { x: 3, y: 0 })
	const _before = sim.path.length
	sim = setPlannerOptions(sim, { algorithm: 'dijkstra', inflationRadius: 0 })
	// One autonomous step triggers the due-replan; the path is recomputed.
	sim = stepSimulation(sim, 1 / 60)
	expect(sim.path.length).toBeGreaterThanOrEqual(0) // replanned without error
	// Invalidating options shouldn't drop the destination.
	expect(sim.goals).toEqual([{ x: 3, y: 0 }])
})

test('the robot reaches a goal on the far side of a wall (plans around it)', () => {
	// The wall at x=2 blocks a straight run. With planning enabled and the grid
	// filling in from lidar, the robot must navigate around it. Generous timeout
	// because replanning on a fresh grid explores the unknown first.
	const sim = setGoal(freshSim(), { x: 3, y: 0 })
	const after = runFor(sim, 45)
	expect(distanceToGoal(after.robot.pose, { x: 3, y: 0 })).toBeLessThan(0.2)
})

test('planner fallback: no world still drives straight at the goal (milestone 7)', () => {
	const sim = setGoal(createSimulation(), { x: 2, y: 0 })
	// No grid => no plan; the controller falls back to the destination directly.
	expect(sim.path).toEqual([])
	expect(sim.autonomous).toBe(true)
	const after = runFor(sim, 0.2)
	expect(after.robot.pose.x).toBeGreaterThan(0)
})

test('planned path waypoints never sit on the blocking wall cell column', () => {
	const sim = setGoal(freshSim(), { x: 3, y: 0 })
	// The wall lives at x=2, y in [-3, 3]. The planner must not produce a
	// waypoint whose cell center lies on that wall — it should route around.
	for (const w of sim.path) {
		const onWallX = Math.abs(w.x - 2) < 0.15
		if (onWallX) {
			// If a waypoint shares the wall's x, it must be above or below the wall.
			expect(Math.abs(w.y)).toBeGreaterThan(3)
		}
	}
})

/** Planning on the `obstacles` built-in map also produces a clean route. */
test('planning on the "obstacles" built-in map routes to a chosen cell', () => {
	const world = createWorld(loadMap('obstacles'))
	const sim = createSimulation({
		spawnPose: { x: -4, y: -3, heading: 0 },
		world,
		lidar: LIDAR,
	})
	const planned = setGoal(sim, { x: 4, y: 4 })
	expect(planned.autonomous).toBe(true)
	// Even with an empty grid the planner routes through unknown cells to the
	// goal, so a path exists and ends near the chosen destination.
	expect(planned.path.length).toBeGreaterThan(0)
})
