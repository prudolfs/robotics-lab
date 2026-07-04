// Lidar scan model: the immutable result of casting a single scan.
//
// A scan is a fixed-length array of `LidarSample`, one per ray in angular
// order from `-fieldOfView/2` to `+fieldOfView/2` relative to the sensor
// heading. Each sample records whether the ray hit something (`hit`) and the
// distance to the hit, capped at the configured `range` for misses.
//
// Design intent: the scan is just plain numbers so it can be sent to a ROS
// bridge, written into an occupancy grid and rendered — all without the
// sensor model knowing about any of those consumers.

import type { LidarConfig } from './index'
import { generateRays } from './index'
import type { Pose, World } from '@robotics-lab/core'
import { castRaysAgainst } from './raycast'

export type LidarSample = {
	/** Angle relative to the sensor heading, in radians. */
	angle: number
	/** Distance to the nearest hit, in metres. Misses are recorded as `range`. */
	distance: number
	/** Obstacle kind that was hit, or null if no hit within range. */
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

/**
 * Produce a lidar scan by generating rays for `config` at `origin` and casting
 * them against `world`. One sample per ray, in angular order.
 */
export function createScan(
	config: LidarConfig,
	origin: Pose,
	world: World,
): LidarScan {
	const rays = generateRays(config, origin)
	const hits = castRaysAgainst(world, rays, config.range)
	return {
		config,
		origin,
		samples: hits.map((hit, i) => ({
			angle: rays[i]?.angle ?? 0,
			distance: hit.touched ? Math.min(hit.distance, config.range) : config.range,
			hit: hit.touched ? hit.obstacleKind : null,
		})),
	}
}
