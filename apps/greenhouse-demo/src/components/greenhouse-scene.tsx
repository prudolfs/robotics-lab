import { OrbitControls } from '@react-three/drei/webgpu'
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu'
import { Component, type ReactNode, useEffect, useRef, useState } from 'react'
import type { Group } from 'three'
import { WebGPURenderer } from 'three/webgpu'
import type { Scene } from '../api/client'

type RendererStatus = 'loading' | 'webgpu' | 'unsupported' | 'error'

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

function World({ scene }: { scene: Scene }) {
	const robot = useRef<Group>(null)
	const capsule = useRef<Group>(null)
	// These transforms only present the latest Python snapshot. No client physics.
	useFrame(() => {
		robot.current?.position.set(scene.robot.x, 0, -scene.robot.y)
		robot.current?.rotation.set(0, scene.robot.heading, 0)
		const { x, y, z } = scene.capsule.position
		capsule.current?.position.set(x, z, -y)
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
			<Box
				position={[scene.tray.position.x, scene.tray.position.z, -scene.tray.position.y]}
				size={[0.65, 0.07, 0.65]}
				color="#728a63"
			/>
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
				{[-0.08, 0.08].map((z) => (
					<Box key={z} position={[0.28, 0.07, z]} size={[0.22, 0.035, 0.025]} color="#657963" />
				))}
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

export function GreenhouseScene({ scene }: { scene: Scene | null }) {
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
		<section aria-label="Greenhouse preview" className="relative min-h-[420px] flex-1 bg-muted">
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
						<World scene={scene} />
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
