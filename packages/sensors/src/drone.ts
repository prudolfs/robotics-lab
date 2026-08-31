import type { World } from '@robotics-lab/core'
import { createLidarConfig, type LidarConfig } from './index'
import { createScan, type LidarScan, type Rng } from './scan'

export type SensorVector3 = {
	x: number
	y: number
	z: number
}

export type DroneSensorInput = {
	position: SensorVector3
	velocity: SensorVector3
	previousVelocity: SensorVector3
	angularVelocity: SensorVector3
	heading: number
	deltaSeconds: number
}

export type GpsOrigin = {
	latitude: number
	longitude: number
	altitude: number
}

export type DroneSensorConfig = {
	lidar: LidarConfig
	gpsNoise: number
	gpsOrigin: GpsOrigin
}

export type DroneSensorReadings = {
	lidar: LidarScan
	altimeter: {
		groundHeight: number
		altitudeAgl: number
	}
	gps: {
		latitude: number
		longitude: number
		altitude: number
		waypointDistance: number | null
	}
	imu: {
		acceleration: SensorVector3
		angularVelocity: SensorVector3
		heading: number
	}
}

export const DEFAULT_GPS_ORIGIN: GpsOrigin = {
	latitude: 56.9496,
	longitude: 24.1052,
	altitude: 7,
}

export function createDroneSensorConfig(
	overrides: Partial<Omit<DroneSensorConfig, 'lidar' | 'gpsOrigin'>> & {
		lidar?: Partial<LidarConfig>
		gpsOrigin?: Partial<GpsOrigin>
	} = {},
): DroneSensorConfig {
	return {
		lidar: createLidarConfig({ rayCount: 90, range: 10, ...overrides.lidar }),
		gpsNoise: Math.max(0, overrides.gpsNoise ?? 0),
		gpsOrigin: { ...DEFAULT_GPS_ORIGIN, ...overrides.gpsOrigin },
	}
}

/** The current planner worlds use a flat ground plane at zero metres. */
export function sampleGroundHeight(_world: World, _position: SensorVector3): number {
	return 0
}

function gaussian(rng: Rng): number {
	let u = 0
	let v = 0
	while (u === 0) u = rng()
	while (v === 0) v = rng()
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v)
}

export function sampleDroneSensors(
	input: DroneSensorInput,
	world: World,
	config: DroneSensorConfig,
	waypoint: SensorVector3 | null = null,
	rng: Rng = Math.random,
): DroneSensorReadings {
	const groundHeight = sampleGroundHeight(world, input.position)
	const lidar = createScan(
		config.lidar,
		{ x: input.position.x, y: input.position.z, heading: input.heading },
		world,
		rng,
	)
	const noiseEast = gaussian(rng) * config.gpsNoise
	const noiseNorth = gaussian(rng) * config.gpsNoise
	const noiseAltitude = gaussian(rng) * config.gpsNoise
	const north = input.position.z + noiseNorth
	const east = input.position.x + noiseEast
	const metresPerDegree = 111_320
	const longitudeScale = metresPerDegree * Math.cos((config.gpsOrigin.latitude * Math.PI) / 180)
	const safeDelta = input.deltaSeconds > 0 ? input.deltaSeconds : 1

	return {
		lidar,
		altimeter: {
			groundHeight,
			altitudeAgl: Math.max(0, input.position.y - groundHeight),
		},
		gps: {
			latitude: config.gpsOrigin.latitude + north / metresPerDegree,
			longitude: config.gpsOrigin.longitude + east / longitudeScale,
			altitude: config.gpsOrigin.altitude + input.position.y + noiseAltitude,
			waypointDistance: waypoint
				? Math.hypot(
						waypoint.x - input.position.x,
						waypoint.y - input.position.y,
						waypoint.z - input.position.z,
					)
				: null,
		},
		imu: {
			acceleration: {
				x: (input.velocity.x - input.previousVelocity.x) / safeDelta,
				y: (input.velocity.y - input.previousVelocity.y) / safeDelta,
				z: (input.velocity.z - input.previousVelocity.z) / safeDelta,
			},
			angularVelocity: { ...input.angularVelocity },
			heading: input.heading,
		},
	}
}
