import { useGLTF } from '@react-three/drei/webgpu'
import { type RefObject, useEffect, useMemo } from 'react'
import { type Group, Mesh, type MeshStandardMaterial, type Object3D } from 'three/webgpu'
import type { Scene } from '../api/client'

const directory = '/assets/greenhouse/'
const files = ['environment', 'caretaker', 'capsule', 'plant-a', 'plant-b', 'plant-c']

export type CaretakerRig = {
	root: Group
	capsule: Group
	leftWheel: Object3D
	rightWheel: Object3D
	lift: Object3D
	leftJaw: Object3D
	rightJaw: Object3D
	headPan: Object3D
	headPitch: Object3D
	eye: Object3D
	lids: Object3D[]
	lamp: MeshStandardMaterial
}

export function AuthoredAssets({
	scene,
	rigRef,
	onReady,
}: {
	scene: Scene
	rigRef: RefObject<CaretakerRig | null>
	onReady: () => void
}) {
	const loaded = useGLTF(files.map((file) => `${directory}${file}.glb`))
	const assets = useMemo(() => {
		const copies = loaded.map((asset) => asset.scene.clone(true))
		for (const copy of copies)
			copy.traverse((node) => {
				if (!(node instanceof Mesh)) return
				node.castShadow = true
				node.receiveShadow = true
				for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
					if (material.transparent) {
						material.depthWrite = false
						node.castShadow = false
					}
				}
			})
		const root = copies[1]
		const node = (name: string) => {
			const result = root.getObjectByName(name)
			if (!result) throw new Error(`Missing caretaker pivot: ${name}`)
			return result
		}
		const status = node('Status_Light')
		let lamp: MeshStandardMaterial | undefined
		status.traverse((child) => {
			if (child instanceof Mesh) {
				lamp = (child.material as MeshStandardMaterial).clone()
				child.material = lamp
			}
		})
		if (!lamp) throw new Error('Missing caretaker status material')
		const rig: CaretakerRig = {
			root,
			capsule: copies[2],
			leftWheel: node('Wheel_Left'),
			rightWheel: node('Wheel_Right'),
			lift: node('Lift_Carriage'),
			leftJaw: node('Jaw_Left'),
			rightJaw: node('Jaw_Right'),
			headPan: node('Head_Pan'),
			headPitch: node('Head_Pitch'),
			eye: node('Robot_Eye'),
			lids: [node('Eyelid_Left'), node('Eyelid_Right')],
			lamp,
		}
		for (const lid of rig.lids) lid.visible = false
		return { copies, rig }
	}, [loaded])
	useEffect(() => {
		rigRef.current = assets.rig
		onReady()
		return () => {
			rigRef.current = null
		}
	}, [assets, rigRef, onReady])
	// Geometry, textures and static materials belong to useGLTF's cache. Only
	// the per-character status material is owned by this mounted instance.
	useEffect(
		() => () => {
			assets.rig.lamp.dispose()
		},
		[assets],
	)
	return (
		<group dispose={null}>
			<primitive object={assets.copies[0]} />
			<primitive object={assets.copies[1]} />
			<primitive object={assets.copies[2]} />
			{scene.pots.map((pot, index) => (
				<Plant
					key={pot.id}
					model={assets.copies[3 + (index % 3)]}
					x={pot.position.x}
					z={-pot.position.y}
				/>
			))}
		</group>
	)
}

function Plant({ model, x, z }: { model: Group; x: number; z: number }) {
	const copy = useMemo(() => model.clone(true), [model])
	return <primitive object={copy} position={[x, 0, z]} dispose={null} />
}
