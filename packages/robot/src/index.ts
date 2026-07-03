// Robot state and differential-drive kinematics.
// Framework independent and deterministic: pure functions over immutable state.

import type { Pose, Velocity } from '@robotics-lab/core'

export type WheelSpeeds = {
	leftWheel: number
	rightWheel: number
}

export type RobotState = {
	pose: Pose
	velocity: Velocity
	wheels: WheelSpeeds
	params: RobotParams
}

export type RobotParams = {
	/** Distance between the two wheels, in metres. */
	wheelBase: number
	/** Wheel radius, in metres. */
	wheelRadius: number
}

export const DEFAULT_ROBOT_PARAMS: RobotParams = {
	wheelBase: 0.4,
	wheelRadius: 0.05,
}

export function createRobot(
	pose: Pose = { x: 0, y: 0, heading: 0 },
	params: Partial<RobotParams> = {},
): RobotState {
	return {
		pose,
		velocity: { vx: 0, vy: 0, omega: 0 },
		wheels: { leftWheel: 0, rightWheel: 0 },
		params: { ...DEFAULT_ROBOT_PARAMS, ...params },
	}
}

/**
 * Advance a robot by `dt` seconds using the differential-drive model.
 * Wheel speeds are linear speeds (m/s) at the wheel contact point.
 */
export function stepDifferentialDrive(
	robot: RobotState,
	next: WheelSpeeds,
	dt: number,
): RobotState {
	const { wheelBase } = robot.params
	const v = (next.leftWheel + next.rightWheel) / 2
	const omega = (next.rightWheel - next.leftWheel) / wheelBase
	const heading = robot.pose.heading + omega * dt
	const x = robot.pose.x + v * Math.cos(robot.pose.heading) * dt
	const y = robot.pose.y + v * Math.sin(robot.pose.heading) * dt
	return {
		...robot,
		pose: { x, y, heading },
		velocity: { vx: v * Math.cos(heading), vy: v * Math.sin(heading), omega },
		wheels: next,
	}
}
