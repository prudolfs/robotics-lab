// Serialization helpers: convert between log-odds occupancy and the standard
// `[0, 255]` occupancy-grid encoding used by ROS / image tile viewers, and a
// compact JSON form for saving/restoring a run.

import type { OccupancyGrid } from './grid'
import { classify, LOG_ODDS_CLAMP, probability, UNKNOWN_PROB } from './probability'

export type SerializedGrid = {
	width: number
	height: number
	resolution: number
	origin: { x: number; y: number }
	cells: number[]
}

/** Log-odds cell values to the standard ROS `[0,255]` occupancy encoding. */
export function toOccupancyBytes(grid: OccupancyGrid, unknown = -1): Int8Array {
	const out = new Int8Array(grid.cells.length)
	for (let i = 0; i < grid.cells.length; i++) {
		const v = grid.cells[i]
		const cls = classify(v)
		if (cls === 'unknown') {
			out[i] = unknown
		} else {
			const p = probability(v)
			// Probability in [0,1]; map to [0, 100] (standard ROS occupancy,
			// scaled by 1 for Int8ArLP). Then [-128, 127] Int8 storage.
			out[i] = Math.round(p * 100)
		}
	}
	return out
}

/**
 * Convert the grid to display probabilities in `Float32Array`. Each cell is:
 *   `UNKNOWN_PROB (-1)` for unknown cells, otherwise a probability in [0,1].
 */
export function toProbabilityGrid(grid: OccupancyGrid): Float32Array {
	const out = new Float32Array(grid.cells.length)
	for (let i = 0; i < grid.cells.length; i++) {
		const v = grid.cells[i]
		out[i] = classify(v) === 'unknown' ? UNKNOWN_PROB : probability(v)
	}
	return out
}

/** Plain JSON snapshot for save / restore / transport. */
export function serializeGrid(grid: OccupancyGrid): SerializedGrid {
	return {
		width: grid.width,
		height: grid.height,
		resolution: grid.resolution,
		origin: { x: grid.origin.x, y: grid.origin.y },
		cells: Array.from(grid.cells),
	}
}

/** Restore a grid from `serializeGrid` output. Returns a fresh `OccupancyGrid`. */
export function deserializeGrid(data: SerializedGrid): OccupancyGrid {
	return {
		width: data.width,
		height: data.height,
		resolution: data.resolution,
		origin: { x: data.origin.x, y: data.origin.y },
		cells: Float32Array.from(data.cells),
	}
}

export { LOG_ODDS_CLAMP }
