// Tests for the grid search planners (A* and Dijkstra).
//
// The grids below are tiny and hand-shaped so the assertions can pin exact
// paths rather than fight a 200x200 map. Each fixture marks a few cells as
// occupied directly via the cells array so we never have to run the lidar
// mapping pipeline to set up a planning test.
//
// Two conventions to keep the fixtures stable under the default inflation:
//   - structural "does it go through occupied cells" assertions use
//     `inflationRadius: 0` so the planner sees the raw obstacle data; and
//   - "inflation keeps a margin" assertions use larger grids so the
//     inflation ring around an obstacle cannot reach the start / goal cells.

import { createGrid, type OccupancyGrid, setCell } from '@robotics-lab/occupancy-grid'
import { expect, test } from 'vitest'
import {
	aStar,
	type Cell2,
	dijkstra,
	euclideanHeuristic,
	manhattanHeuristic,
	octileHeuristic,
	type SearchStatus,
	zeroHeuristic,
} from './pathfinding'

/** Build a small blank grid and return it for the test to shape. */
function makeGrid(w: number, h: number, resolution = 1): OccupancyGrid {
	return createGrid({ width: w, height: h, resolution, origin: { x: 0, y: 0 } })
}

/** Mark a cell occupied (strong log-odds) by cell coordinates. */
function occupy(grid: OccupancyGrid, col: number, row: number): void {
	setCell(grid, row * grid.width + col, 3)
}

// --- Algorithm essentials ---------------------------------------------------

test('A* returns a straight path on an empty grid', () => {
	const grid = makeGrid(7, 7)
	const { status, path } = aStar(grid, { col: 0, row: 0 }, { col: 6, row: 0 })
	expect(status).toBe('ok')
	expect(path[0]).toEqual({ col: 0, row: 0 })
	expect(path[path.length - 1]).toEqual({ col: 6, row: 0 })
	expect(path.length).toBe(7)
})

test('A* route cost equals the Manhattan distance on an open 4-connected grid', () => {
	const grid = makeGrid(7, 7)
	const { cost } = aStar(grid, { col: 0, row: 0 }, { col: 6, row: 0 })
	expect(cost).toBe(6)
})

test('A* avoids occupied cells and routes via the gap', () => {
	const grid = makeGrid(5, 5)
	// Vertical wall at col 2 with a one-cell gap at row 2. With the default
	// inflation radius the gap would be sealed by its neighbours, so use the
	// raw (inflation 0) grid: only the occupied cells themselves are blocked.
	for (let row = 0; row < 5; row++) if (row !== 2) occupy(grid, 2, row)
	const { status, path } = aStar(
		grid,
		{ col: 0, row: 0 },
		{ col: 4, row: 4 },
		{
			inflationRadius: 0,
		},
	)
	expect(status).toBe('ok')
	// No planned cell may sit inside an occupied cell — the route must use the gap.
	for (const cell of path) {
		if (cell.col === 2) expect(cell.row).toBe(2)
	}
	expect(path[path.length - 1]).toEqual({ col: 4, row: 4 })
})

test('A* reports no_path when the goal region is fully walled off', () => {
	const grid = makeGrid(9, 9)
	// Seal the goal cell (4,4) with a ring on its 8 neighbours, leaving the
	// goal free so the planner reports `no_path` (not `invalid_goal`). With
	// the default inflation radius the blocked mask extends the ring outward;
	// a 9x9 grid gives plenty of room so the start (0,0) stays clear.
	for (let dr = -1; dr <= 1; dr++) {
		for (let dc = -1; dc <= 1; dc++) {
			if (dc === 0 && dr === 0) continue
			occupy(grid, 4 + dc, 4 + dr)
		}
	}
	const { status, path } = aStar(
		grid,
		{ col: 0, row: 0 },
		{ col: 4, row: 4 },
		{
			inflationRadius: 0,
		},
	)
	expect(status).toBe('no_path')
	expect(path).toEqual([])
})

test('A* reports invalid_start / invalid_goal for out-of-bounds cells', () => {
	const grid = makeGrid(3, 3)
	const a = aStar(grid, { col: -1, row: 0 }, { col: 2, row: 2 })
	expect(a.status).toBe('invalid_start')
	const b = aStar(grid, { col: 0, row: 0 }, { col: 9, row: 9 })
	expect(b.status).toBe('invalid_goal')
})

test('A* reports invalid_start when the start cell is occupied', () => {
	const grid = makeGrid(3, 3)
	occupy(grid, 0, 0)
	const { status } = aStar(grid, { col: 0, row: 0 }, { col: 2, row: 2 })
	expect(status).toBe('invalid_start')
})

test('A* inflationRadius keeps the route at least one cell away from an obstacle', () => {
	const grid = makeGrid(9, 9)
	occupy(grid, 4, 4)
	const { status, path } = aStar(
		grid,
		{ col: 0, row: 0 },
		{ col: 8, row: 8 },
		{
			inflationRadius: 1,
		},
	)
	expect(status).toBe('ok')
	// No planned cell sits within Chebyshev distance 1 of the obstacle.
	for (const cell of path) {
		const dist = Math.max(Math.abs(cell.col - 4), Math.abs(cell.row - 4))
		expect(dist).toBeGreaterThan(1)
	}
	expect(path[path.length - 1]).toEqual({ col: 8, row: 8 })
})

test('A* with inflationRadius 0 is allowed to use cells adjacent to an obstacle', () => {
	const grid = makeGrid(9, 9)
	occupy(grid, 4, 4)
	// With inflation 0, cells touching the obstacle are usable: a goal sitting
	// one cell diagonally away is reachable (it would be blocked with inflation 1).
	const adjacent = aStar(grid, { col: 0, row: 0 }, { col: 3, row: 3 }, { inflationRadius: 0 })
	expect(adjacent.status).toBe('ok')
	// And the inflation-1 planner refuses that same goal (the goal cell is in
	// the obstacle's blocked ring), reporting `invalid_goal`.
	const ringed = aStar(grid, { col: 0, row: 0 }, { col: 3, row: 3 }, { inflationRadius: 1 })
	expect(ringed.status).toBe('invalid_goal')
})

test('A* allowUnknown is the default — blocking unknown requires allowUnknown=false', () => {
	const grid = makeGrid(5, 1)
	// Cells in the middle are unknown (0). With the default (allowUnknown true)
	// the search routes straight through; opting out forces no_path.
	const open = aStar(grid, { col: 0, row: 0 }, { col: 4, row: 0 })
	expect(open.status).toBe('ok')
	expect(open.path.length).toBe(5)
	const blocked = aStar(
		grid,
		{ col: 0, row: 0 },
		{ col: 4, row: 0 },
		{
			allowUnknown: false,
		},
	)
	expect(blocked.status).not.toBe('ok')
})

test('A* diagonal=true takes fewer steps with diagonal moves', () => {
	const grid = makeGrid(5, 5)
	const ortho = aStar(grid, { col: 0, row: 0 }, { col: 4, row: 4 })
	const diag = aStar(grid, { col: 0, row: 0 }, { col: 4, row: 4 }, { diagonal: true })
	expect(diag.status).toBe('ok')
	// Diagonal path visits fewer cells than the orthogonal route (octile).
	expect(diag.path.length).toBeLessThan(ortho.path.length)
})

test('A* diagonal path does not clip through corner-touching obstacles', () => {
	const grid = makeGrid(9, 9)
	// Two obstacles meeting at a corner right in front of the start — the
	// corner-clip test. Place them away from the start so inflation can't
	// fence the start in.
	occupy(grid, 4, 3)
	occupy(grid, 3, 4)
	const { status, path } = aStar(
		grid,
		{ col: 0, row: 0 },
		{ col: 8, row: 8 },
		{
			diagonal: true,
			inflationRadius: 0,
		},
	)
	expect(status).toBe('ok')
	// The path must not pass through either obstacle cell.
	expect(path).not.toContainEqual({ col: 4, row: 3 })
	expect(path).not.toContainEqual({ col: 3, row: 4 })
	// And cannot make the diagonal jump between the two corner-touching cells
	// (that would require both orthogonal neighbours to be clear); verify that
	// no consecutive pair in the path is (3,3)->(4,4) which is the clip jump.
	for (let i = 1; i < path.length; i++) {
		const a = path[i - 1]
		const b = path[i]
		const is3to3 = a.col === 3 && a.row === 3 && b.col === 4 && b.row === 4
		expect(is3to3).toBe(false)
	}
})

test('A* visits the closed and open sets for visualization', () => {
	const grid = makeGrid(5, 5)
	occupy(grid, 2, 2)
	const { closed, open } = aStar(
		grid,
		{ col: 0, row: 0 },
		{ col: 4, row: 4 },
		{
			inflationRadius: 0,
		},
	)
	// The search must have expanded some cells.
	expect(closed.length).toBeGreaterThan(0)
	// Closed cells should all be inside the grid.
	for (const c of closed) {
		expect(c.col).toBeGreaterThanOrEqual(0)
		expect(c.col).toBeLessThan(5)
	}
	for (const c of open) {
		expect(c.col).toBeGreaterThanOrEqual(0)
		expect(c.col).toBeLessThan(5)
	}
	// The start cell was popped (closed) immediately.
	expect(closed.some((c) => c.col === 0 && c.row === 0)).toBe(true)
})

test('Dijkstra finds the same optimal cost as A* on an open grid', () => {
	const grid = makeGrid(7, 7)
	const a = aStar(grid, { col: 0, row: 0 }, { col: 6, row: 6 }, { diagonal: true })
	const d = dijkstra(grid, { col: 0, row: 0 }, { col: 6, row: 6 }, { diagonal: true })
	expect(d.status).toBe('ok')
	// Dijkstra is admissible-optimal; A* with an admissible heuristic matches it.
	expect(d.cost).toBeCloseTo(a.cost, 6)
})

test('Dijkstra explores broadly — expanded no fewer nodes than A* on the same grid', () => {
	const grid = makeGrid(9, 9)
	const a = aStar(grid, { col: 0, row: 0 }, { col: 8, row: 8 })
	const d = dijkstra(grid, { col: 0, row: 0 }, { col: 8, row: 8 })
	expect(a.iterations).toBeLessThanOrEqual(d.iterations)
})

test('A* respects the maxIterations budget', () => {
	const grid = makeGrid(5, 5)
	occupy(grid, 2, 0)
	occupy(grid, 2, 1)
	occupy(grid, 2, 2)
	occupy(grid, 2, 3)
	const { status } = aStar(grid, { col: 0, row: 0 }, { col: 4, row: 4 }, { maxIterations: 1 })
	expect(status).toBe('limit')
})

// --- Heuristics -----------------------------------------------------------

test('heuristics return expected values for simple inputs', () => {
	const a: Cell2 = { col: 0, row: 0 }
	const b: Cell2 = { col: 3, row: 4 }
	expect(euclideanHeuristic(a, b)).toBeCloseTo(5, 9)
	expect(manhattanHeuristic(a, b)).toBe(7)
	expect(zeroHeuristic(a, b)).toBe(0)
	// octile = 7 + (SQRT2 - 2) * min(3,4) = 7 + 3*SQRT2 - 6
	expect(octileHeuristic(a, b)).toBeCloseTo(7 + (Math.SQRT2 - 2) * 3, 9)
})

// --- SearchStatus type sanity ----------------------------------------------

test('SearchStatus is a closed set', () => {
	const ok: SearchStatus = 'ok'
	const noPath: SearchStatus = 'no_path'
	const invalid: SearchStatus = 'invalid_start'
	expect([ok, noPath, invalid]).toEqual(['ok', 'no_path', 'invalid_start'])
})
