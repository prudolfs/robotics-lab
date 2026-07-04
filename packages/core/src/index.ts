// Core shared types for the robotics platform.
// These are the building blocks every other package depends on.

/**
 * Pose of a rigid body in 2D world space.
 * `heading` is in radians, measured counter-clockwise from the +x axis.
 */
export type Pose = {
	x: number
	y: number
	heading: number
}

/**
 * Linear + angular velocity in 2D.
 * `omega` is the turn rate in radians per second.
 */
export type Velocity = {
	vx: number
	vy: number
	omega: number
}

/**
 * Two-dimensional bounding box, axis aligned.
 */
export type Bounds2 = {
	minX: number
	minY: number
	maxX: number
	maxY: number
}

/**
 * Generic identifier for simulation entities.
 */
export type EntityId = string

export const TAU = Math.PI * 2

/** Normalize an angle (radians) into the range [-PI, PI). */
export function normalizeAngle(angle: number): number {
	let a = angle % TAU
	if (a < -Math.PI) a += TAU
	if (a >= Math.PI) a -= TAU
	return a
}

/** Shortest signed angular distance from `from` to `to`, in radians. */
export function angularDelta(from: number, to: number): number {
	return normalizeAngle(to - from)
}

export * from './world'
