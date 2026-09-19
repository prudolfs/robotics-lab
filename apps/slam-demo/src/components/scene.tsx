import { Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import type { MapSnapshot, Pose3 } from '@robotics-lab/vision'
import {
	Component,
	type ComponentRef,
	type ReactNode,
	Suspense,
	useEffect,
	useMemo,
	useRef,
} from 'react'
import { Vector3 } from 'three'
import manifest from '../../../../assets/slam-demo/manifest.json'
import type { Acquisition } from '../sensor/runtime'
import type { VisualPoint } from '../sensor/visual'
import type { SimulationController } from '../sim/controller'
import { createSimulation, type Simulation, setStatus, stepSimulation } from '../sim/simulation'
import { scenePosition } from '../sim/world'
import { usePresentation } from '../store'
import { AuthoredAssets, StudioEnvironment } from './assets'
import { RenderMetrics } from './render-metrics'
import { SparseMap } from './sparse-map'

class GraphicsBoundary extends Component<
	{ children: ReactNode; onFailure: () => void },
	{ failed: boolean }
> {
	state = { failed: false }
	static getDerivedStateFromError() {
		return { failed: true }
	}
	componentDidCatch() {
		this.props.onFailure()
	}
	render() {
		return this.state.failed ? (
			<div className="graphics-error">
				<strong>The lab could not load.</strong>
				<p>
					Check your connection and WebGL2 support, then reload to retry loading the lab assets.
				</p>
			</div>
		) : (
			this.props.children
		)
	}
}
function CameraRig({ controller }: { controller: SimulationController }) {
	const mode = usePresentation((s) => s.camera)
	const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
	const { camera, gl, size } = useThree()
	const desired = useMemo(() => new Vector3(), []),
		target = useMemo(() => new Vector3(), [])
	useEffect(() => {
		if ('fov' in camera) {
			camera.fov = mode === 'robot' ? 53.13010235415598 : 42
			camera.updateProjectionMatrix()
		}
		if (mode === 'bench') {
			camera.position.set(-0.8, 2.25, -0.25)
			controls.current?.target.set(-2.3, 1.05, -3.3)
			controls.current?.update()
		}
		if (mode === 'overview') {
			const scale = Math.max(1, Math.min(1.7, size.height / size.width))
			camera.position.set(10 * scale, 10 * scale, 12 * scale)
			camera.lookAt(0, 0, 0)
			controls.current?.target.set(0, 0, 0)
			controls.current?.update()
		}
	}, [camera, mode, size.width, size.height])
	useEffect(() => {
		function lost(e: Event) {
			e.preventDefault()
			controller.pause()
		}
		gl.domElement.addEventListener('webglcontextlost', lost)
		return () => gl.domElement.removeEventListener('webglcontextlost', lost)
	}, [controller, gl])
	useFrame((_, dt) => {
		if (mode === 'robot') {
			const p = controller.read().truth.pose,
				[mx, my, mz] = manifest.mounts.Camera_Left,
				c = Math.cos(p.heading),
				sn = Math.sin(p.heading)
			camera.position.set(p.x + c * mx - sn * my, mz, -(p.y + sn * mx + c * my))
			target.set(camera.position.x + c, camera.position.y, camera.position.z - sn)
			camera.lookAt(target)
		}
		if (mode === 'follow' && controls.current) {
			const p = controller.read().truth.pose
			target.set(p.x, 0.2, -p.y)
			desired.set(p.x - 3 * Math.cos(p.heading) + 1, 2.6, -p.y + 3 * Math.sin(p.heading) + 2)
			const a = 1 - Math.exp(-5 * dt)
			camera.position.lerp(desired, a)
			controls.current.target.lerp(target, a)
			controls.current.update()
		}
	})
	return (
		<OrbitControls
			ref={controls}
			enabled={mode === 'overview'}
			makeDefault
			minDistance={4}
			maxDistance={36}
			minPolarAngle={0.1}
			maxPolarAngle={Math.PI / 2 - 0.08}
			enableDamping
		/>
	)
}
function Paths({ state, visualTrail }: { state: Simulation; visualTrail: VisualPoint[] }) {
	const { showTruth, showOdometry, showRoute, showVisual } = usePresentation()
	const route = useMemo(() => {
		let s = setStatus(createSimulation({ noise: false }), 'running')
		while (s.status === 'running') s = stepSimulation(s)
		return s.truthTrail.map((p) => scenePosition(p, 0.025))
	}, [])
	const truth = useMemo(
		() => state.truthTrail.map((p) => scenePosition(p, 0.04)),
		[state.truthTrail],
	)
	const odometry = useMemo(
		() => state.odometry.history.map((p) => scenePosition(p, 0.055)),
		[state.odometry.history],
	)
	return (
		<>
			{showVisual && visualTrail.length > 1 && (
				<Line points={visualTrail.map((p) => [p.x, 0.075, -p.y])} color="#83dece" lineWidth={2.5} />
			)}
			{showRoute && (
				<Line
					points={route}
					color="#b9d0ce"
					opacity={0.5}
					transparent
					dashed
					dashSize={0.1}
					gapSize={0.12}
					lineWidth={1}
				/>
			)}
			{showTruth && truth.length > 1 && <Line points={truth} color="#e2ecef" lineWidth={2} />}
			{showOdometry && odometry.length > 1 && (
				<Line
					points={odometry}
					color="#f1b86c"
					dashed
					dashSize={0.12}
					gapSize={0.07}
					lineWidth={2}
				/>
			)}
			{showOdometry && (
				<mesh position={scenePosition(state.odometry.pose, 0.06)} rotation={[-Math.PI / 2, 0, 0]}>
					<ringGeometry args={[0.15, 0.18, 32]} />
					<meshBasicMaterial color="#f1b86c" />
				</mesh>
			)}
		</>
	)
}
export function Scene({
	state,
	controller,
	onReady,
	onFailure,
	acquisition,
	visualTrail,
	map,
	mapOrigin,
}: {
	state: Simulation
	controller: SimulationController
	onReady: () => void
	onFailure: () => void
	acquisition: Acquisition
	visualTrail: VisualPoint[]
	map?: MapSnapshot
	mapOrigin: Pose3 | null
}) {
	const quality = usePresentation((s) => s.quality)
	return (
		<GraphicsBoundary
			onFailure={() => {
				controller.pause()
				onFailure()
			}}
		>
			<Canvas
				shadows={quality === 'standard'}
				camera={{ position: [10, 10, 12], fov: 42, near: 0.1, far: 80 }}
				dpr={quality === 'low' ? 1 : [1, 1.5]}
				gl={{ antialias: true }}
				fallback={<div className="graphics-error">WebGL2 is required to display the lab.</div>}
				aria-label="Interactive inspection lab"
			>
				<color attach="background" args={['#18232b']} />
				<ambientLight intensity={0.3} />
				<hemisphereLight args={['#d7ebff', '#4f5350', 1.2]} />
				<directionalLight
					castShadow
					position={[1, 8, 4]}
					intensity={2.5}
					color="#ffecd1"
					shadow-mapSize={[2048, 2048]}
					shadow-camera-left={-7}
					shadow-camera-right={7}
					shadow-camera-top={7}
					shadow-camera-bottom={-7}
					shadow-normalBias={0.025}
					shadow-bias={-0.0001}
				/>
				<StudioEnvironment />
				<pointLight
					position={[-2.3, 1.8, -3.15]}
					color="#ffce91"
					intensity={5}
					distance={4}
					decay={2}
				/>
				<Suspense fallback={null}>
					<AuthoredAssets controller={controller} onReady={onReady} acquisition={acquisition} />
				</Suspense>
				<Paths state={state} visualTrail={visualTrail} />
				<SparseMap map={map} origin={mapOrigin} />
				<RenderMetrics controller={controller} />

				<CameraRig controller={controller} />
			</Canvas>
		</GraphicsBoundary>
	)
}
