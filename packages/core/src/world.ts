// The world model: a framework-independent snapshot of the loaded map.
//
// `World` is the data the simulation reasons about (collision, raycasting,
// occupancy). It is deliberately decoupled from the rendering package so it
// can run in Node and in tests.
//
// Walls, boxes and cylinders are stored in a small normalized form so that
// sensor and collision code can iterate them uniformly.

import type { Vec2 } from '@robotics-lab/geometry'
import { distance } from '@robotics-lab/geometry'
import type { MapData } from '@robotics-lab/maps'

export type WorldObstacleKind = 'wall' | 'box' | 'cylinder'

/** A normalized obstacle segment or solid used by collision and sensors. */
export type WorldObstacle = {
	kind: WorldObstacleKind
}

/** Axis-aligned rectangle obstacle (boxes, wall segments treated as solids). */
export type BoxObstacle = WorldObstacle & {
	kind: 'box'
	center: Vec2
	width: number
	depth: number
	rotation: number
}

/** Circular obstacle derived from a cylinder footprint. */
export type CircleObstacle = WorldObstacle & {
	kind: 'cylinder'
	center: Vec2
	radius: number
}

/** A wall treated as a line segment for raycasts. */
export type SegmentObstacle = WorldObstacle & {
	kind: 'wall'
	start: Vec2
	end: Vec2
}

export type World = {
	name: string
	width: number
	depth: number
	walls: SegmentObstacle[]
	boxes: BoxObstacle[]
	cylinders: CircleObstacle[]
}

/** Build a `World` from loaded `MapData`. */
export function createWorld(map: MapData): World {
	return {
		name: map.name,
		width: map.width,
		depth: map.depth,
		walls: map.walls.map((w) => ({ kind: 'wall', start: w.start, end: w.end })),
		boxes: map.boxes.map((b) => ({
			kind: 'box',
			center: b.center,
			width: b.width,
			depth: b.depth,
			rotation: b.rotation,
		})),
		cylinders: map.cylinders.map((c) => ({
			kind: 'cylinder',
			center: c.center,
			radius: c.diameter / 2,
		})),
	}
}

export type WorldBounds2 = {
	minX: number
	minY: number
	maxX: number
	maxY: number
}

/** World-space axis-aligned bounds, derived from floor size centred on origin. */
export function worldBounds(world: World): WorldBounds2 {
	const halfW = world.width / 2
	const halfD = world.depth / 2
	return { minX: -halfW, minY: -halfD, maxX: halfW, maxY: halfD }
}

/** True when a world point lies within the floor bounds. */
export function containsPoint(world: World, point: Vec2): boolean {
	const b = worldBounds(world)
	return point.x >= b.minX && point.x <= b.maxX && point.y >= b.minY && point.y <= b.maxY
}

/** Total number of solid obstacles in the world. */
export function obstacleCount(world: World): number {
	return world.walls.length + world.boxes.length + world.cylinders.length
}

/** Distance from a point to the nearest cylinder center, or Infinity. */
export function distanceToNearestCylinder(world: World, point: Vec2): number {
	let best = Number.POSITIVE_INFINITY
	for (const c of world.cylinders) {
		const d = distance(point, c.center)
		if (d < best) best = d
	}
	return best
}
