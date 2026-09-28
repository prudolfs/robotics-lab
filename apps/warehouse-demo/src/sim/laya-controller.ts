import { createLayaClient, type LayaResponse, type LayaTransport } from './laya-client'
import {
	emptyLayaRoute,
	motionGeometry,
	motionRequest,
	motorCommand,
	selectLayaTask,
	taskRequest,
	updateLayaRoute,
} from './laya-observation'
import type { Command, WarehouseState } from './world'

export const LAYA_LIMITS = {
	decisionSeconds: 0.25,
	leaseSeconds: 0.5,
	leaseMs: 500,
	failures: 3,
	rejections: 10,
	rejectionWindow: 30,
	stallSeconds: 15,
	runSeconds: 900,
} as const
// Floors below the smallest correct scores in the 56-state Phase 4 fixture.
// These are demo abstention thresholds, not calibrated success probabilities.
export const MOTOR_MIN_PROBABILITY: Record<string, number> = {
	travel: 0.65,
	gear: 0.6,
	steering: 0.28,
	fork: 0.6,
	action: 0.4,
}
export type DecisionRecord = {
	id: number
	generation: number
	time: number
	stage: string
	observation: string
	choices: Record<string, string>
	probabilities: Record<string, Record<string, number>>
	latencyMs: number
	applied: boolean
	heldReason: string | null
}
export type LayaInspector = {
	connection: 'idle' | 'waiting' | 'connected' | 'delayed' | 'uncertain' | 'error'
	requests: number
	failures: number
	lastResponseAt: number | null
	last: DecisionRecord | null
	rejections: { time: number; reason: string }[]
	error: string | null
}

export function createLayaController(
	transport: LayaTransport = createLayaClient(),
	notify = () => {},
	now = () => performance.now(),
) {
	let route = emptyLayaRoute()
	let inspector: LayaInspector = {
		connection: 'idle',
		requests: 0,
		failures: 0,
		lastResponseAt: null,
		last: null,
		rejections: [],
		error: null,
	}
	let pending: Promise<void> | null = null
	let abort: AbortController | null = null
	let epoch = 0
	let command: Command = {}
	let leaseTime = -Infinity
	let leaseWall = -Infinity
	let nextDecision = 0
	let lastProgress = 0
	let bestDistance = Infinity
	let observedStage = 'select'
	let latest: WarehouseState | null = null
	const trace: DecisionRecord[] = []
	function fail(reason: string) {
		epoch++
		abort?.abort()
		abort = null
		pending = null
		route = { ...route, stage: 'stalled', failReason: reason }
		inspector = { ...inspector, connection: 'error', error: reason }
		command = {}
	}
	function cancel() {
		epoch++
		abort?.abort()
		abort = null
		pending = null
		command = {}
		leaseTime = -Infinity
		inspector = { ...inspector, connection: 'idle' }
	}
	function request(state: WarehouseState) {
		const selecting = route.stage === 'select'
		const payload = selecting ? taskRequest(state) : motionRequest(state, route)
		const requestStage = route.stage
		const requestEpoch = epoch
		const generation = state.generation
		const id = inspector.requests + 1
		const started = now()
		const currentAbort = new AbortController()
		abort = currentAbort
		inspector = { ...inspector, requests: id, connection: 'waiting' }
		nextDecision = state.elapsed + LAYA_LIMITS.decisionSeconds
		pending = transport(payload, currentAbort.signal)
			.then((response: LayaResponse) => {
				if (
					requestEpoch !== epoch ||
					currentAbort.signal.aborted ||
					latest?.generation !== generation
				)
					return
				const choices = Object.fromEntries(
					Object.entries(response.answers).map(([key, answer]) => [key, answer.choice]),
				)
				const fresh =
					route.stage === requestStage &&
					(selecting ||
						(latest.elapsed - state.elapsed <= LAYA_LIMITS.leaseSeconds &&
							now() - started <= LAYA_LIMITS.leaseMs))
				const uncertain = selecting
					? undefined
					: Object.entries(response.answers).find(
							([key, answer]) =>
								answer.probabilities[answer.choice] < (MOTOR_MIN_PROBABILITY[key] ?? 0),
						)
				const heldReason = uncertain
					? `Laya is unsure about ${uncertain[0]}; holding for another decision`
					: null
				const record: DecisionRecord = {
					id,
					generation,
					time: state.elapsed,
					stage: requestStage,
					observation: payload.state,
					choices,
					probabilities: Object.fromEntries(
						Object.entries(response.answers).map(([key, answer]) => [key, answer.probabilities]),
					),
					latencyMs: response.latencyMs,
					applied: fresh && !uncertain,
					heldReason,
				}
				trace.push(record)
				inspector = {
					...inspector,
					connection: !fresh ? 'delayed' : uncertain ? 'uncertain' : 'connected',
					failures: 0,
					lastResponseAt: now(),
					last: record,
					error: heldReason,
				}
				if (!fresh || uncertain) {
					command = {}
					return
				}
				if (selecting) {
					try {
						route = selectLayaTask(latest, choices.cargo, choices.bay)
					} catch (error) {
						fail(String(error))
						return
					}
					command = {}
				} else {
					command = motorCommand(choices, route)
					leaseTime = state.elapsed
					leaseWall = started
				}
			})
			.catch((error: unknown) => {
				if (requestEpoch !== epoch || currentAbort.signal.aborted) return
				const message = error instanceof Error ? error.message : String(error)
				const failures = inspector.failures + 1
				inspector = { ...inspector, connection: 'error', failures, error: message }
				command = {}
				if (failures >= LAYA_LIMITS.failures)
					fail(`Laya paused after ${failures} failed requests: ${message}`)
			})
			.finally(() => {
				if (requestEpoch !== epoch) return
				pending = null
				abort = null
				notify()
			})
	}
	return {
		getRoute: () => route,
		getInspector: () => inspector,
		getTrace: () => trace,
		settle: () => pending ?? Promise.resolve(),
		cancel,
		tick(state: WarehouseState): Command {
			latest = state
			if (route.stage === 'stalled' || state.status !== 'running') return {}
			const previousStage = route.stage
			route = updateLayaRoute(state, route)
			if (previousStage !== route.stage) {
				command = {}
				nextDecision = state.elapsed
			}
			const distance = Math.max(0, motionGeometry(state, route).distance)
			if (route.stage !== observedStage || distance < bestDistance - 0.15) {
				lastProgress = state.elapsed
				bestDistance = distance
				observedStage = route.stage
			}
			if (state.elapsed - lastProgress > LAYA_LIMITS.stallSeconds)
				fail(
					`Laya made no task or approach progress for ${LAYA_LIMITS.stallSeconds} simulated seconds (${route.stage})`,
				)
			if (state.elapsed > LAYA_LIMITS.runSeconds)
				fail(`Laya exceeded the ${LAYA_LIMITS.runSeconds} second run limit`)
			if (route.stage === 'stalled' || route.stage === 'done') return {}
			if (!pending && state.elapsed + 1e-8 >= nextDecision) request(state)
			if (
				state.elapsed - leaseTime > LAYA_LIMITS.leaseSeconds ||
				now() - leaseWall > LAYA_LIMITS.leaseMs
			) {
				if (pending && inspector.last) inspector = { ...inspector, connection: 'delayed' }
				return {}
			}
			const result = command
			// Attachment/release is attempted once per answer; other motors have a bounded lease.
			if (command.action) command = { ...command, action: undefined }
			return result
		},
		observe(previous: WarehouseState, state: WarehouseState) {
			latest = state
			if (
				state.invalidActions > previous.invalidActions ||
				state.contactCount > previous.contactCount
			) {
				const reason = state.events.at(-1)?.text ?? 'Physical action rejected'
				const rejections = [...inspector.rejections, { time: state.elapsed, reason }].slice(-100)
				inspector = { ...inspector, rejections }
				if (
					rejections.filter((r) => state.elapsed - r.time <= LAYA_LIMITS.rejectionWindow).length >=
					LAYA_LIMITS.rejections
				)
					fail(
						`Laya paused after ${LAYA_LIMITS.rejections} rejected actions in ${LAYA_LIMITS.rejectionWindow} seconds: ${reason}`,
					)
			}
			if (state.status === 'complete') {
				route = { ...route, stage: 'done', goal: null }
				cancel()
			}
		},
	}
}
