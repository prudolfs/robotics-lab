import { expect, test, vi } from 'vitest'
import { createController } from './controller'
import {
	createLayaClient,
	type LayaRequest,
	type LayaResponse,
	type LayaTransport,
	parseAnswers,
} from './laya-client'
import {
	candidates,
	emptyLayaRoute,
	motionRequest,
	selectLayaTask,
	taskRequest,
} from './laya-observation'
import { advance, createWorld, setRunStatus } from './world'

function answer(request: LayaRequest, selected: Record<string, string> = {}): LayaResponse {
	return {
		latencyMs: 20,
		answers: Object.fromEntries(
			Object.entries(request.questions).map(([key, question]) => {
				const choice = selected[key] ?? Object.keys(question.criteria)[0]
				return [
					key,
					{
						choice,
						probabilities: Object.fromEntries(
							Object.keys(question.criteria).map((option) => [option, option === choice ? 1 : 0]),
						),
					},
				]
			}),
		),
	}
}
const stopped: LayaTransport = async (request) =>
	answer(request, { travel: 'at', steering: 'straight', fork: 'level', action: 'none' })
async function ticks(controller: ReturnType<typeof createController>, count: number) {
	for (let i = 0; i < count; i++) {
		controller.step()
		await controller.settle()
	}
}

test('task choices exclude blocked rear cargo and occupied storage', () => {
	const state = createWorld(42)
	const legal = candidates(state)
	const request = taskRequest(state)
	expect(Object.keys(request.questions.cargo.criteria)).toEqual([
		...legal.cargo.map((c) => c.cargoId),
		'unsure',
	])
	for (const stock of state.scenario.existing)
		expect(request.questions.bay.criteria[stock.bayId]).toBeUndefined()
	expect(() => selectLayaTask(state, 'missing', 'B1')).toThrow()
	expect(emptyLayaRoute().palletId).toBe('')
})

test('typed client rejects unknown choices, missing answers and malformed probabilities', () => {
	const request = taskRequest(createWorld(42))
	const valid = answer(request)
	expect(parseAnswers(valid, request)).toEqual(valid.answers)
	expect(() => parseAnswers({}, request)).toThrow('answers')
	valid.answers.cargo.choice = 'invented'
	expect(() => parseAnswers(valid, request)).toThrow('answer')
	const bad = answer(request)
	bad.answers.bay.probabilities.unsure = NaN
	expect(() => parseAnswers(bad, request)).toThrow('probabilities')
})

test('client times out and aborts the actual HTTP request', async () => {
	vi.stubGlobal(
		'fetch',
		vi.fn(
			(_url, init: RequestInit) =>
				new Promise((_resolve, reject) => {
					init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
				}),
		),
	)
	try {
		await expect(
			createLayaClient('/laya', 10)(taskRequest(createWorld(42)), new AbortController().signal),
		).rejects.toThrow('timed out')
	} finally {
		vi.unstubAllGlobals()
	}
})

test('Laya motor choices are applied even when they move away from the goal', async () => {
	const controller = createController(42, {
		mode: 'laya',
		transport: async (request) =>
			answer(request, {
				travel: 'far',
				gear: 'reverse',
				steering: 'straight',
				fork: 'level',
				action: 'none',
			}),
	})
	controller.start()
	await ticks(controller, 90)
	expect(controller.getSnapshot().forklift.y).toBeGreaterThan(1.9)
	expect(controller.getDecisionTrace().some((d) => d.choices.gear === 'reverse' && d.applied)).toBe(
		true,
	)
})

test('reset cancels the request and ignores even a transport that resolves after cancellation', async () => {
	let resolve: ((response: LayaResponse) => void) | undefined
	let payload: LayaRequest | undefined
	let signal: AbortSignal | undefined
	const controller = createController(42, {
		mode: 'laya',
		transport: (request, requestSignal) => {
			payload = request
			signal = requestSignal
			return new Promise((done) => {
				resolve = done
			})
		},
	})
	controller.start()
	controller.step()
	const pending = controller.settle()
	controller.reset(7)
	expect(signal?.aborted).toBe(true)
	if (!payload || !resolve) throw new Error('Missing pending request')
	resolve(answer(payload))
	await pending
	expect(controller.getSnapshot().seed).toBe(7)
	expect(controller.getSnapshot().generation).toBe(1)
	expect(controller.getSnapshot().status).toBe('ready')
	expect(controller.getRoute().stage).toBe('select')
	expect(controller.getDecisionTrace()).toHaveLength(0)
})

test('only one request is in flight and expired motor leases brake', async () => {
	let calls = 0
	let wall = 0
	const controller = createController(42, {
		mode: 'laya',
		now: () => wall,
		transport: async (request) => {
			calls++
			if (calls > 2) return new Promise(() => {})
			return answer(request, {
				travel: 'far',
				gear: 'forward',
				steering: 'straight',
				fork: 'level',
				action: 'none',
			})
		},
	})
	controller.start()
	await ticks(controller, 17)
	expect(controller.getSnapshot().forklift.speed).toBeGreaterThan(0)
	wall = 600
	controller.stepTicks(120)
	expect(calls).toBe(3)
	expect(controller.getSnapshot().forklift.speed).toBe(0)
	controller.pause()
})

test('three request failures pause with an explanation and predictable mode remains independent', async () => {
	const failing: LayaTransport = async () => {
		throw new Error('Service unavailable')
	}
	const controller = createController(42, { mode: 'laya', transport: failing })
	controller.start()
	await ticks(controller, 90)
	expect(controller.getSnapshot().status).toBe('paused')
	expect(controller.getRoute().failReason).toContain('3 failed requests')
	controller.setMode('predictable')
	controller.start()
	controller.stepTicks(60)
	expect(controller.getSnapshot().status).toBe('running')
	expect(controller.getSnapshot().forklift.y).toBeLessThan(1.7)
	expect(controller.getLaya().requests).toBe(0)
})

test('repeated physical rejections pause without correcting the model commands', async () => {
	const controller = createController(42, {
		mode: 'laya',
		transport: async (request) =>
			answer(request, { travel: 'at', steering: 'straight', fork: 'level', action: 'pickup' }),
	})
	controller.start()
	await ticks(controller, 240)
	expect(controller.getSnapshot().status).toBe('paused')
	expect(controller.getSnapshot().invalidActions).toBe(10)
	expect(controller.getLaya().rejections).toHaveLength(10)
	expect(controller.getRoute().failReason).toContain('10 rejected actions')
})

test('no progress pauses after the bounded interval', async () => {
	const controller = createController(42, { mode: 'laya', transport: stopped })
	controller.start()
	await ticks(controller, 1000)
	expect(controller.getSnapshot().status).toBe('paused')
	expect(controller.getRoute().failReason).toContain('no task or approach progress')
})

test('pickup and placement require a stopped vehicle in the shared simulator', () => {
	const state = setRunStatus(createWorld(42), 'running')
	state.forklift.speed = 0.5
	const next = advance(state, {
		throttle: 0.5,
		action: { kind: 'pickup', palletId: state.scenario.cargo[0].cargoId },
	})
	expect(next.invalidActions).toBe(1)
	expect(next.events.at(-1)?.text).toContain('Stop the forklift')
})

test('observations provide qualitative directions and explicit finite motor choices', () => {
	const state = createWorld(42)
	const legal = candidates(state)
	const route = selectLayaTask(state, legal.cargo[0].cargoId, legal.bays[0].id)
	const request = motionRequest(state, route)
	expect(request.state).toContain('The alignment is')
	expect(request.state).not.toMatch(/\d+\.\d+/)
	expect(Object.keys(request.questions.travel.criteria)).toHaveLength(3)
})

test('a late motion answer is discarded and pause cancels the next in-flight request', async () => {
	let wall = 0
	let calls = 0
	let resolve: ((response: LayaResponse) => void) | undefined
	let payload: LayaRequest | undefined
	let signal: AbortSignal | undefined
	const controller = createController(42, {
		mode: 'laya',
		now: () => wall,
		transport: async (request, requestSignal) => {
			calls++
			if (calls === 1) return answer(request)
			payload = request
			signal = requestSignal
			return new Promise((done) => {
				resolve = done
			})
		},
	})
	controller.start()
	await ticks(controller, 15)
	controller.step()
	const pending = controller.settle()
	if (!resolve || !payload) throw new Error('Expected a motion request')
	wall = 700
	resolve(
		answer(payload, {
			travel: 'far',
			gear: 'forward',
			steering: 'straight',
			fork: 'level',
			action: 'none',
		}),
	)
	await pending
	expect(controller.getDecisionTrace().at(-1)?.applied).toBe(false)
	controller.stepTicks(30)
	expect(controller.getSnapshot().forklift.speed).toBe(0)
	controller.pause()
	expect(signal?.aborted).toBe(true)
})

test('motor answers below the measured confidence floor hold and remain visible', async () => {
	const controller = createController(42, {
		mode: 'laya',
		transport: async (request) => {
			const result = answer(request, {
				travel: 'far',
				gear: 'forward',
				steering: 'left',
				fork: 'level',
				action: 'none',
			})
			if (result.answers.steering)
				result.answers.steering.probabilities = {
					left: 0.24,
					slight_left: 0.19,
					straight: 0.19,
					slight_right: 0.19,
					right: 0.19,
				}
			return result
		},
	})
	controller.start()
	await ticks(controller, 30)
	expect(controller.getSnapshot().forklift.speed).toBe(0)
	expect(controller.getLaya().error).toContain('unsure about steering')
	expect(controller.getDecisionTrace().at(-1)?.applied).toBe(false)
	controller.pause()
})
