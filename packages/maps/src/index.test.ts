import { expect, test } from 'vitest'
import { createEmptyMap, parseMap, serializeMap } from './index'

test('serialize / parse round trips an empty map', () => {
	const map = createEmptyMap({ name: 'empty', width: 5, height: 5 })
	const parsed = parseMap(serializeMap(map))
	expect(parsed.name).toBe('empty')
	expect(parsed.width).toBe(5)
	expect(parsed.walls).toEqual([])
})
