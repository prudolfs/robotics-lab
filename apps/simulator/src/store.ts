import { createWorld, type Pose, type World } from '@robotics-lab/core'
import type { Vec2 } from '@robotics-lab/geometry'
import { loadMap, mapNames } from '@robotics-lab/maps'
import type { Goal, NavConfig, NavStatus, PlannerOptions } from '@robotics-lab/navigation'
import { DEFAULT_NAV_CONFIG } from '@robotics-lab/navigation'
import type { OccupancyGrid } from '@robotics-lab/occupancy-grid'
import type { RobotState } from '@robotics-lab/robot'
import { createLidarConfig, type LidarConfig, type LidarScan } from '@robotics-lab/sensors'

// Camera noise level passed to RobotCameraViewport; re-exported from rendering
// so the store doesn't need a direct rendering dependency.
type CameraNoiseLevel = 'none' | 'low' | 'medium' | 'high'

import { create } from 'zustand'
import { createSimulation, DEFAULT_PLANNER_OPTIONS, robotSpeed, type SimState } from '@/sim/loop'
import { DEFAULT_TELEOP_CONFIG, type TeleopConfig } from '@/sim/teleop'

/** Right-panel tab identifiers. */
export type PanelTab = 'sensors' | 'map' | 'nav' | 'teleop' | 'utils'

/**
 * Widget kinds that can be dragged out of the right panel onto the viewport
 * (docs/hud.md Phase 3). Each maps to one `WidgetCard` rendered in a tab.
 */
export type WidgetId =
	| 'sensors.lidar'
	| 'sensors.camera.controls'
	| 'sensors.camera.feed'
	| 'map.controls'
	| 'map.minimap'
	| 'nav.navigation'
	| 'nav.localization'
	| 'teleop.controls'
	| 'utils.robotDebug'
	| 'utils.logs'

/**
 * Dock edge a popped widget snaps to. Per the Phase-3 design, dragging a
 * widget out of the panel does *not* drop a free-floating copy in the viewport
 * centre — instead the panel closes and the user drops onto one of four edge
 * zones (top / right / bottom / left); the widget docks to that edge.
 */
export type DropEdge = 'top' | 'right' | 'bottom' | 'left'

/**
 * A widget rendered as a docked overlay on the main viewport. The widget is
 * **moved** out of the panel (not duplicated): while a kind is popped, the
 * panel slot is empty and the popped copy owns the widget body (including any
 * live feed). Clicking the popped copy's close button moves it back to its tab.
 */
export type PoppedWidget = {
	/** The widget kind (also the instance id — a kind is popped at most once). */
	widget: WidgetId
	/** Dock edge on the viewport. */
	edge: DropEdge
}

// Default spawn pose: center of the floor, facing +x.
export const SPAWN_POSE = { x: 0, y: 0, heading: 0 }

/** Default lidar spec for the HUD / sensor inspector. */
export const DEFAULT_LIDAR_CONFIG = createLidarConfig({ range: 8, rayCount: 180 })

export type SimulatorStore = {
	/** App state: names of all maps available to switch between. */
	mapNames: string[]
	/** App state: currently selected map name. */
	selectedMap: string
	/** App state: the world model derived from the selected map. */
	world: World
	/** Observed: latest robot snapshot sampled from the simulation. */
	robot: RobotState
	/** Observed: simulation clock in seconds. */
	simTime: number
	/** Observed: last reported render FPS (pushed by App's <FpsCounter>). */
	fps: number
	/** Observed: linear robot speed in m/s. */
	speed: number
	/** Observed: the current commanded wheel speeds (m/s). */
	input: { leftWheel: number; rightWheel: number }
	/** Observed: whether the simulation loop is currently advancing. */
	running: boolean
	/** Observed: the most recent lidar scan sampled from the simulation. */
	scan: LidarScan | null
	/** Observed: the live occupancy grid built from lidar scans. */
	grid: OccupancyGrid | null
	/** Observed: the queued navigation goals (mirrors the sim). */
	goals: Goal[]
	/** Observed: whether the controller is currently driving the robot. */
	autonomous: boolean
	/** Observed: status reported by the controller on the last fixed step. */
	navStatus: NavStatus
	/** Observed: the smoothed planner waypoints the controller is following
	 *  toward `goals[0]`. Distinct from `goals` so the HUD shows the true
	 *  destinations while the path view draws the intermediate route. */
	path: Goal[]
	/** Observed: cells expanded into the closed set during the last plan,
	 *  for the path-finder visualization (world centres). */
	planClosed: Vec2[]
	/** Observed: cells ever queued to the open frontier during the last plan. */
	planOpen: Vec2[]
	/** App state: planner tuning (algorithm / inflation / unknown handling). */
	planner: PlannerOptions
	/** App state: show the planned-path overlay (open / closed / final path). */
	showPath: boolean
	/** App state: navigation controller tuning exposed to the HUD. */
	nav: NavConfig
	/** App state: teleop tuning exposed to the HUD slider / speed adjustment. */
	teleop: TeleopConfig
	/** App state: lidar configuration (range / resolution / noise). */
	lidar: LidarConfig
	/** App state: visualization toggles for the sensor overlays. */
	showLidar: boolean
	/** App state: show the robot's onboard camera viewport. */
	showCamera: boolean
	/** App state: image noise level on the robot camera viewport. */
	cameraNoise: CameraNoiseLevel
	/** App state: show the occupancy grid overlay on the floor. */
	showOccupancy: boolean
	/** App state: show the occupancy minimap in the corner. */
	showMinimap: boolean
	/** Observed: whether the robot is in coverage mode. */
	coverageMode: boolean
	/** Observed: whether the coverage run is complete. */
	coverageComplete: boolean
	/** Observed: dead-reckoning pose estimate (milestone 11). */
	odometryPose: Pose
	/** Observed: recent estimated pose trail (oldest first). */
	odometryHistory: Pose[]
	/** App state: show the odometry trail + estimate marker overlay. */
	showOdometry: boolean
	/** App action: toggle the odometry overlay. */
	toggleOdometry: () => void
	/** App action: clear the dead-reckoning trail (nonce the loop clears it). */
	clearOdometry: () => void
	/** Observed nonce incremented each time the user asks the loop to clear
	 *  the dead-reckoning trail. */
	odometryNonce: number
	/* ----------------------------- Right panel ----------------------------- */
	/** App state: whether the right panel is visible. */
	panelOpen: boolean
	/** App state: which right-panel tab is active (sensors/map/nav/teleop/utils). */
	activeTab: PanelTab
	/** App action: toggle the right panel open/closed. */
	togglePanel: () => void
	/** App action: switch the active right-panel tab. */
	setTab: (tab: PanelTab) => void
	/* ------------------------- Popped widgets ------------------------- */
	/** App state: widget copies docked onto the main viewport (docs Phase 3). */
	popped: PoppedWidget[]
	/** App state: the widget kind currently being dragged out of the panel
	 *  (drives the close-panel + edge-zone overlay behaviour), or null. */
	draggingWidget: WidgetId | null
	/** App action: begin dragging a widget handle out of the panel. Closes the
	 *  right panel so the viewport edge zones are reachable. */
	startDragWidget: (widget: WidgetId) => void
	/** App action: end the drag with a drop. The widget is moved to that edge
	 *  (a kind is a singleton — re-dropping the same kind moves its existing
	 *  copy to the new edge). The panel reopens. */
	dropPoppedWidget: (widget: WidgetId, edge: DropEdge) => void
	/** App action: end the drag without a drop — cancel, reopen the panel. */
	cancelDragWidget: () => void
	/** App action: move a popped widget back to the right panel (close button). */
	undockWidget: (widget: WidgetId) => void
	/** App action nonce: incremented to signal the loop to clear the grid. */
	mapNonce: number
	/** App action: record the latest render FPS (from <FpsCounter>). */
	setFps: (fps: number) => void
	/** App action: switch the active map (the loop resets the sim on change). */
	selectMap: (name: string) => void
	/** App action: tune the teleop throttle (base speed). */
	setBaseSpeed: (value: number) => void
	/** App action: replace the lidar configuration. */
	setLidar: (config: LidarConfig) => void
	/** App action: toggle the lidar ray overlay. */
	toggleLidar: () => void
	/** App action: toggle the robot camera viewport. */
	toggleCamera: () => void
	/** App action: cycle the camera image noise level. */
	cycleCameraNoise: () => void
	/** App action: toggle the occupancy grid floor overlay. */
	toggleOccupancy: () => void
	/** App action: toggle the occupancy minimap. */
	toggleMinimap: () => void
	/** App action: clear the learned occupancy map (without resetting the robot). */
	clearMap: () => void
	/** App action: set a single navigation goal at a world point (enables autonomy). */
	setGoal: (goal: Goal) => void
	/** App action: add a navigation goal to the back of the queue. */
	addGoal: (goal: Goal) => void
	/** App action: empty the goal queue (leaves autonomy as-is). */
	clearGoals: () => void
	/** App action: turn autonomous driving on/off. */
	setAutonomous: (on: boolean) => void
	/** App action: toggle the autonomous driving flag. */
	toggleAutonomous: () => void
	/** App action: replace the navigation controller tuning. */
	setNav: (nav: NavConfig) => void
	/** App action: replace the planner tuning. */
	setPlanner: (planner: PlannerOptions) => void
	/** App action: toggle the planned-path overlay. */
	togglePath: () => void
	/** App action: start coverage planning mode. */
	startCoverage: () => void
	/** App action: cancel coverage mode. */
	cancelCoverage: () => void
	/** Observer: push the latest simulation snapshot for rendering / HUD. */
	observe: (next: SimState) => void
}

function buildWorld(name: string): World {
	return createWorld(loadMap(name))
}

export function sampleState(next: SimState) {
	return {
		robot: next.robot,
		simTime: next.time,
		speed: robotSpeed(next.robot),
		input: next.input,
		running: next.running,
		scan: next.scan,
		grid: next.grid,
		goals: next.goals,
		autonomous: next.autonomous,
		navStatus: next.navStatus,
		path: next.path,
		planClosed: next.planClosed,
		planOpen: next.planOpen,
		coverageMode: next.coverageMode,
		coverageComplete: next.coverageComplete,
		odometryPose: next.odometry.pose,
		odometryHistory: next.odometry.history,
	}
}

export const useSimulatorStore = create<SimulatorStore>((set) => {
	const names = mapNames()
	const initial = names[0] ?? ''
	return {
		mapNames: names,
		selectedMap: initial,
		world: buildWorld(initial),
		// The loop is the authority; the store only mirrors its state so React
		// can observe it. The hook calls `observe` every frame after stepping.
		...sampleState(createSimulation({ spawnPose: SPAWN_POSE })),
		fps: 0,
		teleop: DEFAULT_TELEOP_CONFIG,
		lidar: DEFAULT_LIDAR_CONFIG,
		nav: DEFAULT_NAV_CONFIG,
		goals: [],
		autonomous: false,
		navStatus: 'idle',
		path: [],
		planClosed: [],
		planOpen: [],
		planner: DEFAULT_PLANNER_OPTIONS,
		showPath: true,
		coverageMode: false,
		coverageComplete: false,
		showLidar: true,
		showCamera: false,
		cameraNoise: 'none' as CameraNoiseLevel,
		showOccupancy: true,
		showMinimap: true,
		mapNonce: 0,
		panelOpen: true,
		activeTab: 'sensors',
		popped: [],
		draggingWidget: null,
		showOdometry: true,
		odometryNonce: 0,
		selectMap: (name) => {
			if (!names.includes(name)) return
			set({ selectedMap: name, world: buildWorld(name) })
		},
		setBaseSpeed: (value) =>
			set((s) => ({
				teleop: { ...s.teleop, baseSpeed: clampPositive(value) },
			})),
		setLidar: (config) => set({ lidar: config }),
		toggleLidar: () => set((s) => ({ showLidar: !s.showLidar })),
		toggleCamera: () => set((s) => ({ showCamera: !s.showCamera })),
		cycleCameraNoise: () =>
			set((s) => {
				const levels: CameraNoiseLevel[] = ['none', 'low', 'medium', 'high']
				const idx = levels.indexOf(s.cameraNoise)
				return { cameraNoise: levels[(idx + 1) % levels.length] }
			}),
		toggleOccupancy: () => set((s) => ({ showOccupancy: !s.showOccupancy })),
		toggleMinimap: () => set((s) => ({ showMinimap: !s.showMinimap })),
		toggleOdometry: () => set((s) => ({ showOdometry: !s.showOdometry })),
		clearOdometry: () => set((s) => ({ odometryNonce: s.odometryNonce + 1 })),
		clearMap: () => {
			// The loop owns the grid; we push the clear via the import below, but to
			// keep store <-> loop circularity clean we expose the action as a flag
			// the loop can read. Implementation note: a `mapNonce` that the loop
			// watches and resets the grid on increment.
			set((s) => ({ mapNonce: s.mapNonce + 1 }))
		},
		setGoal: (goal) => set({ goals: [goal], autonomous: true }),
		addGoal: (goal) => set((s) => ({ goals: [...s.goals, goal] })),
		clearGoals: () => set({ goals: [], autonomous: false }),
		setAutonomous: (on) => set({ autonomous: on }),
		toggleAutonomous: () => set((s) => ({ autonomous: !s.autonomous })),
		setNav: (nav) => set({ nav }),
		setPlanner: (planner) => set({ planner }),
		togglePath: () => set((s) => ({ showPath: !s.showPath })),
		startCoverage: () =>
			set((s) => {
				// Coverage mode is applied via the simulation loop
				return s
			}),
		cancelCoverage: () =>
			set((s) => {
				// Cancel is applied via the simulation loop
				return s
			}),
		togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
		setTab: (tab) => set({ activeTab: tab }),
		setFps: (fps) => set({ fps }),
		startDragWidget: (widget) => set({ draggingWidget: widget, panelOpen: false }),
		dropPoppedWidget: (widget, edge) =>
			set((s) => ({
				draggingWidget: null,
				panelOpen: true,
				popped: mergePopped(s.popped, { widget, edge }),
			})),
		cancelDragWidget: () => set({ draggingWidget: null, panelOpen: true }),
		undockWidget: (widget) =>
			set((s) => ({
				panelOpen: true,
				popped: s.popped.filter((p) => p.widget !== widget),
			})),
		observe: (next) => set(sampleState(next)),
	}
})

/** Teleop throttle must stay strictly positive; clamp UI slip to a small floor. */
function clampPositive(value: number): number {
	return Number.isFinite(value) && value > 0 ? value : DEFAULT_TELEOP_CONFIG.baseSpeed
}

/**
 * Merge a popped widget into the list. A widget kind is a singleton (it is
 * moved out of the panel, not duplicated), so the kind's `widget` doubles as
 * its instance id. Dropping the same kind again moves it to the new edge.
 */
function mergePopped(
	popped: PoppedWidget[],
	next: { widget: WidgetId; edge: DropEdge },
): PoppedWidget[] {
	const existing = popped.find((p) => p.widget === next.widget)
	if (existing) {
		return popped.map((p) => (p.widget === next.widget ? { ...p, edge: next.edge } : p))
	}
	return [...popped, { widget: next.widget, edge: next.edge }]
}

/** Is a given widget kind currently popped onto the viewport? */
export function isWidgetPopped(popped: PoppedWidget[], widget: WidgetId): boolean {
	return popped.some((p) => p.widget === widget)
}
