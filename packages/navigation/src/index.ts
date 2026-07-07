// Planning and control for navigation.

import type { Pose } from '@robotics-lab/core'
import { angularDelta } from '@robotics-lab/core'

export * from './controller'
export * from './coverage'
export * from './goals'
export * from './pathfinding'
export * from './planner'
export * from './smoothing'

export type Goal = {
	x: number
	y: number
}

/** Proportional heading controller: turn rate towards a target heading. */
export function headingController(pose: Pose, targetHeading: number, gain = 1): number {
	return gain * angularDelta(pose.heading, targetHeading)
}

/** Compute the heading needed to point from `from` towards `goal`. */
export function headingTowards(from: Pose, goal: Goal): number {
	return Math.atan2(goal.y - from.y, goal.x - from.x)
}

/** Euclidean distance from a pose to a goal (ignoring heading). */
export function distanceToGoal(pose: Pose, goal: Goal): number {
	return Math.hypot(goal.x - pose.x, goal.y - pose.y)
}
