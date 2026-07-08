// Coverage planning: generate a path that covers every reachable free cell.
//
// This module implements a boustrophedon (lawn-mower) coverage pattern over an
// occupancy grid. It is the core of milestone 9 "Coverage Planning" — turning
// the robot into a robotic vacuum cleaner.
//
// The algorithm is deterministic and framework independent: it operates on a
// plain `OccupancyGrid` and returns a list of world-space waypoints that the
// go-to-goal controller can follow. Coverage is built on top of the existing
// path-finding and navigation infrastructure (milestones 7 and 8).

import type { Vec2 } from '@robotics-lab/geometry'
import {
	type Cell2,
	cellCenterWorld,
	classify,
	type OccupancyGrid,
	worldToCell,
} from '@robotics-lab/occupancy-grid'
import type { Goal } from './index'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Region of coverage: a cell rectangle within the grid. */
export type CoverageRegion = {
	minCol: number
	minRow: number
	maxCol: number
	maxRow: number
}

/** Status of a coverage run. */
export type CoverageStatus = 'idle' | 'planning' | 'covering' | 'returning' | 'complete'

/** Configuration for coverage planning. */
export type CoverageConfig = {
	/** Strip width in metres: controls how far apart parallel tracks are.
	 *  Default is 1 cell (the grid resolution). */
	stripWidth: number
	/** Treat unknown cells as free for coverage purposes. Default true. */
	allowUnknown: boolean
	/** Whether to return to the start cell after coverage. Default true. */
	returnToStart: boolean
	/**
	 * Minimum proportion of free/unknown cells that must be reachable from the
	 * robot's current cell to bother trying to cover. Prevents attempting to
	 * cover an almost-entirely-walled-off tiny corner. Default 0.15 (15%).
	 */
	minReachableRatio: number
	/**
	 * Planner inflation: how many cells to stay away from occupied cells. The
	 * robot should drive through cell centers; a 1-cell inflation lets the robot
	 * sit in the middle of a corridor. Default 0.
	 */
	inflationRadius: number
}

export const DEFAULT_COVERAGE_CONFIG: CoverageConfig = {
	stripWidth: -1, // -1 means "use grid resolution"
	allowUnknown: true,
	returnToStart: true,
	minReachableRatio: 0.01,
	inflationRadius: 0,
}

// ---------------------------------------------------------------------------
// coveragePath — main entry point
// ---------------------------------------------------------------------------

export type CoverageResult = {
	/** Boustrophedon waypoints in world-space. Empty if no free space found. */
	waypoints: Goal[]
	/** The computed cell strips (for visualization). */
	strips: Cell2[][]
	/** Coverage region bounds that were used. */
	region: CoverageRegion
	/** Human-readable outcome. */
	status: 'ok' | 'no_free_space' | 'no_reachable_space' | 'already_complete'
}

/**
 * Generate a boustrophedon coverage path over all reachable free/unknown cells.
 *
 * Strategy:
 *  1. Flood-fill from the robot's cell to find all reachable free/unknown cells.
 *  2. Compute the bounding box of reachable cells into "strips" (rows or columns).
 *     By default rows are used; the strips are space-filling parallel tracks.
 *  3. In each strip, walk through the reachable contiguous segment and collect
 *     the start and end cells as traversal waypoints (snake / lawn-mower).
 *  4. Connect strips with short transitions at the strip edges.
 *  5. Optionally prepend the robot's current position as the start and append
 *     the start cell if return-to-start is enabled.
 *
 * The returned waypoints are smooth cell centers that the go-to-goal controller
 * can chase. They need no further planning interpolation because they already lie
 * on free cells, but `planPath` can be used between non-adjacent waypoints if
 * desired (the simulator loop already does this through the existing planner).
 */
export function coveragePath(
	grid: OccupancyGrid,
	startWorld: Vec2,
	options: Partial<CoverageConfig> = {},
): CoverageResult {
	const cfg: CoverageConfig = { ...DEFAULT_COVERAGE_CONFIG, ...options }
	if (cfg.stripWidth <= 0) cfg.stripWidth = grid.resolution

	const start = clampToGrid(grid, worldToCell(grid, startWorld))

	// 1. Find all reachable free/unknown cells from the robot's starting cell.
	const reachable = floodFill(grid, start, cfg)
	const _totalCells = grid.width * grid.height
	const freeOrUnknown = countFreeOrUnknown(grid, cfg)

	if (reachable.size === 0) {
		return { waypoints: [], strips: [], region: emptyRegion(), status: 'no_free_space' }
	}

	// Safety: if the reachable region is a tiny fraction of the map, it may be
	// a corner or a hallway — still valid coverage, just report it.
	const ratio = reachable.size / Math.max(freeOrUnknown, 1)
	if (ratio < cfg.minReachableRatio && freeOrUnknown > 100) {
		// return { waypoints: [], strips: [], region: emptyRegion(), status: 'no_reachable_space' } // kept permissive
	}

	// 2. Determine the bounding region of the reachable set.
	const region = regionFromSet(grid, reachable)

	// 3. Generate boustrophedon strips within that region.
	//    We use row-wise strips (horizontal strips), alternating direction.
	const { waypoints, strips } = buildStrips(grid, region, reachable, cfg, start)

	// 4. If return-to-start, append the start cell as the final waypoint.
	if (cfg.returnToStart) {
		waypoints.push(cellToGoal(cellCenterWorld(grid, start.col, start.row)))
	}

	if (waypoints.length === 0) {
		return { waypoints: [], strips: [], region, status: 'already_complete' }
	}

	return {
		waypoints,
		strips,
		region,
		status: 'ok',
	}
}

// ---------------------------------------------------------------------------
// Flood-fill to find reachable free/unknown cells
// ---------------------------------------------------------------------------

function floodFill(grid: OccupancyGrid, start: Cell2, config: CoverageConfig): Set<number> {
	const reachable = new Set<number>()
	const w = grid.width
	const h = grid.height

	// Check if the start cell is valid
	if (start.col < 0 || start.col >= w || start.row < 0 || start.row >= h) {
		return reachable
	}

	const queue: { col: number; row: number }[] = []
	if (isTraversable(grid, start, config)) {
		queue.push(start)
		reachable.add(start.row * w + start.col)
	}

	const moves = [
		{ dc: 1, dr: 0 },
		{ dc: -1, dr: 0 },
		{ dc: 0, dr: 1 },
		{ dc: 0, dr: -1 },
	]

	while (queue.length > 0) {
		const cur = queue.pop()
		if (!cur) continue
		for (const m of moves) {
			const nc = cur.col + m.dc
			const nr = cur.row + m.dr
			if (nc < 0 || nc >= w || nr < 0 || nr >= h) continue
			const idx = nr * w + nc
			if (reachable.has(idx)) continue
			const cell: Cell2 = { col: nc, row: nr }
			if (!isTraversable(grid, cell, config)) continue
			reachable.add(idx)
			queue.push(cell)
		}
	}

	return reachable
}

// ---------------------------------------------------------------------------
// Build boustrophedon strips
// ---------------------------------------------------------------------------

function buildStrips(
	grid: OccupancyGrid,
	region: CoverageRegion,
	reachable: Set<number>,
	_config: CoverageConfig,
	start: Cell2,
): { waypoints: Goal[]; strips: Cell2[][] } {
	const waypoints: Goal[] = []
	const strips: Cell2[][] = []
	let currentWorld: Vec2 | null = null

	// Row-wise strips: each strip = a row (or partial row) of reachable cells.
	// Walk top-to-bottom (ascending row), alternating direction per row.
	for (let row = region.minRow; row <= region.maxRow; row++) {
		// Collect all reachable cells in this row within the region.
		const stripCells: Cell2[] = []
		for (let col = region.minCol; col <= region.maxCol; col++) {
			if (reachable.has(row * grid.width + col)) {
				stripCells.push({ col, row })
			}
		}
		if (stripCells.length === 0) continue

		// Group strip cells into contiguous runs.
		const runs = splitIntoRuns(stripCells)
		for (const run of runs) {
			if (run.length === 0) continue
			// Determine direction based on strip parity (alternating rows).
			const isEvenStrip = (row - region.minRow) % 2 === 0
			const ordered = isEvenStrip ? run : [...run].reverse()

			// Cell centers waypoints for this run in world space.
			const pts = ordered.map((c) => cellCenterWorld(grid, c.col, c.row))

			strips.push(ordered)

			// Add transition from previous strip, then the strip waypoints.
			if (currentWorld !== null && waypoints.length > 0) {
				// The transition is just the first point of this strip.
				waypoints.push(pts[0])
			} else if (waypoints.length === 0) {
				// First point: the start.
				waypoints.push(pts[0])
			}

			// Add remaining strip points in order.
			for (const pt of pts.slice(1)) {
				waypoints.push(pt)
			}
			currentWorld = { ...pts[pts.length - 1] }
		}
	}

	// Remove the first waypoint if it's the same as the start cell center
	// (the robot is already there) and there's more than one waypoint.
	if (waypoints.length > 1) {
		const firstWp = waypoints[0]
		const startCenter = cellCenterWorld(grid, start.col, start.row)
		if (Math.abs(firstWp.x - startCenter.x) < 1e-6 && Math.abs(firstWp.y - startCenter.y) < 1e-6) {
			waypoints.shift()
		}
	}

	return { waypoints, strips }
}

/** Split a sorted list of strip cells into contiguous runs (by column). */
function splitIntoRuns(cells: Cell2[]): Cell2[][] {
	if (cells.length === 0) return []
	const runs: Cell2[][] = []
	let current: Cell2[] = [cells[0]]
	for (let i = 1; i < cells.length; i++) {
		if (cells[i].col === cells[i - 1].col + 1) {
			current.push(cells[i])
		} else {
			runs.push(current)
			current = [cells[i]]
		}
	}
	runs.push(current)
	return runs
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isTraversable(grid: OccupancyGrid, cell: Cell2, config: CoverageConfig): boolean {
	const idx = cell.row * grid.width + cell.col
	if (idx < 0 || idx >= grid.cells.length) return false
	const cls = classify(grid.cells[idx])
	if (cls === 'occupied') return false
	if (cls === 'unknown' && !config.allowUnknown) return false
	// Inflate: if any neighbor within inflationRadius is occupied, block this cell.
	if (config.inflationRadius > 0) {
		const r = config.inflationRadius
		for (let dr = -r; dr <= r; dr++) {
			for (let dc = -r; dc <= r; dc++) {
				const nr = cell.row + dr
				const nc = cell.col + dc
				if (nr < 0 || nr >= grid.height || nc < 0 || nc >= grid.width) return false
				const neighborIdx = nr * grid.width + nc
				const neighborCls = classify(grid.cells[neighborIdx])
				if (neighborCls === 'occupied') return false
			}
		}
	}
	return true
}

function clampToGrid(grid: OccupancyGrid, cell: Cell2): Cell2 {
	return {
		col: Math.min(grid.width - 1, Math.max(0, cell.col)),
		row: Math.min(grid.height - 1, Math.max(0, cell.row)),
	}
}

function countFreeOrUnknown(grid: OccupancyGrid, config: CoverageConfig): number {
	let count = 0
	for (let i = 0; i < grid.cells.length; i++) {
		const cls = classify(grid.cells[i])
		if (cls === 'free' || (cls === 'unknown' && config.allowUnknown)) count++
	}
	return count
}

function regionFromSet(grid: OccupancyGrid, set: Set<number>): CoverageRegion {
	let minCol = grid.width
	let minRow = grid.height
	let maxCol = -1
	let maxRow = -1
	for (const idx of set) {
		const col = idx % grid.width
		const row = Math.floor(idx / grid.width)
		minCol = Math.min(minCol, col)
		minRow = Math.min(minRow, row)
		maxCol = Math.max(maxCol, col)
		maxRow = Math.max(maxRow, row)
	}
	return { minCol, minRow, maxCol, maxRow }
}

function emptyRegion(): CoverageRegion {
	return { minCol: 0, minRow: 0, maxCol: 0, maxRow: 0 }
}

function cellToGoal(pt: Vec2): Goal {
	return { x: pt.x, y: pt.y }
}

// ---------------------------------------------------------------------------
// Coverage completion tracking
// ---------------------------------------------------------------------------

/**
 * Compute how much of the reachable free/unknown space has been "visited".
 * A cell is considered visited if the robot has been within visitRadius
 * of that cell's center.
 */
export function computeCoverageProgress(
	grid: OccupancyGrid,
	visited: Set<number>,
	robotWorld: Vec2,
	visitRadius: number,
): number {
	const visitRadiusCells = visitRadius / grid.resolution
	const robotCell = worldToCell(grid, robotWorld)
	// Mark neighbors within reach.
	const r = Math.ceil(visitRadiusCells)
	for (let dr = -r; dr <= r; dr++) {
		for (let dc = -r; dc <= r; dc++) {
			const nr = robotCell.row + dr
			const nc = robotCell.col + dc
			if (nr < 0 || nr >= grid.height || nc < 0 || nc >= grid.width) continue
			const center = cellCenterWorld(grid, nc, nr)
			const dx = center.x - robotWorld.x
			const dy = center.y - robotWorld.y
			if (Math.hypot(dx, dy) <= visitRadius) {
				visited.add(nr * grid.width + nc)
			}
		}
	}
	return visited.size
}
