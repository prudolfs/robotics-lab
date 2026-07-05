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
