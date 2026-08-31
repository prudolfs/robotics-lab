import {
	createDroneState,
	DEFAULT_QUADCOPTER_PARAMS,
	throttleToMotorSpeed,
} from '@robotics-lab/drone'

export const PREVIEW_DRONE_PARAMS = DEFAULT_QUADCOPTER_PARAMS

const armedMotorSpeed = throttleToMotorSpeed(0.12, PREVIEW_DRONE_PARAMS)

/** Static planning-preview state. Milestone 3 will move this into the simulation clock. */
export const PREVIEW_DRONE_STATE = createDroneState({
	position: { x: 0, y: 0.22, z: 0 },
	batteryLevel: 96,
	missionState: 'armed',
	motorSpeeds: [armedMotorSpeed, armedMotorSpeed, armedMotorSpeed, armedMotorSpeed],
})
