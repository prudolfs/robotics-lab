/** Clamp a scalar to an inclusive range. */
export function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(Math.max(value, minimum), maximum)
}

/** Linearly interpolate between two scalar values. */
export function lerp(start: number, end: number, amount: number): number {
	return start + (end - start) * amount
}

export function degreesToRadians(degrees: number): number {
	return (degrees * Math.PI) / 180
}

export function radiansToDegrees(radians: number): number {
	return (radians * 180) / Math.PI
}
