// Tests for occupancy-grid mapping: ray tracing + cell updates via `applyScan`.
//
// We build synthetic scans inline (matching the `LidarScan` shape) so the
// occupancy-grid package stays isolated from the full sensor model when testing.

import type { World } from '@robotics-lab/core'
import type { LidarConfig, LidarSample, LidarScan } from '@robotics-lab/sensors'
import { expect, test } from 'vitest'
import {
	applyScan,
	cellIndex,
	classify,
	createGrid,
	getCell,
	markOccupied,
	resetGrid,
	traceSegment,
	worldToCell,
} from './index'

function makeScan(
	origin: { x: number; y: number; heading: number },
	samples: LidarSample[],
): LidarScan {
	const config: LidarConfig = {
		fieldOfView: Math.PI * 2,
		rayCount: samples.length,
		range: 10,
		noise: 0,
	}
	return { config, origin: { ...origin, heading: origin.heading }, samples }
}

function gridFor(width: number, height: number, resolution = 0.5, origin = { x: 0, y: 0 }) {
	return createGrid({ width, height, resolution, origin })
}

test('traceSegment walks every cell from origin to endpoint', () => {
	const grid = gridFor(10, 10, 0.5)
	const visits = traceSegment(grid, 0, 0, 4, 0) // along +x
	expect(visits.length).toBe(9) // cells 0..4 inclusive in 0.5m resolution
	expect(visits[0]).toMatchObject({ index: cellIndex(grid, { x: 0, y: 0 }) })
	expect(visits[visits.length - 1].last).toBe(true)
})

test('traceSegment short-circuits a degenerate segment to one visit', () => {
	const grid = gridFor(10, 10, 0.5)
	const visits = traceSegment(grid, 0.2, 0.2, 0.25, 0.25)
	expect(visits.length).toBe(1)
	expect(visits[0].last).toBe(true)
})

test('applyScan frees cells along a ray and marks the endpoint occupied', () => {
	const grid = gridFor(21, 21, 0.5, { x: -5, y: -5 })
	const origin = { x: 0, y: 0, heading: 0 }
	// A ray straight along +x hitting something 3 m away.
	const scan = makeScan(origin, [{ angle: 0, distance: 3, hit: 'wall' }])
	applyScan(grid, scan, null)
	// Free cells along the path: every sampling point strictly inside the path
	// should be classified `free`. The origin cell is included by the traversal
	// and gets freed too (the robot confirms it's not an obstacle).
	for (let x = 0; x < 3; x += 0.5) {
		const idx = cellIndex(grid, { x, y: 0 })
		if (idx >= 0) expect(classify(getCell(grid, idx))).toBe('free')
	}
	// Endpoint cell occupied.
	const hitIdx = cellIndex(grid, { x: 3, y: 0 })
	expect(hitIdx).toBeGreaterThanOrEqual(0)
	expect(classify(getCell(grid, hitIdx))).toBe('occupied')
})

test('applyScan on a miss marks the path free and writes no occupied cells', () => {
	const grid = gridFor(21, 21, 0.5, { x: -5, y: -5 })
	const origin = { x: 0, y: 0, heading: 0 }
	const scan = makeScan(origin, [{ angle: 0, distance: 4, hit: null }])
	applyScan(grid, scan, null)
	let occupiedCount = 0
	for (let i = 0; i < grid.cells.length; i++) {
		if (classify(grid.cells[i]) === 'occupied') occupiedCount++
	}
	expect(occupiedCount).toBe(0)
	// First cell along the path is free.
	expect(classify(getCell(grid, cellIndex(grid, { x: 0.5, y: 0 })))).toBe('free')
})

test('resetGrid clears every cell back to unknown', () => {
	const grid = gridFor(5, 5, 0.5)
	markOccupied(grid, 0, 1)
	markOccupied(grid, 12, 1)
	resetGrid(grid)
	let nonzero = 0
	for (let i = 0; i < grid.cells.length; i++) if (grid.cells[i] !== 0) nonzero++
	expect(nonzero).toBe(0)
})

test('repeated occupied updates accumulate and clamp at LOG_ODDS_CLAMP', () => {
	const grid = gridFor(5, 5, 0.5)
	const idx = cellIndex(grid, { x: 0, y: 0 })
	for (let i = 0; i < 100; i++) markOccupied(grid, idx, 10)
	expect(getCell(grid, idx)).toBeLessThanOrEqual(4 + 1e-6)
})

test('cellIndex and worldToCell agree on placements', () => {
	const grid = gridFor(21, 21, 0.5, { x: -5, y: -5 })
	for (const world of [
		{ x: 0, y: 0 },
		{ x: 2.3, y: -1.2 },
		{ x: -4.9, y: 4.9 },
	]) {
		const idx = cellIndex(grid, world)
		const cell = worldToCell(grid, world)
		expect({ col: idx % grid.width, row: Math.floor(idx / grid.width) }).toEqual(cell)
	}
})

// `World` import kept for API parity with `applyScan`; these tests synthesize
// scans directly instead of using the full sensor model.
const _worldRef: World | null = null
export type _W = typeof _worldRef
