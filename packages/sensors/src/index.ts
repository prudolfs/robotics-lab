// Sensor models simulated deterministically. No browser/React dependencies.

import type { Pose } from '@robotics-lab/core'
import { TAU } from '@robotics-lab/core'

export type LidarConfig = {
	/** Full angular span covered by the scan, in radians. */
	fieldOfView: number
	/** Number of rays emitted per scan. */
	rayCount: number
	/** Maximum measurable distance, in metres. */
	range: number
	/** Noise added to the returned distance, in metres. */
	noise: number
	/** Probability (0–1) that any single ray returns a miss (random dropout). */
	dropoutRate: number
}

export type LidarRay = {
	/** Angle relative to the sensor heading, in radians. */
	angle: number
	origin: Pose
}

export function createLidarConfig(override: Partial<LidarConfig> = {}): LidarConfig {
	return {
		fieldOfView: TAU,
		rayCount: 360,
		range: 10,
		noise: 0,
		dropoutRate: 0,
		...override,
	}
}

/** Generate evenly spaced rays covering the field of view, centred forward. */
export function generateRays(config: LidarConfig, origin: Pose): LidarRay[] {
	const rays: LidarRay[] = []
	const half = config.fieldOfView / 2
	const step = config.fieldOfView / config.rayCount
	for (let i = 0; i < config.rayCount; i++) {
		const angle = -half + step * i
		rays.push({ angle, origin })
	}
	return rays
}

export type { ObstacleKind, RayHit } from './raycast'
export { castRayAgainstWorld, castRaysAgainst } from './raycast'
export type { LidarSample, LidarScan, Rng } from './scan'
export { createScan } from './scan'
