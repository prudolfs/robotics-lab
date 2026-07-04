import { Canvas } from '@react-three/fiber'
import { FpsCounter, RobotView, SimulatorScene, WorldView } from '@robotics-lab/rendering'
import { useCallback, useState } from 'react'
import { DebugOverlay } from '@/components/debug-overlay'
import { Button } from '@/components/ui/button'
import { useSimulatorStore } from '@/store'

const CAMERA = { position: [6, 6, 6] as const, fov: 50, near: 0.2, far: 1000 }

export default function App() {
	const [fps, setFps] = useState(0)
	const handleFps = useCallback((value: number) => setFps(Math.round(value)), [])

	const mapNames = useSimulatorStore((s) => s.mapNames)
	const selectedMap = useSimulatorStore((s) => s.selectedMap)
	const world = useSimulatorStore((s) => s.world)
	const robot = useSimulatorStore((s) => s.robot)
	const selectMap = useSimulatorStore((s) => s.selectMap)
	const resetRobot = useSimulatorStore((s) => s.resetRobot)

	return (
		<div className="relative h-screen w-screen overflow-hidden bg-background">
			<Canvas shadows gl={{ antialias: true }} camera={CAMERA}>
				<SimulatorScene>
					<FpsCounter onUpdate={handleFps} />
					<WorldView world={world} />
					<RobotView pose={robot.pose} params={robot.params} />
				</SimulatorScene>
			</Canvas>

			<div className="pointer-events-none absolute top-4 left-4 flex flex-col gap-1">
				<h1 className="font-semibold text-foreground text-lg">Robotics Lab — Simulator</h1>
				<span className="font-mono text-muted-foreground text-sm">FPS: {fps}</span>
				<span className="font-mono text-muted-foreground text-sm">Map: {world.name}</span>
			</div>

			<DebugOverlay robot={robot} onReset={resetRobot} />

			<div className="absolute top-4 right-4 flex flex-col items-end gap-2">
				<span className="font-medium text-muted-foreground text-xs uppercase">Map</span>
				<div className="flex flex-wrap justify-end gap-2">
					{mapNames.map((name) => (
						<Button
							key={name}
							variant={name === selectedMap ? 'default' : 'outline'}
							onClick={() => selectMap(name)}
							className="pointer-events-auto"
						>
							{name}
						</Button>
					))}
				</div>
			</div>
		</div>
	)
}
