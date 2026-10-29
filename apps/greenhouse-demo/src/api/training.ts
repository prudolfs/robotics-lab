import { model, request, type Scene } from './client'
import type { HttpModels } from './generated/http'

export type TrainingCatalog = HttpModels['training_catalog']
export type TrainingJob = HttpModels['training_job']
export type TrainingRequest = HttpModels['training_request']
export type PolicyDetail = HttpModels['policy_detail']
export type ValidationRollout = PolicyDetail['evaluation']['episodes'][number]
const catalog = model<TrainingCatalog>('TrainingCatalog')
const job = model<TrainingJob>('Job')
const detail = model<PolicyDetail>('PolicyDetail')

export const trainingApi = {
	list(signal?: AbortSignal) {
		return request('/training', { signal }, catalog)
	},
	start(body: TrainingRequest) {
		return request(
			'/training/jobs',
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			},
			job,
		)
	},
	cancel(id: string) {
		return request(`/training/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' }, job)
	},
	checkpoint(id: string, signal?: AbortSignal) {
		return request(`/training/checkpoints/${encodeURIComponent(id)}`, { signal }, detail)
	},
}

/** Recorded validation states; never sends replay actions to the server. */
export function validationScene(
	detail: PolicyDetail,
	rollout: ValidationRollout,
	index: number,
	playing: boolean,
): Scene {
	const state = index > 0 ? rollout.frames?.[index - 1]?.state : rollout.initial
	if (!state) throw new Error('This validation episode has no saved playback states.')
	const target = state.holding
		? [detail.template.tray.position.x, detail.template.tray.position.y]
		: state.capsule
	const dx = target[0] - state.x,
		dy = target[1] - state.y
	const c = Math.cos(state.heading),
		s = Math.sin(state.heading)
	const forward = c * dx + s * dy,
		left = -s * dx + c * dy
	return {
		...detail.template,
		controller: 'learned_policy',
		stage: state.delivered ? 'done' : 'learned',
		status:
			state.status === 'complete' || state.status === 'failed'
				? state.status
				: playing
					? 'running'
					: 'paused',
		elapsed_seconds: state.tick * detail.checkpoint.configuration.control_dt,
		observation: {
			target_forward: forward,
			target_left: left,
			distance: Math.hypot(dx, dy),
			bearing: Math.atan2(left, forward),
			speed: state.speed,
			yaw_speed: state.yaw_speed,
			lift_height: state.lift_height,
			holding: state.holding,
		},
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
