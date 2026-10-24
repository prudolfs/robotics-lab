import { createWorld, type World } from '@robotics-lab/core'
import { loadMap } from '@robotics-lab/maps'
import { createLidarConfig } from '@robotics-lab/sensors'
import { describe, expect, test } from 'vitest'
import { motionIsClear, robotFootprintRadius } from './collision'
import {
	createSimulation,
	FIXED_DT,
	replan,
	runFor,
	setGoal,
	setInput,
	setSimWorld,
	startCoverage,
	stepSimulation,
} from './loop'

const room = (extras: Partial<World> = {}): World => ({
	name: 'collision regression',
	width: 10,
	depth: 10,
	walls: [],
	boxes: [],
	cylinders: [],
	...extras,
})
const noLidar = createLidarConfig({ dropoutRate: 1, rayCount: 36 })

describe('physical collision guard', () => {
	test.each([
		['thin wall', room({ walls: [{ kind: 'wall', start: { x: 1, y: -2 }, end: { x: 1, y: 2 } }] })],
		[
			'rotated box',
			room({
				boxes: [{ kind: 'box', center: { x: 1, y: 0 }, width: 0.05, depth: 2, rotation: 0.4 }],
			}),
		],
		['cylinder', room({ cylinders: [{ kind: 'cylinder', center: { x: 1, y: 0 }, radius: 0.2 }] })],
	] as const)('a fast manual step cannot tunnel through a %s', (_, world) => {
		const sim = createSimulation({
			world,
			lidar: noLidar,
			input: { leftWheel: 180, rightWheel: 180 },
		})
		const end = stepSimulation(sim)
		// Both endpoints of the unguarded 3m movement are clear, but the sweep is not.
		expect(end.collision).toBe(true)
		expect(end.robot.pose.x).toBeLessThan(1)
		expect(end.robot.pose.x).toBeGreaterThan(0)
		expect(end.robot.velocity.vx).toBe(0)
		const reverse = runFor(setInput(end, { leftWheel: -0.5, rightWheel: -0.5 }), 1)
		expect(reverse.robot.pose.x).toBeLessThan(end.robot.pose.x - 0.4)
	})

	test('floor bounds contain the whole robot even without border walls', () => {
		const sim = createSimulation({
			world: room(),
			lidar: noLidar,
			input: { leftWheel: 600, rightWheel: 600 },
		})
		const end = stepSimulation(sim)
		expect(end.robot.pose.x).toBeCloseTo(5 - robotFootprintRadius(end.robot.params), 4)
		expect(end.collision).toBe(true)
	})

	test('wheelbase changes increase collision clearance', () => {
		const world = room({ cylinders: [{ kind: 'cylinder', center: { x: 1, y: 0.5 }, radius: 0.1 }] })
		const start = { x: 0, y: 0 },
			end = { x: 2, y: 0 }
		expect(
			motionIsClear(world, start, end, robotFootprintRadius({ wheelBase: 0.4, wheelRadius: 0.05 })),
		).toBe(true)
		expect(
			motionIsClear(world, start, end, robotFootprintRadius({ wheelBase: 1, wheelRadius: 0.05 })),
		).toBe(false)
	})

	test('swept geometry handles grazing and collinear segments', () => {
		const world = room({ walls: [{ kind: 'wall', start: { x: 0, y: 1 }, end: { x: 2, y: 1 } }] })
		expect(motionIsClear(world, { x: -1, y: 1 }, { x: 3, y: 1 }, 0.1)).toBe(false)
		expect(motionIsClear(world, { x: -1, y: 0.5 }, { x: 3, y: 0.5 }, 0.3)).toBe(true)
		expect(motionIsClear(world, { x: -1, y: 0.7 }, { x: 3, y: 0.7 }, 0.3)).toBe(false)
	})
})

describe('safe autonomous routes', () => {
	test('autonomy can recover from manual wall contact through a safe connector', () => {
		const world = room({ width: 4, depth: 4 })
		let sim = runFor(
			createSimulation({ world, lidar: noLidar, input: { leftWheel: 1, rightWheel: 1 } }),
			2,
		)
		expect(sim.collision).toBe(true)
		sim = setGoal(sim, { x: 0, y: 0 })
		expect(sim.planStatus).toBe('ok')
		sim = runFor(sim, 15)
		expect(sim.goals).toEqual([])
	})

	test.each([
		'empty',
		'obstacles',
		'slalom',
	])('coverage completes on %s with every step collision-free', (name) => {
		const world = createWorld(loadMap(name))
		let sim = startCoverage(createSimulation({ world, lidar: noLidar }))
		let contacts = 0
		for (let i = 0; i < 60 * 1500 && !sim.coverageComplete; i++) {
			sim = stepSimulation(sim)
			if (sim.collision) contacts++
		}
		expect(contacts).toBe(0)
		expect(sim.coverageComplete).toBe(true)
	})
	test('routes around a wall and checks every movement, with no lidar evidence', () => {
		const world = room({ walls: [{ kind: 'wall', start: { x: 1, y: -1 }, end: { x: 1, y: 1 } }] })
		let sim = setGoal(createSimulation({ world, lidar: noLidar }), { x: 2, y: 0 })
		expect(sim.planStatus).toBe('ok')
		expect(sim.path.some((p) => Math.abs(p.y) > 1.3)).toBe(true)
		let detour = 0
		for (let i = 0; i < 60 * 35 && sim.autonomous; i++) {
			const previous = sim.robot.pose
			sim = stepSimulation(sim)
			expect(
				motionIsClear(world, previous, sim.robot.pose, robotFootprintRadius(sim.robot.params)),
			).toBe(true)
			expect(sim.collision).toBe(false)
			detour = Math.max(detour, Math.abs(sim.robot.pose.y))
		}
		expect(detour).toBeGreaterThan(1.3)
		expect(sim.goals).toEqual([])
		expect(Math.hypot(sim.robot.pose.x - 2, sim.robot.pose.y)).toBeLessThan(0.061)
	})

	test('a sealed goal stays queued and stopped rather than driving straight', () => {
		const world = room({ walls: [{ kind: 'wall', start: { x: 1, y: -5 }, end: { x: 1, y: 5 } }] })
		const end = runFor(setGoal(createSimulation({ world, lidar: noLidar }), { x: 2, y: 0 }), 3)
		expect(end.planStatus).toBe('no_path')
		expect(end.navStatus).toBe('blocked')
		expect(end.robot.pose).toEqual({ x: 0, y: 0, heading: 0 })
		expect(end.path).toEqual([])
		expect(end.goals).toEqual([{ x: 2, y: 0 }])
	})

	test.each([
		{ x: 1, y: 0 },
		{ x: 4.9, y: 0 },
		{ x: 50, y: 0 },
	])('rejects an unsafe destination %j', (goal) => {
		const world = room({ cylinders: [{ kind: 'cylinder', center: { x: 1, y: 0 }, radius: 0.3 }] })
		const end = runFor(setGoal(createSimulation({ world, lidar: noLidar }), goal), 1)
		expect(end.planStatus).toBe('invalid_goal')
		expect(end.robot.pose.x).toBe(0)
		expect(end.goals).toEqual([goal])
	})

	test.each([
		'empty',
		'obstacles',
		'slalom',
	])('follows safe routes on %s from start to finish', (name) => {
		const world = createWorld(loadMap(name))
		let sim = setGoal(createSimulation({ world, lidar: noLidar }), {
			x: name === 'empty' ? 2.8 : 3.8,
			y: 2.8,
		})
		expect(sim.planStatus).toBe('ok')
		for (let i = 0; i < 60 * 60 && sim.autonomous; i++) {
			const before = sim.robot.pose
			sim = stepSimulation(sim)
			expect(
				motionIsClear(world, before, sim.robot.pose, robotFootprintRadius(sim.robot.params)),
			).toBe(true)
			expect(sim.collision).toBe(false)
		}
		expect(sim.goals).toHaveLength(0)
	})

	test('editing a wall invalidates the active route and removing it resumes navigation', () => {
		const world = room()
		let sim = setGoal(createSimulation({ world, lidar: noLidar }), { x: 2, y: 0 })
		sim = setSimWorld(
			sim,
			room({ walls: [{ kind: 'wall', start: { x: 1, y: -5 }, end: { x: 1, y: 5 } }] }),
		)
		expect(sim.planStatus).toBe('no_path')
		expect(runFor(sim, 1).robot.pose.x).toBe(0)
		sim = runFor(setSimWorld(sim, world), 15)
		expect(sim.goals).toEqual([])
	})

	test('coverage stays inside the room and finishes without hitting walls or props', () => {
		const world = room({
			width: 4,
			depth: 4,
			cylinders: [{ kind: 'cylinder', center: { x: 0.7, y: 0.5 }, radius: 0.2 }],
		})
		let sim = startCoverage(createSimulation({ world, lidar: noLidar }), { stripWidth: 0.8 })
		expect(sim.goals.length).toBeGreaterThan(5)
		for (const goal of sim.goals) {
			expect(Math.abs(goal.x)).toBeLessThan(1.7)
			expect(Math.abs(goal.y)).toBeLessThan(1.7)
		}
		for (let i = 0; i < 60 * 150 && !sim.coverageComplete; i++) {
			sim = stepSimulation(sim, FIXED_DT)
			expect(sim.collision).toBe(false)
		}
		expect(sim.coverageComplete).toBe(true)
		expect(sim.goals).toEqual([])
	})

	test('a failed plan is throttled rather than retried on every physics tick', () => {
		let sim = setGoal(createSimulation({ world: room(), lidar: noLidar }), { x: 10, y: 0 })
		sim = runFor(sim, 0.1)
		expect(sim.lastPlanStep).toBe(0)
		expect(replan(sim).lastPlanStep).toBe(sim.stepCount)
	})
})
