import type { DecisionRecord, LayaInspector } from './laya-controller'
import type { LayaRoute } from './laya-observation'
import type { Command, WarehouseState } from './world'

export type RunSummary = {
	seed: number
	mode: 'predictable' | 'laya'
	delivered: number
	incoming: number
	elapsed: number
	contacts: number
	invalid: number
	pauses: number
	outcome: 'ready' | 'running' | 'paused' | 'complete' | 'stalled' | 'interrupted'
	reason: string | null
}
export type RecordedFrame = {
	state: WarehouseState
	route: LayaRoute
	inspector: LayaInspector
	command: Command
}
export type RunRecording = {
	version: 1
	seed: number
	frames: RecordedFrame[]
	decisions: DecisionRecord[]
	pauses: { tick: number; time: number; reason: string }[]
	summary: RunSummary
}
