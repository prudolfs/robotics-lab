// Dead-reckoning odometry (milestone 11 — Localization).
//
// Dead reckoning estimates the robot's pose by integrating the wheel speeds
// the encoders *report*. In a deterministic, noise-free simulation that
// estimate matches the ground-truth pose exactly. The moment motion noise is
// introduced (milestone 10: wheel slip, encoder drift) the two diverge, and
// that divergence is the whole point of the milestone — it shows the limits
// of pure odometry and motivates sensor fusion later on.
//
// This module is intentionally pure and framework independent. It owns a
// small immutable state object (`OdometryState`) advanced by
// `stepOdometry`, mirroring the API shape of the differential-drive integrator
// in `./index` but keyed off the *commanded* (pre-noise) wheel speeds rather
// than the *perturbed* speeds the simulator actually applies.
//
// `OdometryState.pose` is the dead-reckoned estimate. `history` is a bounded
// ring buffer of recent poses (oldest first) sized so a renderer can draw a
// fading trail without the array growing unboundedly over a long run.

import type { Pose } from '@robotics-lab/core'

export type { Pose } from '@robotics-lab/core'

export type WheelSpeeds = {
	leftWheel: number
	rightWheel: number
}

/** All lengths in metres, speeds in m/s. `wheelBase` is axle width. */
export type OdometryParams = {
	wheelBase: number
	/** Maximum number of pose samples retained for the trail. Older entries
	 *  are dropped (FIFO) once the cap is reached. */
	historyLimit: number
	/** Only sample a history point every `sampleInterval` steps to keep the
	 *  trail cheap and visually clean at 60 Hz fixed stepping. */
	sampleInterval: number
}

export const DEFAULT_ODOMETRY_PARAMS: OdometryParams = {
	wheelBase: 0.4,
	historyLimit: 600,
	sampleInterval: 3,
}

/** Dead-reckoning tracker state. */
export type OdometryState = {
	/** Estimated pose derived purely from integrated wheel odometry. */
	pose: Pose
	/** Estimated linear + angular velocity at the last step. */
	velocity: { vx: number; vy: number; omega: number }
	/** Most recently reported (commanded) wheel speeds. */
	wheels: WheelSpeeds
	params: OdometryParams
	/** Recent estimated poses (oldest first), capped at `historyLimit`. */
	history: Pose[]
	/** Fixed-step counter since creation / last reset. */
	stepCount: number
}

export function createOdometry(
	pose: Pose = { x: 0, y: 0, heading: 0 },
	params: Partial<OdometryParams> = {},
): OdometryState {
	return {
		pose,
		velocity: { vx: 0, vy: 0, omega: 0 },
		wheels: { leftWheel: 0, rightWheel: 0 },
		params: { ...DEFAULT_ODOMETRY_PARAMS, ...params },
		history: [pose],
		stepCount: 0,
	}
}

/** Replace the history cap / sample cadence. Returns a new state. Existing
 *  history is truncated to fit the new limit. */
export function setOdometryParams(
	state: OdometryState,
	params: Partial<OdometryParams>,
): OdometryState {
	const merged = { ...state.params, ...params }
	let history = state.history
	if (merged.historyLimit < history.length) {
		history = history.slice(history.length - merged.historyLimit)
	}
	return { ...state, params: merged, history }
}

/** Reset the estimate back to the spawn pose and clear the history. The
 *  params (wheelBase, sample cadence) are preserved. */
export function resetOdometry(state: OdometryState, pose: Pose): OdometryState {
	return {
		...createOdometry(pose, state.params),
	}
}

/**
 * Advance the dead-reckoning estimate by `dt` seconds using the reported
 * (commanded, pre-noise) wheel speeds. Pure and deterministic: no RNG, no
 * external state. Integrate position at the heading midpoint so an arc stays
 * accurate over many steps (same trick as the ground-truth integrator).
 *
 * Returns a new state with the updated pose and, when the sample interval has
 * elapsed, an appended history entry.
 */
export function stepOdometry(
	state: OdometryState,
	reported: WheelSpeeds,
	dt: number,
): OdometryState {
	const { wheelBase } = state.params
	const v = (reported.leftWheel + reported.rightWheel) / 2
	const omega = (reported.rightWheel - reported.leftWheel) / wheelBase
	const midHeading = state.pose.heading + (omega * dt) / 2
	const heading = state.pose.heading + omega * dt
	const x = state.pose.x + v * Math.cos(midHeading) * dt
	const y = state.pose.y + v * Math.sin(midHeading) * dt
	const pose: Pose = { x, y, heading }

	const stepCount = state.stepCount + 1
	let history = state.history
	if (stepCount % state.params.sampleInterval === 0) {
		history = [...history, pose]
		if (history.length > state.params.historyLimit) {
			history = history.slice(history.length - state.params.historyLimit)
		}
	}
	return {
		...state,
		pose,
		velocity: { vx: v * Math.cos(heading), vy: v * Math.sin(heading), omega },
		wheels: reported,
		history,
		stepCount,
	}
}

/** Drop every recorded pose, keeping only the current estimate. */
export function clearOdometryHistory(state: OdometryState): OdometryState {
	if (state.history.length <= 1) return state
	return { ...state, history: [state.pose] }
}

/** Euclidean distance between the estimated pose and a ground-truth pose.
 *  Handy for tests asserting drift once motion noise is present. */
export function poseError(estimate: Pose, truth: Pose): number {
	return Math.hypot(estimate.x - truth.x, estimate.y - truth.y)
}
