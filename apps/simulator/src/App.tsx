import { Canvas } from '@react-three/fiber'
import {
	FpsCounter,
	GoalPicker,
	GoalView,
	LidarView,
	OccupancyGridView,
	OccupancyMinimap,
	PathView,
	RobotCameraViewport,
	RobotView,
	SimulatorScene,
	WorldView,
} from '@robotics-lab/rendering'
import { useCallback, useState } from 'react'
import { DebugOverlay } from '@/components/debug-overlay'
import { MapHud } from '@/components/map-hud'
import { NavigationHud } from '@/components/navigation-hud'
import { SensorHud } from '@/components/sensor-hud'
import { TeleopHud } from '@/components/teleop-hud'
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
	const scan = useSimulatorStore((s) => s.scan)
	const grid = useSimulatorStore((s) => s.grid)
	const showLidar = useSimulatorStore((s) => s.showLidar)
	const showCamera = useSimulatorStore((s) => s.showCamera)
	const showOccupancy = useSimulatorStore((s) => s.showOccupancy)
	const showMinimap = useSimulatorStore((s) => s.showMinimap)
	const selectMap = useSimulatorStore((s) => s.selectMap)
	const goals = useSimulatorStore((s) => s.goals)
	const setGoal = useSimulatorStore((s) => s.setGoal)
	const addGoal = useSimulatorStore((s) => s.addGoal)
	const path = useSimulatorStore((s) => s.path)
	const planOpen = useSimulatorStore((s) => s.planOpen)
	const planClosed = useSimulatorStore((s) => s.planClosed)
	const showPath = useSimulatorStore((s) => s.showPath)

	const controls = useSimulationLoop()

	// Click destination on the floor: replace the goal queue, or append (Shift).
	const handlePick = useCallback(
		(point: { x: number; y: number }, event: { shiftKey?: boolean }) => {
			if (event.shiftKey) addGoal(point)
			else setGoal(point)
		},
		[setGoal, addGoal],
	)

	// Camera look tilt (radians); user-controlled via drag on the viewport.
	const [pitch, setPitch] = useState(0)

	return (
		<div className="relative h-screen w-screen overflow-hidden bg-background">
			<Canvas data-testid="simulator-canvas" shadows gl={{ antialias: true }} camera={CAMERA}>
				<SimulatorScene>
					<FpsCounter onUpdate={handleFps} />
					<WorldView world={world} />
					<RobotView pose={robot.pose} params={robot.params} />
					{showOccupancy && <OccupancyGridView data-testid="occupancy-grid-overlay" grid={grid} />}
					{showLidar && <LidarView scan={scan} />}
					<GoalView pose={robot.pose} goals={goals} />
					{showPath && (
						<PathView closed={planClosed} open={planOpen} path={path} pose={robot.pose} />
					)}
					<GoalPicker world={world} onPick={handlePick} />
				</SimulatorScene>
			</Canvas>

			<div
				data-testid="simulator-hud"
				className="pointer-events-none absolute top-4 left-4 flex flex-col gap-1"
			>
				<h1 className="font-semibold text-foreground text-lg">Robotics Lab — Simulator</h1>
				<span data-testid="fps-counter" className="font-mono text-muted-foreground text-sm">
					FPS: {fps}
				</span>
				<span className="font-mono text-muted-foreground text-sm">Map: {world.name}</span>
				<span data-testid="sim-time" className="font-mono text-muted-foreground text-sm">
					Sim time: {simTime.toFixed(2)}s
				</span>
				{robot && (
					<span data-testid="robot-marker" className="sr-only" aria-hidden="true">
						robot present
					</span>
				)}
			</div>

			<div className="pointer-events-none absolute top-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
				<div className="flex items-center gap-2">
					<Button
						data-testid="pause-resume-button"
						variant={running ? 'default' : 'outline'}
						onClick={controls.togglePause}
						className="pointer-events-auto"
					>
						{running ? 'Pause' : 'Resume'}
					</Button>
					<Button
						data-testid="reset-button"
						variant="outline"
						onClick={controls.reset}
						className="pointer-events-auto"
					>
						Reset
					</Button>
				</div>
				<div className="flex flex-wrap justify-center gap-2">
					{mapNames.map((name) => (
						<Button
							key={name}
							variant={name === selectedMap ? 'default' : 'outline'}
							onClick={() => selectMap(name)}
							size="xs"
							className="pointer-events-auto"
						>
							{name}
						</Button>
					))}
				</div>
			</div>

			<DebugOverlay robot={robot} onReset={controls.reset} />

			<TeleopHud controls={controls} />
			<SensorHud />
			<MapHud />
			<NavigationHud controls={controls} />

			{showCamera && (
				<RobotCameraViewport
					world={world}
					pose={robot.pose}
					robotParams={robot.params}
					active={showCamera}
					pitch={pitch}
					onPitch={setPitch}
					className="pointer-events-auto absolute bottom-4 left-1/2 h-48 w-64 -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-black/80 backdrop-blur-sm"
				/>
			)}

			{showMinimap && (
				<div data-testid="occupancy-minimap" className="pointer-events-none absolute top-1/2 left-4 flex -translate-y-1/2 flex-col gap-1">
					<span className="font-mono text-[10px] text-muted-foreground">Minimap</span>
					<div className="rounded-lg border border-border bg-card/80 p-1 backdrop-blur-sm">
						<OccupancyMinimap
							grid={grid}
							world={world}
							pose={robot.pose}
							scan={scan}
							className="block h-40 w-40 rounded"
						/>
					</div>
				</div>
			)}
		</div>
	)
}
