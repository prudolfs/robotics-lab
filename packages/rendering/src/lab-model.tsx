import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import type { Mesh } from 'three'

/** Each placement owns its transform; cached geometry and materials stay shared. */
export function LabModel({ name }: { name: string }) {
	const { scene } = useGLTF(`/assets/lab/${name}.glb`)
	const model = useMemo(() => {
		const copy = scene.clone(true)
		copy.traverse((object) => {
			if ((object as Mesh).isMesh) {
				object.castShadow = true
				object.receiveShadow = true
			}
		})
		return copy
	}, [scene])
	return <primitive object={model} />
}
