import { OrbitControls } from '@react-three/drei/webgpu'
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu'
import { Component, type ReactNode, useEffect, useRef, useState } from 'react'
import type { Group } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three/addons/controls/OrbitControls.js'
import { MathUtils, Vector3, WebGPURenderer } from 'three/webgpu'
import type { Scene } from '../api/client'

type RendererStatus = 'loading' | 'webgpu' | 'unsupported' | 'error'
export type CameraMode = 'overview' | 'follow'

function Box({
	position,
	size,
	color,
}: {
	position: [number, number, number]
	size: [number, number, number]
	color: string
}) {
	return (
		<mesh position={position} castShadow receiveShadow>
			<boxGeometry args={size} />
			<meshStandardMaterial color={color} roughness={0.85} />
		</mesh>
	)
}

function World({
	scene,
	generation,
	cameraMode,
}: {
	scene: Scene
	generation: number
	cameraMode: CameraMode
}) {
	const robot = useRef<Group>(null)
	const capsule = useRef<Group>(null)
	const gripper = useRef<Group>(null)
	const leftWheel = useRef<Group>(null)
	const rightWheel = useRef<Group>(null)
	const frame = useRef({ previous: scene, current: scene, generation, received: performance.now() })
	const camera = useThree((state) => state.camera)
	const size = useThree((state) => state.size)
	const controls = useThree((state) => state.controls) as OrbitControlsImpl | null
	const target = useRef(new Vector3())
	const cameraPosition = useRef(new Vector3())
	const reduced = useRef(false)
	useEffect(() => {
		reduced.current = matchMedia('(prefers-reduced-motion: reduce)').matches
	}, [])
	useEffect(() => {
		const old = frame.current
		const interpolate =
			generation === old.generation &&
			scene.status === 'running' &&
			old.current.status === 'running' &&
			scene.robot.holding === old.current.robot.holding
		frame.current = {
			previous: interpolate ? old.current : scene,
			current: scene,
			generation,
			received: performance.now(),
		}
	}, [scene, generation])
	// biome-ignore lint/correctness/useExhaustiveDependencies: a reset generation must also reset the camera pose.
	useEffect(() => {
		const pose = frame.current.current.robot
		target.current.set(
			cameraMode === 'overview' ? 0 : pose.x,
			0.2,
			cameraMode === 'overview' ? 0 : -pose.y,
		)
		const scale = Math.max(1, Math.sqrt(1.3 / (size.width / size.height)))
		camera.position.set(5.5 * scale, 5 * scale, 6.1 * scale)
		controls?.target.copy(target.current)
		camera.lookAt(target.current)
		controls?.update()
	}, [camera, controls, cameraMode, generation, size.width, size.height])
	// Only interpolate two authoritative snapshots. Never extrapolate or step physics.
	useFrame((_, delta) => {
		const { previous: a, current: b, received } = frame.current
		const span = Math.max(50, Math.min(200, (b.elapsed_seconds - a.elapsed_seconds) * 1000))
		const alpha = MathUtils.clamp((performance.now() - received) / span, 0, 1)
		const mix = (start: number, end: number) => MathUtils.lerp(start, end, alpha)
		const x = mix(a.robot.x, b.robot.x)
		const y = mix(a.robot.y, b.robot.y)
		const heading =
			a.robot.heading +
			Math.atan2(
				Math.sin(b.robot.heading - a.robot.heading),
				Math.cos(b.robot.heading - a.robot.heading),
			) *
				alpha
		robot.current?.position.set(x, 0, -y)
		robot.current?.rotation.set(0, heading, 0)
		capsule.current?.position.set(
			mix(a.capsule.position.x, b.capsule.position.x),
			mix(a.capsule.position.z, b.capsule.position.z),
			-mix(a.capsule.position.y, b.capsule.position.y),
		)
		if (gripper.current) gripper.current.position.y = mix(a.robot.lift_height, b.robot.lift_height)
		if (leftWheel.current)
			leftWheel.current.rotation.z = -mix(a.robot.left_wheel_angle, b.robot.left_wheel_angle)
		if (rightWheel.current)
			rightWheel.current.rotation.z = -mix(a.robot.right_wheel_angle, b.robot.right_wheel_angle)
		if (cameraMode === 'follow') {
			const ease = reduced.current ? 1 : 1 - Math.exp(-delta * 7)
			target.current.set(x, 0.3, -y)
			cameraPosition.current.set(x + 2.4, 2.8, -y + 3.0)
			camera.position.lerp(cameraPosition.current, ease)
			controls?.target.lerp(target.current, ease)
			camera.lookAt(controls?.target ?? target.current)
			controls?.update()
		}
	})
	return (
		<>
			<color attach="background" args={['#d6dfcc']} />
			<ambientLight intensity={1.6} />
			<directionalLight
				castShadow
				position={[-3, 7, 4]}
				intensity={3}
				shadow-mapSize={[1024, 1024]}
			/>
			<Box position={[0, -0.1, 0]} size={[6.3, 0.15, 4.3]} color="#9ca98c" />
			<Box position={[0, -0.005, 0]} size={[6, 0.01, 4]} color="#c6c6a8" />
			{scene.walls.map((wall) => (
				<Box
					key={wall.id}
					position={[wall.position.x, wall.position.z, -wall.position.y]}
					size={[wall.half_size.x * 2, wall.half_size.z * 2, wall.half_size.y * 2]}
					color="#71816b"
				/>
			))}
			{[-2.9, 0, 2.9].map((x) => (
				<group key={x}>
					<Box position={[x, 1.1, -1.96]} size={[0.05, 2.2, 0.05]} color="#708071" />
					<Box position={[x, 2.35, -0.95]} size={[0.05, 0.05, 2.8]} color="#708071" />
				</group>
			))}
			{scene.pots.map((pot) => (
				<group key={pot.id} position={[pot.position.x, 0, -pot.position.y]}>
					<mesh castShadow position={[0, 0.15, 0]}>
						<cylinderGeometry args={[0.15, 0.11, 0.3, 16]} />
						<meshStandardMaterial color="#9a7756" />
					</mesh>
					<mesh castShadow position={[0, 0.4, 0]} scale={[1, 1.4, 1]}>
						<icosahedronGeometry args={[0.16, 1]} />
						<meshStandardMaterial color="#618353" />
					</mesh>
				</group>
			))}
			<mesh
				position={[scene.tray.position.x, 0.001, -scene.tray.position.y]}
				rotation={[-Math.PI / 2, 0, 0]}
				receiveShadow
			>
				<planeGeometry args={[0.65, 0.65]} />
				<meshStandardMaterial color="#728a63" roughness={0.85} />
			</mesh>
			<Box position={[-1.75, 0.02, 0.75]} size={[0.75, 0.04, 0.65]} color="#738374" />
			<group ref={robot}>
				<Box position={[0, 0.21, 0]} size={[0.42, 0.28, 0.36]} color="#e7dfb2" />
				{[-0.22, 0.22].map((z) => (
					<group key={z} ref={z < 0 ? leftWheel : rightWheel} position={[0, 0.14, z]}>
						<mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
							<cylinderGeometry args={[0.14, 0.14, 0.08, 20]} />
							<meshStandardMaterial color="#374b42" />
						</mesh>
						<Box
							position={[0, 0, z < 0 ? -0.041 : 0.041]}
							size={[0.19, 0.025, 0.009]}
							color="#8fa38e"
						/>
					</group>
				))}
				<Box position={[0.03, 0.43, 0]} size={[0.06, 0.2, 0.06]} color="#647764" />
				<Box position={[0.08, 0.56, 0]} size={[0.17, 0.15, 0.38]} color="#e7dfb2" />
				{[-0.11, 0.11].map((z) => (
					<mesh key={z} position={[0.17, 0.56, z]} rotation={[0, 0, -Math.PI / 2]}>
						<cylinderGeometry args={[0.055, 0.055, 0.035, 20]} />
						<meshStandardMaterial color="#344942" />
					</mesh>
				))}
				<group ref={gripper}>
					{[-1, 1].map((side) => (
						<Box
							key={side}
							position={[0.28, 0, side * (scene.robot.holding ? 0.0625 : 0.09)]}
							size={[0.22, 0.025, 0.025]}
							color="#657963"
						/>
					))}
				</group>
			</group>
			<group ref={capsule}>
				<mesh castShadow>
					<sphereGeometry args={[0.05, 16, 12]} />
					<meshStandardMaterial color="#d2943e" />
				</mesh>
			</group>
			<OrbitControls
				makeDefault
				enabled={cameraMode === 'overview'}
				target={[0, 0.2, 0]}
				maxPolarAngle={Math.PI / 2.1}
			/>
		</>
	)
}

function ReportBackend({ onStatus }: { onStatus: (status: RendererStatus) => void }) {
	const renderer = useThree((state) => state.renderer as WebGPURenderer)
	useEffect(() => {
		onStatus(
			(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend
				? 'webgpu'
				: 'unsupported',
		)
	}, [renderer, onStatus])
	return null
}

class Boundary extends Component<
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

export function GreenhouseScene({
	scene,
	generation,
	cameraMode,
}: {
	scene: Scene | null
	generation: number
	cameraMode: CameraMode
}) {
	const [status, setStatus] = useState<RendererStatus>('loading')
	const [capable, setCapable] = useState(false)
	useEffect(() => {
		let active = true
		async function check() {
			try {
				const adapter = await navigator.gpu?.requestAdapter()
				if (active) {
					setCapable(!!adapter)
					if (!adapter) setStatus('unsupported')
				}
			} catch {
				if (active) setStatus('error')
			}
		}
		void check()
		return () => {
			active = false
		}
	}, [])
	return (
		<section aria-label="Greenhouse simulation" className="relative min-h-[420px] flex-1 bg-muted">
			<p
				data-testid="renderer-status"
				className="absolute top-4 left-5 z-10 rounded-md bg-background/90 px-3 py-2 text-muted-foreground text-xs"
			>
				{status === 'webgpu'
					? 'WebGPU active'
					: status === 'unsupported'
						? 'WebGPU is unavailable'
						: status === 'error'
							? 'The 3D preview could not start'
							: 'Preparing 3D preview…'}
			</p>
			{capable && scene && (
				<Boundary onError={() => setStatus('error')}>
					<Canvas
						style={{ position: 'absolute', inset: 0 }}
						shadows
						camera={{ position: [5.5, 5, 6.1], fov: 44 }}
						renderer={async (props: { canvas: HTMLCanvasElement }) => {
							const renderer = new WebGPURenderer({ canvas: props.canvas, antialias: true })
							await renderer.init()
							if (!(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend) {
								renderer.dispose()
								setStatus('unsupported')
								throw new Error('WebGPU is required')
							}
							return renderer
						}}
					>
						<ReportBackend onStatus={setStatus} />
						<World scene={scene} generation={generation} cameraMode={cameraMode} />
					</Canvas>
				</Boundary>
			)}
			{(!scene || status === 'unsupported' || status === 'error') && (
				<div className="flex h-full min-h-[420px] items-center justify-center px-8">
					<p className="max-w-md text-center text-muted-foreground text-sm">
						{status === 'unsupported'
							? 'Use a browser with WebGPU support to see your caretaker. The server connection remains available.'
							: status === 'error'
								? 'Reload the page to retry the 3D preview.'
								: 'Your greenhouse will appear when the Python server connects.'}
					</p>
				</div>
			)}
		</section>
	)
}
