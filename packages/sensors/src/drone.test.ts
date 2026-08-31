import { createWorld, TAU } from '@robotics-lab/core'
import { createDroneSensorConfig, sampleDroneSensors, sampleGroundHeight } from './drone'

const world = createWorld({
	name: 'drone-sensors',
	width: 10,
	depth: 10,
	walls: [
		{ start: { x: 2, y: -2 }, end: { x: 2, y: 2 } },
		{ start: { x: -5, y: -5 }, end: { x: 5, y: -5 } },
		{ start: { x: 5, y: -5 }, end: { x: 5, y: 5 } },
		{ start: { x: 5, y: 5 }, end: { x: -5, y: 5 } },
		{ start: { x: -5, y: 5 }, end: { x: -5, y: -5 } },
	],
	boxes: [],
	cylinders: [],
})

const input = {
	position: { x: 0, y: 3, z: 0 },
	velocity: { x: 2, y: 1, z: -1 },
	previousVelocity: { x: 1, y: 1, z: 0 },
	angularVelocity: { x: 0.1, y: 0.2, z: 0.3 },
	heading: Math.PI / 4,
	deltaSeconds: 0.5,
}

describe('drone sensors', () => {
	it('performs a configurable 360 degree lidar scan with distance hits', () => {
		const config = createDroneSensorConfig({
			lidar: { fieldOfView: TAU, rayCount: 36, range: 4 },
		})
		const readings = sampleDroneSensors(input, world, config, null, () => 0.5)

		expect(readings.lidar.samples).toHaveLength(36)
		expect(readings.lidar.config.fieldOfView).toBe(TAU)
		expect(readings.lidar.config.range).toBe(4)
		expect(readings.lidar.samples.some((sample) => sample.hit !== null)).toBe(true)
		expect(readings.lidar.samples.every((sample) => sample.distance <= 4)).toBe(true)
	})

	it('samples flat ground height and reports altitude above ground', () => {
		expect(sampleGroundHeight(world, input.position)).toBe(0)
		expect(sampleDroneSensors(input, world, createDroneSensorConfig()).altimeter).toEqual({
			groundHeight: 0,
			altitudeAgl: 3,
		})
	})

	it('converts local position to global GPS and measures waypoint distance', () => {
		const config = createDroneSensorConfig({ gpsNoise: 0 })
		const readings = sampleDroneSensors(input, world, config, { x: 3, y: 3, z: 4 }, () => 0.5)

		expect(readings.gps.latitude).toBeCloseTo(config.gpsOrigin.latitude)
		expect(readings.gps.longitude).toBeCloseTo(config.gpsOrigin.longitude)
		expect(readings.gps.altitude).toBe(config.gpsOrigin.altitude + 3)
		expect(readings.gps.waypointDistance).toBe(5)
	})

	it('applies configurable GPS noise through an injected random source', () => {
		const clean = sampleDroneSensors(input, world, createDroneSensorConfig(), null, () => 0.5)
		const noisy = sampleDroneSensors(
			input,
			world,
			createDroneSensorConfig({ gpsNoise: 2 }),
			null,
			() => 0.2,
		)

		expect(noisy.gps.latitude).not.toBe(clean.gps.latitude)
		expect(noisy.gps.longitude).not.toBe(clean.gps.longitude)
	})

	it('reports IMU acceleration, angular velocity, and heading', () => {
		const imu = sampleDroneSensors(input, world, createDroneSensorConfig()).imu

		expect(imu.acceleration).toEqual({ x: 2, y: 0, z: -2 })
		expect(imu.angularVelocity).toEqual(input.angularVelocity)
		expect(imu.heading).toBe(input.heading)
	})
})
