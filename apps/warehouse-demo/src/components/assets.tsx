import { useGLTF } from '@react-three/drei/webgpu'
import { useFrame } from '@react-three/fiber/webgpu'
import { useEffect, useMemo, useRef } from 'react'
import { CanvasTexture, type Group, type Mesh, SRGBColorSpace, Vector3 } from 'three/webgpu'
import manifest from '../../../../assets/warehouse-demo/manifest.json'
import { type Pallet, palletPosition, type WarehouseState } from '../sim/world'

function prepare(model: Group): Group {
	const copy = model.clone(true)
	copy.traverse((object) => {
		const mesh = object as Mesh
		if (mesh.isMesh) {
			mesh.castShadow = true
			mesh.receiveShadow = true
		}
	})
	return copy
}

function Cargo({
	model,
	pallet,
	state,
	reducedMotion,
}: {
	model: Group
	pallet: Pallet
	state: WarehouseState
	reducedMotion: boolean
}) {
	const clone = useMemo(() => prepare(model), [model])
	const root = useRef<Group>(null)
	const transition = useRef({ location: '', generation: -1, offset: new Vector3() })
	const target = new Vector3()
	const label = useMemo(() => {
		const canvas = document.createElement('canvas')
		canvas.width = 128
		canvas.height = 64
		const context = canvas.getContext('2d')
		if (!context) throw new Error('Cargo label canvas is unavailable')
		context.fillStyle = pallet.origin === 'delivery' ? '#dfb477' : '#8bb4af'
		context.fillRect(0, 0, 128, 64)
		context.fillStyle = '#14292e'
		context.font = 'bold 40px sans-serif'
		context.textAlign = 'center'
		context.fillText(pallet.id, 64, 47)
		const texture = new CanvasTexture(canvas)
		texture.colorSpace = SRGBColorSpace
		return texture
	}, [pallet.id, pallet.origin])
	useEffect(() => () => label.dispose(), [label])
	useFrame((_, delta) => {
		if (!root.current) return
		const position = palletPosition(pallet, state)
		target.set(position.x, position.height - 0.15, -position.y)
		const location = JSON.stringify(pallet.location)
		const previous = transition.current
		if (previous.generation !== state.generation) {
			previous.offset.set(0, 0, 0)
			previous.generation = state.generation
		} else if (previous.location !== location) {
			previous.offset.copy(root.current.position).sub(target)
		}
		previous.location = location
		previous.offset.multiplyScalar(reducedMotion ? 0 : Math.exp(-22 * delta))
		root.current.position.copy(target).add(previous.offset)
		root.current.rotation.y =
			pallet.location.kind === 'carried'
				? state.forklift.heading
				: pallet.location.kind === 'truck'
					? -Math.PI / 2
					: 0
	})
	return (
		<group ref={root}>
			<primitive object={clone} />
			<mesh position={[0.12, 0.66, 0.515]}>
				<planeGeometry args={[0.25, 0.125]} />
				<meshBasicMaterial map={label} />
			</mesh>
		</group>
	)
}

export function AuthoredAssets({
	state,
	onReady,
	reducedMotion,
}: {
	state: WarehouseState
	onReady: (ready: boolean) => void
	reducedMotion: boolean
}) {
	const models = useGLTF(Object.values(manifest.assets), { draco: false })
	const environment = useMemo(() => prepare(models[0].scene), [models])
	const forklift = useMemo(() => prepare(models[1].scene), [models])
	const root = useRef<Group>(null)
	const wheelMotion = useRef({ elapsed: 0, generation: -1, distance: 0 })
	const pivots = useMemo(() => {
		const find = (name: string) => {
			const object = forklift.getObjectByName(name)
			if (!object) throw new Error(`Missing authored forklift pivot: ${name}`)
			return object
		}
		return {
			fork: find(manifest.pivots.fork),
			mast: find(manifest.pivots.mast),
			wheels: [...manifest.pivots.frontWheels, ...manifest.pivots.rearWheels].map(find),
			steering: manifest.pivots.steering.map(find),
		}
	}, [forklift])
	useEffect(() => onReady(true), [onReady])
	useFrame(() => {
		if (!root.current) return
		root.current.position.set(state.forklift.x, 0, -state.forklift.y)
		root.current.rotation.y = state.forklift.heading
		const previous = wheelMotion.current
		if (previous.generation !== state.generation) {
			previous.generation = state.generation
			previous.distance = 0
			previous.elapsed = state.elapsed
		}
		previous.distance += state.forklift.speed * (state.elapsed - previous.elapsed)
		previous.elapsed = state.elapsed
		for (const wheel of pivots.wheels)
			wheel.rotation.z = -previous.distance / manifest.forklift.wheelRadius
		for (const pivot of pivots.steering) pivot.rotation.y = -state.forklift.steering
		pivots.fork.position.y = state.forklift.forkHeight
		pivots.mast.position.y = Math.max(0, state.forklift.forkHeight - 0.3) * 0.5
	})
	return (
		<>
			<primitive object={environment} dispose={null} />
			<group ref={root} dispose={null}>
				<primitive object={forklift} />
			</group>
			{state.pallets.map((pallet) => (
				<Cargo
					key={pallet.id}
					model={models[Number(pallet.id.slice(1)) % 2 ? 2 : 3].scene}
					pallet={pallet}
					state={state}
					reducedMotion={reducedMotion}
				/>
			))}
		</>
	)
}
