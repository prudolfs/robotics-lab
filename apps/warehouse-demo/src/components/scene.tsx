import { OrbitControls } from '@react-three/drei/webgpu'
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu'
import { Component, type ReactNode, Suspense, useEffect } from 'react'
import { Vector3, WebGPURenderer } from 'three/webgpu'
import type { WarehouseController } from '../sim/controller'
import type { WarehouseState } from '../sim/world'
import { AuthoredAssets } from './assets'

type RendererStatus = 'loading' | 'webgpu' | 'unsupported' | 'error'
export type CameraMode = 'overview' | 'follow' | 'dock' | 'rack'

declare global {
	interface Window {
		__warehouseRenderMetrics?: {
			frameMs: number[]
			calls: number
			triangles: number
			backend: string
		}
	}
}

function BackendReporter({ onStatus }: { onStatus: (status: RendererStatus) => void }) {
	const renderer = useThree((state) => state.renderer as WebGPURenderer)
	const scene = useThree((state) => state.scene)
	useEffect(() => {
		const active = (renderer.backend as { isWebGPUBackend?: boolean })?.isWebGPUBackend === true
		onStatus(active ? 'webgpu' : 'unsupported')
		window.__warehouseRenderMetrics = {
			frameMs: [],
			calls: 0,
			triangles: 0,
			backend: active ? 'webgpu' : 'unsupported',
		}
		const previous = scene.onAfterRender
		scene.onAfterRender = (...args) => {
			previous.apply(scene, args)
			const metrics = window.__warehouseRenderMetrics
			if (!metrics) return
			metrics.calls = renderer.info.render.drawCalls
			metrics.triangles = renderer.info.render.triangles
		}
		return () => {
			scene.onAfterRender = previous
			delete window.__warehouseRenderMetrics
		}
	}, [renderer, scene, onStatus])
	useFrame((_, delta) => {
		const metrics = window.__warehouseRenderMetrics
		if (!metrics) return
		metrics.frameMs.push(delta * 1000)
		if (metrics.frameMs.length > 600) metrics.frameMs.shift()
	})
	return null
}

const CAMERA = {
	overview: { position: [15, 19, 17], target: [0, 0.6, -4.3] },
	dock: { position: [4, 7, 8], target: [-1.9, 0.5, 1.5] },
	rack: { position: [-3, 7, -1], target: [4.4, 0.7, -7] },
} as const

function CameraTracker({ state, mode }: { state: WarehouseState; mode: CameraMode }) {
	const camera = useThree((scene) => scene.camera)
	const target = new Vector3()
	useEffect(() => {
		if (mode !== 'follow') {
			camera.position.fromArray(CAMERA[mode].position)
			camera.lookAt(new Vector3().fromArray(CAMERA[mode].target))
		}
	}, [camera, mode])
	useFrame((_, delta) => {
		if (mode !== 'follow') return
		target.set(state.forklift.x, 0.7, -state.forklift.y)
		const desired = new Vector3(target.x + 4.2, 4.8, target.z + 5.1)
		camera.position.lerp(desired, 1 - Math.exp(-4 * delta))
		camera.lookAt(target)
	})
	return null
}

function RouteCue({ state, goal }: { state: WarehouseState; goal: { x: number; y: number } }) {
	const dx = goal.x - state.forklift.x
	const dy = goal.y - state.forklift.y
	return (
		<>
			<mesh
				position={[(goal.x + state.forklift.x) / 2, 0.075, -(goal.y + state.forklift.y) / 2]}
				rotation={[0, Math.atan2(dy, dx), 0]}
			>
				<boxGeometry args={[Math.hypot(dx, dy), 0.012, 0.025]} />
				<meshBasicMaterial color="#8de2ce" transparent opacity={0.5} />
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
	onAssetsReady,
}: {
	state: WarehouseState
	cameraMode: CameraMode
	route: ReturnType<WarehouseController['getRoute']>
	showRoute: boolean
	onAssetsReady: (ready: boolean) => void
}) {
	return (
		<>
			<color attach="background" args={['#152128']} />
			<ambientLight intensity={0.75} />
			<hemisphereLight args={['#d0e4e2', '#344751', 1.4]} />
			<directionalLight
				castShadow
				position={[-4, 14, 5]}
				intensity={3}
				color="#ffe5c5"
				shadow-mapSize={[2048, 2048]}
				shadow-camera-left={-16}
				shadow-camera-right={16}
				shadow-camera-top={20}
				shadow-camera-bottom={-15}
				shadow-normalBias={0.035}
			/>
			<directionalLight position={[8, 8, -10]} intensity={1.2} color="#a9d9ec" />
			<Suspense fallback={null}>
				<AuthoredAssets state={state} onReady={onAssetsReady} />
			</Suspense>
			{showRoute && route.goal && <RouteCue state={state} goal={route.goal} />}
			{cameraMode !== 'follow' && (
				<OrbitControls
					key={cameraMode}
					makeDefault
					target={[...CAMERA[cameraMode].target]}
					minDistance={3}
					maxDistance={38}
					maxPolarAngle={Math.PI / 2.08}
				/>
			)}
			<CameraTracker state={state} mode={cameraMode} />
		</>
	)
}

class SceneErrorBoundary extends Component<
	{ children: ReactNode; onError: () => void },
	{ failed: boolean }
> {
	state = { failed: false }
	static getDerivedStateFromError() {
		return { failed: true }
	}
	componentDidCatch() {
		this.props.onError()
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
	onAssetsReady,
}: {
	state: WarehouseState
	cameraMode: CameraMode
	route: ReturnType<WarehouseController['getRoute']>
	showRoute: boolean
	onRendererStatus: (status: RendererStatus) => void
	onAssetsReady: (ready: boolean) => void
}) {
	return (
		<SceneErrorBoundary onError={() => onRendererStatus('error')}>
			<Canvas
				shadows
				dpr={[1, 1.5]}
				camera={{ position: [...CAMERA.overview.position], fov: 44, near: 0.1, far: 120 }}
				renderer={async (props: { canvas: HTMLCanvasElement }) => {
					const renderer = new WebGPURenderer({ canvas: props.canvas, antialias: true })
					await renderer.init()
					return renderer
				}}
			>
				<WarehouseWorld
					state={state}
					cameraMode={cameraMode}
					route={route}
					showRoute={showRoute}
					onAssetsReady={onAssetsReady}
				/>
				<BackendReporter onStatus={onRendererStatus} />
			</Canvas>
		</SceneErrorBoundary>
	)
}
