import { describe, expect, it } from 'vitest'
import { createController } from './controller'
import { ROUTE_DURATION, ROUTE_LENGTH, SPAWN } from './route'
import {
	createSimulation,
	HISTORY_LIMIT,
	type Simulation,
	setStatus,
	stepSimulation,
} from './simulation'
import { collides, ROBOT_RADIUS, WORLD } from './world'

function run(state: Simulation, steps: number) {
	let result = state
	for (let i = 0; i < steps; i++) result = stepSimulation(result, { forward: 1, turn: 0 })
	return result
}
describe('deterministic inspection simulation', () => {
	it('completes the rounded route without collisions and returns to the dock', () => {
		const start = setStatus(createSimulation({ noise: false }), 'running')
		const end = run(start, 5000)
		expect(end.status).toBe('complete')
		expect(end.elapsed).toBeCloseTo(ROUTE_DURATION, 8)
		expect(Math.hypot(end.truth.pose.x - SPAWN.x, end.truth.pose.y - SPAWN.y)).toBeLessThan(0.001)
		expect(end.truth.pose.heading).toBeCloseTo(2 * Math.PI, 8)
		expect(end.collisionCount).toBe(0)
		expect(end.distance).toBeCloseTo(ROUTE_LENGTH, 6)
		expect(end.odometry.pose).toEqual(end.truth.pose)
		expect(end.truth.velocity.vx).toBe(0)
		expect(end.estimator).toEqual({
			status: 'not-connected',
			pose: null,
			landmarkCount: 0,
			keyframeCount: 0,
		})
		expect(stepSimulation(end)).toBe(end)
	})
	it('repeats a noisy route exactly for the same seed and changes truth for another seed', () => {
		const first = run(setStatus(createSimulation({ seed: 42 }), 'running'), 5000)
		const second = run(setStatus(createSimulation({ seed: 42 }), 'running'), 5000)
		const other = run(setStatus(createSimulation({ seed: 43 }), 'running'), 5000)
		expect(first).toEqual(second)
		expect(first.truth.pose).not.toEqual(other.truth.pose)
		expect(first.status).toBe('complete')
		expect(first.collisionCount).toBe(0)
		expect(
			Math.hypot(
				first.truth.pose.x - first.odometry.pose.x,
				first.truth.pose.y - first.odometry.pose.y,
			),
		).toBeGreaterThan(0.01)
		expect(first.truthTrail.length).toBeLessThanOrEqual(HISTORY_LIMIT)
	})
	it('stalls at bounds, then reverses away from contact without encoder travel through the wall', () => {
		const start = setStatus(createSimulation({ mode: 'manual', noise: false }), 'running')
		const end = run(start, 1000)
		expect(end.collision).toBe(true)
		expect(collides(end.truth.pose)).toBe(false)
		expect(end.truth.pose.x).toBeLessThanOrEqual(WORLD.width / 2 - ROBOT_RADIUS)
		expect(end.odometry.pose).toEqual(end.truth.pose)
		expect(end.collisionCount).toBe(1)
		const reverse = stepSimulation(end, { forward: -1, turn: 0 })
		expect(reverse.collision).toBe(false)
		expect(reverse.truth.pose.x).toBeLessThan(end.truth.pose.x)
	})
	it('blocks the equipment island footprint', () => {
		const state = setStatus(createSimulation({ mode: 'manual', noise: false }), 'running')
		state.truth = { ...state.truth, pose: { x: 0, y: -1.5, heading: Math.PI / 2 } }
		const end = run(state, 100)
		expect(end.collision).toBe(true)
		expect(end.truth.pose.y).toBeLessThanOrEqual(-1 - ROBOT_RADIUS)
	})
	it('pauses without consuming time or randomness and resumes the same run', () => {
		const first = run(setStatus(createSimulation(), 'running'), 120)
		const paused = setStatus(first, 'paused')
		expect(run(paused, 500)).toBe(paused)
		const resumed = run(setStatus(paused, 'running'), 120)
		const continuous = run(setStatus(createSimulation(), 'running'), 240)
		expect(resumed).toEqual(continuous)
	})
})
describe('fixed-step controller', () => {
	it('gives identical motion for different render cadences', () => {
		const a = createController(),
			b = createController()
		a.play()
		b.play()
		for (let i = 0; i < 60; i++) a.advance(1 / 30)
		for (let i = 0; i < 288; i++) b.advance(1 / 144)
		expect(a.read().tick).toBe(120)
		expect(a.read()).toEqual(b.read())
	})
	it('clears held commands and leftover time across pause and reset', () => {
		const c = createController({ mode: 'manual' })
		c.play()
		c.command({ forward: 1, turn: 0 })
		c.advance(0.055)
		c.pause()
		const paused = c.read()
		c.advance(3)
		expect(c.read()).toBe(paused)
		c.play()
		c.advance(1 / 60)
		expect(c.read().truth.pose).toEqual(paused.truth.pose)
		c.reset()
		expect(c.read()).toEqual(createSimulation({ mode: 'manual' }))
		c.play()
		c.advance(1 / 120)
		expect(c.read().tick).toBe(0)
	})
	it('bounds catch-up after suspension rather than advancing through obstacles', () => {
		const c = createController()
		c.play()
		c.advance(20)
		expect(c.read().tick).toBe(6)
	})
})
