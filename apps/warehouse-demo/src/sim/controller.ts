import type { LayaTransport } from './laya-client'
import { createLayaController } from './laya-controller'
import { createPredictableRoute, predictableStep } from './predictable'
import { advance, appendEvent, createWorld, FIXED_DT, setRunStatus } from './world'

export type ControlMode = 'predictable' | 'laya'
export type WarehouseController = ReturnType<typeof createController>

export function createController(
	seed = 42,
	options: { mode?: ControlMode; transport?: LayaTransport; now?: () => number } = {},
) {
	let state = createWorld(seed)
	let mode = options.mode ?? 'predictable'
	let route = mode === 'predictable' ? createPredictableRoute(state) : null
	const listeners = new Set<() => void>()
	const emit = () => {
		for (const listener of listeners) listener()
	}
	const makeLaya = () =>
		createLayaController(
			options.transport,
			() => {
				state = { ...state }
				emit()
			},
			options.now,
		)
	let laya = makeLaya()
	function reset(nextSeed = state.seed) {
		laya.cancel()
		state = createWorld(nextSeed, state.generation + 1)
		route = mode === 'predictable' ? createPredictableRoute(state) : null
		laya = makeLaya()
		emit()
	}
	return {
		subscribe(listener: () => void) {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
		getSnapshot: () => state,
		getMode: () => mode,
		getRoute: () => route ?? laya.getRoute(),
		getLaya: () => laya.getInspector(),
		getDecisionTrace: () => laya.getTrace(),
		settle: () => laya.settle(),
		start() {
			if (this.getRoute().stage === 'stalled') return
			state = setRunStatus(state, 'running')
			emit()
		},
		pause() {
			laya.cancel()
			state = setRunStatus(state, 'paused')
			emit()
		},
		reset,
		setMode(next: ControlMode) {
			if (next === mode) return
			mode = next
			reset()
		},
		suspend() {
			laya.cancel()
		},
		randomize() {
			const values = new Uint32Array(1)
			crypto.getRandomValues(values)
			reset(values[0])
		},
		step() {
			if (state.status !== 'running') return
			if (mode === 'predictable' && route) {
				const result = predictableStep(state, route)
				route = result.route
				state = advance(state, result.command, FIXED_DT)
				if (state.status === 'complete') route = { ...route, stage: 'done', goal: null }
			} else {
				const previous = state
				state = advance(state, laya.tick(state), FIXED_DT)
				laya.observe(previous, state)
			}
			const activeRoute = this.getRoute()
			if (activeRoute.stage === 'stalled' && state.status === 'running') {
				state = appendEvent(
					setRunStatus(state, 'paused'),
					'warning',
					activeRoute.failReason ?? 'Controller stalled',
				)
			}
			emit()
		},
		stepTicks(count: number) {
			for (let index = 0; index < count; index++) this.step()
		},
	}
}
