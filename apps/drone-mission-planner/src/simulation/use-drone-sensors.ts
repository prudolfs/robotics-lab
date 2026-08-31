import type { World } from '@robotics-lab/core'
import { type DroneSimulation, quaternionYaw } from '@robotics-lab/drone'
import {
	type DroneSensorConfig,
	type DroneSensorReadings,
	type SensorVector3,
	sampleDroneSensors,
} from '@robotics-lab/sensors'
import { useMemo, useRef } from 'react'

const SENSOR_RATE_HZ = 10

export function useDroneSensors(
	simulation: DroneSimulation,
	world: World,
	config: DroneSensorConfig,
	waypoint: SensorVector3 | null,
): DroneSensorReadings {
	const droneRef = useRef(simulation.drone)
	droneRef.current = simulation.drone
	const previousVelocity = useRef({ ...simulation.drone.velocity })
	const previousSampleTime = useRef(simulation.clock.elapsedSeconds)
	const sampleIndex = Math.floor(simulation.clock.elapsedSeconds * SENSOR_RATE_HZ)

	return useMemo(() => {
		const drone = droneRef.current
		const sampleTime = sampleIndex / SENSOR_RATE_HZ
		const deltaSeconds = Math.max(1 / SENSOR_RATE_HZ, sampleTime - previousSampleTime.current)
		const readings = sampleDroneSensors(
			{
				position: drone.position,
				velocity: drone.velocity,
				previousVelocity: previousVelocity.current,
				angularVelocity: drone.angularVelocity,
				heading: quaternionYaw(drone.orientation),
				deltaSeconds,
			},
			world,
			config,
			waypoint,
		)
		previousVelocity.current = { ...drone.velocity }
		previousSampleTime.current = sampleTime
		return readings
	}, [config, sampleIndex, waypoint, world])
}
