import { model, request, type Scene } from './client'
import type { Frame, HttpModels, StateData } from './generated/http'

export type Dataset = HttpModels['dataset']
export type EpisodeDetail = HttpModels['episode']
export type Review = HttpModels['review']
export type ValidationReport = HttpModels['validation']
const dataset = model<Dataset>('DatasetSummary')
const detail = model<EpisodeDetail>('EpisodeDetail')
const validation = model<ValidationReport>('ValidationReport')
const imported = model<HttpModels['import_result']>('ImportResult')
const prefix = '/api/v1/greenhouse'
const json = (body: unknown, method = 'POST'): RequestInit => ({
	method,
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(body),
})

export const demonstrations = {
	list(signal?: AbortSignal) {
		return request('/dataset', { signal }, dataset)
	},
	get(id: string, signal?: AbortSignal) {
		return request(`/episodes/${encodeURIComponent(id)}`, { signal }, detail)
	},
	review(id: string, body: Review) {
		return request(`/episodes/${encodeURIComponent(id)}/review`, json(body, 'PATCH'), detail)
	},
	experts() {
		return request(
			'/dataset/expert',
			json({ seeds: Array.from({ length: 20 }, (_, index) => index) }),
			dataset,
		)
	},
	validate() {
		return request('/dataset/validate', { method: 'POST' }, validation)
	},
	import(file: File) {
		if (file.size > 20 * 1024 * 1024) throw new Error('Import exceeds the 20 MiB limit.')
		return request(
			'/dataset/import',
			{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: file },
			imported,
		)
	},
	async download(id?: string) {
		const response = await fetch(
			`${prefix}/dataset/export${id ? `?ids=${encodeURIComponent(id)}` : ''}`,
		)
		if (!response.ok) {
			const body = (await response.json()) as { detail?: string }
			throw new Error(body.detail ?? 'The dataset could not be exported.')
		}
		const blob = await response.blob()
		const url = URL.createObjectURL(blob)
		const link = document.createElement('a')
		link.href = url
		link.download = id ? `greenhouse-episode-${id}.json` : 'greenhouse-demonstrations-v1.json'
		link.click()
		setTimeout(() => URL.revokeObjectURL(url), 1000)
	},
}

/** Playback uses recorded states; it never feeds recorded actions to the server. */
export function recordedScene(detail: EpisodeDetail, index: number, playing: boolean): Scene {
	const episode = detail.entry.episode
	const frame: Frame | undefined = index > 0 ? episode.frames[index - 1] : undefined
	const state: StateData =
		index === episode.frames.length ? episode.final_state : (frame?.state ?? episode.initial_state)
	return {
		...detail.template,
		observation: frame?.next_observation ?? episode.frames[0].observation,
		controller: frame?.controller ?? episode.frames[0].controller,
		status:
			state.status === 'complete' || state.status === 'failed'
				? state.status
				: playing
					? 'running'
					: 'paused',
		stage: state.delivered ? 'done' : (frame?.stage ?? episode.frames[0].stage),
		elapsed_seconds: state.tick * episode.configuration.control_dt,
		delivered: state.delivered,
		pickups: state.pickups,
		collisions: state.collisions,
		invalid_actions: state.invalid_actions,
		reason: state.reason,
		events: state.events,
		robot: {
			id: 'caretaker',
			x: state.x,
			y: state.y,
			heading: state.heading,
			holding: state.holding,
			lift_height: state.lift_height,
			left_wheel_angle: state.left_wheel_angle,
			right_wheel_angle: state.right_wheel_angle,
		},
		capsule: {
			id: 'capsule-1',
			position: { x: state.capsule[0], y: state.capsule[1], z: state.capsule[2] },
		},
	}
}
