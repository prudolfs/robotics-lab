import { Canvas } from '@react-three/fiber'
import { FpsCounter, RobotView, SimulatorScene, WorldView } from '@robotics-lab/rendering'
import { useCallback, useState } from 'react'
import { DebugOverlay } from '@/components/debug-overlay'
import { Button } from '@/components/ui/button'
import { useSimulationLoop } from '@/sim/use-simulation-loop'
import { useSimulatorStore } from '@/store'

const CAMERA = { position: [6, 6, 6] as const, fov: 50, near: 0.2, far: 1000 }

export default function App() {
	const [fps, setFps] = useState(0)
	const handleFps = useCallback((value: number) => setFps(Math.round(value)), [])

	const mapNames = useSimulatorStore((s) => s.mapNames)
	const selectedMap = useSimulatorStore((s) => s.selectedMap)
	const world = useSimulatorStore((s) => s.world)
	const robot = useSimulatorStore((s) => s.robot)
	const simTime = useSimulatorStore((s) => s.simTime)
	const running = useSimulatorStore((s) => s.running)
	const selectMap = useSimulatorStore((s) => s.selectMap)

	const controls = useSimulationLoop()

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
				<span className="font-mono text-muted-foreground text-sm">
					Sim time: {simTime.toFixed(2)}s
				</span>
			</div>

			<div className="absolute top-4 left-1/2 flex -translate-x-1/2 items-center gap-2">
				<Button
					variant={running ? 'default' : 'outline'}
					onClick={controls.togglePause}
					className="pointer-events-auto"
				>
					{running ? 'Pause' : 'Resume'}
				</Button>
				<Button variant="outline" onClick={controls.reset} className="pointer-events-auto">
					Reset
				</Button>
			</div>

			<DebugOverlay robot={robot} onReset={controls.reset} />

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
