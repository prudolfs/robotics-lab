// Geometry primitives used across the platform.
// Vectors are plain { x, y } objects so they can be composed cheaply.

export type Vec2 = {
	x: number
	y: number
}

export function add(a: Vec2, b: Vec2): Vec2 {
	return { x: a.x + b.x, y: a.y + b.y }
}

export function sub(a: Vec2, b: Vec2): Vec2 {
	return { x: a.x - b.x, y: a.y - b.y }
}

export function scale(v: Vec2, s: number): Vec2 {
	return { x: v.x * s, y: v.y * s }
}

export function length(v: Vec2): number {
	return Math.hypot(v.x, v.y)
}

export function distance(a: Vec2, b: Vec2): number {
	return Math.hypot(b.x - a.x, b.y - a.y)
}

/** Angle of a vector in radians, measured from +x. */
export function angle(v: Vec2): number {
	return Math.atan2(v.y, v.x)
}

export function fromAngle(radians: number, length = 1): Vec2 {
	return { x: Math.cos(radians) * length, y: Math.sin(radians) * length }
}

/** Rotate a vector about the origin by `radians`. */
export function rotate(v: Vec2, radians: number): Vec2 {
	const c = Math.cos(radians)
	const s = Math.sin(radians)
	return { x: v.x * c - v.y * s, y: v.x * s + v.y * c }
}
