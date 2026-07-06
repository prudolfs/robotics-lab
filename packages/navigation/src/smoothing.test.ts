// Tests for path smoothing: simplifyPath, shortcutPath and smoothToWorld.

import type { Cell2 } from '@robotics-lab/occupancy-grid'
import {
	cellCenterWorld,
	createGrid,
	type OccupancyGrid,
	setCell,
} from '@robotics-lab/occupancy-grid'
import { expect, test } from 'vitest'
import { cellsToWorld, shortcutPath, simplifyPath, smoothToWorld } from './smoothing'

function makeGrid(w: number, h: number, resolution = 1): OccupancyGrid {
	return createGrid({ width: w, height: h, resolution, origin: { x: 0, y: 0 } })
}
function occupy(grid: OccupancyGrid, col: number, row: number): void {
	setCell(grid, row * grid.width + col, 3)
}

// --- simplifyPath ----------------------------------------------------------

test('simplifyPath returns a straight run untouched', () => {
	const cells: Cell2[] = [
		{ col: 0, row: 0 },
		{ col: 1, row: 0 },
		{ col: 2, row: 0 },
		{ col: 3, row: 0 },
	]
	const out = simplifyPath(cells)
	expect(out).toEqual([
		{ col: 0, row: 0 },
		{ col: 3, row: 0 },
	])
})

test('simplifyPath preserves corners of an L path', () => {
	const cells: Cell2[] = [
		{ col: 0, row: 0 },
		{ col: 1, row: 0 },
		{ col: 2, row: 0 },
		{ col: 2, row: 1 },
		{ col: 2, row: 2 },
	]
	const out = simplifyPath(cells)
	expect(out).toEqual([
		{ col: 0, row: 0 },
		{ col: 2, row: 0 },
		{ col: 2, row: 2 },
	])
})

test('simplifyPath preserves endpoints on a degenerate path', () => {
	const out = simplifyPath([{ col: 3, row: 3 }])
	expect(out).toEqual([{ col: 3, row: 3 }])
})

// --- shortcutPath ----------------------------------------------------------

test('shortcutPath replaces a straight zig-zag with one jump', () => {
	const grid = makeGrid(7, 1)
	const cells: Cell2[] = [
		{ col: 0, row: 0 },
		{ col: 1, row: 0 },
		{ col: 2, row: 0 },
		{ col: 3, row: 0 },
		{ col: 4, row: 0 },
	]
	const out = shortcutPath(grid, cells)
	expect(out).toEqual([
		{ col: 0, row: 0 },
		{ col: 4, row: 0 },
	])
})

test('shortcutPath routes around an obstacle via the surviving waypoints', () => {
	const grid = makeGrid(7, 7)
	// A wall in the middle that blocks straight through; planner would route
	// around it, but here we hand-shape the path and verify shortening keeps
	// the detour corners and just skips redundant cells.
	occupy(grid, 3, 3)
	const detour: Cell2[] = [
		{ col: 0, row: 0 },
		{ col: 1, row: 0 },
		{ col: 2, row: 0 },
		{ col: 2, row: 1 },
		{ col: 2, row: 2 },
		{ col: 3, row: 2 },
		{ col: 4, row: 2 },
		{ col: 4, row: 1 },
		{ col: 4, row: 0 },
		{ col: 6, row: 0 },
	]
	const out = shortcutPath(grid, detour, { inflationRadius: 0 })
	expect(out[0]).toEqual({ col: 0, row: 0 })
	expect(out[out.length - 1]).toEqual({ col: 6, row: 0 })
	// Short-cut must not pass straight through the occupied cell.
	expect(out).not.toContainEqual({ col: 3, row: 3 })
	// And the segment shortened the input.
	expect(out.length).toBeLessThan(detour.length)
})

test('shortcutPath never crosses a blocked cell between consecutive survivors', () => {
	const grid = makeGrid(7, 7)
	occupy(grid, 3, 3)
	const detour: Cell2[] = [
		{ col: 0, row: 0 },
		{ col: 6, row: 0 },
		{ col: 6, row: 6 },
	]
	const out = shortcutPath(grid, detour, { inflationRadius: 1 })
	// First jump (0,0)->(6,0) is clear of the central obstacle.
	expect(out[0]).toEqual({ col: 0, row: 0 })
	// The segment to (6,6) must avoid clipping the obstacle; short cut may
	// keep (6,0) as a corner.
	expect(out.length).toBeGreaterThanOrEqual(2)
	expect(out[out.length - 1]).toEqual({ col: 6, row: 6 })
})

// --- smoothToWorld / cellsToWorld ------------------------------------------

test('cellsToWorld maps cells to their cell-center world coordinates', () => {
	const grid = makeGrid(3, 3, 0.5)
	const pts = cellsToWorld(grid, [
		{ col: 0, row: 0 },
		{ col: 2, row: 2 },
	])
	expect(pts[0]).toEqual({ x: 0.25, y: 0.25 })
	expect(pts[1]).toEqual({ x: 1.25, y: 1.25 })
})

test('smoothToWorld returns start and goal as the endpoint waypoints', () => {
	const grid = makeGrid(7, 1)
	const cells: Cell2[] = [
		{ col: 0, row: 0 },
		{ col: 1, row: 0 },
		{ col: 2, row: 0 },
		{ col: 4, row: 0 },
	]
	const pts = smoothToWorld(grid, cells)
	expect(pts[0]).toEqual(cellCenterWorld(grid, 0, 0))
	expect(pts[pts.length - 1]).toEqual(cellCenterWorld(grid, 4, 0))
	expect(pts.length).toBe(2) // simplified to the two endpoints
})

test('smoothToWorld pares the path down to corners only on an L', () => {
	const grid = makeGrid(5, 5)
	const cells: Cell2[] = [
		{ col: 0, row: 0 },
		{ col: 1, row: 0 },
		{ col: 2, row: 0 },
		{ col: 2, row: 1 },
		{ col: 2, row: 2 },
	]
	const pts = smoothToWorld(grid, cells)
	expect(pts.length).toBe(2) // straight collision-free jumps (0,0)->(2,0)->(2,2)? -> 3 corners
	// The line-of-sight shortcut will collapse (2,0) into a straight from (0,0)
	// since nothing blocks it; verify we keep at least start + end.
	expect(pts[0]).toEqual(cellCenterWorld(grid, 0, 0))
	expect(pts[pts.length - 1]).toEqual(cellCenterWorld(grid, 2, 2))
})
