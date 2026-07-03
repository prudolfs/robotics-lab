import { Canvas } from '@react-three/fiber'
import { FpsCounter, SimulatorScene } from '@robotics-lab/rendering'
import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'

export default function App() {
	const [fps, setFps] = useState(0)
	const handleFps = useCallback((value: number) => setFps(Math.round(value)), [])

	return (
		<div className="relative h-screen w-screen overflow-hidden bg-background">
			<Canvas shadows gl={{ antialias: true }} camera={{ position: [6, 6, 6], fov: 50 }}>
				<SimulatorScene>
					<FpsCounter onUpdate={handleFps} />
				</SimulatorScene>
			</Canvas>

			<div className="pointer-events-none absolute top-4 left-4 flex flex-col gap-2">
				<h1 className="font-semibold text-foreground text-lg">Robotics Lab — Simulator</h1>
				<span className="font-mono text-muted-foreground text-sm">FPS: {fps}</span>
			</div>

			<div className="absolute top-4 right-4">
				<Button variant="outline">Milestone 0 · Setup</Button>
			</div>
		</div>
	)
}
