// Occupancy grid updates: ray tracing, cell updates, probability updates.
//
// `applyScan` recomputes a known-good scan against the grid: for each sample
// it walks the cells from the sensor origin to the sample endpoint, frees
// every cell along the path, and marks the endpoint cell occupied when the
// ray hit something (misses contribute free space only — the endpoint cell is
// out of range and left untouched, which mirrors real lidar: a miss teaches
// you the beam found nothing within `range`, not that the far cell is empty).
//
// All increments are clamped log-odds updates so the value stays bounded and
// reversible (see `probability.ts`). The grid is mutated in place: occupancy
// mapping is an accumulating sketch, not a pure transformation of a scan.

import type { World } from '@robotics-lab/core'
import type { Vec2 } from '@robotics-lab/geometry'
import type { LidarScan } from '@robotics-lab/sensors'
import type { OccupancyGrid } from './grid'
import { clampLogOdds } from './probability'
import { traceSegment } from './raycast'

export type UpdateParams = {
	/** Log-odds increment added to occupied (hit) cells. */
	occupied: number
	/** Log-odds increment subtracted from free (traversed) cells. */
	free: number
}

export const DEFAULT_UPDATE_PARAMS: UpdateParams = {
	occupied: 0.85,
	free: 0.4,
}

/**
 * Integrate a single lidar scan into `grid`. For each sample:
 *   - trace every cell from the sensor origin to the sample endpoint
 *   - mark all traversed cells (everything but the endpoint) as `free`
 *   - if the ray hit something, mark the endpoint cell `occupied`
 *
 * Out-of-bounds cells are skipped (`index === -1`). The endpoint cell of a miss
 * is *not* marked free: it sits beyond `range`, so the lidar saw nothing, which
 * is the same as no evidence for that specific cell (free updates only apply
 * to cells the beam actually swept through).
 */
export function applyScan(
	grid: OccupancyGrid,
	scan: LidarScan,
	world: World | null,
	params: UpdateParams = DEFAULT_UPDATE_PARAMS,
): void {
	const origin = scan.origin
	for (const sample of scan.samples) {
		const worldAngle = origin.heading + sample.angle
		const cos = Math.cos(worldAngle)
		const sin = Math.sin(worldAngle)
		const endpointX = origin.x + cos * sample.distance
		const endpointY = origin.y + sin * sample.distance
		const visits = traceSegment(grid, origin.x, origin.y, endpointX, endpointY)
		const lastIndex = visits.length - 1
		for (let i = 0; i < visits.length; i++) {
			const visit = visits[i]
			if (visit.index < 0) continue
			const isHitCell = i === lastIndex && sample.hit !== null
			if (isHitCell) {
				grid.cells[visit.index] = clampLogOdds(grid.cells[visit.index] + params.occupied)
			} else {
				grid.cells[visit.index] = clampLogOdds(grid.cells[visit.index] - params.free)
			}
		}
	}
	// `world` is accepted so future enhancements (e.g. discarding hits that pass
	// through transparent obstacles) can consult it; today the scan already
	// encodes everything we need.
	void world
}

/** Mark a single cell `free` by the configured increment. Returns the new log-odds value. */
export function markFree(grid: OccupancyGrid, index: number, amount: number): number {
	if (index < 0 || index >= grid.cells.length) return 0
	const next = clampLogOdds(grid.cells[index] - amount)
	grid.cells[index] = next
	return next
}

/** Mark a single cell `occupied` by the configured increment. Returns the new value. */
export function markOccupied(grid: OccupancyGrid, index: number, amount: number): number {
	if (index < 0 || index >= grid.cells.length) return 0
	const next = clampLogOdds(grid.cells[index] + amount)
	grid.cells[index] = next
	return next
}

/** Reset every cell to `unknown` (log-odds `0`). Cheaper than reallocating. */
export function resetGrid(grid: OccupancyGrid, fill = 0): void {
	grid.cells.fill(fill)
}

/** Snapshot log-odds into a plain `Float32Array` copy (determinism / rollback). */
export function cloneCells(grid: OccupancyGrid): Float32Array {
	return grid.cells.slice()
}

/** Restore previously cloned log-odds (must be the same size as the grid). */
export function restoreCells(grid: OccupancyGrid, cells: Float32Array): OccupancyGrid {
	if (cells.length === grid.cells.length) grid.cells.set(cells)
	return grid
}

/** Helper: mark the cell containing a world point as occupied. */
export function markPointOccupied(grid: OccupancyGrid, world: Vec2, amount: number): void {
	const col = Math.floor((world.x - grid.origin.x) / grid.resolution)
	const row = Math.floor((world.y - grid.origin.y) / grid.resolution)
	if (col < 0 || col >= grid.width || row < 0 || row >= grid.height) return
	grid.cells[row * grid.width + col] = clampLogOdds(grid.cells[row * grid.width + col] + amount)
}
