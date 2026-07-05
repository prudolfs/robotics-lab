// Cell traversal for occupancy updates ("ray tracing" through the grid).
//
// When a lidar ray returns a hit, every cell the ray passes through before the
// hit should be marked `free`, and the cell containing the hit should be
// marked `occupied`. Misses mark the whole path as `free` (endpoint excluded).
//
// We use a standard integer Bresenham in cell-space to visit every cell the
// segment's centre line crosses, then we guarantee the endpoint cell is the
// last visit. Working in integer cell coordinates (col, row) is simple and
// drift-free: there is no floating `length` boundary case and the endpoint
// cell is always reached exactly.

import type { OccupancyGrid } from './grid'
import { worldToCell } from './grid'

export type Visit = {
	/** Flat cell index, or `-1` if the cell falls outside the grid. */
	index: number
	/** Whether this is the segment endpoint cell (the hit / range cell). */
	last: boolean
}

/**
 * Walk every grid cell crossed by the world-space segment `from -> to`, in
 * order, yielding a `Visit` for each. The cell containing `from` is the first
 * visit; the cell containing `to` is the last and carries `last: true`.
 *
 * A degenerate segment (start and end in the same cell) yields a single visit
 * flagged `last`. `index` is `-1` for any cell that lies outside the grid so
 * callers can cheaply skip without bounds-checking exceptions.
 */
export function traceSegment(
	grid: OccupancyGrid,
	fromX: number,
	fromY: number,
	toX: number,
	toY: number,
): Visit[] {
	const start = worldToCell(grid, { x: fromX, y: fromY })
	const end = worldToCell(grid, { x: toX, y: toY })
	const visits: Visit[] = []

	let col = start.col
	let row = start.row
	const dx = Math.abs(end.col - start.col)
	const dy = Math.abs(end.row - start.row)
	const sx = end.col >= start.col ? 1 : -1
	const sy = end.row >= start.row ? 1 : -1

	const addVisit = (last: boolean) => {
		const index =
			col >= 0 && col < grid.width && row >= 0 && row < grid.height ? row * grid.width + col : -1
		visits.push({ index, last })
	}

	if (dx === 0 && dy === 0) {
		addVisit(true)
		return visits
	}

	// Walk exactly max(dx, dy) integer steps so the last visit lands on `end`.
	// Bresenham decision variable picks the axis to advance each step; ties
	// (diagonal) advance both axes together.
	let err = dx - dy
	const total = Math.max(dx, dy)
	for (let i = 0; i <= total; i++) {
		const reachedEnd = col === end.col && row === end.row
		addVisit(reachedEnd)
		if (reachedEnd) break
		const e2 = 2 * err
		if (e2 > -dy) {
			err -= dy
			col += sx
		}
		if (e2 < dx) {
			err += dx
			row += sy
		}
	}
	return visits
}
