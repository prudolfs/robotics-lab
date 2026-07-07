import { createWorld, type World } from '@robotics-lab/core'
import type { Vec2 } from '@robotics-lab/geometry'
import { loadMap, mapNames } from '@robotics-lab/maps'
import type { Goal, NavConfig, NavStatus, PlannerOptions } from '@robotics-lab/navigation'
import { DEFAULT_NAV_CONFIG } from '@robotics-lab/navigation'
import type { OccupancyGrid } from '@robotics-lab/occupancy-grid'
import type { RobotState } from '@robotics-lab/robot'
import { createLidarConfig, type LidarConfig, type LidarScan } from '@robotics-lab/sensors'
import { create } from 'zustand'
import { createSimulation, DEFAULT_PLANNER_OPTIONS, robotSpeed, type SimState } from '@/sim/loop'
import { DEFAULT_TELEOP_CONFIG, type TeleopConfig } from '@/sim/teleop'

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
	/** App state: show the occupancy grid overlay on the floor. */
	showOccupancy: boolean
	/** App state: show the occupancy minimap in the corner. */
	showMinimap: boolean
	/** Observed: whether the robot is in coverage mode. */
	coverageMode: boolean
	/** Observed: whether the coverage run is complete. */
	coverageComplete: boolean
	/** App action nonce: incremented to signal the loop to clear the grid. */
	mapNonce: number
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
		showOccupancy: true,
		showMinimap: true,
		mapNonce: 0,
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
		toggleOccupancy: () => set((s) => ({ showOccupancy: !s.showOccupancy })),
		toggleMinimap: () => set((s) => ({ showMinimap: !s.showMinimap })),
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
		startCoverage: () => set((s) => {
			// Coverage mode is applied via the simulation loop
			return s
		}),
		cancelCoverage: () => set((s) => {
			// Cancel is applied via the simulation loop
			return s
		}),
		observe: (next) => set(sampleState(next)),
	}
})

/** Teleop throttle must stay strictly positive; clamp UI slip to a small floor. */
function clampPositive(value: number): number {
	return Number.isFinite(value) && value > 0 ? value : DEFAULT_TELEOP_CONFIG.baseSpeed
}
