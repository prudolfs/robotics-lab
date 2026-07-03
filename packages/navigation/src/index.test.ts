import { expect, test } from 'vitest'
import { distanceToGoal, headingController, headingTowards } from './index'

test('headingController returns proportional turn sign', () => {
	const pose = { x: 0, y: 0, heading: 0 }
	expect(headingController(pose, Math.PI / 2)).toBeGreaterThan(0)
	expect(headingController(pose, -Math.PI / 2)).toBeLessThan(0)
})

test('headingTowards points at the goal', () => {
	const pose = { x: 0, y: 0, heading: 0 }
	expect(headingTowards(pose, { x: 1, y: 0 })).toBeCloseTo(0, 10)
	expect(headingTowards(pose, { x: 0, y: 1 })).toBeCloseTo(Math.PI / 2, 10)
})

test('distanceToGoal is Euclidean', () => {
	const pose = { x: 0, y: 0, heading: 0 }
	expect(distanceToGoal(pose, { x: 3, y: 4 })).toBe(5)
})
