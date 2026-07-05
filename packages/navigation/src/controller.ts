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
// The controller stacks two proportional laws onto the same drive envelope:
//
//   1. a *heading* controller that turns the robot to face the goal;
//   2. a *distance* controller that throttles the forward speed down to zero
//      when the robot is misaligned, and ramps it back up as it lines up; and
//   3. a *braking* term that scales the linear speed by the fraction of the
//      goal distance remaining, so the robot coasts to a stop rather than
//      overshooting and oscillating.
//
// `v` is the forward speed and `bias` the turn bias; the per-wheel speeds are
// `left = v - bias`, `right = v + bias` (the same algebra as the teleop
// mapping in `@/sim/teleop`), but the bias here is the closed-loop heading
// error instead of a key press. Each wheel is clamped to the speed envelope
// independently so neither wheel can exceed `maxSpeed` — turn priority over
// forward motion emerges from the `cos(headingError)` alignment factor that
// throttles `v` towards zero when the robot is pointing the wrong way.

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
	 *  and allowed to drive forward full-tilt. Misalign bigger than this and the
	 *  forward speed is throttled down by `cos(error)`. */
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
export type NavStatus = 'idle' | 'rotating' | 'driving' | 'arrived'

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
	const distance = distanceToGoal(pose, goal)
	if (distance <= config.arrivalRadius) return arrivedOutput(pose, goal)

	const targetHeading = headingTowards(pose, goal)
	const headingError = angularDelta(pose.heading, targetHeading)

	// Forward speed is proportional to distance, coupled to alignment: far
	// off-target and we turn in place before committing to forward motion.
	const aligned = Math.abs(headingError) <= config.alignTolerance
	const alignmentFactor = aligned ? 1 : Math.cos(headingError)

	// Brake linearly as we approach: full speed outside `brakeRadius`, tapering
	// to `minDriveSpeed` just outside the arrival radius so we don't skid past.
	const brakeWindow = config.brakeRadius - config.arrivalRadius
	const brakeFactor =
		brakeWindow <= 0 ? 1 : clamp01((distance - config.arrivalRadius) / brakeWindow)

	const v =
		config.distanceGain *
		distance *
		alignmentFactor *
		(config.minDriveSpeed + (1 - config.minDriveSpeed) * brakeFactor)
	// Turn bias from the heading error.
	const bias = config.headingGain * headingError

	// Per-wheel speeds; each clamped to the envelope independently so neither
	// wheel can exceed `maxSpeed`. When misaligned, `v` is already ~0 from the
	// alignment factor, so the bias dominates and the robot spins in place.
	const leftWheel = clamp(v - bias, -config.maxSpeed, config.maxSpeed)
	const rightWheel = clamp(v + bias, -config.maxSpeed, config.maxSpeed)

	const status: NavStatus = aligned ? 'driving' : 'rotating'
	return { input: { leftWheel, rightWheel }, status, headingError, distance }
}

function clamp(value: number, lo: number, hi: number): number {
	return value < lo ? lo : value > hi ? hi : value
}

function clamp01(value: number): number {
	return clamp(value, 0, 1)
}
