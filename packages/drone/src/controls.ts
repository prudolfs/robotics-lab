import { clamp } from '@robotics-lab/math'
import {
	type DroneState,
	type MotorSpeeds,
	type QuadcopterParams,
	throttleToMotorSpeed,
} from './index'

export type ManualControlInput = {
	throttle: number
	yaw: number
	pitch: number
	roll: number
}

export const CONTROL_RESPONSE_OPTIONS = [0.5, 1, 1.5] as const
export type ControlResponse = (typeof CONTROL_RESPONSE_OPTIONS)[number]

export const NEUTRAL_MANUAL_CONTROL: ManualControlInput = {
	throttle: 0,
	yaw: 0,
	pitch: 0,
	roll: 0,
}

export function isDroneArmed(state: DroneState): boolean {
	return state.missionState === 'armed' || state.missionState === 'flying'
}

/** Mix hover-centered pilot commands into an X-frame quadcopter motor layout. */
export function mixManualMotorSpeeds(
	input: ManualControlInput,
	params: QuadcopterParams,
	response: ControlResponse = 1,
): MotorSpeeds {
	const throttle = clamp(input.throttle, -1, 1)
	const yaw = clamp(input.yaw, -1, 1)
	const pitch = clamp(input.pitch, -1, 1)
	const roll = clamp(input.roll, -1, 1)
	const base = params.hoverThrottle + throttle * 0.24 * response
	const attitudeAuthority = 0.1 * response
	const motorThrottle: MotorSpeeds = [
		base + (roll + pitch + yaw) * attitudeAuthority,
		base + (-roll + pitch - yaw) * attitudeAuthority,
		base + (-roll - pitch + yaw) * attitudeAuthority,
		base + (roll - pitch - yaw) * attitudeAuthority,
	]
	return motorThrottle.map((value) => throttleToMotorSpeed(value, params)) as MotorSpeeds
}

export function applyManualControl(
	state: DroneState,
	input: ManualControlInput,
	params: QuadcopterParams,
	response: ControlResponse = 1,
): DroneState {
	if (!isDroneArmed(state)) {
		if (state.motorSpeeds.every((speed) => speed === 0)) return state
		return { ...state, motorSpeeds: [0, 0, 0, 0] }
	}
	const motorSpeeds = mixManualMotorSpeeds(input, params, response)
	const missionState =
		state.missionState === 'armed' && input.throttle > 0.05 ? 'flying' : state.missionState
	if (
		missionState === state.missionState &&
		motorSpeeds.every((speed, index) => speed === state.motorSpeeds[index])
	) {
		return state
	}
	return { ...state, missionState, motorSpeeds }
}

export function armDrone(state: DroneState, params: QuadcopterParams): DroneState {
	if (isDroneArmed(state)) return state
	const hoverSpeed = throttleToMotorSpeed(params.hoverThrottle, params)
	return {
		...state,
		missionState: 'armed',
		motorSpeeds: [hoverSpeed, hoverSpeed, hoverSpeed, hoverSpeed],
	}
}

export function disarmDrone(state: DroneState): DroneState {
	if (!isDroneArmed(state) && state.motorSpeeds.every((speed) => speed === 0)) return state
	return { ...state, missionState: 'idle', motorSpeeds: [0, 0, 0, 0] }
}
