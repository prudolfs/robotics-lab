import {
	addWall,
	boxIndexAt,
	createWorld,
	cylinderIndexAt,
	moveBox,
	moveCylinder,
	nearestWallIndex,
	type Pose,
	removeWall,
	resizeBox,
	resizeCylinder,
	type World,
} from '@robotics-lab/core'
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
export type ThemeMode = 'light' | 'dark'

/** localStorage key persisting the user's theme choice. */
export const THEME_STORAGE_KEY = 'robotics-lab.theme'

/** Resolve the initial theme: stored choice → OS preference → dark by default. */
export function resolveInitialTheme(): ThemeMode {
	try {
		const stored =
			typeof localStorage !== 'undefined' ? localStorage.getItem(THEME_STORAGE_KEY) : null
		if (stored === 'light' || stored === 'dark') return stored
	} catch {
		// localStorage may be unavailable (SSR / restricted env) — fall through.
	}
	if (typeof window !== 'undefined' && window.matchMedia) {
		return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
	}
	return 'dark'
}

import { create } from 'zustand'
import { createSimulation, DEFAULT_PLANNER_OPTIONS, robotSpeed, type SimState } from '@/sim/loop'
import {
	createPlaybackState,
	createRecording,
	deserializeRecording,
	hasFrames,
	type PlaybackState,
	pausePlayback,
	playPlayback,
	type Recording,
	seekPlayback,
	serializeRecording,
	setPlaybackSpeed,
	stopPlayback,
} from '@/sim/playback'
import { DEFAULT_TELEOP_CONFIG, type TeleopConfig } from '@/sim/teleop'

/** Right-panel tab identifiers. */
export type PanelTab = 'sensors' | 'map' | 'nav' | 'teleop' | 'utils' | 'editor' | 'playback'

/** Editor tools (milestone 12). `'none'` is the idle / no-edit state. */
export type EditorTool = 'none' | 'addWall' | 'removeWall' | 'move' | 'resize' | 'setSpawn'

/** Which obstacle (if any) the editor has selected for move/resize. */
export type EditorSelection =
	| { kind: 'none' }
	| { kind: 'box'; index: number }
	| { kind: 'cylinder'; index: number }
	| { kind: 'wall'; index: number }

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
	| 'editor.world'
	| 'editor.robot'
	| 'playback.controls'

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

/** Click tolerance (metres) for the pick-a-wall-to-remove tool. A click within
 *  this distance of a wall segment removes it; farther clicks are ignored. */
export const EDITOR_WALL_PICK_TOLERANCE = 0.3

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
	/* ----------------------------- Editor (milestone 12) ----------------------------- */
	/** App state: active editor tool (`'none'` leaves the world read-only). */
	editorTool: EditorTool
	/** App state: the obstacle the editor has selected (move/resize), if any. */
	editorSelection: EditorSelection
	/** App state: first endpoint of the wall being drawn (click 1 of 2); null
	 *  until the first click lands. Cleared on completion / tool change. */
	wallStart: Vec2 | null
	/** App state: the robot spawn pose used on Reset / map switch. */
	spawnPose: Pose
	/** App action: set / clear the first endpoint of the wall being drawn. */
	setWallStart: (point: Vec2 | null) => void
	/** App action: switch the active editor tool. Clears in-progress state and,
	 *  for `'none'`, also drops the selection so the overlay markers vanish. */
	setEditorTool: (tool: EditorTool) => void
	/** App action: add a wall segment to the world. */
	editorAddWall: (start: Vec2, end: Vec2) => void
	/** App action: remove the wall nearest to a world point (within tolerance). */
	editorRemoveWallAt: (point: Vec2) => void
	/** App action: begin a move / resize on the obstacle nearest the point.
	 *  Selects a box or cylinder (whichever is closest to the click). */
	editorSelectAt: (point: Vec2) => void
	/** App action: move the selected obstacle to a new world point. */
	editorMoveSelectionTo: (point: Vec2) => void
	/** App action: resize the selected box by deltas (width/depth in metres). */
	editorResizeBox: (index: number, width: number, depth: number) => void
	/** App action: resize the selected cylinder by a new radius. */
	editorResizeCylinder: (index: number, radius: number) => void
	/** App action: clear the editor selection. */
	clearEditorSelection: () => void
	/** App action: set spawn pose to a world point (heading preserved). */
	editorSetSpawn: (point: Vec2) => void
	/** App action: rebase the spawn pose to the robot's current pose, then reset. */
	editorResetRobotPose: () => void
	/** Observed nonce incremented each time the user requests a spawn rebase +
	 *  reset (the loop reads it and calls `resetSimulation` with the new spawn). */
	spawnNonce: number
	/* ----------------------------- Playback (milestone 13) ----------------------------- */
	/** App state: whether the loop is currently capturing frames into `recording`. */
	recording: boolean
	/** App state: the recording being built while `recording`, or the most recent
	 *  finished one (used for Save run). The loop appends frames to it. */
	recordingData: Recording
	/** App state: a saved run loaded for replay (`null` until a Load succeeds). */
	loadedRecording: Recording | null
	/** App state: the replay player state (index / playing / speed). */
	playback: PlaybackState
	/** Observed: true while replaying a recording (overrides observed sim state
	 *  with the replayed frame's pose). Mirror of `playback.index >= 0`. */
	replaying: boolean
	/** Observed: the map the loaded recording was captured on (so a Load can
	 *  switch the active map). Parallel to `loadedRecording?.map`. */
	loadedMap: string | null
	/** App action: start recording the live simulation into a fresh run. */
	startRecording: (map: string) => void
	/** App action: stop recording and keep the run for Save / Replay. */
	stopRecording: () => void
	/** App action: clear the current recording (after the user is done with it). */
	clearRecording: () => void
	/** App action: serialize the current recording to JSON (Save run). */
	saveRecording: () => string | null
	/** App action: parse a JSON run and set it as the loaded recording, switching
	 *  the active map to the run's source map. Throws on a malformed file. */
	loadRecording: (json: string) => void
	/** App action: start replaying the loaded recording from the current index. */
	playRecording: () => void
	/** App action: pause replay (leaves the playhead where it is). */
	pauseRecording: () => void
	/** App action: stop replay and return the playhead to before the first frame. */
	stopReplay: () => void
	/** App action: scrub the playhead to an absolute frame index (pauses). */
	seekRecording: (index: number) => void
	/** App action: set the replay playback speed multiplier. */
	setPlaybackSpeed: (speed: number) => void
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
	/** App state: the widget kind currently being dragged (drives the edge-zone
	 *  overlay); null when idle. Phase 4 change: dragging no longer touches
	 *  `panelOpen` — the drop zones overlay the viewport beside a live panel. */
	draggingWidget: WidgetId | null
	/** App action: begin dragging a widget handle. Mounts the edge drop zones.
	 *  Phase 4: does **not** close the right panel (only `togglePanel` flips
	 *  `panelOpen`). */
	startDragWidget: (widget: WidgetId) => void
	/** App action: end the drag with a drop. Moves the widget to that edge (a
	 *  kind is a singleton — re-dropping moves its existing copy). Phase 4:
	 *  does **not** force `panelOpen` back to true (the panel never closed). */
	dropPoppedWidget: (widget: WidgetId, edge: DropEdge) => void
	/** App action: end the drag without a drop — cancel (no pop). Phase 4: clears
	 *  `draggingWidget` only — does not touch `panelOpen`. */
	cancelDragWidget: () => void
	/** App action: move a popped widget back to the right panel (close button).
	 *  Phase 4: does **not** reopen the panel (the panel never closed). */
	undockWidget: (widget: WidgetId) => void
	/* ----------------------------- Theme (Phase 4d) ----------------------------- */
	/** App state: app color scheme ('light' | 'dark'). Applied by App.tsx
	 *  mirroring to `document.documentElement.classList`. Default: dark. */
	theme: ThemeMode
	/** App action: flip `theme` and persist the choice to localStorage. */
	toggleTheme: () => void
	/** App action: set `theme` and persist the choice to localStorage. */
	setTheme: (theme: ThemeMode) => void
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

export const useSimulatorStore = create<SimulatorStore>((set, get) => {
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
		theme: resolveInitialTheme(),
		showOdometry: true,
		odometryNonce: 0,
		editorTool: 'none',
		editorSelection: { kind: 'none' },
		wallStart: null,
		spawnPose: SPAWN_POSE,
		spawnNonce: 0,
		// --- Playback (milestone 13) ---------------------------------------------
		recording: false,
		recordingData: createRecording(initial),
		loadedRecording: null,
		playback: createPlaybackState(),
		replaying: false,
		loadedMap: null,
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
		// --- Editor (milestone 12) ---------------------------------------------
		// The editor owns the world: it mutates the in-memory `World` the store
		// already feeds to the simulation loop via the existing `world` effect in
		// `use-simulation-loop`. Re-creating the world object each edit gives React
		// a fresh reference so the renderer and the sim both pick up the change.
		setEditorTool: (tool) =>
			set((s) => ({
				editorTool: tool,
				wallStart: s.editorTool === tool ? s.wallStart : null,
				editorSelection:
					tool === 'move' || tool === 'resize' ? s.editorSelection : { kind: 'none' },
			})),
		setWallStart: (point) => set({ wallStart: point }),
		editorAddWall: (start, end) =>
			set((s) => ({ world: addWall(s.world, { kind: 'wall', start, end }), wallStart: null })),
		editorRemoveWallAt: (point) =>
			set((s) => {
				const idx = nearestWallIndex(s.world, point, EDITOR_WALL_PICK_TOLERANCE)
				if (idx < 0) return {}
				return { world: removeWall(s.world, idx) }
			}),
		editorSelectAt: (point) =>
			set((s) => {
				const box = boxIndexAt(s.world, point)
				if (box >= 0) return { editorSelection: { kind: 'box', index: box } }
				const cyl = cylinderIndexAt(s.world, point)
				if (cyl >= 0) return { editorSelection: { kind: 'cylinder', index: cyl } }
				return { editorSelection: { kind: 'none' } }
			}),
		editorMoveSelectionTo: (point) =>
			set((s) => {
				const sel = s.editorSelection
				if (sel.kind === 'box') return { world: moveBox(s.world, sel.index, point) }
				if (sel.kind === 'cylinder') return { world: moveCylinder(s.world, sel.index, point) }
				return {}
			}),
		editorResizeBox: (index, width, depth) =>
			set((s) => ({ world: resizeBox(s.world, index, { width, depth }) })),
		editorResizeCylinder: (index, radius) =>
			set((s) => ({ world: resizeCylinder(s.world, index, radius) })),
		clearEditorSelection: () => set({ editorSelection: { kind: 'none' } }),
		editorSetSpawn: (point) =>
			set((s) => ({ spawnPose: { ...s.spawnPose, x: point.x, y: point.y } })),
		editorResetRobotPose: () =>
			set((s) => ({
				spawnPose: { x: s.robot.pose.x, y: s.robot.pose.y, heading: s.robot.pose.heading },
				spawnNonce: s.spawnNonce + 1,
			})),
		// --- Playback (milestone 13) ---------------------------------------------
		// Store owns only the UI-facing knobs the loop reads/writes. The loop is
		// the authority for frame capture (it appends while `recording` is on) and
		// for playback advancement (it pushes the replayed pose into the store so
		// the viewport shows the recorded motion). These actions only flip flags +
		// mutate the lightweight player state.
		startRecording: (map) =>
			set(() => ({
				recording: true,
				recordingData: createRecording(map),
				loadedRecording: null,
				playback: stopPlayback(createPlaybackState()),
				replaying: false,
			})),
		stopRecording: () => set({ recording: false }),
		clearRecording: () =>
			set((s) => ({
				recordingData: createRecording(s.selectedMap),
				loadedRecording: null,
				playback: stopPlayback(createPlaybackState()),
				replaying: false,
				loadedMap: null,
			})),
		saveRecording: () => {
			const s = get()
			const rec = hasFrames(s.recordingData) ? s.recordingData : s.loadedRecording
			return rec ? serializeRecording(rec) : null
		},
		loadRecording: (json) => {
			const rec = deserializeRecording(json)
			// Switch the active map to the run's source map (no-op if already on it
			// or unknown; `selectMap` guards unknown names).
			if (rec.map && rec.map !== get().selectedMap && get().mapNames.includes(rec.map)) {
				const { selectMap } = get()
				selectMap(rec.map)
			}
			set(() => ({
				loadedRecording: rec,
				loadedMap: rec.map,
				recording: false,
				playback: stopPlayback(createPlaybackState()),
				replaying: false,
			}))
		},
		playRecording: () =>
			set((s) => {
				const rec = s.loadedRecording
				const next = rec ? playPlayback(rec, s.playback) : s.playback
				return { playback: next, replaying: next.playing || next.index >= 0 }
			}),
		pauseRecording: () => set((s) => ({ playback: pausePlayback(s.playback) })),
		stopReplay: () =>
			set(() => ({ playback: stopPlayback(createPlaybackState()), replaying: false })),
		seekRecording: (index) =>
			set((s) => {
				const rec = s.loadedRecording
				const next = rec ? seekPlayback(rec, s.playback, index) : createPlaybackState()
				return { playback: next, replaying: next.index >= 0 }
			}),
		setPlaybackSpeed: (speed) => set((s) => ({ playback: setPlaybackSpeed(s.playback, speed) })),
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
		// Phase 4: dragging no longer touches panelOpen — the drop zones overlay
		// the viewport beside the live panel. Only togglePanel flips panelOpen.
		startDragWidget: (widget) => set({ draggingWidget: widget }),
		dropPoppedWidget: (widget, edge) =>
			set((s) => ({ draggingWidget: null, popped: mergePopped(s.popped, { widget, edge }) })),
		cancelDragWidget: () => set({ draggingWidget: null }),
		undockWidget: (widget) => set((s) => ({ popped: s.popped.filter((p) => p.widget !== widget) })),
		toggleTheme: () => set((s) => ({ theme: persistTheme(s.theme === 'dark' ? 'light' : 'dark') })),
		setTheme: (theme) => set({ theme: persistTheme(theme) }),
		observe: (next) => set(sampleState(next)),
	}
})

/** Teleop throttle must stay strictly positive; clamp UI slip to a small floor. */
function clampPositive(value: number): number {
	return Number.isFinite(value) && value > 0 ? value : DEFAULT_TELEOP_CONFIG.baseSpeed
}

/** Persist a theme choice to localStorage (best-effort) and return it. */
function persistTheme(theme: ThemeMode): ThemeMode {
	try {
		localStorage.setItem(THEME_STORAGE_KEY, theme)
	} catch {
		// Same guarding as resolveInitialTheme: SSR / restricted environments.
	}
	return theme
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
