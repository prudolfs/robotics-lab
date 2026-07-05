// Occupancy grid public API.
//
// Cell values stored as log-odds: `0 = unknown`, `>0 = occupied`, `<0 = free`.
// The modules re-exported below are the building blocks of stereo-with-noise
// occupancy mapping:
//
//   grid.ts          — fixed-size plane over the world, coordinate conversions
//   probability.ts   — log-odds <-> probability, classification, clamping
//   raycast.ts       — DDA cell traversal of a world-space segment
//   update.ts        — apply a lidar scan, mark cells, reset, snapshot/restore
//   serialization.ts— JSON / ROS-style [0,255] / probability array export
//
// Consumers only need the helpers re-exported here (deep module: shallow API,
// hidden internal complexity).

import type { Vec2 } from '@robotics-lab/geometry'
import type { GridParams, OccupancyGrid } from './grid'

export type { Cell2, GridParams, OccupancyGrid } from './grid'
export {
	cellCenterWorld,
	createGridInternal,
	indexToCell,
	worldToCell,
	worldToIndex,
} from './grid'
export type { OccupancyClass } from './probability'
export {
	clampLogOdds,
	classify,
	LOG_ODDS_CLAMP,
	logOdds,
	probability,
	UNKNOWN_PROB,
} from './probability'
export type { Visit } from './raycast'
export { traceSegment } from './raycast'
export type { SerializedGrid } from './serialization'
export {
	deserializeGrid,
	serializeGrid,
	toOccupancyBytes,
	toProbabilityGrid,
} from './serialization'
export type { UpdateParams } from './update'
export {
	applyScan,
	cloneCells,
	DEFAULT_UPDATE_PARAMS,
	markFree,
	markOccupied,
	markPointOccupied,
	resetGrid,
	restoreCells,
} from './update'

// --- Convenience constructors / accessors -----------------------------------------
// These wrap the lower-level helpers with the conventions the original API
// promised: `cellIndex` for a world point, `getCell` / `setCell` flat access.

import { createGridInternal, worldToIndex } from './grid'

export function createGrid(params: GridParams): OccupancyGrid {
	return createGridInternal(params, 0)
}

/** Index of the cell containing `world`, or `-1` if outside the grid. */
export function cellIndex(grid: OccupancyGrid, world: Vec2): number {
	return worldToIndex(grid, world)
}

export type CellIndex = { col: number; row: number }

/** Read the log-odds value; out-of-range indices return `0` (unknown). */
export function getCell(grid: OccupancyGrid, index: number): number {
	if (index < 0 || index >= grid.cells.length) return 0
	return grid.cells[index]
}

/** Write a raw log-odds value (caller responsible for clamping). */
export function setCell(grid: OccupancyGrid, index: number, value: number): void {
	if (index < 0 || index >= grid.cells.length) return
	grid.cells[index] = value
}
