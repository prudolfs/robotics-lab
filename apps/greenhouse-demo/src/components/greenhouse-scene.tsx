import { OrbitControls } from '@react-three/drei/webgpu'
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu'
import {
	Component,
	type ReactNode,
	Suspense,
	useCallback,
	useEffect,
	useRef,
	useState,
} from 'react'
import type { PerspectiveCamera } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three/addons/controls/OrbitControls.js'
import { MathUtils, Vector3, WebGPURenderer } from 'three/webgpu'
import type { Scene } from '../api/client'
import { AuthoredAssets, type CaretakerRig } from './authored-assets'

type RendererStatus = 'loading' | 'webgpu' | 'unsupported' | 'error'
export type CameraMode = 'overview' | 'follow' | 'eye'

// Bounded, read-only presentation diagnostics for reproducible browser reviews.
declare global {
	interface Window {
		__greenhouseReview?: {
			frameMs: number[]
			drawCalls: number
			triangles: number
			memory: { geometries: number; textures: number; total: number }
			pose?: {
				robot: number[]
				capsule: number[]
				lift: number
				leftWheel: number
				headPan: number
				headPitch: number
				lids: boolean[]
				holding: boolean
			}
		}
	}
}

function World({
	scene,
	generation,
	cameraMode,
	onReady,
}: {
	scene: Scene
	generation: number
	cameraMode: CameraMode
	onReady: () => void
}) {
	const rig = useRef<CaretakerRig | null>(null)
	const expression = useRef({ stage: scene.stage, at: performance.now() })
	const eyeTarget = useRef(new Vector3())
	const frame = useRef({ previous: scene, current: scene, generation, received: performance.now() })
	const camera = useThree((state) => state.camera)
	const size = useThree((state) => state.size)
	const controls = useThree((state) => state.controls) as OrbitControlsImpl | null
	const target = useRef(new Vector3())
	const cameraPosition = useRef(new Vector3())
	const reduced = useRef(false)
	useEffect(() => {
		const preference = matchMedia('(prefers-reduced-motion: reduce)')
		const update = () => {
			reduced.current = preference.matches
		}
		update()
		preference.addEventListener('change', update)
		return () => preference.removeEventListener('change', update)
	}, [])
	useEffect(() => {
		if (expression.current.stage !== scene.stage)
			expression.current = { stage: scene.stage, at: performance.now() }
		const old = frame.current
		const interpolate =
			generation === old.generation &&
			scene.status === 'running' &&
			old.current.status === 'running' &&
			scene.robot.holding === old.current.robot.holding &&
			scene.capsule.id === old.current.capsule.id
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
		const perspective = camera as PerspectiveCamera
		perspective.near = cameraMode === 'eye' ? 0.015 : 0.1
		perspective.fov = cameraMode === 'eye' ? 68 : 44
		perspective.updateProjectionMatrix()
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
		const character = rig.current
		if (character) {
			character.root.position.set(x, 0, -y)
			character.root.rotation.set(0, heading, 0)
			character.capsule.position.set(
				mix(a.capsule.position.x, b.capsule.position.x),
				mix(a.capsule.position.z, b.capsule.position.z),
				-mix(a.capsule.position.y, b.capsule.position.y),
			)
			character.lift.position.y = mix(a.robot.lift_height, b.robot.lift_height)
			character.leftWheel.rotation.z = -mix(a.robot.left_wheel_angle, b.robot.left_wheel_angle)
			character.rightWheel.rotation.z = -mix(a.robot.right_wheel_angle, b.robot.right_wheel_angle)
			character.leftJaw.position.z = -(b.robot.holding ? 0.0625 : 0.09)
			character.rightJaw.position.z = b.robot.holding ? 0.0625 : 0.09
			// Presentation only: attention, blink and completion nod never feed physics.
			const tx = b.robot.holding ? b.tray.position.x : b.capsule.position.x
			const ty = b.robot.holding ? b.tray.position.y : b.capsule.position.y
			const bearing = Math.atan2(ty - y, tx - x) - heading
			const elapsed = (performance.now() - expression.current.at) / 1000
			const nod =
				(b.stage === 'lift' || b.stage === 'done') && elapsed < 0.65
					? Math.sin((elapsed / 0.65) * Math.PI * 2) * 0.13
					: 0
			character.headPan.rotation.y = reduced.current
				? 0
				: MathUtils.clamp(Math.atan2(Math.sin(bearing), Math.cos(bearing)), -0.45, 0.45)
			character.headPitch.rotation.z = reduced.current ? 0 : -0.18 + nod
			const blinkPhase = (performance.now() / 1000) % 5.3
			const blink =
				reduced.current || blinkPhase > 0.22 ? 0 : Math.sin((blinkPhase / 0.22) * Math.PI)
			for (const lid of character.lids) {
				lid.visible = blink > 0.02
				lid.scale.y = Math.max(0.001, blink)
			}
			const color =
				b.status === 'failed'
					? '#d67958'
					: b.status === 'paused'
						? '#8eafc6'
						: b.status === 'ready'
							? '#d8b46a'
							: '#b4dea2'
			character.lamp.color.set(color)
			character.lamp.emissive.set(color)
			character.lamp.emissiveIntensity = 0.6
			if (window.__greenhouseReview)
				window.__greenhouseReview.pose = {
					robot: character.root.position.toArray(),
					capsule: character.capsule.position.toArray(),
					lift: character.lift.position.y,
					leftWheel: character.leftWheel.rotation.z,
					headPan: character.headPan.rotation.y,
					headPitch: character.headPitch.rotation.z,
					lids: character.lids.map((lid) => lid.visible),
					holding: b.robot.holding,
				}
			if (cameraMode === 'eye') {
				character.root.updateWorldMatrix(true, true)
				character.eye.getWorldPosition(camera.position)
				eyeTarget.current.set(1.5, -0.12, 0)
				character.eye.localToWorld(eyeTarget.current)
				camera.lookAt(eyeTarget.current)
			}
		}
		if (cameraMode === 'follow') {
			const ease = reduced.current ? 1 : 1 - Math.exp(-delta * 7)
			target.current.set(x, 0.3, -y)
			cameraPosition.current.set(x + 1.35, 1.25, -y + 1.65)
			camera.position.lerp(cameraPosition.current, ease)
			controls?.target.lerp(target.current, ease)
			camera.lookAt(controls?.target ?? target.current)
			controls?.update()
		}
	})
	return (
		<>
			<color attach="background" args={['#d8e0d1']} />
			<hemisphereLight args={['#fff0d0', '#617565', 2]} />
			<directionalLight
				castShadow
				position={[-3, 7, 4]}
				color="#fff1d5"
				shadow-camera-left={-4}
				shadow-camera-right={4}
				shadow-camera-top={4}
				shadow-camera-bottom={-4}
				shadow-normalBias={0.008}
				intensity={2.5}
				shadow-mapSize={[2048, 2048]}
			/>
			<AuthoredAssets scene={scene} rigRef={rig} onReady={onReady} />
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
	const world = useThree((state) => state.scene)
	useFrame((_, delta) => {
		const review = window.__greenhouseReview
		if (!review) return
		review.frameMs.push(delta * 1000)
		if (review.frameMs.length > 600) review.frameMs.shift()
	})
	useEffect(() => {
		const previous = world.onAfterRender
		world.onAfterRender = (...args) => {
			previous.apply(world, args)
			const review = window.__greenhouseReview
			if (!review) return
			review.drawCalls = renderer.info.render.drawCalls
			review.triangles = renderer.info.render.triangles
			review.memory = {
				geometries: renderer.info.memory.geometries,
				textures: renderer.info.memory.textures,
				total: renderer.info.memory.total,
			}
		}
		return () => {
			world.onAfterRender = previous
		}
	}, [renderer, world])
	useEffect(() => {
		window.__greenhouseReview = {
			frameMs: [],
			drawCalls: 0,
			triangles: 0,
			memory: { geometries: 0, textures: 0, total: 0 },
		}
		onStatus(
			(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend
				? 'webgpu'
				: 'unsupported',
		)
		return () => {
			delete window.__greenhouseReview
		}
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
	const [assetsReady, setAssetsReady] = useState(false)
	const ready = useCallback(() => setAssetsReady(true), [])
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
		<section
			aria-label="Greenhouse simulation"
			className="relative min-h-0 min-w-0 flex-1 bg-muted"
		>
			<p
				data-testid="renderer-status"
				className="absolute top-4 left-5 z-10 rounded-md bg-background/90 px-3 py-2 text-muted-foreground text-xs"
			>
				{status === 'webgpu'
					? assetsReady
						? 'WebGPU active'
						: 'Loading greenhouse assets…'
					: status === 'unsupported'
						? 'WebGPU is unavailable'
						: status === 'error'
							? 'The 3D preview could not start'
							: 'Preparing 3D preview…'}
			</p>
			{capable && scene && (
				<Suspense fallback={null}>
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
							<Suspense fallback={null}>
								<World
									scene={scene}
									generation={generation}
									cameraMode={cameraMode}
									onReady={ready}
								/>
							</Suspense>
						</Canvas>
					</Boundary>
				</Suspense>
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
