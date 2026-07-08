// Robot state and differential-drive kinematics.
// Framework independent and deterministic: pure functions over immutable state.

import type { Pose, Velocity } from '@robotics-lab/core'
import type { Rng } from '@robotics-lab/noise'
import { encoderDrift, wheelSlip } from '@robotics-lab/noise'

export type WheelSpeeds = {
	leftWheel: number
	rightWheel: number
}

/** Stochastic disturbance applied to differential-drive motion.  All fields
 *  are optional; the default is perfect odometry (zero noise). */
export type MotionNoise = {
	/** Standard deviation of wheel-speed multiplicative noise (slip).
	 *  e.g. 0.05 → each wheel can be 5 % faster or slower at each step. */
	wheelSlipSigma: number
	/** Standard deviation of heading drift per step (encoder drift, in radians). */
	encoderDriftSigma: number
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
	/** Optional motion noise model; absent means perfect motion. */
	noise?: MotionNoise
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

/** Apply motion noise to the wheel speeds.  Pure: no external state. */
export function applyWheelNoise(
	wheels: WheelSpeeds,
	noise: MotionNoise,
	rng: Rng = Math.random,
): WheelSpeeds {
	const [lMul, rMul] = wheelSlip(noise.wheelSlipSigma, rng)
	return {
		leftWheel: wheels.leftWheel * lMul,
		rightWheel: wheels.rightWheel * rMul,
	}
}

/**
 * Advance a robot by `dt` seconds using the differential-drive model.
 * Wheel speeds are linear speeds (m/s) at the wheel contact point.
 *
 * Integration uses the heading midpoint for the position update, which keeps
 * arc motion accurate over many steps (plain Euler drifts badly on circles).
 *
 * When `robot.params.noise` is present, `rng` (default `Math.random`) produces
 * the stochastic disturbance.  The simulation loop should inject a seeded rng
 * for reproducibility.
 */
export function stepDifferentialDrive(
	robot: RobotState,
	next: WheelSpeeds,
	dt: number,
	rng: Rng = Math.random,
): RobotState {
	const { wheelBase } = robot.params
	const noise = robot.params.noise

	// Apply wheel slip to commanded speeds before integrating.
	const perturbed =
		noise && (noise.wheelSlipSigma > 0 || noise.encoderDriftSigma > 0)
			? applyWheelNoise(next, noise, rng)
			: next

	const v = (perturbed.leftWheel + perturbed.rightWheel) / 2
	const omega = (perturbed.rightWheel - perturbed.leftWheel) / wheelBase
	let midHeading = robot.pose.heading + (omega * dt) / 2
	let heading = robot.pose.heading + omega * dt

	// Encoder drift: small heading perturbation per step.
	if (noise && noise.encoderDriftSigma > 0) {
		const delta = encoderDrift(noise.encoderDriftSigma, rng)
		midHeading += delta / 2
		heading += delta
	}

	const x = robot.pose.x + v * Math.cos(midHeading) * dt
	const y = robot.pose.y + v * Math.sin(midHeading) * dt
	return {
		...robot,
		pose: { x, y, heading },
		velocity: { vx: v * Math.cos(heading), vy: v * Math.sin(heading), omega },
		wheels: perturbed,
	}
}

export * from './odometry'
