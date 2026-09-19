import { Grid, Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Component, type ComponentRef, type ReactNode, useEffect, useMemo, useRef } from 'react'
import { type Group, Vector3 } from 'three'
import type { SimulationController } from '../sim/controller'
import { createSimulation, type Simulation, setStatus, stepSimulation } from '../sim/simulation'
import { OBSTACLES, scenePosition, WORLD } from '../sim/world'
import { usePresentation } from '../store'

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
				<strong>The 3D view could not start.</strong>
				<p>
					This demo needs WebGL2. Try a browser with hardware acceleration enabled, then reload.
				</p>
			</div>
		) : (
			this.props.children
		)
	}
}
function Lab() {
	return (
		<group>
			<mesh receiveShadow position={[0, -0.13, 0]}>
				<boxGeometry args={[WORLD.width, 0.24, WORLD.depth]} />
				<meshStandardMaterial color="#526067" roughness={0.95} />
			</mesh>
			<Grid
				position={[0, 0.005, 0]}
				args={[10, 8]}
				cellSize={0.5}
				cellThickness={0.45}
				cellColor="#65767b"
				sectionSize={1}
				sectionThickness={0.7}
				sectionColor="#7e8f90"
				fadeDistance={24}
				fadeStrength={1}
			/>
			{OBSTACLES.map((o) => (
				<group key={o.id} position={[o.x, 0, -o.y]}>
					<mesh position={[0, o.height / 2, 0]} castShadow receiveShadow>
						<boxGeometry args={[o.width, o.height, o.depth]} />
						<meshStandardMaterial
							color={o.id === 'island' ? '#36484e' : '#45575d'}
							roughness={0.72}
						/>
					</mesh>
					<mesh position={[0, o.height + 0.025, 0]} castShadow>
						<boxGeometry args={[o.width + 0.06, 0.05, o.depth + 0.06]} />
						<meshStandardMaterial color="#91a09f" roughness={0.5} metalness={0.25} />
					</mesh>
				</group>
			))}
			{/* Low boundary blocks preserve sightlines while showing the collision perimeter. */}
			{[-1, 1].map((side) => (
				<group key={side}>
					<mesh position={[side * 5, 0.12, 0]} castShadow>
						<boxGeometry args={[0.08, 0.24, 8]} />
						<meshStandardMaterial color="#8a9c9d" />
					</mesh>
					<mesh position={[0, 0.12, side * 4]} castShadow>
						<boxGeometry args={[10, 0.24, 0.08]} />
						<meshStandardMaterial color="#8a9c9d" />
					</mesh>
				</group>
			))}
			<mesh position={[0, 0.013, 2.5]} rotation={[-Math.PI / 2, 0, 0]}>
				<planeGeometry args={[0.85, 0.8]} />
				<meshStandardMaterial color="#213e40" transparent opacity={0.85} />
			</mesh>
			<Line
				points={[
					[-0.43, 0.025, 2.9],
					[-0.43, 0.025, 2.1],
					[0.43, 0.025, 2.1],
					[0.43, 0.025, 2.9],
				]}
				color="#7edbc7"
				lineWidth={1.5}
			/>
		</group>
	)
}
function Rover({ controller }: { controller: SimulationController }) {
	const root = useRef<Group>(null)
	useFrame(() => {
		const pose = controller.read().truth.pose
		if (root.current) {
			root.current.position.set(pose.x, 0, -pose.y)
			root.current.rotation.y = pose.heading
		}
	})
	return (
		<group ref={root}>
			<mesh position={[0, 0.2, 0]} castShadow>
				<boxGeometry args={[0.48, 0.16, 0.38]} />
				<meshStandardMaterial color="#3f8d87" metalness={0.25} roughness={0.5} />
			</mesh>
			<mesh position={[0.08, 0.3, 0]} castShadow>
				<boxGeometry args={[0.26, 0.07, 0.28]} />
				<meshStandardMaterial color="#b6c6c5" metalness={0.4} roughness={0.4} />
			</mesh>
			<mesh position={[0.16, 0.4, 0]}>
				<boxGeometry args={[0.04, 0.16, 0.04]} />
				<meshStandardMaterial color="#9baeb2" />
			</mesh>
			<mesh position={[0.16, 0.45, 0]}>
				<boxGeometry args={[0.06, 0.065, 0.2]} />
				<meshStandardMaterial color="#16242c" />
			</mesh>
			{[-1, 1].map((side) => (
				<group key={side}>
					<mesh position={[0, 0.08, side * 0.2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
						<cylinderGeometry args={[0.08, 0.08, 0.055, 24]} />
						<meshStandardMaterial color="#111c23" roughness={0.9} />
					</mesh>
					<mesh position={[0.194, 0.45, side * 0.06]} rotation={[0, Math.PI / 2, 0]}>
						<circleGeometry args={[0.017, 16]} />
						<meshBasicMaterial color="#7edbc7" />
					</mesh>
				</group>
			))}
			<mesh position={[0.255, 0.2, 0]}>
				<boxGeometry args={[0.018, 0.025, 0.2]} />
				<meshBasicMaterial color="#a3f4d9" />
			</mesh>
		</group>
	)
}
function CameraRig({ controller }: { controller: SimulationController }) {
	const mode = usePresentation((s) => s.camera)
	const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
	const { camera, gl, size } = useThree()
	const desired = useMemo(() => new Vector3(), []),
		target = useMemo(() => new Vector3(), [])
	useEffect(() => {
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
function Paths({ state }: { state: Simulation }) {
	const { showTruth, showOdometry, showRoute } = usePresentation()
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
}: {
	state: Simulation
	controller: SimulationController
}) {
	return (
		<GraphicsBoundary onFailure={() => controller.pause()}>
			<Canvas
				shadows
				camera={{ position: [10, 10, 12], fov: 42, near: 0.1, far: 80 }}
				dpr={[1, 1.5]}
				gl={{ antialias: true }}
				fallback={<div className="graphics-error">WebGL2 is required to display the lab.</div>}
				aria-label="Interactive inspection lab"
			>
				<color attach="background" args={['#18232b']} />
				<ambientLight intensity={0.65} />
				<hemisphereLight args={['#d7ebff', '#4f5350', 1.8]} />
				<directionalLight
					castShadow
					position={[1, 8, 4]}
					intensity={2.8}
					color="#ffecd1"
					shadow-mapSize={[1024, 1024]}
					shadow-camera-left={-7}
					shadow-camera-right={7}
					shadow-camera-top={7}
					shadow-camera-bottom={-7}
					shadow-normalBias={0.04}
				/>
				<Lab />
				<Paths state={state} />
				<Rover controller={controller} />
				<CameraRig controller={controller} />
			</Canvas>
		</GraphicsBoundary>
	)
}
