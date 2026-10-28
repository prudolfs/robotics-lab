import { OrbitControls } from '@react-three/drei/webgpu'
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu'
import { Component, type ReactNode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Group } from 'three'
import { MathUtils, WebGPURenderer } from 'three/webgpu'
import { Button } from '@/components/ui/button'
import './styles.css'

type Snapshot = {
	version: number
	generation: number
	tick: number
	time: number
	robot: { id: string; x: number; y: number; heading: number; holding: boolean }
	capsule: { id: string; position: [number, number, number] }
	tray: { id: string; position: [number, number, number] }
	success: boolean
}
type Recording = { kind: string; seed: number; frames: Snapshot[]; final: Snapshot }
type ProbeMetrics = {
	backend: string
	frame: number
	robot: number[]
	capsule: number[]
	generation: number
}
declare global {
	interface Window {
		__greenhouseProbe?: ProbeMetrics
	}
}

// Python is right-handed Z-up; Three.js is right-handed Y-up.
function toView([x, y, z]: [number, number, number]): [number, number, number] {
	return [x, z, -y]
}

function Backend({ onBackend }: { onBackend: (value: string) => void }) {
	const renderer = useThree((state) => state.renderer as WebGPURenderer)
	useEffect(() => {
		const active = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend
		onBackend(active ? 'webgpu' : 'unsupported')
	}, [renderer, onBackend])
	return null
}

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
		<mesh castShadow receiveShadow position={position}>
			<boxGeometry args={size} />
			<meshStandardMaterial color={color} roughness={0.85} />
		</mesh>
	)
}

function World({
	recording,
	playing,
	generation,
	progress,
}: {
	recording: Recording
	playing: boolean
	generation: number
	progress: number
}) {
	const robot = useRef<Group>(null)
	const capsule = useRef<Group>(null)
	const gripper = useRef<Group>(null)
	const timeline = useRef({ elapsed: 0, generation: -1, progress: -1 })
	useFrame((_, delta) => {
		const cursor = timeline.current
		if (cursor.generation !== generation || cursor.progress !== progress) {
			cursor.elapsed = progress * recording.final.time
			cursor.generation = generation
			cursor.progress = progress
		}
		if (playing) cursor.elapsed = Math.min(recording.final.time, cursor.elapsed + delta)
		const frames = recording.frames
		let i = Math.min(frames.length - 1, Math.floor(cursor.elapsed / 0.1))
		if (cursor.elapsed >= recording.final.time) i = frames.length - 1
		const a = frames[i]
		const b = frames[i + 1] ?? recording.final
		const alpha =
			a.time === b.time ? 0 : MathUtils.clamp((cursor.elapsed - a.time) / (b.time - a.time), 0, 1)
		const x = MathUtils.lerp(a.robot.x, b.robot.x, alpha)
		const y = MathUtils.lerp(a.robot.y, b.robot.y, alpha)
		const heading =
			a.robot.heading +
			Math.atan2(
				Math.sin(b.robot.heading - a.robot.heading),
				Math.cos(b.robot.heading - a.robot.heading),
			) *
				alpha
		const p = a.capsule.position.map((value, index) =>
			MathUtils.lerp(value, b.capsule.position[index], alpha),
		) as [number, number, number]
		// Attachment/release transitions are discrete, never interpolated through a shelf/floor.
		const discrete = alpha < 1 ? a : b
		if (a.robot.holding !== b.robot.holding) p.splice(0, 3, ...discrete.capsule.position)
		robot.current?.position.set(x, 0, -y)
		robot.current?.rotation.set(0, heading, 0)
		capsule.current?.position.set(...toView(p))
		if (gripper.current) gripper.current.position.y = discrete.robot.holding ? 0.21 : 0
		window.__greenhouseProbe = {
			backend: window.__greenhouseProbe?.backend ?? 'webgpu',
			frame: i,
			robot: [x, 0, -y, heading],
			capsule: toView(p),
			generation,
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
			<Box position={[0, 0.17, -2.05]} size={[6.2, 0.34, 0.1]} color="#71816b" />
			<Box position={[-3.05, 0.17, 0]} size={[0.1, 0.34, 4]} color="#71816b" />
			{[-2.9, 0, 2.9].map((x) => (
				<group key={x}>
					<Box position={[x, 1.1, -1.96]} size={[0.05, 2.2, 0.05]} color="#708071" />
					<Box position={[x, 2.35, -0.95]} size={[0.05, 0.05, 2.8]} color="#708071" />
				</group>
			))}
			{[-2, -1, 0, 1, 2].map((x) => (
				<group key={x} position={[x, 0, -1.65]}>
					<mesh castShadow position={[0, 0.16, 0]}>
						<cylinderGeometry args={[0.15, 0.11, 0.3, 16]} />
						<meshStandardMaterial color="#9a7756" />
					</mesh>
					<mesh castShadow position={[0, 0.4, 0]} scale={[1, 1.4, 1]}>
						<icosahedronGeometry args={[0.16, 1]} />
						<meshStandardMaterial color="#618353" />
					</mesh>
				</group>
			))}
			<Box position={[1.65, 0.035, -0.65]} size={[0.65, 0.07, 0.65]} color="#728a63" />
			<Box position={[-1.75, 0.02, 0.75]} size={[0.75, 0.04, 0.65]} color="#738374" />
			<group ref={robot}>
				<Box position={[0, 0.21, 0]} size={[0.42, 0.28, 0.36]} color="#e7dfb2" />
				{[-0.22, 0.22].map((z) => (
					<mesh key={z} position={[0, 0.14, z]} rotation={[Math.PI / 2, 0, 0]} castShadow>
						<cylinderGeometry args={[0.14, 0.14, 0.08, 20]} />
						<meshStandardMaterial color="#374b42" />
					</mesh>
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
					{[-0.08, 0.08].map((z) => (
						<Box key={z} position={[0.28, 0.07, z]} size={[0.22, 0.035, 0.025]} color="#657963" />
					))}
				</group>
			</group>
			<group ref={capsule}>
				<mesh castShadow>
					<sphereGeometry args={[0.05, 16, 12]} />
					<meshStandardMaterial color="#d2943e" />
				</mesh>
			</group>
			<OrbitControls makeDefault target={[0, 0.2, 0]} maxPolarAngle={Math.PI / 2.1} />
		</>
	)
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

function App() {
	const [recording, setRecording] = useState<Recording | null>(null)
	const [backend, setBackend] = useState('loading')
	const [error, setError] = useState('')
	const [playing, setPlaying] = useState(false)
	const [generation, setGeneration] = useState(0)
	const [progress, setProgress] = useState(0)
	const [mounted, setMounted] = useState(true)
	useEffect(() => {
		fetch('/python-snapshots.json')
			.then((response) => {
				if (!response.ok) throw new Error(`Snapshot request failed: ${response.status}`)
				return response.json()
			})
			.then(setRecording)
			.catch((cause) => setError(String(cause)))
		if (!('gpu' in navigator) || !navigator.gpu) setBackend('unsupported')
	}, [])
	return (
		<main className="flex min-h-screen flex-col bg-background text-foreground">
			<header className="flex flex-wrap items-center justify-between gap-4 border-border border-b px-6 py-5">
				<div>
					<h1 className="font-medium text-xl">Greenhouse Caretaker</h1>
					<p className="mt-1 text-muted-foreground text-sm">
						A small robot learning to lend a hand.
					</p>
				</div>
				<div className="text-right text-sm">
					<p data-testid="backend">
						{backend === 'webgpu'
							? 'WebGPU active'
							: backend === 'unsupported'
								? 'WebGPU is unavailable'
								: backend}
					</p>
					<p className="mt-1 text-muted-foreground">Phase 0 · recorded Python policy</p>
				</div>
			</header>
			<section
				aria-label="Greenhouse simulation"
				className="relative min-h-[420px] flex-1"
				style={{ height: 'calc(100vh - 230px)' }}
			>
				{recording && mounted && backend !== 'unsupported' && (
					<Boundary onError={() => setBackend('error')}>
						<Canvas
							shadows
							camera={{ position: [5.5, 5.0, 6.1], fov: 44 }}
							renderer={async (props: { canvas: HTMLCanvasElement }) => {
								const renderer = new WebGPURenderer({ canvas: props.canvas, antialias: true })
								await renderer.init()
								if (!(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend) {
									renderer.dispose()
									setBackend('unsupported')
									throw new Error('An active WebGPU backend is required')
								}
								return renderer
							}}
						>
							<Backend onBackend={setBackend} />
							<World
								recording={recording}
								playing={playing}
								generation={generation}
								progress={progress}
							/>
						</Canvas>
					</Boundary>
				)}
				{backend === 'unsupported' && (
					<p className="p-8">
						Open this probe in a browser with WebGPU support to inspect the greenhouse.
					</p>
				)}
				{error && (
					<p role="alert" className="p-8">
						{error}
					</p>
				)}
			</section>
			<footer className="flex flex-col gap-4 border-border border-t px-6 py-5">
				<div className="flex flex-wrap items-center gap-3">
					<Button disabled={backend !== 'webgpu'} onClick={() => setPlaying((value) => !value)}>
						{playing ? 'Pause playback' : 'Play recording'}
					</Button>
					<Button
						variant="secondary"
						disabled={!recording}
						onClick={() => {
							setPlaying(false)
							setProgress(0)
							setGeneration((value) => value + 1)
						}}
					>
						Reset recording
					</Button>
					<Button
						variant="outline"
						disabled={!recording}
						onClick={() => {
							setPlaying(false)
							setProgress(1)
							setGeneration((value) => value + 1)
						}}
					>
						Show delivery
					</Button>
					<Button
						variant="ghost"
						disabled={backend !== 'webgpu'}
						onClick={() => setMounted((value) => !value)}
					>
						Toggle canvas
					</Button>
					<p className="text-muted-foreground text-sm">
						Seed {recording?.seed ?? '…'} · capsule → collection tray
					</p>
				</div>
				<p className="max-w-3xl text-muted-foreground text-sm">
					Placeholder geometry. Playback uses Python snapshots with ideal target sensing and a
					simplified grasp. Live simulation and teaching controls follow in later phases.
				</p>
			</footer>
		</main>
	)
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing root')
createRoot(root).render(<App />)
