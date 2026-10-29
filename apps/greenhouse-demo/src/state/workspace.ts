import { create, type StateCreator } from 'zustand'
import { persist } from 'zustand/middleware'
import type { EpisodeDetail } from '../api/demonstrations'
import type { HttpModels } from '../api/generated/http'
import type { PolicyDetail, TrainingCatalog } from '../api/training'

export const panels = ['watch', 'teach', 'train', 'compare', 'missions'] as const
export type PanelId = (typeof panels)[number]
export type Replay =
	| { kind: 'live' }
	| { kind: 'episode'; detail: EpisodeDetail }
	| { kind: 'validation'; detail: PolicyDetail; seed: number }
	| { kind: 'comparison'; detail: HttpModels['comparison_detail']; entry: number }

export function replayLength(replay: Replay): number {
	if (replay.kind === 'episode') return replay.detail.entry.episode.frames.length
	if (replay.kind === 'validation')
		return (
			replay.detail.evaluation.episodes.find((item) => item.seed === replay.seed)?.frames?.length ??
			0
		)
	if (replay.kind === 'comparison')
		return replay.detail.entries[replay.entry]?.rollout.frames?.length ?? 0
	return 0
}

export type WorkspaceState = {
	panel: PanelId
	paletteOpen: boolean
	camera: 'overview' | 'follow' | 'eye'
	inspectorSize: number
	mobileViewportSize: number
	checkpointId: string
	missionId: string
	comparisonA: string
	comparisonB: string
	comparisonSeed: number
	replay: Replay
	frame: number
	playing: boolean
	viewGeneration: number
	replayTicket: number
	sessionIdentity: string
	openPanel: (panel: PanelId) => void
	setPalette: (open: boolean) => void
	setCamera: (camera: WorkspaceState['camera']) => void
	setLayout: (vertical: boolean, size: number) => void
	chooseCheckpoint: (id: string) => void
	reconcileCheckpoints: (catalog: TrainingCatalog) => void
	chooseMission: (id: string) => void
	compareWith: (side: 'a' | 'b', id: string) => void
	setComparisonSeed: (seed: number) => void
	beginReplay: () => number
	finishReplay: (ticket: number, replay: Replay) => boolean
	showReplay: (replay: Replay) => void
	returnLive: () => void
	seek: (index: number) => void
	togglePlayback: () => void
	advancePlayback: () => void
	updateEpisode: (id: string, detail: EpisodeDetail) => void
	bindSession: (session: string, generation: number) => void
}
export const workspaceState: StateCreator<WorkspaceState> = (set, get) => ({
	panel: 'watch',
	paletteOpen: false,
	camera: 'overview',
	inspectorSize: 36,
	mobileViewportSize: 42,
	checkpointId: '',
	missionId: '',
	comparisonA: '',
	comparisonB: '',
	comparisonSeed: 10000,
	replay: { kind: 'live' },
	frame: 0,
	playing: false,
	viewGeneration: 100000,
	replayTicket: 0,
	sessionIdentity: '',
	openPanel: (panel) => set({ panel }),
	setPalette: (paletteOpen) => set({ paletteOpen }),
	setCamera: (camera) => set({ camera }),
	setLayout: (vertical, size) =>
		set(
			vertical
				? { mobileViewportSize: Math.max(25, Math.min(65, size)) }
				: { inspectorSize: Math.max(25, Math.min(60, size)) },
		),
	chooseCheckpoint: (checkpointId) => {
		if (get().checkpointId === checkpointId) return
		set({ checkpointId })
		if (get().replay.kind === 'validation') get().returnLive()
	},
	reconcileCheckpoints: (catalog) => {
		if (catalog.checkpoints.some((item) => item.checkpoint_id === get().checkpointId)) return
		const selected = catalog.jobs.find((item) => item.state === 'completed')?.selected_checkpoint
		const id =
			catalog.checkpoints.find((item) => item.checkpoint_id === selected && item.compatible)
				?.checkpoint_id ??
			catalog.checkpoints.find((item) => item.compatible)?.checkpoint_id ??
			''
		get().chooseCheckpoint(id)
	},
	chooseMission: (missionId) => set({ missionId }),
	compareWith: (side, id) => set(side === 'a' ? { comparisonA: id } : { comparisonB: id }),
	setComparisonSeed: (comparisonSeed) => set({ comparisonSeed }),
	beginReplay: () => {
		const ticket = get().replayTicket + 1
		set({ replayTicket: ticket })
		return ticket
	},
	finishReplay: (ticket, replay) => {
		if (get().replayTicket !== ticket) return false
		set((state) => ({ replay, frame: 0, playing: false, viewGeneration: state.viewGeneration + 1 }))
		return true
	},
	showReplay: (replay) => {
		const ticket = get().beginReplay()
		get().finishReplay(ticket, replay)
	},
	returnLive: () =>
		set((state) => ({
			replay: { kind: 'live' },
			frame: 0,
			playing: false,
			replayTicket: state.replayTicket + 1,
			viewGeneration: state.viewGeneration + 1,
		})),
	seek: (index) =>
		set((state) => ({
			frame: Math.max(0, Math.min(index, replayLength(state.replay))),
			playing: false,
			viewGeneration: state.viewGeneration + 1,
		})),
	togglePlayback: () =>
		set((state) =>
			state.replay.kind === 'live'
				? {}
				: {
						playing: !state.playing,
						frame: state.frame >= replayLength(state.replay) ? 0 : state.frame,
						viewGeneration:
							state.frame >= replayLength(state.replay)
								? state.viewGeneration + 1
								: state.viewGeneration,
					},
		),
	advancePlayback: () =>
		set((state) => {
			const max = replayLength(state.replay)
			const frame = Math.min(max, state.frame + 1)
			return { frame, playing: frame < max && state.playing }
		}),
	updateEpisode: (id, detail) =>
		set((state) =>
			state.replay.kind === 'episode' && state.replay.detail.entry.episode.episode_id === id
				? { replay: { kind: 'episode', detail } }
				: {},
		),
	bindSession: (session, generation) => {
		const identity = `${session}:${generation}`
		if (get().sessionIdentity && get().sessionIdentity !== identity) get().returnLive()
		set({ sessionIdentity: identity })
	},
})
export const useWorkspace = create<WorkspaceState>()(
	persist(workspaceState, {
		name: 'greenhouse-workspace-v1',
		partialize: (state) => ({
			panel: state.panel,
			camera: state.camera,
			inspectorSize: state.inspectorSize,
			mobileViewportSize: state.mobileViewportSize,
			checkpointId: state.checkpointId,
		}),
	}),
)
