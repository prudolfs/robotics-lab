import type { World } from '@robotics-lab/core'
import type { Vec2 } from '@robotics-lab/geometry'
import type { RobotParams } from '@robotics-lab/robot'

// A disk enclosing the chassis and wheels at every heading. The debug heading
// arrow is not a physical part. Keep these dimensions aligned with RobotView.
export function robotFootprintRadius(params: RobotParams): number {
	return Math.hypot(0.203, Math.max(0.14, params.wheelBase / 2 + 0.018))
}

export const NAV_CLEARANCE = 0.04
const WALL_HALF_THICKNESS = 0.04

function pointSegmentDistance(point: Vec2, a: Vec2, b: Vec2): number {
	const dx = b.x - a.x
	const dy = b.y - a.y
	const length2 = dx * dx + dy * dy
	const t =
		length2 === 0
			? 0
			: Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2))
	return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy)
}

function cross(a: Vec2, b: Vec2, c: Vec2): number {
	return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function segmentDistance(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number {
	const abC = cross(a, b, c)
	const abD = cross(a, b, d)
	const cdA = cross(c, d, a)
	const cdB = cross(c, d, b)
	// Strict crossing; parallel, degenerate and collinear cases use distances.
	if (abC * abD < 0 && cdA * cdB < 0) return 0
	return Math.min(
		pointSegmentDistance(a, c, d),
		pointSegmentDistance(b, c, d),
		pointSegmentDistance(c, a, b),
		pointSegmentDistance(d, a, b),
	)
}

/** Swept disk against the authored wall thickness, rotated boxes and circles.
 * Checks the whole movement segment so even a fast step cannot tunnel through.
 */
export function motionIsClear(world: World, from: Vec2, to: Vec2, radius: number): boolean {
	if (![from.x, from.y, to.x, to.y, radius].every(Number.isFinite) || radius < 0) return false
	for (const point of [from, to]) {
		if (
			Math.abs(point.x) + radius >= world.width / 2 ||
			Math.abs(point.y) + radius >= world.depth / 2
		)
			return false
	}
	for (const wall of world.walls) {
		if (segmentDistance(from, to, wall.start, wall.end) <= radius + WALL_HALF_THICKNESS)
			return false
	}
	for (const cylinder of world.cylinders) {
		if (pointSegmentDistance(cylinder.center, from, to) <= radius + cylinder.radius) return false
	}
	for (const box of world.boxes) {
		const c = Math.cos(box.rotation)
		const s = Math.sin(box.rotation)
		const local = (p: Vec2): Vec2 => ({
			x: (p.x - box.center.x) * c + (p.y - box.center.y) * s,
			y: -(p.x - box.center.x) * s + (p.y - box.center.y) * c,
		})
		const a = local(from)
		const b = local(to)
		const hw = box.width / 2
		const hd = box.depth / 2
		if ([a, b].some((p) => Math.abs(p.x) <= hw && Math.abs(p.y) <= hd)) return false
		const corners = [
			{ x: -hw, y: -hd },
			{ x: hw, y: -hd },
			{ x: hw, y: hd },
			{ x: -hw, y: hd },
		]
		for (let i = 0; i < 4; i++) {
			if (segmentDistance(a, b, corners[i], corners[(i + 1) % 4]) <= radius) return false
		}
	}
	return true
}
