import {
	createDroneState,
	DEFAULT_QUADCOPTER_PARAMS,
	throttleToMotorSpeed,
} from '@robotics-lab/drone'

export const PREVIEW_DRONE_PARAMS = DEFAULT_QUADCOPTER_PARAMS

const hoverMotorSpeed = throttleToMotorSpeed(
	PREVIEW_DRONE_PARAMS.hoverThrottle,
	PREVIEW_DRONE_PARAMS,
)

/** Balanced hover gives the live physics loop a stable, inspectable starting state. */
export const PREVIEW_DRONE_STATE = createDroneState({
	position: { x: 0, y: 1.2, z: 0 },
	batteryLevel: 96,
	missionState: 'flying',
	motorSpeeds: [hoverMotorSpeed, hoverMotorSpeed, hoverMotorSpeed, hoverMotorSpeed],
})
