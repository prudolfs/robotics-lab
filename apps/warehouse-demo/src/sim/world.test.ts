import { expect, test } from 'vitest'
import { createController } from './controller'
import { buildRouteGraph, createPredictableRoute, predictableStep, selectTask } from './predictable'
import { createScenario, REFERENCE_SEEDS, validateScenario } from './scenario'
import {
	advance,
	canOccupy,
	createWorld,
	FIXED_DT,
	palletPosition,
	type WarehouseState,
} from './world'

test('seeded scenarios are repeatable and feasible', () => {
	for (let seed = 0; seed < 1000; seed++) {
		const scenario = createScenario(seed)
		expect(validateScenario(scenario)).toEqual([])
		expect(createScenario(seed)).toEqual(scenario)
	}
	expect(createScenario(42).cargo.map((item) => item.cargoId)).toEqual(['C2', 'C1', 'C3', 'C4'])
})

test('fixed-step motion repeats and reset restores the seed state', () => {
	const controller = createController(42)
	controller.start()
	controller.stepTicks(120)
	const first = controller.getSnapshot()
	expect(first.tick).toBe(120)
	expect(first.elapsed).toBeCloseTo(120 * FIXED_DT)
	controller.reset()
	expect(controller.getSnapshot().tick).toBe(0)
	expect(controller.getSnapshot().seed).toBe(42)
	expect(controller.getSnapshot().generation).toBe(1)
	controller.start()
	controller.stepTicks(120)
	expect(controller.getSnapshot().forklift).toEqual(first.forklift)
	expect(controller.getSnapshot().pallets).toEqual(first.pallets)
})

test('forklift stops at the wall without passing through it', () => {
	let state = createWorld(42)
	state = {
		...state,
		status: 'running',
		forklift: { ...state.forklift, x: 4.4, y: 0.8, heading: 0 },
	}
	expect(canOccupy(state, state.forklift)).toBe(true)
	for (let step = 0; step < 180; step++) state = advance(state, { throttle: 1 }, FIXED_DT)
	expect(state.contactCount).toBeGreaterThan(0)
	expect(state.forklift.x).toBeLessThan(5.1)
})

test('truck, rack, and loose pallets block the forklift footprint', () => {
	const state = createWorld(42)
	const near = state.scenario.cargo.find((item) => item.id === 'left-front')
	if (!near) throw new Error('Fixture lacks expected cargo')
	expect(canOccupy(state, { ...state.forklift, x: -3.45, y: -1.1, heading: -Math.PI / 2 })).toBe(
		false,
	)
	expect(canOccupy(state, { ...state.forklift, x: 5.45, y: 6.75, heading: 0 })).toBe(false)
	expect(
		canOccupy(state, { ...state.forklift, x: near.x, y: near.y + 1.2, heading: -Math.PI / 2 }),
	).toBe(false)
})

test('pickup and placement require alignment, height, and an empty bay', () => {
	let state: WarehouseState = { ...createWorld(42), status: 'running' }
	const cargo = state.scenario.cargo.find((item) => item.id === 'left-front')
	if (!cargo) throw new Error('Fixture lacks expected cargo')
	state = advance(state, { action: { kind: 'pickup', palletId: cargo.cargoId } })
	expect(state.invalidActions).toBe(1)
	state = {
		...state,
		forklift: { ...state.forklift, x: cargo.x, y: cargo.y + 1.55, heading: -Math.PI / 2, speed: 0 },
	}
	state = advance(state, { action: { kind: 'pickup', palletId: cargo.cargoId } })
	expect(state.forklift.carriedId).toBe(cargo.cargoId)
	const occupied = state.scenario.existing[0].bayId
	state = advance(state, { action: { kind: 'place', bayId: occupied } })
	expect(state.invalidActions).toBe(2)
	const empty = ['B1', 'B2', 'B3', 'B4'].find(
		(bayId) => !state.scenario.existing.some((item) => item.bayId === bayId),
	)
	if (!empty) throw new Error('Fixture lacks an empty bay')
	const bayY = 2.35 + (Number(empty.slice(1)) - 1) * 1.25
	state = {
		...state,
		forklift: { ...state.forklift, x: 4.9 - 1.55, y: bayY, heading: 0, speed: 0 },
	}
	state = advance(state, { action: { kind: 'place', bayId: empty } })
	expect(state.delivered).toBe(1)
	expect(state.forklift.carriedId).toBeNull()
})

test('pickup rejects a high fork and cargo blocked by a nearer pallet', () => {
	let state: WarehouseState = { ...createWorld(42), status: 'running' }
	const near = state.scenario.cargo.find((item) => item.id === 'left-front')
	const rear = state.scenario.cargo.find((item) => item.id === 'left-rear')
	if (!near || !rear) throw new Error('Fixture lacks expected left-lane cargo')
	state = {
		...state,
		forklift: { ...state.forklift, x: near.x, y: near.y + 1.55, forkHeight: 0.45 },
	}
	state = advance(state, { action: { kind: 'pickup', palletId: near.cargoId } })
	expect(state.invalidActions).toBe(1)
	expect(state.forklift.carriedId).toBeNull()
	state = {
		...state,
		forklift: { ...state.forklift, x: rear.x, y: rear.y + 1.55, forkHeight: 0.1 },
	}
	state = advance(state, { action: { kind: 'pickup', palletId: rear.cargoId } })
	expect(state.invalidActions).toBe(2)
	expect(state.events.at(-1)?.text).toBe('Near pallet blocks this cargo')
})

test('task selection uses reachable cargo and an empty bay with stable tie breaks', () => {
	const state = createWorld(42)
	const task = selectTask(state)
	if (!task) throw new Error('Expected a task for seed 42')
	expect(task?.slotId).toBe('left-front')
	expect(task?.bayId).toBe('B7')
	expect(selectTask(state)).toEqual(task)
	const graph = buildRouteGraph(task.slotId, task.bayId)
	expect(graph.edges).toHaveLength(6)
	expect(graph.nodes.pickup).toEqual({ x: -2.8, y: -0.55, heading: -Math.PI / 2 })
	expect(graph.nodes.bayApproach).toEqual({ x: 3.3500000000000005, y: 9.85, heading: 0 })
})

test('a small pickup offset triggers a bounded reverse and retry', () => {
	let state: WarehouseState = { ...createWorld(42), status: 'running' }
	let route = createPredictableRoute(state)
	const slot = state.scenario.cargo.find((item) => item.id === route.slotId)
	if (!slot) throw new Error('Selected cargo is missing')
	state = {
		...state,
		forklift: { ...state.forklift, x: slot.x + 0.18, y: slot.y + 1.55 },
	}
	route = { ...route, stage: 'pickup' }
	state = advance(state, { action: { kind: 'pickup', palletId: route.palletId } })
	expect(state.invalidActions).toBe(1)
	for (let tick = 0; tick < 60 * 25 && !state.forklift.carriedId; tick++) {
		const result = predictableStep(state, route)
		route = result.route
		state = advance(state, result.command)
	}
	expect(state.forklift.carriedId).toBe(route.palletId)
	expect(route.recoveryCount).toBe(1)
	expect(state.contactCount).toBe(0)
})

test('predictable alignment retries stop after two attempts', () => {
	let state = createWorld(42)
	let route = createPredictableRoute(state)
	for (let attempt = 1; attempt <= 3; attempt++) {
		state = { ...state, invalidActions: attempt }
		route = { ...route, stage: 'pickup' }
		route = predictableStep(state, route).route
		expect(route.stage).toBe(attempt < 3 ? 'recover-pickup' : 'stalled')
	}
	expect(route.failReason).toContain('after two retries')
})

test('authored pallet lifts with the forks and is lowered before every placement', () => {
	const controller = createController(42)
	controller.start()
	let placements = 0
	let lifted = false
	for (let tick = 0; tick < 60 * 500 && controller.getSnapshot().status !== 'complete'; tick++) {
		controller.step()
		const state = controller.getSnapshot()
		const carried = state.pallets.find((pallet) => pallet.location.kind === 'carried')
		if (carried) {
			expect(palletPosition(carried, state).height - 0.15).toBeCloseTo(
				state.forklift.forkHeight - 0.1,
			)
			if (controller.getRoute().stage === 'retreat') {
				expect(state.forklift.forkHeight).toBeGreaterThanOrEqual(0.3)
				lifted = true
			}
		}
		if (state.delivered > placements) {
			expect(lifted).toBe(true)
			expect(state.forklift.forkHeight).toBeCloseTo(0.1, 2)
			expect(state.forklift.carriedId).toBeNull()
			placements = state.delivered
			lifted = false
		}
	}
	expect(placements).toBe(4)
	expect(controller.getSnapshot().status).toBe('complete')
})

for (const seed of REFERENCE_SEEDS) {
	test(`Predictable unloads all cargo for reference seed ${seed}`, () => {
		const controller = createController(seed)
		controller.start()
		controller.stepTicks(60 * 700)
		const state = controller.getSnapshot()
		expect(controller.getRoute().stage).toBe('done')
		expect(state.delivered).toBe(state.scenario.cargo.length)
		expect(state.status).toBe('complete')
		expect(
			state.pallets.filter((item) => item.origin === 'delivery' && item.location.kind === 'bay'),
		).toHaveLength(state.scenario.cargo.length)
	})
}

test('Predictable unloads varied valid layouts', () => {
	const failures: { seed: number; stage: string; delivered: number; contact: number }[] = []
	for (let seed = 0; seed < 100; seed++) {
		const controller = createController(seed)
		controller.start()
		controller.stepTicks(60 * 700)
		const state = controller.getSnapshot()
		expect(state.contactCount, `seed ${seed} collision count`).toBe(0)
		expect(state.invalidActions, `seed ${seed} invalid action count`).toBe(0)
		if (state.delivered !== state.scenario.cargo.length) {
			failures.push({
				seed,
				stage: controller.getRoute().stage,
				delivered: state.delivered,
				contact: state.contactCount,
			})
		}
	}
	expect(failures).toEqual([])
})
