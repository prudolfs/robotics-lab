// Tests for the high-level planner: world points in, world waypoints out,
// with the planner responsibility for the cost savings shortcuts, grid->world
// conversion and the "drop the start cell" convention that keeps the
// controller from jumping zero distance.

import {
	cellCenterWorld,
	createGrid,
	markPointOccupied,
	type OccupancyGrid,
} from '@robotics-lab/occupancy-grid'
import { expect, test } from 'vitest'

import { planPath } from './planner'

/** Fresh grid each test — never leak cell state across cases. */
function makeGrid(w: number, h: number): OccupancyGrid {
	return createGrid({ width: w, height: h, resolution: 0.5, origin: { x: 0, y: 0 } })
}
function occupyWorld(grid: OccupancyGrid, x: number, y: number): void {
	markPointOccupied(grid, { x, y }, 2)
}

test('planPath drives straight on an empty grid, ending on the goal', () => {
	const grid = makeGrid(9, 9)
	const start = cellCenterWorld(grid, 0, 0)
	const goal = cellCenterWorld(grid, 8, 8)
	const res = planPath(grid, start, goal)
	expect(res.status).toBe('ok')
	expect(res.waypoints.length).toBeGreaterThanOrEqual(1)
	// The final waypoint is the goal cell center.
	expect(res.waypoints[res.waypoints.length - 1]).toEqual(goal)
})

test('planPath routes around an obstacle instead of through it', () => {
	const grid = makeGrid(9, 9)
	// A wall along the main diagonal column so a straight line would cross it.
	occupyWorld(grid, cellCenterWorld(grid, 4, 4).x, cellCenterWorld(grid, 4, 4).y)
	occupyWorld(grid, cellCenterWorld(grid, 4, 5).x, cellCenterWorld(grid, 4, 5).y)
	occupyWorld(grid, cellCenterWorld(grid, 4, 3).x, cellCenterWorld(grid, 4, 3).y)
	const start = cellCenterWorld(grid, 0, 0)
	const goal = cellCenterWorld(grid, 8, 8)
	const res = planPath(grid, start, goal)
	expect(res.status).toBe('ok')
	// No waypoint may fall on the central obstacle cell.
	const obstacle = cellCenterWorld(grid, 4, 4)
	for (const w of res.waypoints) {
		expect(Math.hypot(w.x - obstacle.x, w.y - obstacle.y)).toBeGreaterThan(0)
	}
	expect(res.waypoints[res.waypoints.length - 1]).toEqual(goal)
})

test('planPath returns an empty waypoint list with status when the goal is unreachable', () => {
	const grid = makeGrid(9, 9)
	// Seal the goal cell (4,4) with a ring on its 8 neighbours, goal left free.
	const goal = cellCenterWorld(grid, 4, 4)
	for (let dr = -1; dr <= 1; dr++) {
		for (let dc = -1; dc <= 1; dc++) {
			if (dc === 0 && dr === 0) continue
			const c = cellCenterWorld(grid, 4 + dc, 4 + dr)
			occupyWorld(grid, c.x, c.y)
		}
	}
	const start = cellCenterWorld(grid, 0, 0)
	const res = planPath(grid, start, goal, { inflationRadius: 0 })
	expect(res.status).toBe('no_path')
	expect(res.waypoints).toEqual([])
})

test('planPath returns the single goal point when start and goal share a cell', () => {
	const grid = makeGrid(5, 5)
	const start = cellCenterWorld(grid, 2, 2)
	const goal = cellCenterWorld(grid, 2, 2)
	const res = planPath(grid, start, goal)
	expect(res.status).toBe('ok')
	expect(res.waypoints).toEqual([goal])
})

test('planPath drops the robot own cell from the waypoint queue', () => {
	const grid = makeGrid(7, 1)
	const start = cellCenterWorld(grid, 0, 0)
	const goal = cellCenterWorld(grid, 6, 0)
	const res = planPath(grid, start, goal)
	expect(res.status).toBe('ok')
	expect(res.waypoints[0]).not.toEqual(start) // robot cell dropped
	expect(res.waypoints[res.waypoints.length - 1]).toEqual(goal)
})

test('planPath uses dijkstra when algorithm is dijkstra', () => {
	const grid = makeGrid(9, 9)
	const start = cellCenterWorld(grid, 0, 0)
	const goal = cellCenterWorld(grid, 8, 0)
	const astar = planPath(grid, start, goal, { algorithm: 'astar' })
	const dijk = planPath(grid, start, goal, { algorithm: 'dijkstra' })
	expect(dijk.status).toBe('ok')
	// Both optimal-cost planners reach the goal.
	expect(astar.waypoints[astar.waypoints.length - 1]).toEqual(goal)
	expect(dijk.waypoints[dijk.waypoints.length - 1]).toEqual(goal)
})

test('planPath exposes the open / closed cell sets in world coordinates', () => {
	const grid = makeGrid(5, 5)
	const start = cellCenterWorld(grid, 0, 0)
	const goal = cellCenterWorld(grid, 4, 4)
	occupyWorld(grid, cellCenterWorld(grid, 2, 2).x, cellCenterWorld(grid, 2, 2).y)
	const res = planPath(grid, start, goal)
	expect(res.status).toBe('ok')
	// Closed set is non-empty and lives within the grid bounds.
	expect(res.closed.length).toBeGreaterThan(0)
	for (const w of res.closed) {
		expect(w.x).toBeGreaterThanOrEqual(0)
		expect(w.y).toBeGreaterThanOrEqual(0)
	}
	expect(res.iterations).toBeGreaterThan(0)
})
