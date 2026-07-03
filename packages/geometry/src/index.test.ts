import { expect, test } from 'vitest'
import { angle, distance, fromAngle, length, rotate, type Vec2 } from './index'

test('distance is Euclidean', () => {
	expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
})

test('rotate preserves length', () => {
	const v: Vec2 = { x: 1, y: 0 }
	const r = rotate(v, Math.PI / 2)
	expect(r.x).toBeCloseTo(0, 10)
	expect(r.y).toBeCloseTo(1, 10)
	expect(length(r)).toBeCloseTo(1, 10)
})

test('fromAngle is the inverse of angle', () => {
	const v = fromAngle(0.7, 4)
	expect(angle(v)).toBeCloseTo(0.7, 10)
})
