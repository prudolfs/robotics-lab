// Occupancy grid representation.
//
// A grid is a fixed-size plane of cells laid over the world. Each cell stores
// a log-odds occupancy value:
//
//   log-odds = 0        -> unknown (no evidence either way)
//   log-odds > 0        -> occupied
//   log-odds < 0        -> free
//
// Log-odds are used because they are additively updatable (just add the per-hit
// / per-miss increment) and stay bounded for any finite amount of evidence.
// The value is clamped to [-CLAMP, +CLAMP] so noisy or repeated scans cannot
// drive a cell to a state that can never be reversed.
//
// Convention used throughout the package:
//   `col` advances along world +x
//   `row` advances along world +y
//   flat index = row * width + col   (row-major)

import type { Vec2 } from '@robotics-lab/geometry'

export type OccupancyGrid = {
	width: number
	height: number
	/** World units per cell. Length of one cell side in metres. */
	resolution: number
	/** World point that sits at the centre of cell (col=0,row=0). */
	origin: Vec2
	cells: Float32Array
}

export type GridParams = {
	width: number
	height: number
	resolution: number
	origin?: Vec2
}

/**
 * Create a fresh grid filled with `unknownFill` (0 by default). The cells are
 * zero-initialised so `new Float32Array` already gives the convention's
 * `0 = unknown` semantics for free.
 */
export function createGridInternal(params: GridParams, unknownFill = 0): OccupancyGrid {
	const cells = new Float32Array(params.width * params.height)
	if (unknownFill !== 0) cells.fill(unknownFill)
	return {
		width: params.width,
		height: params.height,
		resolution: params.resolution,
		origin: params.origin ?? { x: 0, y: 0 },
		cells,
	}
}

export type Cell2 = { col: number; row: number }

/** Real-valued world point -> the cell that contains it. Returns `-1` if outside. */
export function worldToIndex(grid: OccupancyGrid, world: Vec2): number {
	const col = Math.floor((world.x - grid.origin.x) / grid.resolution)
	const row = Math.floor((world.y - grid.origin.y) / grid.resolution)
	if (col < 0 || col >= grid.width || row < 0 || row >= grid.height) return -1
	return row * grid.width + col
}

/** Real-valued world point -> the cell that contains it as a (col,row). */
export function worldToCell(grid: OccupancyGrid, world: Vec2): Cell2 {
	return {
		col: Math.floor((world.x - grid.origin.x) / grid.resolution),
		row: Math.floor((world.y - grid.origin.y) / grid.resolution),
	}
}

/** Centre of a cell in world coordinates. */
export function cellCenterWorld(grid: OccupancyGrid, col: number, row: number): Vec2 {
	return {
		x: grid.origin.x + (col + 0.5) * grid.resolution,
		y: grid.origin.y + (row + 0.5) * grid.resolution,
	}
}

/** Convert a flat index to a (col,row) pair. Returns `null` for invalid indices. */
export function indexToCell(grid: OccupancyGrid, index: number): Cell2 | null {
	if (index < 0 || index >= grid.cells.length) return null
	return { col: index % grid.width, row: Math.floor(index / grid.width) }
}

const DEFAULT_UNKNOWN_FILL = 0

export { DEFAULT_UNKNOWN_FILL }
