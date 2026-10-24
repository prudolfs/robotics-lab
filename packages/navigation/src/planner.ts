// High-level path planner: take world-space start and goal points and return
// a smoothed world-space waypoint list the go-to-goal controller can feed to
// the robot.
//
// This is the public façade the simulator loop calls into. It hides the
// grid<->world conversions, the algorithm choice and the smoothing passes
// behind a single `planPath` call that takes a live `OccupancyGrid`, the
// robot's current pose and the requested goal, and returns:
//
//   - the smoothed world-space waypoints (the queue to drive),
//   - the raw cell path A* found,
//   - the open / closed cells the search expanded (for visualization),
//   - the planning outcome flag.
//
// Determinism note: the planner is a pure function of (grid, start, goal,
// options). It consults the grid the sim attaches each frame and never reaches
// out to React / Zustand / the browser, so the same inputs always produce the
// same plan in Node, the browser and tests.

import type { Vec2 } from '@robotics-lab/geometry'
import {
	type Cell2,
	cellCenterWorld,
	type OccupancyGrid,
	worldToCell,
} from '@robotics-lab/occupancy-grid'
import { aStar, dijkstra, type SearchResult, type SearchStatus } from './pathfinding'
import { smoothToWorld } from './smoothing'

/** Which search algorithm to use for planning. */
export type PlannerAlgorithm = 'astar' | 'dijkstra'

/** Tuning knobs exposed at the call site. */
export type PlannerOptions = Parameters<typeof aStar>[3] & {
	/** Algorithm to run. Default `astar`. */
	algorithm?: PlannerAlgorithm
}

/** Result of a high-level planning request. */
export type PlanResult = {
	/** Outcome flag of the underlying search. */
	status: SearchStatus
	/** Smoothed world-space waypoints from start (exclusive) to goal
	 *  (inclusive). The robot is already at the start cell so the first cell
	 *  is dropped to avoid commanding a zero-distance jump; when the search
	 *  fails this is empty. Callers should stop and surface the failure. */
	waypoints: Vec2[]
	/** Raw cell path the search returned (start..goal, inclusive). */
	cellPath: Cell2[]
	/** Cells expanded into the closed set — for visualization (world centres). */
	closed: Vec2[]
	/** Cells ever queued to the open frontier — for visualization (world centres). */
	open: Vec2[]
	/** Cost of the returned cell path (grid-cell units). */
	cost: number
	/** Number of node expansions the search performed. */
	iterations: number
}

/**
 * Plan a route from `start` to `goal` over `grid`. Returns a `PlanResult`
 * whose `waypoints` are ready to enqueue as navigation goals.
 *
 * Behaviour in one sentence: "find a grid path with A*, smooth it to the
 * shortest collision-free polyline, and return the world points between the
 * corners." If the start / goal are the same cell, the path is trivially the
 * goal point itself.
 */
export function planPath(
	grid: OccupancyGrid,
	start: Vec2,
	goal: Vec2,
	options: PlannerOptions = {},
): PlanResult {
	const algorithm = options.algorithm ?? 'astar'
	const startCell = worldToCell(grid, start)
	const goalCell = worldToCell(grid, goal)

	const result: SearchResult =
		algorithm === 'dijkstra'
			? dijkstra(grid, startCell, goalCell, options)
			: aStar(grid, startCell, goalCell, options)

	if (result.status !== 'ok') {
		return {
			status: result.status,
			waypoints: [],
			cellPath: result.path,
			closed: cellsToWorld(grid, result.closed),
			open: cellsToWorld(grid, result.open),
			cost: result.cost,
			iterations: result.iterations,
		}
	}

	// Smooth the cell path to a collision-free polyline, then push it to world
	// coordinates. The first cell is the robot's current cell; dropping it
	// prevents a zero-distance "arrive now" command being queued.
	const smoothing = smoothToWorld(grid, result.path, {
		inflationRadius: options.inflationRadius,
		allowUnknown: options.allowUnknown,
	})
	const inner = smoothing.slice(1)
	return {
		status: 'ok',
		waypoints: inner.length > 0 ? inner : smoothing,
		cellPath: result.path,
		closed: cellsToWorld(grid, result.closed),
		open: cellsToWorld(grid, result.open),
		cost: result.cost,
		iterations: result.iterations,
	}
}

function cellsToWorld(grid: OccupancyGrid, cells: Cell2[]): Vec2[] {
	return cells.map((c) => cellCenterWorld(grid, c.col, c.row))
}
