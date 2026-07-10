import { Canvas } from '@react-three/fiber'
import {
	E2EBridge,
	FpsCounter,
	GoalPicker,
	GoalView,
	LidarView,
	OccupancyGridView,
	OdometryView,
	PathView,
	RobotView,
	SimulatorScene,
	WorldView,
} from '@robotics-lab/rendering'
import { useCallback } from 'react'
import { DndProvider } from '@/components/dnd-context'
import { DropZones } from '@/components/drop-zones'
import { FooterStatusBar } from '@/components/footer-status-bar'
import { RightPanel } from '@/components/right-panel'
import { TopAppBar } from '@/components/top-app-bar'
import { ViewportWidgetsLayer } from '@/components/viewport-widgets-layer'
import { useSimulationLoop } from '@/sim/use-simulation-loop'
import { useSimulatorStore } from '@/store'

// The main orbit camera config.
const CAMERA = { position: [6, 6, 6] as const, fov: 50, near: 0.2, far: 1000 }

export default function App() {
	const setFps = useSimulatorStore((s) => s.setFps)
	const world = useSimulatorStore((s) => s.world)
	const robot = useSimulatorStore((s) => s.robot)
	const scan = useSimulatorStore((s) => s.scan)
	const grid = useSimulatorStore((s) => s.grid)
	const goals = useSimulatorStore((s) => s.goals)
	const setGoal = useSimulatorStore((s) => s.setGoal)
	const addGoal = useSimulatorStore((s) => s.addGoal)
	const path = useSimulatorStore((s) => s.path)
	const planOpen = useSimulatorStore((s) => s.planOpen)
	const planClosed = useSimulatorStore((s) => s.planClosed)
	const showOccupancy = useSimulatorStore((s) => s.showOccupancy)
	const showLidar = useSimulatorStore((s) => s.showLidar)
	const showPath = useSimulatorStore((s) => s.showPath)
	const showOdometry = useSimulatorStore((s) => s.showOdometry)
	const odometryPose = useSimulatorStore((s) => s.odometryPose)
	const odometryHistory = useSimulatorStore((s) => s.odometryHistory)

	const controls = useSimulationLoop()

	const handleFps = useCallback((value: number) => setFps(Math.round(value)), [setFps])

	// Click destination on the floor: replace the goal queue, or append (Shift).
	const handlePick = useCallback(
		(point: { x: number; y: number }, event: { shiftKey?: boolean }) => {
			if (event.shiftKey) addGoal(point)
			else setGoal(point)
		},
		[setGoal, addGoal],
	)

	return (
		<div
			data-testid="simulation-viewport"
			className="relative h-screen w-screen overflow-hidden bg-background"
		>
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
					{showOdometry && <OdometryView history={odometryHistory} pose={odometryPose} />}
					<E2EBridge />
				</SimulatorScene>
			</Canvas>

			{/* Phase 3 app shell: the formerly-scattered top-left HUD + top-centre
			   controls fold into the top app bar; the fps/sim-time readouts move
			   to the footer. The right panel insets move to top-12 bottom-8. */}
			<TopAppBar controls={controls} />
			<FooterStatusBar />

			{/* dnd-kit context owns the drag (panel handles + popped re-dock
			   handles) and the edge drop zones. Everything that drags or drops
			   must be inside. */}
			<DndProvider>
				<RightPanel controls={controls} onReset={controls.reset} />

				{/* Edge drop zones shown while a widget handle is being dragged out of
				   the panel; and the popped-widget overlay layer (docked copies). */}
				<DropZones />
				<ViewportWidgetsLayer controls={controls} onReset={controls.reset} />
			</DndProvider>
		</div>
	)
}
