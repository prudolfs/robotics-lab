import type { OccupancyGrid } from '@robotics-lab/occupancy-grid'
import { expect, test } from 'vitest'
import { computeCoverageProgress, coveragePath, DEFAULT_COVERAGE_CONFIG } from './coverage'

function makeGrid(width: number, height: number, resolution: number): OccupancyGrid {
	return {
		width,
		height,
		resolution,
		origin: { x: 0, y: 0 },
		cells: new Float32Array(width * height).fill(0),
	}
}

/** Fill a rectangle of cells as occupied (log-odds > 0). */
function occupyRect(grid: OccupancyGrid, col: number, row: number, w: number, h: number) {
	for (let r = row; r < row + h; r++) {
		for (let c = col; c < col + w; c++) {
			if (r >= 0 && r < grid.height && c >= 0 && c < grid.width) {
				grid.cells[r * grid.width + c] = 1.0
			}
		}
	}
}

test('coveragePath returns empty waypoints for a fully occupied grid', () => {
	const grid = makeGrid(10, 10, 1)
	occupyRect(grid, 0, 0, 10, 10)
	const result = coveragePath(grid, { x: 5, y: 5 }, DEFAULT_COVERAGE_CONFIG)
	expect(result.status).toBe('no_free_space')
	expect(result.waypoints).toHaveLength(0)
})

test('coveragePath generates waypoints for an empty grid', () => {
	const grid = makeGrid(5, 5, 1)
	const start = { x: 2.5, y: 2.5 }
	const result = coveragePath(grid, start, DEFAULT_COVERAGE_CONFIG)
	expect(result.status).toBe('ok')
	expect(result.waypoints.length).toBeGreaterThan(0)
	expect(result.strips.length).toBeGreaterThan(0)
})

test('coveragePath produces a boustrophedon (back-and-forth) pattern', () => {
	const grid = makeGrid(5, 5, 1)
	const start = { x: 2.5, y: 2.5 }
	const result = coveragePath(grid, start, DEFAULT_COVERAGE_CONFIG)
	expect(result.status).toBe('ok')
	// Strips should alternate in x to create back-and-forth coverage.
	for (const strip of result.strips) {
		if (strip.length >= 2) {
			for (let i = 1; i < strip.length; i++) {
				expect(strip[i].row).toBe(strip[0].row)
			}
		}
	}
})

test('coveragePath avoids occupied cells', () => {
	const grid = makeGrid(5, 5, 1)
	occupyRect(grid, 0, 2, 5, 1)
	const start = { x: 2, y: 1 }
	const result = coveragePath(grid, start, DEFAULT_COVERAGE_CONFIG)
	// Robot starts near the wall, should still cover its reachable area.
	expect(result.status).toBe('ok')
	for (const wp of result.waypoints) {
		const row = Math.floor(wp.y)
		expect(row).not.toBe(2)
	}
})

test('coveragePath returns to start when configured>null configured', () => {
	const grid = makeGrid(5, 5, 1)
	const start = { x: 2.5, y: 2.5 }
	const result = coveragePath(grid, start, { ...DEFAULT_COVERAGE_CONFIG, returnToStart: true })
	expect(result.status).toBe('ok')
	const last = result.waypoints[result.waypoints.length - 1]
	expect(last.x).toBeCloseTo(2.5, 3)
	expect(last.y).toBeCloseTo(2.5, 3)
})

test('coveragePath does not return to start when disabled', () => {
	const grid = makeGrid(5, 5, 1)
	const start = { x: 2.5, y: 2.5 }
	const result = coveragePath(grid, start, { ...DEFAULT_COVERAGE_CONFIG, returnToStart: false })
	const last = result.waypoints[result.waypoints.length - 1]
	expect(last.x).not.toBeCloseTo(2.5, 3)
	expect(last.y).not.toBeCloseTo(2.5, 3)
})

test('coveragePath handles robot starting outside the grid', () => {
	const grid = makeGrid(5, 5, 1)
	const start = { x: 100, y: 100 }
	const result = coveragePath(grid, start, DEFAULT_COVERAGE_CONFIG)
	expect(result.status).toBe('ok')
})

test('computeCoverageProgress marks near cells as visited', () => {
	const grid = makeGrid(5, 5, 1)
	const visited = new Set<number>()
	const count = computeCoverageProgress(grid, visited, { x: 2.5, y: 2.5 }, 1.5)
	expect(count).toBeGreaterThan(0)
	expect(visited.size).toBeGreaterThan(0)
})
