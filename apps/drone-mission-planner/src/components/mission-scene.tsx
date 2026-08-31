import type { DroneState } from '@robotics-lab/drone'
import { CoordinateAxes, LidarView, Lights, WorldView } from '@robotics-lab/rendering'
import type { DroneSensorReadings } from '@robotics-lab/sensors'
import type { CameraMode } from '@/camera'
import { DroneView } from '@/components/drone-view'
import { FlightCamera } from '@/components/flight-camera'
import { MissionEditorLayer } from '@/components/mission-editor-layer'
import { PREVIEW_DRONE_PARAMS } from '@/drone-preview'
import { usePlannerStore } from '@/store'

function WebGPUGrid({ size }: { size: number }) {
	const minorDivisions = Math.round(size * 2)
	const majorDivisions = Math.max(1, Math.round(size / 2))

	return (
		<group position={[0, -0.015, 0]}>
			<gridHelper args={[size, minorDivisions, '#68786f', '#87938b']} />
			<gridHelper args={[size, majorDivisions, '#46564e', '#68786f']} position={[0, 0.004, 0]} />
		</group>
	)
}

export function MissionScene({
	droneState,
	cameraMode,
	cameraFov,
	sensorReadings,
	showLidarRays,
	showLidarHits,
}: {
	droneState: DroneState
	cameraMode: CameraMode
	cameraFov: number
	sensorReadings: DroneSensorReadings
	showLidarRays: boolean
	showLidarHits: boolean
}) {
	const world = usePlannerStore((state) => state.world)
	const worldScale = usePlannerStore((state) => state.worldScale)
	const gridSize = Math.max(world.width, world.depth) * 6

	return (
		<>
			<FlightCamera drone={droneState} mode={cameraMode} fov={cameraFov} worldScale={worldScale} />
			<Lights />
			<group scale={worldScale}>
				<WebGPUGrid size={gridSize} />
				<WorldView world={world} />
				<CoordinateAxes />
				<MissionEditorLayer worldScale={worldScale} />
				<LidarView
					scan={sensorReadings.lidar}
					elevation={droneState.position.y}
					showRays={showLidarRays}
					showHits={showLidarHits}
				/>
				<DroneView state={droneState} params={PREVIEW_DRONE_PARAMS} />
			</group>
			<fog attach="fog" args={['#b9c1b6', 20, 68]} />
		</>
	)
}
