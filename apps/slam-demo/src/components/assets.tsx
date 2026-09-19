import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { type Group, type Mesh, PMREMGenerator, type Texture } from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import manifest from '../../../../assets/slam-demo/manifest.json'
import type { SimulationController } from '../sim/controller'
import { usePresentation } from '../store'

function prepare(group: Group) {
	const copy = group.clone(true)
	copy.traverse((object) => {
		const mesh = object as Mesh
		if (mesh.isMesh) {
			mesh.castShadow = true
			mesh.receiveShadow = true
		}
	})
	return copy
}
export function AuthoredAssets({
	controller,
	onReady,
}: {
	controller: SimulationController
	onReady: () => void
}) {
	const models = useGLTF(
		[manifest.assets.lab, manifest.assets.cutaway, manifest.assets.rover],
		'/assets/slam/draco/',
	)
	const [lab, cutaway, rover] = useMemo(() => models.map((model) => prepare(model.scene)), [models])
	const root = useRef<Group>(null)
	const cameraMode = usePresentation((s) => s.camera),
		quality = usePresentation((s) => s.quality)
	const pivots = useMemo(
		() => ({
			left: rover.getObjectByName('Wheel_Left'),
			right: rover.getObjectByName('Wheel_Right'),
		}),
		[rover],
	)
	useEffect(() => {
		if (
			!pivots.left ||
			!pivots.right ||
			!rover.getObjectByName('Camera_Left') ||
			!rover.getObjectByName('Camera_Right')
		)
			throw Error('Rover export is missing named pivots or calibration mounts')
		onReady()
	}, [onReady, pivots, rover])
	useEffect(() => {
		for (const group of [lab, cutaway, rover])
			group.traverse((object) => {
				if ((object as Mesh).isMesh) (object as Mesh).castShadow = quality === 'standard'
			})
	}, [lab, cutaway, rover, quality])
	useFrame(() => {
		const s = controller.read()
		if (root.current) {
			root.current.position.set(s.truth.pose.x, 0, -s.truth.pose.y)
			root.current.rotation.y = s.truth.pose.heading
		}
		// Authored pivots are empty nodes in the glTF world basis. +Y axle becomes -Z.
		if (pivots.left) pivots.left.rotation.z = -s.wheelAngles.left
		if (pivots.right) pivots.right.rotation.z = -s.wheelAngles.right
	})
	return (
		<>
			<primitive object={lab} />
			<primitive object={cutaway} visible={cameraMode === 'robot'} />
			<group ref={root}>
				<primitive object={rover} />
			</group>
		</>
	)
}
export function StudioEnvironment() {
	const { gl, scene } = useThree()
	useEffect(() => {
		const generator = new PMREMGenerator(gl),
			room = new RoomEnvironment()
		const target = generator.fromScene(room, 0.04)
		const old = scene.environment as Texture | null
		scene.environment = target.texture
		scene.environmentIntensity = 0.4
		room.dispose()
		generator.dispose()
		return () => {
			scene.environment = old
			target.dispose()
		}
	}, [gl, scene])
	return null
}
