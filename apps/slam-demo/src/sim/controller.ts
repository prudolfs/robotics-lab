import {
	type Config,
	createSimulation,
	FIXED_DT,
	type ManualCommand,
	setStatus,
	stepSimulation,
} from './simulation'
export function createController(config: Partial<Config> = {}) {
	let live = createSimulation(config),
		published = live,
		accumulator = 0
	let command: ManualCommand = { forward: 0, turn: 0 }
	const listeners = new Set<() => void>()
	let generation = 0
	let guard = () => true
	const ticks = new Set<(state: typeof live, generation: number) => void>()
	function emitTick() {
		for (const listener of ticks) listener(live, generation)
	}
	function publish() {
		published = live
		for (const listener of listeners) listener()
	}
	function clearInput() {
		command = { forward: 0, turn: 0 }
	}
	return {
		read: () => live,
		getGeneration: () => generation,
		subscribeTicks(listener: (state: typeof live, generation: number) => void) {
			ticks.add(listener)
			return () => {
				ticks.delete(listener)
			}
		},
		setAdvanceGuard(next: () => boolean) {
			guard = next
		},
		getSnapshot: () => published,
		subscribe(listener: () => void) {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		play() {
			if (live.status === 'complete') return
			live = setStatus(live, 'running')
			accumulator = 0
			publish()
		},
		pause() {
			if (live.status === 'running') live = setStatus(live, 'paused')
			accumulator = 0
			clearInput()
			publish()
		},
		reset(next: Partial<Config> = {}) {
			live = createSimulation({ ...live.config, ...next })
			generation++
			accumulator = 0
			clearInput()
			emitTick()
			publish()
		},
		command(next: ManualCommand) {
			command = next
		},
		clearInput,
		advance(seconds: number) {
			if (live.status !== 'running' || !Number.isFinite(seconds) || seconds <= 0) return
			if (!guard()) {
				accumulator = 0
				return
			}
			// Discard excess wall time after suspended tabs; never integrate one giant physics step.
			accumulator += Math.min(seconds, 0.1)
			while (accumulator + 1e-12 >= FIXED_DT && live.status === 'running' && guard()) {
				live = stepSimulation(live, command)
				accumulator -= FIXED_DT
				emitTick()
			}
			if (
				Math.floor(live.tick / 6) !== Math.floor(published.tick / 6) ||
				live.status !== published.status
			)
				publish()
		},
	}
}
export type SimulationController = ReturnType<typeof createController>
