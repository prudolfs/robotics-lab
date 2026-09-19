import { useThree } from '@react-three/fiber'
import type { Vec3 } from '@robotics-lab/sensors'
import { useEffect } from 'react'
import type { Object3D } from 'three'
import manifest from '../../../../assets/slam-demo/manifest.json'
import { createCapture } from './capture'
import type { Acquisition } from './runtime'
export function SensorBridge({
	models,
	acquisition,
}: {
	models: Object3D[]
	acquisition: Acquisition
}) {
	const { gl, scene } = useThree()
	useEffect(() => {
		const detach = acquisition.attach(
			createCapture(
				gl,
				models,
				manifest.calibration,
				[manifest.mounts.Camera_Left, manifest.mounts.Camera_Right] as [Vec3, Vec3],
				scene.environment,
			),
		)
		const lost = () =>
			acquisition.fail('Graphics context lost. Wait for recovery, then retry the sensor.')
		gl.domElement.addEventListener('webglcontextlost', lost)
		return () => {
			gl.domElement.removeEventListener('webglcontextlost', lost)
			detach()
		}
	}, [acquisition, gl, models, scene])
	return null
}
