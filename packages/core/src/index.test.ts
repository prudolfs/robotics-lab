import { expect, test } from 'vitest'
import { angularDelta, normalizeAngle } from './index'

test('normalizeAngle wraps into [-PI, PI)', () => {
	expect(normalizeAngle(0)).toBe(0)
	expect(normalizeAngle(Math.PI)).toBeCloseTo(-Math.PI, 10)
	expect(normalizeAngle(Math.PI * 3)).toBeCloseTo(-Math.PI, 10)
})

test('angularDelta is the shortest signed turn', () => {
	expect(angularDelta(0, 0)).toBeCloseTo(0, 10)
	expect(angularDelta(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 10)
	expect(angularDelta(0, -Math.PI / 2)).toBeCloseTo(-Math.PI / 2, 10)
	expect(angularDelta(0, Math.PI * 1.5)).toBeCloseTo(-Math.PI / 2, 10)
})
