// Occupancy grid mapping.
// Cell values are log-odds occupancy: 0 = unknown, >0 occupied, <0 free.

import type { Vec2 } from '@robotics-lab/geometry'

export type OccupancyGrid = {
	width: number
	height: number
	/** World units per cell. */
	resolution: number
	/** World origin at the centre of cell (0,0). */
	origin: Vec2
	cells: Float32Array
}

export type GridParams = {
	width: number
	height: number
	resolution: number
	origin?: Vec2
}

export function createGrid(params: GridParams): OccupancyGrid {
	return {
		width: params.width,
		height: params.height,
		resolution: params.resolution,
		origin: params.origin ?? { x: 0, y: 0 },
		cells: new Float32Array(params.width * params.height),
	}
}

export type CellIndex = { col: number; row: number }

export function cellIndex(grid: OccupancyGrid, world: Vec2): number {
	const col = Math.floor((world.x - grid.origin.x) / grid.resolution)
	const row = Math.floor((world.y - grid.origin.y) / grid.resolution)
	if (col < 0 || col >= grid.width || row < 0 || row >= grid.height) return -1
	return row * grid.width + col
}

export function getCell(grid: OccupancyGrid, index: number): number {
	if (index < 0 || index >= grid.cells.length) return 0
	return grid.cells[index]
}

export function setCell(grid: OccupancyGrid, index: number, value: number): void {
	if (index < 0 || index >= grid.cells.length) return
	grid.cells[index] = value
}
