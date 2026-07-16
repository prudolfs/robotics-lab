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

/* ──────────────────────────────────────────────────────────────────────────
 * World editor helpers (milestone 12 — Editor).
 *
 * Pure, framework-independent operations the editor calls to mutate the
 * in-memory world: add/remove walls, move/resize boxes & cylinders. Each
 * returns a new `World` (structural sharing) so React sees a fresh reference
 * and the simulation-loop effect that reflects the world into the sim fires.
 * No mutation of the inputs.
 * ────────────────────────────────────────────────────────────────────────── */

/** Append a wall segment to the world. */
export function addWall(world: World, wall: SegmentObstacle): World {
	return { ...world, walls: [...world.walls, wall] }
}

/** Append a box obstacle to the world. */
export function addBox(world: World, box: BoxObstacle): World {
	return { ...world, boxes: [...world.boxes, box] }
}

/** Append a cylinder obstacle to the world. */
export function addCylinder(world: World, cylinder: CircleObstacle): World {
	return { ...world, cylinders: [...world.cylinders, cylinder] }
}

/** Remove a wall by index. Out-of-range indices are a no-op. */
export function removeWall(world: World, index: number): World {
	if (index < 0 || index >= world.walls.length) return world
	return { ...world, walls: world.walls.filter((_, i) => i !== index) }
}

/** Remove a box by index. Out-of-range indices are a no-op. */
export function removeBox(world: World, index: number): World {
	if (index < 0 || index >= world.boxes.length) return world
	return { ...world, boxes: world.boxes.filter((_, i) => i !== index) }
}

/** Remove a cylinder by index. Out-of-range indices are a no-op. */
export function removeCylinder(world: World, index: number): World {
	if (index < 0 || index >= world.cylinders.length) return world
	return { ...world, cylinders: world.cylinders.filter((_, i) => i !== index) }
}

/** Move a box's center, preserving its size and rotation. */
export function moveBox(world: World, index: number, center: Vec2): World {
	if (index < 0 || index >= world.boxes.length) return world
	const boxes = world.boxes.map((b, i) => (i === index ? { ...b, center } : b))
	return { ...world, boxes }
}

/** Resize a box (width x depth), preserving its center and rotation. */
export function resizeBox(
	world: World,
	index: number,
	size: { width: number; depth: number },
): World {
	if (index < 0 || index >= world.boxes.length) return world
	const boxes = world.boxes.map((b, i) =>
		i === index ? { ...b, width: size.width, depth: size.depth } : b,
	)
	return { ...world, boxes }
}

/** Move a cylinder's center, preserving its radius. */
export function moveCylinder(world: World, index: number, center: Vec2): World {
	if (index < 0 || index >= world.cylinders.length) return world
	const cylinders = world.cylinders.map((c, i) => (i === index ? { ...c, center } : c))
	return { ...world, cylinders }
}

/** Resize a cylinder (radius), preserving its center. */
export function resizeCylinder(world: World, index: number, radius: number): World {
	if (index < 0 || index >= world.cylinders.length) return world
	const cylinders = world.cylinders.map((c, i) => (i === index ? { ...c, radius } : c))
	return { ...world, cylinders }
}

/** Find the index of the wall nearest to a world point within `maxDist`, or -1.
 *  Used by the pick-to-remove wall tool. */
export function nearestWallIndex(world: World, point: Vec2, maxDist: number): number {
	let best = -1
	let bestD = maxDist
	for (let i = 0; i < world.walls.length; i++) {
		const d = pointToSegmentDistance(point, world.walls[i])
		if (d <= bestD) {
			best = i
			bestD = d
		}
	}
	return best
}

/** Find the index of the box containing a point (axis-aligned hit test on
 *  the box's local frame), or -1 when none. */
export function boxIndexAt(world: World, point: Vec2): number {
	for (let i = 0; i < world.boxes.length; i++) {
		const b = world.boxes[i]
		if (pointInBox(point, b)) return i
	}
	return -1
}

/** Find the index of the cylinder containing a point (within its radius), or -1. */
export function cylinderIndexAt(world: World, point: Vec2): number {
	for (let i = 0; i < world.cylinders.length; i++) {
		if (distance(point, world.cylinders[i].center) <= world.cylinders[i].radius) return i
	}
	return -1
}

/** True when a world point lies inside an oriented box (local frame test). */
export function pointInBox(point: Vec2, box: BoxObstacle): boolean {
	// Translate into the box's local frame (undo center + rotation), then an
	// axis-aligned half-extent test. Rotation is stored as radians about center.
	const dx = point.x - box.center.x
	const dy = point.y - box.center.y
	const c = Math.cos(-box.rotation)
	const s = Math.sin(-box.rotation)
	const lx = dx * c - dy * s
	const ly = dx * s + dy * c
	return Math.abs(lx) <= box.width / 2 && Math.abs(ly) <= box.depth / 2
}

/** Perpendicular distance from a point to a wall segment (in metres). */
export function pointToSegmentDistance(point: Vec2, seg: SegmentObstacle): number {
	const ax = seg.start.x
	const ay = seg.start.y
	const bx = seg.end.x
	const by = seg.end.y
	const dx = bx - ax
	const dy = by - ay
	const len2 = dx * dx + dy * dy
	if (len2 === 0) return distance(point, seg.start)
	let t = ((point.x - ax) * dx + (point.y - ay) * dy) / len2
	t = Math.max(0, Math.min(1, t))
	return distance(point, { x: ax + t * dx, y: ay + t * dy })
}
