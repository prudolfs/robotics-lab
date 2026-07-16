// Editor helper tests (milestone 12 — Editor).
// The helpers are pure: they return new worlds and never mutate inputs.

import type { MapData } from '@robotics-lab/maps'
import { expect, test } from 'vitest'
import {
	addBox,
	addCylinder,
	addWall,
	boxIndexAt,
	createWorld,
	cylinderIndexAt,
	moveBox,
	moveCylinder,
	nearestWallIndex,
	obstacleCount,
	pointInBox,
	pointToSegmentDistance,
	removeBox,
	removeCylinder,
	removeWall,
	resizeBox,
	resizeCylinder,
} from './world'

const map: MapData = {
	name: 'test',
	width: 10,
	depth: 10,
	walls: [
		{ start: { x: -5, y: -5 }, end: { x: 5, y: -5 } },
		{ start: { x: 5, y: -5 }, end: { x: 5, y: 5 } },
	],
	boxes: [{ center: { x: 0, y: 0 }, width: 2, depth: 2, rotation: 0 }],
	cylinders: [{ center: { x: 3, y: 3 }, diameter: 2 }],
}

const world = () => createWorld(map)

test('addWall appends a wall segment', () => {
	const next = addWall(world(), { kind: 'wall', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } })
	expect(next.walls).toHaveLength(3)
	expect(obstacleCount(next)).toBe(obstacleCount(world()) + 1)
	// Original unchanged.
	expect(world().walls).toHaveLength(2)
})

test('addBox / addCylinder append solid obstacles', () => {
	const w = world()
	const b = addBox(w, { kind: 'box', center: { x: 1, y: 1 }, width: 1, depth: 1, rotation: 0 })
	const c = addCylinder(b, { kind: 'cylinder', center: { x: 0, y: 0 }, radius: 0.5 })
	expect(b.boxes).toHaveLength(2)
	expect(c.cylinders).toHaveLength(2)
})

test('removeWall / removeBox / removeCylinder drop by index', () => {
	const w = world()
	expect(removeWall(w, 0).walls).toHaveLength(1)
	expect(removeBox(w, 0).boxes).toHaveLength(0)
	expect(removeCylinder(w, 0).cylinders).toHaveLength(0)
	// Out of range is a no-op (same reference returned).
	expect(removeWall(w, 99)).toBe(w)
	expect(removeBox(w, -1)).toBe(w)
	expect(removeCylinder(w, 5)).toBe(w)
})

test('moveBox and moveCylinder relocate without resizing', () => {
	const w = world()
	const mb = moveBox(w, 0, { x: 5, y: 5 })
	expect(mb.boxes[0]?.center).toEqual({ x: 5, y: 5 })
	expect(mb.boxes[0]?.width).toBe(2)
	const mc = moveCylinder(w, 0, { x: -3, y: -3 })
	expect(mc.cylinders[0]?.center).toEqual({ x: -3, y: -3 })
	expect(mc.cylinders[0]?.radius).toBe(1)
})

test('resizeBox and resizeCylinder scale without moving', () => {
	const w = world()
	const rb = resizeBox(w, 0, { width: 4, depth: 1 })
	expect(rb.boxes[0]?.width).toBe(4)
	expect(rb.boxes[0]?.depth).toBe(1)
	expect(rb.boxes[0]?.center).toEqual({ x: 0, y: 0 })
	const rc = resizeCylinder(w, 0, 0.25)
	expect(rc.cylinders[0]?.radius).toBe(0.25)
	expect(rc.cylinders[0]?.center).toEqual({ x: 3, y: 3 })
})

test('pointInBox axis-aligned hit', () => {
	const box = world().boxes[0]!
	expect(pointInBox({ x: 0, y: 0 }, box)).toBe(true)
	expect(pointInBox({ x: 0.99, y: 0.99 }, box)).toBe(true)
	expect(pointInBox({ x: 1.01, y: 0 }, box)).toBe(false)
})

test('pointInBox respects rotation', () => {
	const w = createWorld({
		...map,
		boxes: [{ center: { x: 0, y: 0 }, width: 2, depth: 0.4, rotation: Math.PI / 4 }],
	})
	const box = w.boxes[0]!
	// A 45°-rotated 2x0.4 box reaches (1,1)&(−1,−1) at its corners.
	expect(pointInBox({ x: 0.7, y: 0.7 }, box)).toBe(true)
	expect(pointInBox({ x: 0, y: 1 }, box)).toBe(false)
})

test('boxIndexAt / cylinderIndexAt pick the right obstacle', () => {
	const w = world()
	expect(boxIndexAt(w, { x: 0, y: 0 })).toBe(0)
	expect(boxIndexAt(w, { x: 4, y: 4 })).toBe(-1)
	expect(cylinderIndexAt(w, { x: 3.5, y: 3 })).toBe(0)
	expect(cylinderIndexAt(w, { x: 0, y: 0 })).toBe(-1)
})

test('pointToSegmentDistance clamps to the segment', () => {
	const seg = createWorld(map).walls[0]! // from (-5,-5) to (5,-5)
	expect(pointToSegmentDistance({ x: 0, y: -5 }, seg)).toBeCloseTo(0, 10)
	expect(pointToSegmentDistance({ x: 0, y: -4 }, seg)).toBeCloseTo(1, 10)
	expect(pointToSegmentDistance({ x: 6, y: -5 }, seg)).toBeCloseTo(1, 10) // clamps to end
})

test('nearestWallIndex finds the closest wall within threshold', () => {
	const w = world()
	expect(nearestWallIndex(w, { x: 0, y: -4.9 }, 0.5)).toBe(0)
	expect(nearestWallIndex(w, { x: 0, y: 0 }, 0.5)).toBe(-1)
})
