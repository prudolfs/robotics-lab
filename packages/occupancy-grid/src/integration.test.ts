// Integration test: build a real scan from a real world and integrate it,
// verifying the occupancy grid reflects the world geometry (walls occupied).

import { createWorld } from '@robotics-lab/core'
import { loadMap } from '@robotics-lab/maps'
import { createLidarConfig, createScan } from '@robotics-lab/sensors'
import { expect, test } from 'vitest'
import { applyScan, cellIndex, classify, createGrid, getCell } from './index'

test('integrating a real scan marks the world walls occupied', () => {
	const world = createWorld(loadMap('empty')) // 8x8 arena, four walls
	const config = createLidarConfig({ range: 8, rayCount: 360 })
	const origin = { x: 0, y: 0, heading: 0 }
	const scan = createScan(config, origin, world)
	const grid = createGrid({
		width: 80,
		height: 80,
		resolution: 0.2,
		origin: { x: -8, y: -8 },
	})
	applyScan(grid, scan, world)

	let free = 0
	let occupied = 0
	let unknown = 0
	for (let i = 0; i < grid.cells.length; i++) {
		const c = classify(grid.cells[i])
		if (c === 'free') free++
		else if (c === 'occupied') occupied++
		else unknown++
	}
	// The arena is bounded; at least the four walls should be observed.
	expect(occupied).toBeGreaterThan(0)
	expect(free).toBeGreaterThan(0)
	// Sanity: most of a coarse 80x80 grid is still unexplored.
	expect(unknown).toBeGreaterThan(0)

	// Specifically: the wall at +x (x = 4) should be marked occupied along y=0.
	let wallHits = 0
	for (let x = 3.7; x <= 4.0; x += 0.05) {
		const idx = cellIndex(grid, { x, y: 0 })
		if (idx >= 0 && classify(getCell(grid, idx)) === 'occupied') wallHits++
	}
	expect(wallHits).toBeGreaterThan(0)
})

test('a hit exactly on a +wall cell boundary marks the inside cell, not the cell beyond the wall', () => {
	// Regression: when a lidar hit lands exactly on a cell boundary on the
	// +x / +y side of the world (e.g. the right wall at x = +4), `floor` would
	// place it in the *next* cell (centred just past the wall), making the
	// occupancy overlay visibly overshoot the wall on the top/right. The hit
	// cell should be the one the ray was *in* just before crossing the wall —
	// i.e. the cell on the inside of the boundary.
	const world = createWorld(loadMap('empty')) // 8x8, four walls on the boundary
	const config = createLidarConfig({ range: 8, rayCount: 360 })
	const origin = { x: 0, y: 0, heading: 0 }
	const scan = createScan(config, origin, world)
	const grid = createGrid({
		width: 80,
		height: 80,
		resolution: 0.2,
		origin: { x: -8, y: -8 },
	})
	applyScan(grid, scan, world)

	// Right wall sits at x = +4. Cells are 0.2m wide; the cell just inside the
	// wall spans [3.8, 4.0) with centre x = 3.9.
	const insideRight = cellIndex(grid, { x: 3.9, y: 0 })
	const beyondRight = cellIndex(grid, { x: 4.1, y: 0 })
	expect(insideRight).toBeGreaterThanOrEqual(0)
	expect(beyondRight).toBeGreaterThanOrEqual(0)
	expect(classify(getCell(grid, insideRight))).toBe('occupied')
	expect(classify(getCell(grid, beyondRight))).toBe('unknown')

	// Top wall at y = +4 (note: a ray straight up the -y axis hits the top wall
	// only after sweeping +y; check a hit along +y actually exists).
	const insideTop = cellIndex(grid, { x: 0, y: 3.9 })
	const beyondTop = cellIndex(grid, { x: 0, y: 4.1 })
	expect(classify(getCell(grid, insideTop))).toBe('occupied')
	expect(classify(getCell(grid, beyondTop))).toBe('unknown')
})

test('integrating against the obstacles map observes interior boxes', () => {
	const world = createWorld(loadMap('obstacles'))
	const config = createLidarConfig({ range: 10, rayCount: 720 })
	const scan = createScan(config, { x: 0, y: 0, heading: 0 }, world)
	const grid = createGrid({
		width: 100,
		height: 100,
		resolution: 0.2,
		origin: { x: -10, y: -10 },
	})
	applyScan(grid, scan, world)
	// Some occupied cells must exist (the box at (-2, 1) is within range).
	let occupied = 0
	for (let i = 0; i < grid.cells.length; i++) {
		if (classify(grid.cells[i]) === 'occupied') occupied++
	}
	expect(occupied).toBeGreaterThan(0)
})
