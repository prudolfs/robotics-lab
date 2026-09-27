import { expect, test } from 'vitest'
import { createController } from './controller'
import { createScenario, REFERENCE_SEEDS, validateScenario } from './scenario'
import { advance, canOccupy, createWorld, FIXED_DT, type WarehouseState } from './world'

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

for (const seed of REFERENCE_SEEDS) {
	test(`Phase 1 showcase transfers one pallet for seed ${seed}`, () => {
		const controller = createController(seed)
		controller.start()
		controller.stepTicks(60 * 200)
		const state = controller.getSnapshot()
		expect(controller.getRoute().stage).toBe('done')
		expect(state.delivered).toBe(1)
		expect(state.status).toBe('paused')
		expect(
			state.pallets.filter((item) => item.origin === 'delivery' && item.location.kind === 'bay'),
		).toHaveLength(1)
	})
}

test('Phase 1 showcase transfers a pallet across varied valid layouts', () => {
	const failures: { seed: number; stage: string; delivered: number; contact: number }[] = []
	for (let seed = 0; seed < 100; seed++) {
		const controller = createController(seed)
		controller.start()
		controller.stepTicks(60 * 120)
		const state = controller.getSnapshot()
		if (state.delivered !== 1) {
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
