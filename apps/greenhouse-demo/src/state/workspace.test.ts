import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createStore } from 'zustand/vanilla'
import type { EpisodeDetail } from '../api/demonstrations'
import type { PolicyDetail, TrainingCatalog, TrainingJob } from '../api/training'
import { replayLength, workspaceState } from './workspace'

function evidence<T>(name: string): T {
	return JSON.parse(
		readFileSync(
			new URL(`../../../../docs/greenhouse-demo/phase5/${name}.json`, import.meta.url),
			'utf8',
		),
	) as T
}
const first = evidence<PolicyDetail>('round-0')
const last = evidence<PolicyDetail>('round-3')
const job = evidence<TrainingJob>('training-job')
const source = evidence<{ episodes: EpisodeDetail['entry'][] }>('expert-example-v1').episodes[0]
const template = evidence<{ initial: { scene: EpisodeDetail['template'] } }>('browser-collection')
	.initial.scene
const episode: EpisodeDetail = { entry: source, template }
const catalog: TrainingCatalog = {
	active_job: null,
	artifact_location: 'test',
	jobs: [job],
	checkpoints: [first.checkpoint, last.checkpoint].map((item) => ({ ...item, compatible: true })),
}

function workspace() {
	return createStore(workspaceState)
}

describe('workspace selection and playback ownership', () => {
	it('keeps an explicit checkpoint when polling reports a newer completed job', () => {
		const store = workspace()
		store.getState().reconcileCheckpoints(catalog)
		store.getState().chooseCheckpoint(first.checkpoint.checkpoint_id)
		store.getState().reconcileCheckpoints({
			...catalog,
			jobs: [{ ...job, selected_checkpoint: last.checkpoint.checkpoint_id }],
		})
		expect(store.getState().checkpointId).toBe(first.checkpoint.checkpoint_id)
		store.getState().openPanel('missions')
		expect(store.getState().checkpointId).toBe(first.checkpoint.checkpoint_id)
	})
	it('reconciles a removed checkpoint to a compatible choice and safely handles an empty catalog', () => {
		const store = workspace()
		store.getState().chooseCheckpoint('removed')
		store.getState().reconcileCheckpoints(catalog)
		expect(store.getState().checkpointId).toBe(last.checkpoint.checkpoint_id)
		store.getState().reconcileCheckpoints({ ...catalog, jobs: [], checkpoints: [] })
		expect(store.getState().checkpointId).toBe('')
	})
	it('prevents an older HTTP response from replacing a later playback or return to live', () => {
		const store = workspace()
		const delayed = store.getState().beginReplay()
		store.getState().showReplay({ kind: 'validation', detail: first, seed: 10000 })
		expect(store.getState().finishReplay(delayed, { kind: 'episode', detail: episode })).toBe(false)
		expect(store.getState().replay.kind).toBe('validation')
		const next = store.getState().beginReplay()
		store.getState().returnLive()
		expect(store.getState().finishReplay(next, { kind: 'episode', detail: episode })).toBe(false)
		expect(store.getState().replay.kind).toBe('live')
	})
	it('uses one playback source and resets frame and running state on source change', () => {
		const store = workspace()
		store.getState().showReplay({ kind: 'episode', detail: episode })
		store.getState().seek(3)
		store.getState().togglePlayback()
		store.getState().showReplay({ kind: 'validation', detail: first, seed: 10000 })
		expect(store.getState()).toMatchObject({
			frame: 0,
			playing: false,
			replay: { kind: 'validation' },
		})
		store.getState().chooseCheckpoint(last.checkpoint.checkpoint_id)
		expect(store.getState().replay.kind).toBe('live')
	})
	it('clamps seeks, stops at the final state and restarts playback from its initial state', () => {
		const store = workspace()
		store.getState().showReplay({ kind: 'episode', detail: episode })
		const length = replayLength(store.getState().replay)
		expect(length).toBeGreaterThan(1)
		store.getState().seek(-5)
		expect(store.getState().frame).toBe(0)
		store.getState().seek(length + 100)
		expect(store.getState().frame).toBe(length)
		store.getState().seek(length - 1)
		store.getState().togglePlayback()
		store.getState().advancePlayback()
		expect(store.getState()).toMatchObject({ frame: length, playing: false })
		store.getState().togglePlayback()
		expect(store.getState()).toMatchObject({ frame: 0, playing: true })
	})
	it('invalidates pending previews when the session or generation changes', () => {
		const store = workspace()
		store.getState().bindSession('one', 0)
		const ticket = store.getState().beginReplay()
		store.getState().bindSession('one', 1)
		expect(store.getState().finishReplay(ticket, { kind: 'episode', detail: episode })).toBe(false)
		store.getState().showReplay({ kind: 'episode', detail: episode })
		store.getState().bindSession('two', 0)
		expect(store.getState().replay.kind).toBe('live')
	})
	it('does not let a delayed review update overwrite a different active source', () => {
		const store = workspace()
		store.getState().showReplay({ kind: 'episode', detail: episode })
		store.getState().seek(3)
		const reviewed = {
			...episode,
			entry: { ...episode.entry, review: { ...episode.entry.review, notes: 'checked' } },
		}
		store.getState().updateEpisode(episode.entry.episode.episode_id, reviewed)
		expect(store.getState().frame).toBe(3)
		store.getState().showReplay({ kind: 'validation', detail: first, seed: 10000 })
		store.getState().updateEpisode(episode.entry.episode.episode_id, reviewed)
		expect(store.getState().replay.kind).toBe('validation')
	})
})
