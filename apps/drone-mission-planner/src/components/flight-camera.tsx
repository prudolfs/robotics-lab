import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import type { DroneState } from '@robotics-lab/drone'
import { useRef } from 'react'
import { Quaternion, type PerspectiveCamera as ThreePerspectiveCamera, Vector3 } from 'three'
import type { CameraMode } from '@/camera'
import { usePlannerStore } from '@/store'

const dronePosition = new Vector3()
const droneOrientation = new Quaternion()
const desiredPosition = new Vector3()
const desiredTarget = new Vector3()
const localOffset = new Vector3()
const localLook = new Vector3()

export function FlightCamera({
	drone,
	mode,
	fov,
	worldScale,
}: {
	drone: DroneState
	mode: CameraMode
	fov: number
	worldScale: number
}) {
	const cameraRef = useRef<ThreePerspectiveCamera>(null)
	const smoothTarget = useRef(new Vector3())
	const cinematicAngle = useRef(0)
	const missionEditMode = usePlannerStore((state) => state.missionEditMode)

	useFrame((_, delta) => {
		const camera = cameraRef.current
		if (!camera || mode === 'orbit') return

		dronePosition.set(
			drone.position.x * worldScale,
			drone.position.y * worldScale,
			drone.position.z * worldScale,
		)
		droneOrientation.set(
			drone.orientation.x,
			drone.orientation.y,
			drone.orientation.z,
			drone.orientation.w,
		)

		if (mode === 'follow') {
			localOffset.set(-3.6, 2.2, 3.4).applyQuaternion(droneOrientation)
			desiredPosition.copy(dronePosition).add(localOffset)
			desiredTarget
				.copy(dronePosition)
				.add(localLook.set(0.7, 0.2, 0).applyQuaternion(droneOrientation))
		} else if (mode === 'chase') {
			localOffset.set(-4.2, 1.45, 0).applyQuaternion(droneOrientation)
			desiredPosition.copy(dronePosition).add(localOffset)
			desiredTarget
				.copy(dronePosition)
				.add(localLook.set(2.2, 0.1, 0).applyQuaternion(droneOrientation))
		} else if (mode === 'fpv') {
			localOffset.set(0.18 * worldScale, 0.09 * worldScale, 0).applyQuaternion(droneOrientation)
			desiredPosition.copy(dronePosition).add(localOffset)
			desiredTarget
				.copy(dronePosition)
				.add(localLook.set(8, 0, 0).applyQuaternion(droneOrientation))
		} else {
			cinematicAngle.current = (cinematicAngle.current + delta * 0.22) % (Math.PI * 2)
			desiredPosition.set(
				dronePosition.x + Math.cos(cinematicAngle.current) * 6,
				dronePosition.y + 2.8 + Math.sin(cinematicAngle.current * 0.6) * 0.7,
				dronePosition.z + Math.sin(cinematicAngle.current) * 6,
			)
			desiredTarget.copy(dronePosition).add(localLook.set(0, 0.18, 0))
		}

		const positionDamping = mode === 'fpv' ? 18 : mode === 'cinematic' ? 2.2 : 5.5
		const lookDamping = mode === 'fpv' ? 20 : 7
		camera.position.lerp(desiredPosition, 1 - Math.exp(-positionDamping * delta))
		smoothTarget.current.lerp(desiredTarget, 1 - Math.exp(-lookDamping * delta))
		camera.lookAt(smoothTarget.current)
	})

	return (
		<>
			<PerspectiveCamera
				makeDefault
				ref={cameraRef}
				position={[9, 7, 10]}
				fov={fov}
				near={0.03}
				far={500}
			/>
			<OrbitControls
				makeDefault
				enabled={mode === 'orbit' && missionEditMode !== 'add-waypoint'}
				enableDamping
				dampingFactor={0.08}
				maxPolarAngle={Math.PI / 2.05}
			/>
		</>
	)
}
