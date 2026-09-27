import { OrbitControls, useGLTF } from '@react-three/drei/webgpu'
import { Canvas, useThree } from '@react-three/fiber/webgpu'
import { Suspense, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { WebGPURenderer } from 'three/webgpu'

type BackendState = 'loading' | 'webgpu' | 'webgl-fallback' | 'error'

function ReportBackend({ onBackend }: { onBackend: (state: BackendState) => void }) {
	const renderer = useThree((state) => state.renderer as WebGPURenderer)
	useEffect(() => {
		const backend = renderer.backend as { isWebGPUBackend?: boolean }
		onBackend(backend?.isWebGPUBackend ? 'webgpu' : 'webgl-fallback')
	}, [renderer, onBackend])
	return null
}

function SampleModel({ onLoaded }: { onLoaded: () => void }) {
	const { scene } = useGLTF('/assets/slam/workbench.glb', { draco: '/assets/slam/draco/' })
	useEffect(() => onLoaded(), [onLoaded])
	return <primitive object={scene} position={[0, 0.12, 0]} scale={1.5} />
}

function App() {
	const [backend, setBackend] = useState<BackendState>('loading')
	const [mounted, setMounted] = useState(true)
	const [modelLoaded, setModelLoaded] = useState(false)
	const [error, setError] = useState('')
	return (
		<div
			style={{ height: '100vh', background: '#111a20', color: '#e6eded', fontFamily: 'sans-serif' }}
		>
			<div
				style={{
					position: 'absolute',
					zIndex: 1,
					margin: 20,
					padding: 14,
					background: '#162128df',
					borderRadius: 8,
				}}
			>
				<strong>Warehouse WebGPU probe</strong>
				<p data-testid="backend">Backend: {backend}</p>
				<p data-testid="model">GLB loaded: {String(modelLoaded)}</p>
				<p data-testid="error">{error}</p>
				<button type="button" onClick={() => setMounted((value) => !value)}>
					Toggle canvas
				</button>
			</div>
			{mounted && (
				<Canvas
					shadows
					camera={{ position: [3.4, 2.7, 4.3], fov: 50 }}
					renderer={async (props: { canvas: HTMLCanvasElement }) => {
						try {
							const renderer = new WebGPURenderer({
								canvas: props.canvas as HTMLCanvasElement,
								antialias: true,
							})
							await renderer.init()
							return renderer
						} catch (cause) {
							setError(String(cause))
							setBackend('error')
							throw cause
						}
					}}
				>
					<color attach="background" args={['#1b2930']} />
					<ambientLight intensity={1.3} />
					<directionalLight
						castShadow
						position={[2, 5, 3]}
						intensity={2.5}
						shadow-mapSize={[1024, 1024]}
					/>
					<mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
						<planeGeometry args={[6, 6]} />
						<meshStandardMaterial color="#71848c" roughness={0.85} />
					</mesh>
					<mesh castShadow position={[-1.3, 0.5, 0]}>
						<boxGeometry args={[0.6, 1, 0.6]} />
						<meshStandardMaterial color="#85dbc5" roughness={0.4} />
					</mesh>
					<Suspense fallback={null}>
						<SampleModel onLoaded={() => setModelLoaded(true)} />
					</Suspense>
					<OrbitControls makeDefault target={[0, 0.6, 0]} />
					<ReportBackend onBackend={setBackend} />
				</Canvas>
			)}
		</div>
	)
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing probe root')
createRoot(root).render(<App />)
