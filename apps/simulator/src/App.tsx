import { Canvas } from '@react-three/fiber'
import type { World } from '@robotics-lab/core'
import {
	E2EBridge,
	EditorOverlay,
	EditorPicker,
	type EditorSelectionView,
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
import { useCallback, useEffect, useState } from 'react'
import { DndProvider } from '@/components/dnd-context'
import { DropZones } from '@/components/drop-zones'
import { FooterStatusBar } from '@/components/footer-status-bar'
import { RightPanel } from '@/components/right-panel'
import { TopAppBar } from '@/components/top-app-bar'
import { ViewportWidgetsLayer } from '@/components/viewport-widgets-layer'
import { useSimulationLoop } from '@/sim/use-simulation-loop'
import { type EditorSelection, useSimulatorStore } from '@/store'

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
	const theme = useSimulatorStore((s) => s.theme)

	// Editor (milestone 12).
	const editorTool = useSimulatorStore((s) => s.editorTool)
	const wallStart = useSimulatorStore((s) => s.wallStart)
	const editorSelection = useSimulatorStore((s) => s.editorSelection)
	const spawnPose = useSimulatorStore((s) => s.spawnPose)
	const editorAddWall = useSimulatorStore((s) => s.editorAddWall)
	const editorRemoveWallAt = useSimulatorStore((s) => s.editorRemoveWallAt)
	const editorSelectAt = useSimulatorStore((s) => s.editorSelectAt)
	const editorMoveSelectionTo = useSimulatorStore((s) => s.editorMoveSelectionTo)
	const editorResizeBox = useSimulatorStore((s) => s.editorResizeBox)
	const editorResizeCylinder = useSimulatorStore((s) => s.editorResizeCylinder)
	const editorSetSpawn = useSimulatorStore((s) => s.editorSetSpawn)
	const setWallStart = useSimulatorStore((s) => s.setWallStart)
	const [wallPreview, setWallPreview] = useState<{ x: number; y: number } | null>(null)

	const controls = useSimulationLoop()

	const handleFps = useCallback((value: number) => setFps(Math.round(value)), [setFps])

	// Phase 4d: mirror the theme to <html>'s classList. The shadcn dark variant
	// is `&:is(.dark *)`, so the class must wrap the whole body (not just the
	// simulation-viewport root) for `body`'s `bg-background` to pick it up.
	useEffect(() => {
		document.documentElement.classList.toggle('dark', theme === 'dark')
	}, [theme])

	// Click destination on the floor: replace the goal queue, or append (Shift).
	// Suppressed entirely while an editor tool is active so the editor owns the
	// floor clicks (milestone 12).
	const handlePick = useCallback(
		(point: { x: number; y: number }, event: { shiftKey?: boolean }) => {
			if (event.shiftKey) addGoal(point)
			else setGoal(point)
		},
		[setGoal, addGoal],
	)

	// Editor floor click: route the picked point to the active editor tool.
	const handleEditorPick = useCallback(
		(point: { x: number; y: number }) => {
			const { wallStart } = useSimulatorStore.getState()
			if (editorTool === 'addWall') {
				if (wallStart) {
					editorAddWall(wallStart, point)
				} else {
					setWallStart(point)
				}
			} else if (editorTool === 'removeWall') {
				editorRemoveWallAt(point)
			} else if (editorTool === 'move' || editorTool === 'resize') {
				editorSelectAt(point)
			} else if (editorTool === 'setSpawn') {
				editorSetSpawn(point)
			}
		},
		[editorTool, editorAddWall, editorRemoveWallAt, editorSelectAt, editorSetSpawn, setWallStart],
	)

	// Editor drag: live move / resize of the selected obstacle.
	const handleEditorDrag = useCallback(
		(point: { x: number; y: number }) => {
			const sel = useSimulatorStore.getState().editorSelection
			if (editorTool === 'move') {
				if (sel.kind === 'box' || sel.kind === 'cylinder') editorMoveSelectionTo(point)
			} else if (editorTool === 'resize') {
				const w = useSimulatorStore.getState().world
				if (sel.kind === 'box' && w.boxes[sel.index]) {
					const b = w.boxes[sel.index]!
					// Half-extents in the box's local frame, measured from center to click.
					const dx = point.x - b.center.x
					const dy = point.y - b.center.y
					const c = Math.cos(-b.rotation)
					const s = Math.sin(-b.rotation)
					const lx = Math.abs(dx * c - dy * s)
					const ly = Math.abs(dx * s + dy * c)
					editorResizeBox(sel.index, Math.max(0.2, lx * 2), Math.max(0.2, ly * 2))
				} else if (sel.kind === 'cylinder' && w.cylinders[sel.index]) {
					const cyl = w.cylinders[sel.index]!
					editorResizeCylinder(
						sel.index,
						Math.max(0.1, Math.hypot(point.x - cyl.center.x, point.y - cyl.center.y)),
					)
				}
			}
		},
		[editorTool, editorMoveSelectionTo, editorResizeBox, editorResizeCylinder],
	)

	// Live wall preview: track the cursor while drawing a wall so the overlay
	// can render a faint line from the first endpoint to the mouse.
	const editorActive = editorTool !== 'none'

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
					<GoalPicker world={world} onPick={handlePick} enabled={!editorActive} />
					{editorActive && (
						<EditorPicker
							world={world}
							tool={editorTool}
							onPick={(p) => {
								if (editorTool === 'addWall') setWallPreview(null)
								handleEditorPick(p)
							}}
							onDrag={(p) => {
								if (editorTool === 'move' || editorTool === 'resize') handleEditorDrag(p)
								else if (editorTool === 'addWall' && useSimulatorStore.getState().wallStart)
									setWallPreview(p)
							}}
						/>
					)}
					<EditorOverlay
						tool={editorTool}
						world={world}
						wallStart={wallStart}
						wallPreview={wallPreview}
						spawn={editorTool === 'setSpawn' ? spawnPose : null}
						selection={selectionToView(editorSelection, world)}
					/>
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

/** Convert the store's editor selection (kind + index) into the
 *  geometry-bearing view shape the overlay needs. Reads the live world so
 *  resize handles track the current box/cylinder bounds. */
function selectionToView(sel: EditorSelection, world: World): EditorSelectionView {
	if (sel.kind === 'none') return { kind: 'none' }
	if (sel.kind === 'box') {
		const b = world.boxes[sel.index]
		if (!b) return { kind: 'none' }
		return {
			kind: 'box',
			index: sel.index,
			center: b.center,
			width: b.width,
			depth: b.depth,
			rotation: b.rotation,
		}
	}
	if (sel.kind === 'cylinder') {
		const c = world.cylinders[sel.index]
		if (!c) return { kind: 'none' }
		return { kind: 'cylinder', index: sel.index, center: c.center, radius: c.radius }
	}
	return { kind: 'none' }
}
