// Navigation controller: turn the abstract goal primitives in this package
// into concrete differential-drive wheel speeds.
//
// Framework independent and deterministic — pure functions over the immutable
// robot / goal state. Nothing here imports React, Zustand or browser APIs, so
// it runs identically in Node tests, the browser and (one day) a ROS adapter.
//
// Behaviour in one sentence: "rotate towards the goal first, then drive
// forward, then brake as you approach, and stop dead on arrival." This is the
// classic turn-and-go / "go-to-goal" controller — the simplest feedback law
// that gets a differential-drive robot to a 2D target while staying within the
// robot's speed envelope.
//
// Misaligned robots rotate in place. Once aligned, forward speed tapers near
// the target and both wheels are scaled together to respect the speed limit.

import type { Pose } from '@robotics-lab/core'
import { angularDelta } from '@robotics-lab/core'
import type { WheelSpeeds } from '@robotics-lab/robot'
import { distanceToGoal, type Goal, headingTowards } from './index'

/** Tuning knobs for the go-to-goal controller. Sensible defaults are exported
 *  as `DEFAULT_NAV_CONFIG` and mirror the teleop base speed so the auto-drive
 *  robot feels as quick as its manual counterpart. */
export type NavConfig = {
	/** Maximum forward linear speed, in m/s. Clamps the wheel envelope. */
	maxSpeed: number
	/** Proportional gain on the heading error (radians -> m/s of turn bias). */
	headingGain: number
	/** Proportional gain on the distance to goal (metres -> m/s of forward speed). */
	distanceGain: number
	/** Heading error (radians) within which the robot is considered "aligned"
	 *  and allowed to drive forward. Larger errors rotate in place. */
	alignTolerance: number
	/** Distance (metres) within which the robot is considered to have arrived. */
	arrivalRadius: number
	/** Distance (metres) inside which the linear speed is scaled down linearly
	 *  so the robot brakes before reaching the goal. */
	brakeRadius: number
	/** Minimum forward speed kept while driving (prevents the robot freezing a
	 *  fraction of a metre from the goal when the brake term drives `v` to ~0). */
	minDriveSpeed: number
}

export const DEFAULT_NAV_CONFIG: NavConfig = {
	maxSpeed: 0.5,
	headingGain: 1.2,
	distanceGain: 1.0,
	alignTolerance: 0.087, // ~5°
	arrivalRadius: 0.06,
	brakeRadius: 0.4,
	minDriveSpeed: 0.05,
}

/** Finite state the controller reports each step. */
export type NavStatus = 'idle' | 'rotating' | 'driving' | 'arrived' | 'blocked'

/** Result of a single control step. */
export type NavOutput = {
	/** Wheel speeds to apply on the next fixed step. */
	input: WheelSpeeds
	/** Behaviour the controller is exhibiting this step. */
	status: NavStatus
	/** Shortest signed heading error to the goal, in radians. */
	headingError: number
	/** Distance to the goal, in metres. */
	distance: number
}

/** Zeroed output used when there is nothing to chase. */
export function idleOutput(pose: Pose, goal: Goal): NavOutput {
	return {
		input: { leftWheel: 0, rightWheel: 0 },
		status: 'idle',
		headingError: angularDelta(pose.heading, headingTowards(pose, goal)),
		distance: distanceToGoal(pose, goal),
	}
}

function arrivedOutput(pose: Pose, goal: Goal): NavOutput {
	return {
		input: { leftWheel: 0, rightWheel: 0 },
		status: 'arrived',
		headingError: angularDelta(pose.heading, headingTowards(pose, goal)),
		distance: distanceToGoal(pose, goal),
	}
}

/** True when the robot is within the arrival radius of the goal. */
export function hasArrived(pose: Pose, goal: Goal, config: NavConfig): boolean {
	return distanceToGoal(pose, goal) <= config.arrivalRadius
}

/**
 * Compute the wheel speeds that drive `pose` towards `goal` under `config`.
 *
 * The `null` goal (no goal queued) returns a zeroed `idle` output so the loop
 * can call the controller unconditionally and just apply whatever comes back.
 *
 * On arrival (within `config.arrivalRadius`) the output is zeroed with the
 * `arrived` status so the caller can pop the goal from the queue.
 */
export function controlToGoal(pose: Pose, goal: Goal | null, config: NavConfig): NavOutput {
	if (goal === null) return idleOutput(pose, pose)
	if (!Number.isFinite(config.maxSpeed) || config.maxSpeed <= 0) return idleOutput(pose, goal)
	const distance = distanceToGoal(pose, goal)
	if (distance <= config.arrivalRadius) return arrivedOutput(pose, goal)

	const targetHeading = headingTowards(pose, goal)
	const headingError = angularDelta(pose.heading, targetHeading)

	// Forward speed is proportional to distance, coupled to alignment: far
	// off-target and we turn in place before committing to forward motion.
	const aligned = Math.abs(headingError) <= config.alignTolerance

	// Brake linearly as we approach: full speed outside `brakeRadius`, tapering
	// to `minDriveSpeed` just outside the arrival radius so we don't skid past.
	const brakeWindow = config.brakeRadius - config.arrivalRadius
	const brakeFactor =
		brakeWindow <= 0 ? 1 : clamp01((distance - config.arrivalRadius) / brakeWindow)

	// Turning is genuinely in place. cos(error) used to become negative for
	// goals behind the robot, causing it to reverse into nearby obstacles.
	const v = aligned
		? Math.min(
				config.maxSpeed,
				Math.max(config.minDriveSpeed, config.distanceGain * distance * brakeFactor),
			)
		: 0
	// Turn bias from the heading error.
	const bias = config.headingGain * headingError

	// Scale both wheels together to preserve the requested curvature.
	const scale = Math.max(
		1,
		Math.abs(v - bias) / config.maxSpeed,
		Math.abs(v + bias) / config.maxSpeed,
	)
	const leftWheel = (v - bias) / scale
	const rightWheel = (v + bias) / scale

	const status: NavStatus = aligned ? 'driving' : 'rotating'
	return { input: { leftWheel, rightWheel }, status, headingError, distance }
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value))
}
