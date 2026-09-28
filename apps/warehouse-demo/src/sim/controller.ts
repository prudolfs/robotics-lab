import type { LayaTransport } from './laya-client'
import { createLayaController } from './laya-controller'
import { createPredictableRoute, predictableStep } from './predictable'
import type { RunRecording, RunSummary } from './recording'
import type { Command } from './world'
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
	let pauses = 0
	let history: RunSummary[] = []
	let recording: RunRecording | null = null
	let savedRecording: RunRecording | null = null
	let playback: { recording: RunRecording; index: number; finished: boolean } | null = null
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
	function summary(): RunSummary {
		const active = route ?? laya.getRoute()
		return {
			seed: state.seed,
			mode,
			delivered: state.delivered,
			incoming: state.scenario.cargo.length,
			elapsed: state.elapsed,
			contacts: state.contactCount,
			invalid: state.invalidActions,
			pauses,
			outcome: active.stage === 'stalled' ? 'stalled' : state.status,
			reason: active.failReason,
		}
	}
	function capture(command?: Command) {
		if (mode !== 'laya' || playback || !recording) return
		const frame = {
			state,
			route: laya.getRoute(),
			inspector: laya.getInspector(),
			command: command ?? recording.frames.at(-1)?.command ?? {},
		}
		if (recording.frames.at(-1)?.state.tick === state.tick)
			recording.frames[recording.frames.length - 1] = frame
		else recording.frames.push(frame)
		recording.summary = summary()
		recording.decisions = laya.getTrace()
	}
	function remember() {
		if (playback || state.tick === 0) return
		const result = summary()
		if (result.outcome === 'running' || result.outcome === 'paused') result.outcome = 'interrupted'
		history = [
			...history.filter((item) => item.seed !== result.seed || item.mode !== result.mode),
			result,
		].slice(-12)
		if (recording) {
			recording.summary = result
			savedRecording = recording
		}
	}
	function reset(nextSeed = state.seed, nextMode = mode) {
		remember()
		laya.cancel()
		mode = nextMode
		state = createWorld(nextSeed, state.generation + 1)
		route = mode === 'predictable' ? createPredictableRoute(state) : null
		laya = makeLaya()
		pauses = 0
		recording = null
		playback = null
		emit()
	}
	function recordPause(reason: string) {
		pauses++
		recording?.pauses.push({ tick: state.tick, time: state.elapsed, reason })
	}

	return {
		subscribe(listener: () => void) {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
		getSnapshot: () => state,
		getMode: () => mode,
		getRoute: () =>
			playback ? playback.recording.frames[playback.index].route : (route ?? laya.getRoute()),
		getLaya: () =>
			playback ? playback.recording.frames[playback.index].inspector : laya.getInspector(),
		getDecisionTrace: () => (playback ? playback.recording.decisions : laya.getTrace()),
		getSummary: () => (playback ? playback.recording.summary : summary()),
		getHistory: () => history,
		getRecording: () => recording ?? savedRecording,
		getPlayback: () =>
			playback
				? {
						finished: playback.finished,
						frames: playback.recording.frames.length,
						index: playback.index,
					}
				: null,
		replay() {
			if (playback && !playback.finished) return
			const source = playback?.recording ?? recording ?? savedRecording
			if (!source || source.frames.length < 2) return
			remember()
			laya.cancel()
			const generation = state.generation + 1
			playback = { recording: source, index: 0, finished: false }
			mode = 'laya'
			recording = null
			route = null
			state = { ...source.frames[0].state, generation, status: 'ready' }
			emit()
		},
		compare() {
			const nextMode = mode === 'predictable' ? 'laya' : 'predictable'
			reset(state.seed, nextMode)
		},
		settle: () => laya.settle(),
		start() {
			if (
				(!playback && this.getRoute().stage === 'stalled') ||
				playback?.finished ||
				state.status === 'complete' ||
				state.status === 'running'
			)
				return
			if (mode === 'laya' && !playback && !recording) {
				recording = {
					version: 1,
					seed: state.seed,
					frames: [],
					decisions: [],
					pauses: [],
					summary: summary(),
				}
				capture()
			}
			state = setRunStatus(state, 'running')
			capture()
			emit()
		},
		pause() {
			if (state.status !== 'running') return
			laya.cancel()
			if (!playback) recordPause('Visitor paused')
			state = setRunStatus(state, 'paused')
			capture()
			emit()
		},
		reset,
		setMode(next: ControlMode) {
			if (next === mode && !playback) return
			reset(state.seed, next)
		},
		suspend() {
			laya.cancel()
		},
		randomize() {
			const values = new Uint32Array(1)
			crypto.getRandomValues(values)
			reset(values[0] === state.seed ? (values[0] + 1) >>> 0 : values[0])
		},
		step() {
			if (state.status !== 'running') return
			if (playback) {
				playback.index = Math.min(playback.index + 1, playback.recording.frames.length - 1)
				const frame = playback.recording.frames[playback.index]
				playback.finished = playback.index === playback.recording.frames.length - 1
				state = {
					...frame.state,
					generation: state.generation,
					status: playback.finished
						? frame.state.status === 'complete'
							? 'complete'
							: 'paused'
						: 'running',
				}
				emit()
				return
			}
			let command: Command = {}
			if (mode === 'predictable' && route) {
				const result = predictableStep(state, route)
				route = result.route
				state = advance(state, result.command, FIXED_DT)
				if (state.status === 'complete') route = { ...route, stage: 'done', goal: null }
			} else {
				const previous = state
				command = laya.tick(state)
				state = advance(state, command, FIXED_DT)
				laya.observe(previous, state)
			}
			const activeRoute = this.getRoute()
			if (activeRoute.stage === 'stalled' && state.status === 'running') {
				recordPause(activeRoute.failReason ?? 'Controller stalled')
				state = appendEvent(
					setRunStatus(state, 'paused'),
					'warning',
					activeRoute.failReason ?? 'Controller stalled',
				)
			}
			capture(command)
			if (state.status === 'complete' || activeRoute.stage === 'stalled') remember()
			emit()
		},
		stepTicks(count: number) {
			for (let index = 0; index < count; index++) this.step()
		},
	}
}
