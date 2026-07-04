import { expect, test } from 'vitest'
import { createEmptyMap, loadMap, type MapData, mapNames, parseMap, serializeMap } from './index'

test('serialize / parse round trips an empty map including cylinders', () => {
	const map = createEmptyMap({ name: 'empty', width: 5, depth: 5 })
	const parsed = parseMap(serializeMap(map))
	expect(parsed.name).toBe('empty')
	expect(parsed.width).toBe(5)
	expect(parsed.depth).toBe(5)
	expect(parsed.walls).toEqual([])
	expect(parsed.cylinders).toEqual([])
})

test('parse accepts legacy `height` as `depth`', () => {
	const legacy = JSON.stringify({ name: 'legacy', width: 4, height: 6 })
	const parsed = parseMap(legacy)
	expect(parsed.depth).toBe(6)
})

test('parse rejects invalid maps', () => {
	expect(() => parseMap(JSON.stringify({ width: 5, depth: 5 }))).toThrow()
})

test('built-in maps are available and unique', () => {
	const names = mapNames()
	expect(names.length).toBeGreaterThanOrEqual(2)
	expect(new Set(names).size).toBe(names.length)
})

test('loadMap returns the requested map and throws for unknown ones', () => {
	const first = mapNames()[0] as string
	const map = loadMap(first) as MapData
	expect(map.name).toBe(first)
	expect(map.walls.length).toBeGreaterThan(0)
	expect(() => loadMap('does-not-exist')).toThrow()
})

test('every built-in map has a closed rectangular border', () => {
	for (const name of mapNames()) {
		const map = loadMap(name) as MapData
		expect(map.walls.length).toBe(4)
	}
})
