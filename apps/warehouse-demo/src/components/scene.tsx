import { OrbitControls } from '@react-three/drei/webgpu'
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu'
import { Component, type ReactNode, useEffect } from 'react'
import { Vector3, WebGPURenderer } from 'three/webgpu'
import type { PredictableRoute } from '../sim/predictable'
import { BAYS } from '../sim/scenario'
import { palletPosition, type WarehouseState } from '../sim/world'

type RendererStatus = 'loading' | 'webgpu' | 'unsupported' | 'error'
type CameraMode = 'overview' | 'follow'

function BackendReporter({ onStatus }: { onStatus: (status: RendererStatus) => void }) {
	const renderer = useThree((state) => state.renderer as WebGPURenderer)
	useEffect(() => {
		const backend = renderer.backend as { isWebGPUBackend?: boolean }
		onStatus(backend?.isWebGPUBackend ? 'webgpu' : 'unsupported')
	}, [renderer, onStatus])
	return null
}

function CameraTracker({ state, mode }: { state: WarehouseState; mode: CameraMode }) {
	const camera = useThree((scene) => scene.camera)
	const target = new Vector3()
	useEffect(() => {
		if (mode === 'overview') {
			camera.position.set(14, 19, 17)
			camera.lookAt(0, 0.6, -4.5)
		}
	}, [camera, mode])
	useFrame((_, delta) => {
		if (mode !== 'follow') return
		target.set(state.forklift.x, 0.6, -state.forklift.y)
		const desired = new Vector3(target.x + 4.2, 5.4, target.z + 5.4)
		camera.position.lerp(desired, 1 - Math.exp(-4 * delta))
		camera.lookAt(target)
	})
	return null
}

function Floor() {
	return (
		<>
			<mesh receiveShadow position={[0, -0.14, -7.75]}>
				<boxGeometry args={[12, 0.28, 15.5]} />
				<meshStandardMaterial color="#71858d" roughness={0.9} />
			</mesh>
			<mesh receiveShadow position={[-1.95, -0.12, 3.1]}>
				<boxGeometry args={[3.7, 0.24, 6.2]} />
				<meshStandardMaterial color="#52666f" roughness={0.85} />
			</mesh>
			<mesh position={[-1.95, 0.012, 0]}>
				<boxGeometry args={[4.5, 0.025, 0.33]} />
				<meshStandardMaterial color="#d9ba6b" roughness={0.8} />
			</mesh>
			<mesh position={[0, 0.03, -0.08]}>
				<boxGeometry args={[12, 0.055, 0.12]} />
				<meshStandardMaterial color="#293a43" />
			</mesh>
		</>
	)
}

function Building() {
	return (
		<>
			<Floor />
			<mesh receiveShadow position={[0, 1.8, -15.5]}>
				<boxGeometry args={[12, 3.6, 0.14]} />
				<meshStandardMaterial color="#d4dbd9" roughness={0.82} />
			</mesh>
			<mesh receiveShadow position={[-6, 1.8, -7.75]}>
				<boxGeometry args={[0.14, 3.6, 15.5]} />
				<meshStandardMaterial color="#9eb0b3" roughness={0.85} />
			</mesh>
			<mesh receiveShadow position={[6, 0.35, -7.75]}>
				<boxGeometry args={[0.14, 0.7, 15.5]} />
				<meshStandardMaterial color="#bfcac8" roughness={0.85} />
			</mesh>
			{[-5.7, -2.8, 0, 2.8, 5.7].map((x) => (
				<mesh key={x} position={[x, 3.55, -15.38]}>
					<boxGeometry args={[0.11, 0.16, 0.15]} />
					<meshStandardMaterial color="#425c65" metalness={0.55} roughness={0.55} />
				</mesh>
			))}
		</>
	)
}

function Truck() {
	return (
		<group>
			<mesh position={[-3.83, 1.12, 3.1]} castShadow>
				<boxGeometry args={[0.12, 2.24, 6.2]} />
				<meshStandardMaterial color="#dce2de" metalness={0.15} roughness={0.7} />
			</mesh>
			<mesh position={[-0.07, 1.12, 3.1]} castShadow>
				<boxGeometry args={[0.12, 2.24, 6.2]} />
				<meshStandardMaterial color="#dce2de" metalness={0.15} roughness={0.7} />
			</mesh>
			<mesh position={[-1.95, 2.28, 3.1]} castShadow>
				<boxGeometry args={[3.88, 0.12, 6.2]} />
				<meshStandardMaterial
					color="#e0e6e2"
					metalness={0.2}
					roughness={0.65}
					transparent
					opacity={0.27}
				/>
			</mesh>
			<mesh position={[-1.95, 0.65, 6.95]} castShadow>
				<boxGeometry args={[3.1, 1.3, 1.15]} />
				<meshStandardMaterial color="#294d50" metalness={0.35} roughness={0.6} />
			</mesh>
			{[-3.23, -0.67].map((x) =>
				[1.5, 5.45, 6.95].map((z) => (
					<mesh key={`${x}-${z}`} position={[x, 0.16, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
						<cylinderGeometry args={[0.36, 0.36, 0.2, 14]} />
						<meshStandardMaterial color="#20282d" roughness={0.98} />
					</mesh>
				)),
			)}
			<mesh position={[-1.95, 2.27, 0.05]}>
				<boxGeometry args={[3.88, 0.14, 0.14]} />
				<meshStandardMaterial color="#d9ba6b" />
			</mesh>
		</group>
	)
}

function Rack({ state }: { state: WarehouseState }) {
	return (
		<group>
			<mesh castShadow position={[5.73, 0.8, -6.7]}>
				<boxGeometry args={[0.28, 1.6, 10.25]} />
				<meshStandardMaterial color="#344e58" metalness={0.48} roughness={0.55} />
			</mesh>
			{BAYS.map((bay, index) => {
				const occupied = state.pallets.some(
					(item) => item.location.kind === 'bay' && item.location.bayId === bay.id,
				)
				return (
					<group key={bay.id}>
						<mesh receiveShadow position={[bay.x, 0.018, -bay.y]}>
							<boxGeometry args={[1.2, 0.035, 1.14]} />
							<meshStandardMaterial color={occupied ? '#755d45' : '#285f5a'} roughness={0.78} />
						</mesh>
						<mesh position={[4.29, 0.12, -bay.y]}>
							<boxGeometry args={[0.045, 0.24, 1.15]} />
							<meshStandardMaterial color="#88d8c2" metalness={0.2} />
						</mesh>
						<mesh castShadow position={[5.7, 1.25, -bay.y - 0.625]}>
							<boxGeometry args={[0.15, 2.5, 0.09]} />
							<meshStandardMaterial color="#203942" metalness={0.55} roughness={0.55} />
						</mesh>
						{index === BAYS.length - 1 && (
							<mesh castShadow position={[5.7, 1.25, -bay.y + 0.625]}>
								<boxGeometry args={[0.15, 2.5, 0.09]} />
								<meshStandardMaterial color="#203942" metalness={0.55} roughness={0.55} />
							</mesh>
						)}
					</group>
				)
			})}
			<mesh castShadow position={[5.65, 2.45, -6.7]}>
				<boxGeometry args={[0.2, 0.13, 10.25]} />
				<meshStandardMaterial color="#203942" metalness={0.55} roughness={0.55} />
			</mesh>
		</group>
	)
}

function Pallets({ state }: { state: WarehouseState }) {
	return (
		<>
			{state.pallets.map((pallet) => {
				const position = palletPosition(pallet, state)
				const delivery = pallet.origin === 'delivery'
				const color = delivery
					? ['#d8a86d', '#c69365', '#b6a077', '#d0b182'][Number(pallet.id.slice(1)) % 4]
					: '#a3a7a0'
				return (
					<group key={pallet.id} position={[position.x, position.height - 0.15, -position.y]}>
						<mesh castShadow receiveShadow position={[0, 0.12, 0]}>
							<boxGeometry args={[1.1, 0.22, 1.1]} />
							<meshStandardMaterial color="#8b6849" roughness={0.95} />
						</mesh>
						<mesh castShadow receiveShadow position={[0, 0.48, 0]}>
							<boxGeometry args={[0.98, 0.52, 0.98]} />
							<meshStandardMaterial color={color} roughness={0.86} />
						</mesh>
						<mesh position={[0, 0.48, -0.5]}>
							<boxGeometry args={[0.52, 0.18, 0.015]} />
							<meshStandardMaterial color={delivery ? '#e9e7cf' : '#526671'} roughness={0.7} />
						</mesh>
					</group>
				)
			})}
		</>
	)
}

function Forklift({ state }: { state: WarehouseState }) {
	const { forklift } = state
	return (
		<group position={[forklift.x, 0, -forklift.y]} rotation={[0, forklift.heading, 0]}>
			<mesh castShadow position={[0, 0.46, 0]}>
				<boxGeometry args={[1.65, 0.52, 0.88]} />
				<meshStandardMaterial color="#0f6c67" metalness={0.24} roughness={0.55} />
			</mesh>
			<mesh castShadow position={[-0.32, 1.17, 0]}>
				<boxGeometry args={[0.88, 0.1, 1.05]} />
				<meshStandardMaterial color="#20353b" metalness={0.45} />
			</mesh>
			{[-0.72, 0.32].flatMap((x) =>
				[-0.38, 0.38].map((z) => (
					<mesh key={`${x}-${z}`} position={[x, 0.23, z]} rotation={[Math.PI / 2, 0, 0]} castShadow>
						<cylinderGeometry args={[0.21, 0.21, 0.18, 14]} />
						<meshStandardMaterial color="#1c2528" roughness={0.95} />
					</mesh>
				)),
			)}
			{[-0.42, 0.42].map((z) => (
				<group key={z}>
					<mesh castShadow position={[0.84, 1.06, z]}>
						<boxGeometry args={[0.1, 2.06, 0.09]} />
						<meshStandardMaterial color="#253139" metalness={0.6} roughness={0.5} />
					</mesh>
					<mesh castShadow position={[1.28, forklift.forkHeight + 0.055, z]}>
						<boxGeometry args={[0.91, 0.1, 0.11]} />
						<meshStandardMaterial color="#c6d5cf" metalness={0.65} roughness={0.4} />
					</mesh>
				</group>
			))}
			<mesh castShadow position={[0.84, forklift.forkHeight + 0.25, 0]}>
				<boxGeometry args={[0.14, 0.5, 0.96]} />
				<meshStandardMaterial color="#2e3e43" metalness={0.5} />
			</mesh>
			<mesh position={[-0.81, 0.58, 0]}>
				<boxGeometry args={[0.05, 0.15, 0.4]} />
				<meshStandardMaterial
					color={state.contact ? '#ed987d' : '#8de2ce'}
					emissive={state.contact ? '#a23620' : '#176b5d'}
					emissiveIntensity={0.5}
				/>
			</mesh>
		</group>
	)
}

function RouteCue({ state, goal }: { state: WarehouseState; goal: { x: number; y: number } }) {
	const dx = goal.x - state.forklift.x
	const dy = goal.y - state.forklift.y
	const distance = Math.hypot(dx, dy)
	return (
		<>
			<mesh
				position={[(goal.x + state.forklift.x) / 2, 0.075, -(goal.y + state.forklift.y) / 2]}
				rotation={[0, Math.atan2(dy, dx), 0]}
			>
				<boxGeometry args={[distance, 0.012, 0.025]} />
				<meshStandardMaterial
					color="#8de2ce"
					emissive="#3c9b85"
					emissiveIntensity={0.7}
					transparent
					opacity={0.62}
				/>
			</mesh>
			<mesh position={[goal.x, 0.08, -goal.y]} rotation={[-Math.PI / 2, 0, 0]}>
				<ringGeometry args={[0.24, 0.3, 32]} />
				<meshBasicMaterial color="#8de2ce" transparent opacity={0.8} side={2} />
			</mesh>
		</>
	)
}

function WarehouseWorld({
	state,
	cameraMode,
	route,
	showRoute,
}: {
	state: WarehouseState
	cameraMode: CameraMode
	route: PredictableRoute
	showRoute: boolean
}) {
	return (
		<>
			<color attach="background" args={['#152128']} />
			<ambientLight intensity={1.4} />
			<hemisphereLight args={['#d0e4e2', '#445b60', 1.2]} />
			<directionalLight
				castShadow
				position={[-3, 11, 5]}
				intensity={2.4}
				shadow-mapSize={[2048, 2048]}
				shadow-camera-left={-15}
				shadow-camera-right={15}
				shadow-camera-top={15}
				shadow-camera-bottom={-15}
			/>
			<Building />
			<Truck />
			<Rack state={state} />
			<Pallets state={state} />
			<Forklift state={state} />
			{showRoute && route.goal && <RouteCue state={state} goal={route.goal} />}
			<OrbitControls
				makeDefault
				enabled={cameraMode === 'overview'}
				target={[0, 0.6, -4.5]}
				minDistance={8}
				maxDistance={38}
				maxPolarAngle={Math.PI / 2.12}
			/>
			<CameraTracker state={state} mode={cameraMode} />
		</>
	)
}

class SceneErrorBoundary extends Component<
	{ children: ReactNode; onError: (message: string) => void },
	{ failed: boolean }
> {
	state = { failed: false }
	static getDerivedStateFromError() {
		return { failed: true }
	}
	componentDidCatch(error: Error) {
		this.props.onError(error.message)
	}
	render() {
		return this.state.failed ? null : this.props.children
	}
}

export function Scene({
	state,
	cameraMode,
	route,
	showRoute,
	onRendererStatus,
}: {
	state: WarehouseState
	cameraMode: CameraMode
	route: PredictableRoute
	showRoute: boolean
	onRendererStatus: (status: RendererStatus) => void
}) {
	return (
		<SceneErrorBoundary onError={() => onRendererStatus('error')}>
			<Canvas
				shadows
				camera={{ position: [14, 19, 17], fov: 44, near: 0.1, far: 100 }}
				renderer={async (props: { canvas: HTMLCanvasElement }) => {
					const renderer = new WebGPURenderer({ canvas: props.canvas, antialias: true })
					await renderer.init()
					return renderer
				}}
			>
				<WarehouseWorld state={state} cameraMode={cameraMode} route={route} showRoute={showRoute} />
				<BackendReporter onStatus={onRendererStatus} />
			</Canvas>
		</SceneErrorBoundary>
	)
}
