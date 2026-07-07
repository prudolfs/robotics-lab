// Lidar scan model: the immutable result of casting a single scan.
//
// A scan is a fixed-length array of `LidarSample`, one per ray in angular
// order from `-fieldOfView/2` to `+fieldOfView/2` relative to the sensor
// heading. Each sample records the ray angle, the (possibly noisy) distance to
// the nearest hit and the obstacle kind hit, or `null` for a miss.
//
// Design intent: the scan is just plain numbers so it can be sent to a ROS
// bridge, written into an occupancy grid and rendered — all without the
// sensor model knowing about any of those consumers. Noise (when configured)
// is applied via an injected `Rng` so scans stay deterministic and testable.

import type { Pose, World } from '@robotics-lab/core'
import { shouldDrop } from '@robotics-lab/noise'
import type { LidarConfig, LidarRay } from './index'
import { generateRays } from './index'
import { castRaysAgainst, type RayHit } from './raycast'

export type LidarSample = {
	/** Angle relative to the sensor heading, in radians. */
	angle: number
	/** Distance to the nearest hit, in metres. Misses are recorded as `range`. */
	distance: number
	/** Obstacle kind that was hit, or `null` if no hit within range. */
	hit: 'wall' | 'box' | 'cylinder' | null
}

export type LidarScan = {
	/** The configuration used to produce this scan, for reference. */
	config: LidarConfig
	/** World pose the sensor occupied when the scan was taken. */
	origin: Pose
	/** One sample per emitted ray, in angular order. */
	samples: LidarSample[]
}

/** Deterministic random source: a function returning a uniform value in [0,1). */
export type Rng = () => number

/** Box–Muller transform: one standard-normal sample from two uniforms. */
function gaussian(rng: Rng): number {
	let u = 0
	let v = 0
	while (u === 0) u = rng()
	while (v === 0) v = rng()
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v)
}

const TAU = Math.PI * 2

/**
 * Produce a lidar scan by generating rays for `config` at `origin` and casting
 * them against `world`. One sample per ray, in angular order. When `config.noise`
 * is positive the `rng` (defaulting to `Math.random`) perturbs each distance.
 */
export function createScan(
	config: LidarConfig,
	origin: Pose,
	world: World,
	rng: Rng = Math.random,
): LidarScan {
	const rays: LidarRay[] = generateRays(config, origin)
	const hits: RayHit[] = castRaysAgainst(world, rays, config.range)
	const samples: LidarSample[] = new Array(hits.length)
	for (let i = 0; i < hits.length; i++) {
		const hit = hits[i]
		const ray = rays[i]

		// Distance noise (passive per-ray perturbation).
		let distance = hit.touched
			? Math.min(applyNoise(hit.distance, config.noise, rng), config.range)
			: config.range

		// Random dropouts: ray is discarded and reported as a miss.
		let hitKind: 'wall' | 'box' | 'cylinder' | null = hit.touched ? hit.obstacleKind : null
		if (config.dropoutRate > 0 && shouldDrop(config.dropoutRate, rng)) {
			distance = config.range
			hitKind = null
		}

		samples[i] = {
			angle: ray?.angle ?? 0,
			distance,
			hit: hitKind,
		}
	}
	return { config, origin, samples }
}

/** Apply zero-mean Gaussian distance noise; no-op when `sigma` is 0. */
function applyNoise(distance: number, sigma: number, rng: Rng): number {
	if (!sigma) return distance
	return distance + gaussian(rng) * sigma
}
