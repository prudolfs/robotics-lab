import { createShowcaseRoute, showcaseStep } from './showcase'
import { advance, appendEvent, createWorld, FIXED_DT, setRunStatus } from './world'

export type WarehouseController = ReturnType<typeof createController>

export function createController(seed = 42) {
	let state = createWorld(seed)
	let route = createShowcaseRoute(state)
	const listeners = new Set<() => void>()
	const emit = () => {
		for (const listener of listeners) listener()
	}
	return {
		subscribe(listener: () => void) {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
		getSnapshot() {
			return state
		},
		getRoute() {
			return route
		},
		start() {
			state = setRunStatus(state, 'running')
			emit()
		},
		pause() {
			state = setRunStatus(state, 'paused')
			emit()
		},
		reset(nextSeed = state.seed) {
			state = createWorld(nextSeed, state.generation + 1)
			route = createShowcaseRoute(state)
			emit()
		},
		randomize() {
			const values = new Uint32Array(1)
			crypto.getRandomValues(values)
			this.reset(values[0])
		},
		step() {
			if (state.status !== 'running') return
			const result = showcaseStep(state, route)
			route = result.route
			state = advance(state, result.command, FIXED_DT)
			if (route.stage === 'done' && state.status === 'running') {
				state = appendEvent(
					setRunStatus(state, 'paused'),
					'success',
					'Phase 1 sample transfer complete',
				)
			}
			emit()
		},
		stepTicks(count: number) {
			for (let index = 0; index < count; index++) this.step()
		},
	}
}
