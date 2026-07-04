import type { MapData } from '@robotics-lab/maps'
import { expect, test } from 'vitest'
import {
	containsPoint,
	createWorld,
	distanceToNearestCylinder,
	obstacleCount,
	worldBounds,
} from './world'

const map: MapData = {
	name: 'test',
	width: 8,
	depth: 6,
	walls: [
		{ start: { x: -4, y: -3 }, end: { x: 4, y: -3 } },
		{ start: { x: 4, y: -3 }, end: { x: 4, y: 3 } },
		{ start: { x: 4, y: 3 }, end: { x: -4, y: 3 } },
		{ start: { x: -4, y: 3 }, end: { x: -4, y: -3 } },
	],
	boxes: [{ center: { x: 0, y: 0 }, width: 1, depth: 1, rotation: 0 }],
	cylinders: [{ center: { x: 2, y: 2 }, diameter: 1 }],
}

test('createWorld normalizes obstacles', () => {
	const world = createWorld(map)
	expect(world.walls).toHaveLength(4)
	expect(world.boxes).toHaveLength(1)
	expect(world.cylinders).toHaveLength(1)
	expect(world.cylinders[0]?.radius).toBe(0.5)
})

test('worldBounds is centered on the origin', () => {
	const world = createWorld(map)
	const b = worldBounds(world)
	expect(b).toEqual({ minX: -4, minY: -3, maxX: 4, maxY: 3 })
})

test('containsPoint respects the floor bounds', () => {
	const world = createWorld(map)
	expect(containsPoint(world, { x: 0, y: 0 })).toBe(true)
	expect(containsPoint(world, { x: 5, y: 0 })).toBe(false)
})

test('obstacleCount sums all obstacle kinds', () => {
	expect(obstacleCount(createWorld(map))).toBe(6)
})

test('distanceToNearestCylinder returns Infinity with no cylinders', () => {
	const empty = createWorld({ ...map, cylinders: [] })
	expect(distanceToNearestCylinder(empty, { x: 0, y: 0 })).toBe(Number.POSITIVE_INFINITY)
})
