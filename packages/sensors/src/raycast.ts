// Deterministic raycasting against the world's obstacles.
//
// The world is composed of three obstacle kinds:
//   - walls     -> line segments
//   - cylinders -> circles
//   - boxes     -> rotated rectangles (OBBs)
//
// For each ray we compute the nearest positive-distance intersection across all
// obstacles. A `RayHit` records whether something was touched within `range`,
// the distance to it and the kind of obstacle encountered. Misses return
// `touched=false` with `distance === range`.
//
// All math is plain 2D and runs identically in the browser, in Node and in
// tests — no React or Three.js here.

import type { BoxObstacle, CircleObstacle, Pose, SegmentObstacle, World } from '@robotics-lab/core'
import type { Vec2 } from '@robotics-lab/geometry'
import type { LidarRay } from './index'

export type ObstacleKind = 'wall' | 'box' | 'cylinder'

export type RayHit = {
	/** Whether an intersection existed within the requested range. */
	touched: boolean
	/** Distance to the intersection, or `range` when nothing was hit. */
	distance: number
	/** Obstacle kind that produced the hit; `null` when untouched. */
	obstacleKind: ObstacleKind | null
	/** Intersection point for visualization; capped to `range` on a miss. */
	point: Vec2
}

/**
 * Cast an array of rays against the world, returning one `RayHit` per ray.
 * The shortest positive intersection wins; misses cap at `range`.
 */
export function castRaysAgainst(world: World, rays: LidarRay[], range: number): RayHit[] {
	return rays.map((ray) => castRayAgainstWorld(world, ray, range))
}

/** Cast a single ray (an `origin` pose + an angle relative to its heading). */
export function castRayAgainstWorld(world: World, ray: LidarRay, range: number): RayHit {
	const dx = Math.cos(ray.origin.heading + ray.angle)
	const dy = Math.sin(ray.origin.heading + ray.angle)
	const origin = ray.origin
	// `best` starts at the configured range so misses flatten to that distance.
	let best = range
	let bestKind: ObstacleKind | null = null
	for (const wall of world.walls) {
		const t = intersectRaySegment(origin, dx, dy, wall)
		if (t !== null && t < best) {
			best = t
			bestKind = 'wall'
		}
	}
	for (const box of world.boxes) {
		const t = intersectRayBox(origin, dx, dy, box)
		if (t !== null && t < best) {
			best = t
			bestKind = 'box'
		}
	}
	for (const cyl of world.cylinders) {
		const t = intersectRayCircle(origin, dx, dy, cyl)
		if (t !== null && t < best) {
			best = t
			bestKind = 'cylinder'
		}
	}
	return {
		touched: bestKind !== null,
		distance: best,
		obstacleKind: bestKind,
		point: { x: origin.x + dx * best, y: origin.y + dy * best },
	}
}

/** Ray (origin + unit dir) vs line segment. Returns nearest positive `t`. */
function intersectRaySegment(
	origin: Pose,
	dx: number,
	dy: number,
	s: SegmentObstacle,
): number | null {
	const sx = s.end.x - s.start.x
	const sy = s.end.y - s.start.y
	// Solve origin + dir*t = start + seg*u  for t,u. The 2x2 system
	//   [dx, -sx] [t]   [start.x - origin.x]
	//   [dy, -sy] [u] = [start.y - origin.y]
	// has determinant det = -(dx*sy - dy*sx); Cramer's rule gives t and u.
	const denom = dx * sy - dy * sx
	if (Math.abs(denom) < 1e-12) return null // parallel / collinear
	const t = ((s.start.x - origin.x) * sy - (s.start.y - origin.y) * sx) / denom
	const u = ((s.start.x - origin.x) * dy - (s.start.y - origin.y) * dx) / denom
	if (t < 1e-9 || u < 0 || u > 1) return null // behind or off-segment
	return t
}

/** Ray vs circle. Returns nearest positive `t` (smaller root of the quadratic). */
function intersectRayCircle(
	origin: Pose,
	dx: number,
	dy: number,
	c: CircleObstacle,
): number | null {
	const fx = origin.x - c.center.x
	const fy = origin.y - c.center.y
	const b = 2 * (fx * dx + fy * dy)
	const cc = fx * fx + fy * fy - c.radius * c.radius
	const disc = b * b - 4 * cc // a = 1 (dir is unit length)
	if (disc < 0) return null // miss
	const sq = Math.sqrt(disc)
	const t1 = (-b - sq) / 2
	const t2 = (-b + sq) / 2
	// Prefer the nearest positive root; ignore roots behind the origin.
	if (t1 > 1e-9) return t1
	if (t2 > 1e-9) return t2
	return null
}

/** Ray vs rotated rectangle (OBB). Into box-local space, axis-align, clamp. */
function intersectRayBox(origin: Pose, dx: number, dy: number, b: BoxObstacle): number | null {
	const cos = Math.cos(-b.rotation)
	const sin = Math.sin(-b.rotation)
	const rx = origin.x - b.center.x
	const ry = origin.y - b.center.y
	const ox = rx * cos - ry * sin // origin in box-local frame
	const oy = rx * sin + ry * cos
	const dirX = dx * cos - dy * sin // direction in box-local frame
	const dirY = dx * sin + dy * cos
	const hx = b.width / 2
	const hy = b.depth / 2
	// Slab method against the axis-aligned local rectangle.
	let tmin = Number.NEGATIVE_INFINITY
	let tmax = Number.POSITIVE_INFINITY
	for (const [od, dd, h] of [
		[ox, dirX, hx],
		[oy, dirY, hy],
	] as const) {
		if (Math.abs(dd) < 1e-12) {
			if (od < -h || od > h) return null // parallel and outside the slab
			continue
		}
		const lo = (-h - od) / dd
		const hi = (h - od) / dd
		const a = Math.min(lo, hi)
		const z = Math.max(lo, hi)
		tmin = Math.max(tmin, a)
		tmax = Math.min(tmax, z)
		if (tmin > tmax) return null
	}
	const t = tmin > 1e-9 ? tmin : tmax > 1e-9 ? tmax : null
	return t
}
