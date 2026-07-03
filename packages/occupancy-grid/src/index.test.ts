import { expect, test } from 'vitest'
import { cellIndex, createGrid, getCell, setCell } from './index'

test('cells default to 0 (unknown)', () => {
	const grid = createGrid({ width: 10, height: 10, resolution: 0.1 })
	expect(getCell(grid, cellIndex(grid, { x: 0, y: 0 }))).toBe(0)
})

test('set/get round trips a cell value', () => {
	const grid = createGrid({ width: 10, height: 10, resolution: 0.1 })
	const idx = cellIndex(grid, { x: 0, y: 0 })
	setCell(grid, idx, 1)
	expect(getCell(grid, idx)).toBe(1)
})

test('out of bounds queries return -1 / 0', () => {
	const grid = createGrid({ width: 10, height: 10, resolution: 0.1 })
	expect(cellIndex(grid, { x: 1000, y: 1000 })).toBe(-1)
	expect(getCell(grid, -1)).toBe(0)
})
