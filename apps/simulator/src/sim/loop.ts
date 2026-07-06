// Deterministic simulation loop: fixed-timestep integration decoupled from the
// render rate.
//
// This module is the bridge between the framework-independent robot model
// (`@robotics-lab/robot`) and the React renderer. It is itself framework
// independent: it imports no React, no Zustand and no browser APIs, so the same
// code runs in the browser, in Node and in tests with byte-identical results.
//
// A simulation is an immutable `SimState` advanced by `stepSimulation` at a
// fixed `FIXED_DT`. The renderer feeds measured wall-clock deltas to
// `accumulate`, which drains the remainder in integer fixed steps and returns
// intermediate snapshots. The renderer therefore observes the simulation
// instead of owning it — it never steps physics.
//
// A lidar scan is recomputed each fixed step against an attached `World`. The
// world is plain immutable data so it can travel in `SimState` without
// breaking purity; passing `null` disables the sensor.

import type { Pose, Velocity, World } from '@robotics-lab/core'
import type { Vec2 } from '@robotics-lab/geometry'
import {
	controlToGoal,
	DEFAULT_NAV_CONFIG,
	type Goal,
	type NavConfig,
	type NavStatus,
	type PlannerOptions,
	type PlanResult,
	planPath,
	popGoal,
} from '@robotics-lab/navigation'
import { applyScan, createGrid, type OccupancyGrid, resetGrid } from '@robotics-lab/occupancy-grid'
import {
	createRobot,
	type RobotParams,
	stepDifferentialDrive,
	type WheelSpeeds,
} from '@robotics-lab/robot'
import {
	createLidarConfig,
	createScan,
	type LidarConfig,
	type LidarScan,
} from '@robotics-lab/sensors'

/** Default occupancy grid resolution (metres per cell). */
export const DEFAULT_GRID_RESOLUTION = 0.2
/** Margin around the world floor built into the occupancy grid, in metres. */
export const DEFAULT_GRID_MARGIN = 4
/** Fixed steps between autonomous replan cycles. The robot re-routes on the
 *  live occupancy grid at this rate but also replans immediately on every
 *  user-driven goal change, so the value is a safety cadence rather than a
 *  correctness dial. */
export const REPLAN_STEP_INTERVAL = 30

/** Fixed simulation timestep in seconds. */
export const FIXED_DT = 1 / 60

/** Wall-clock budget per render frame, clamps the accumulator against stutters. */
export const MAX_FRAME_TIME = 0.25

/** Wheel speeds (m/s) at the contact point, applied on each fixed step. */
export type DriveInput = WheelSpeeds

export type SimState = {
	/** Simulation clock in seconds; advances only on fixed steps while running. */
	time: number
	/** Sub-step remainder carried between render frames. */
	accumulator: number
	/** Whether the simulation is currently advancing. */
	running: boolean
	/** The robot under simulation. */
	robot: ReturnType<typeof createRobot>
	/** Drive input applied on each fixed step while running. */
	input: DriveInput
	/** Pose the robot resets to. */
	spawnPose: Pose
	/** Total fixed steps executed since creation / last reset. */
	stepCount: number
	/** World the lidar raycasts against; `null` disables the sensor. */
	world: World | null
	/** Lidar configuration applied to every scan. */
	lidar: LidarConfig
	/** The most recent lidar scan, recomputed each fixed step. `null` while no world. */
	scan: LidarScan | null
	/** Occupancy grid built from the lidar scans; `null` while no world. */
	grid: OccupancyGrid | null
	/** Navigation controller tuning. */
	nav: NavConfig
	/** FIFO of pending navigation destinations. The head is the goal the robot
	 *  is currently travelling to (the true target, not a transient planner
	 *  waypoint). The HUD observes this so the user sees real destinations. */
	goals: Goal[]
	/** Smoothed world-space waypoints the controller is currently following
	 *  toward `goals[0]`. Produced by the planner; consumed by the controller.
	 *  Dropped to [] when there is nothing to chase or the plan is exhausted. */
	path: Goal[]
	/** Cells expanded into the closed set during the last plan — for the
	 *  path-finder visualization. */
	planClosed: Vec2[]
	/** Cells ever queued to the open frontier during the last plan. */
	planOpen: Vec2[]
	/** The step the last successful plan was produced on. Used to throttle
	 *  replanning to the `REPLAN_STEP_INTERVAL` cadence. */
	lastPlanStep: number
	/** Planner tuning (algorithm, inflation, etc.) exposed for the UI. */
	planner: PlannerOptions
	/** When true, the go-to-goal controller overrides the manual drive input
	 *  each fixed step. Toggle off to drop back to keyboard teleop. */
	autonomous: boolean
	/** Status reported by the controller on the last fixed step. Mirrors the
	 *  controller's own enum so the HUD can read it from the sim snapshot. */
	navStatus: NavStatus
}

export type SimOptions = {
	spawnPose?: Pose
	robotParams?: Partial<RobotParams>
	input?: DriveInput
	running?: boolean
	/** Lidar configuration; defaults to a standard 360° 10m sensor. */
	lidar?: LidarConfig
	/** World the lidar raycasts against each step; null disables the sensor. */
	world?: World | null
	/** Occupancy grid resolution in metres per cell. */
	gridResolution?: number
	/** Metres of margin around the world floor added to the occupancy grid. */
	gridMargin?: number
	/** Navigation controller tuning; defaults to `DEFAULT_NAV_CONFIG`. */
	nav?: NavConfig
	/** Planner tuning (algorithm / inflation / allow-unknown). Defaults to A*
	 *  with a 1-cell safety inflation that routes through unexplored space. */
	planner?: PlannerOptions
	/** When true, the sim drives the robot towards its queued goals; default false. */
	autonomous?: boolean
}

export const DEFAULT_LIDAR_CONFIG = createLidarConfig()

/** Default planner tuning: A* search, 1-cell obstacle inflation, routes
 *  through unknown cells so the robot can plan across unexplored space. */
export const DEFAULT_PLANNER_OPTIONS: PlannerOptions = {
	algorithm: 'astar',
	diagonal: true,
	inflationRadius: 1,
	allowUnknown: true,
}

/** Create an initial simulation state. Defaults to running at the origin. */
export function createSimulation(options: SimOptions = {}): SimState {
	const spawnPose = options.spawnPose ?? { x: 0, y: 0, heading: 0 }
	const robot = createRobot(spawnPose, options.robotParams ?? {})
	const world = options.world ?? null
	const lidar = options.lidar ?? DEFAULT_LIDAR_CONFIG
	const grid = world ? buildGrid(world, options.gridResolution, options.gridMargin) : null
	return {
		time: 0,
		accumulator: 0,
		running: options.running ?? true,
		robot,
		input: options.input ?? { leftWheel: 0, rightWheel: 0 },
		spawnPose,
		stepCount: 0,
		world,
		lidar,
		grid,
		scan: world ? createScan(lidar, robot.pose, world) : null,
		nav: options.nav ?? DEFAULT_NAV_CONFIG,
		planner: options.planner ?? DEFAULT_PLANNER_OPTIONS,
		goals: [],
		path: [],
		planClosed: [],
		planOpen: [],
		lastPlanStep: 0,
		autonomous: options.autonomous ?? false,
		navStatus: 'idle',
	}
}

/**
 * Build an occupancy grid sized to cover the world floor plus a margin, at
 * the default resolution. The grid origin is the world-space corner below and
 * to the left of the floor (so cell (0,0) sits at minX/minY of the bounds).
 */
export function buildGrid(
	world: World,
	resolution: number = DEFAULT_GRID_RESOLUTION,
	margin: number = DEFAULT_GRID_MARGIN,
): OccupancyGrid {
	const width = Math.ceil(world.width / resolution) + Math.ceil((margin * 2) / resolution)
	const height = Math.ceil(world.depth / resolution) + Math.ceil((margin * 2) / resolution)
	return createGrid({
		width,
		height,
		resolution,
		origin: {
			x: -world.width / 2 - margin,
			y: -world.depth / 2 - margin,
		},
	})
}

/** Pure: set the running flag without touching anything else. */
export function setRunning(state: SimState, running: boolean): SimState {
	return state.running === running ? state : { ...state, running }
}

/** Pause the simulation (alias for readability). */
export function pause(state: SimState): SimState {
	return setRunning(state, false)
}

/** Resume the simulation (alias for readability). */
export function resume(state: SimState): SimState {
	return setRunning(state, true)
}

/** Replace the drive input applied on each fixed step. */
export function setInput(state: SimState, input: DriveInput): SimState {
	return state.input.leftWheel === input.leftWheel && state.input.rightWheel === input.rightWheel
		? state
		: { ...state, input }
}

// --- Navigation ------------------------------------------------------------
// The navigation controller lives in `@robotics-lab/navigation`. The sim
// stores the goal queue, the controller tuning and the autonomous flag; each
// fixed step it asks the controller for the wheel speeds towards the head
// goal and applies them exactly like a manual `setInput`.

/** Replace the navigation controller tuning. */
export function setNavConfig(state: SimState, nav: NavConfig): SimState {
	return state.nav === nav ? state : { ...state, nav }
}

/** Replace the goal queue with a single destination, turning autonomy on.
 *  Plans a path on the live grid immediately so the robot starts following
 *  the smoothed waypoints on the next fixed step. If the planner cannot find
 *  a route the destination is queued directly so the go-to-goal controller
 *  drives straight at it (graceful milestone-7 fallback). */
export function setGoal(state: SimState, goal: Goal): SimState {
	const base: SimState = { ...state, goals: [goal], autonomous: true }
	return replan(base)
}

/** Replace the goal queue with a list of destinations, turning autonomy on. */
export function setGoals(state: SimState, goals: Goal[]): SimState {
	const base: SimState = { ...state, goals, autonomous: true }
	return goals.length === 0 ? base : replan(base)
}

/** Append a destination to the back of the queue. Leaves the autonomous
 *  flag alone so the user can pre-stage destinations before enabling
 *  autonomy. If there was no active plan the new tail is kept as-is; the
 *  next replan (manual or cadence) extends the route to it. */
export function enqueueGoal(state: SimState, goal: Goal): SimState {
	const goals = [...state.goals, goal]
	// If the planner had no path queued (e.g. waiting on autonomy), refresh the
	// plan toward the head goal now so the new destination is incorporated.
	const base: SimState = { ...state, goals }
	return state.path.length === 0 && state.autonomous ? replan(base) : base
}

/** Empty the destination queue. Also clears any in-flight planned path so
 *  the controller stops driving intermediate waypoints toward a cancelled
 *  destination. */
export function clearGoals(state: SimState): SimState {
	if (state.goals.length === 0 && state.path.length === 0) return state
	return {
		...state,
		goals: [],
		path: [],
		planClosed: [],
		planOpen: [],
		lastPlanStep: 0,
	}
}

/** Replace the planner tuning (algorithm / inflation / unknown handling).
 *  Schedules an immediate replan so the new knobs take effect at once. */
export function setPlannerOptions(state: SimState, planner: PlannerOptions): SimState {
	return { ...state, planner, lastPlanStep: state.stepCount - REPLAN_STEP_INTERVAL }
}

// --- Path planning integration (milestone 8) --------------------------------
// The go-to-goal controller (milestone 7) drives straight at its head goal.
// Milestone 8 sits a grid path planner between the user's *destination* and
// the controller: `goals[0]` is the true destination the user clicked; the
// planner produces `path`, a smoothed list of intermediate waypoints the
// controller chases one at a time. As the occupancy grid fills up from lidar
// scans the planner replans so the robot re-routes around obstacles it only
// just discovered, finally arriving at the destination.

/** Plan from the robot's current pose to `goals[0]` on the live grid, storing
 *  the smoothed waypoints in `path` and the search artifacts for the
 *  path-finder visualization. Returns the state unchanged when there is
 *  nothing to plan (no grid, no grid, or no goal queued).
 *
 *  When the planner fails (no path / invalid endpoints) we fall back to a
 *  single direct waypoint at the destination so the controller still drives
 *  toward it (the milestone-7 behaviour) rather than freezing in place — the
 *  robot may hit the obstacle, but that is a recoverable failure and far
 *  better than silently giving up on autonomy.
 */
export function replan(state: SimState): SimState {
	const target = state.goals[0]
	if (!target || !state.grid) {
		return { ...state, path: [], planClosed: [], planOpen: [], lastPlanStep: state.stepCount }
	}
	const start: Vec2 = { x: state.robot.pose.x, y: state.robot.pose.y }
	const res: PlanResult = planPath(state.grid, start, target, state.planner)
	// Convert the planner's Vec2 waypoints into the controller's Goal shape.
	const path: Goal[] = res.waypoints.map((w) => ({ x: w.x, y: w.y }))
	return {
		...state,
		path,
		planClosed: res.closed,
		planOpen: res.open,
		lastPlanStep: state.stepCount,
	}
}

/** Toggle autonomous driving on/off. When off, manual teleop input applies. */
export function setAutonomous(state: SimState, autonomous: boolean): SimState {
	// When autonomy is turned off the controller stops driving; zero the input
	// so the robot doesn't keep coasting on the last commanded speeds until the
	// keyboard hook refreshes it next frame.
	if (state.autonomous === autonomous) return state
	if (!autonomous) return { ...state, autonomous, input: { leftWheel: 0, rightWheel: 0 } }
	return { ...state, autonomous }
}

/** Attach (or detach) the world the lidar raycasts against, recomputing the scan. */
export function setSimWorld(state: SimState, world: World | null): SimState {
	if (state.world === world) return state
	const scan = world ? createScan(state.lidar, state.robot.pose, world) : null
	const grid = world ? buildGrid(world) : null
	return { ...state, world, scan, grid }
}

/** Replace the lidar configuration, recomputing the scan if a world is attached. */
export function setLidarConfig(state: SimState, lidar: LidarConfig): SimState {
	if (configsEqual(state.lidar, lidar)) return state
	const scan = state.world ? createScan(lidar, state.robot.pose, state.world) : null
	return { ...state, lidar, scan }
}

function configsEqual(a: LidarConfig, b: LidarConfig): boolean {
	return (
		a.fieldOfView === b.fieldOfView &&
		a.rayCount === b.rayCount &&
		a.range === b.range &&
		a.noise === b.noise
	)
}

/**
 * Reset the simulation: robot back to its spawn pose, clock and counters
 * zeroed, accumulator cleared. Running flag, input, world and lidar config are
 * preserved so a paused loop doesn't yank the robot back into motion on reset.
 * The latest scan is recomputed from the reset pose and the occupancy grid is
 * rebuilt blank (clearing any learned map).
 *
 * Navigation is reset to a clean slate: the goal queue is emptied and
 * autonomy is turned off, since the spawn pose may be unrelated to the goals
 * the user queued before the reset. The controller tuning (`nav`) is kept.
 */
export function resetSimulation(state: SimState): SimState {
	const robot = createRobot(state.spawnPose, state.robot.params)
	const scan = state.world ? createScan(state.lidar, robot.pose, state.world) : null
	const grid = state.world ? buildGrid(state.world) : null
	return {
		...state,
		time: 0,
		accumulator: 0,
		stepCount: 0,
		robot,
		scan,
		grid,
		goals: [],
		path: [],
		planClosed: [],
		planOpen: [],
		lastPlanStep: 0,
		autonomous: false,
		navStatus: 'idle',
	}
}

/** Linear speed magnitude of a robot. Helper for HUDs and assertions. */
export function robotSpeed(robot: { velocity: Velocity }): number {
	return Math.hypot(robot.velocity.vx, robot.velocity.vy)
}

/**
 * Advance the simulation by exactly one fixed timestep.
 *
 * While paused the snapshot is returned unchanged so callers can always treat
 * the result as the current state. While running the navigation controller is
 * polled for wheel speeds first (when autonomy is on and there is a goal
 * queued); the resulting `DriveInput` overrides any manual teleop value for
 * this step. The robot is then stepped via the differential-drive model and
 * the lidar scan is recomputed against the new pose (when a world is
 * attached). On arrival the head goal is popped from the queue.
 */
export function stepSimulation(state: SimState, dt: number = FIXED_DT): SimState {
	if (!state.running) return state

	// Navigation controller overrides the manual input when autonomy is on.
	// The controller drives the head of `path` (a smoothed planner waypoint);
	// `goals[0]` is the true destination the user is heading to. The planner
	// replans on a fixed cadence (milestone 8) so the robot re-routes on the
	// live grid as new obstacles are discovered.
	let goals = state.goals
	let path = state.path
	let planClosed = state.planClosed
	let planOpen = state.planOpen
	let lastPlanStep = state.lastPlanStep
	let autonomous = state.autonomous
	let navStatus = state.navStatus
	let input = state.input
	const pose = state.robot.pose
	if (state.autonomous) {
		const destination = goals.length > 0 ? goals[0] : null
		if (destination === null) {
			// Autonomy on but nothing to chase: idle the controller and stop the robot.
			navStatus = 'idle'
			input = { leftWheel: 0, rightWheel: 0 }
			autonomous = false
			path = []
		} else {
			// Replan towards the destination on the cadence, or immediately when the
			// waypoints have been used up (so the robot re-derives a route on the
			// now-richer grid rather than coasting on a stale/empty plan).
			const due = state.stepCount - lastPlanStep >= REPLAN_STEP_INTERVAL
			if (due || path.length === 0) {
				const planned = replan({ ...state, goals, path, lastPlanStep })
				path = planned.path
				planClosed = planned.planClosed
				planOpen = planned.planOpen
				lastPlanStep = planned.lastPlanStep
			}

			// The controller chases the head planner waypoint if a plan exists;
			// otherwise it drives straight at the destination (planner fallback).
			const head: Goal = path[0] ?? destination
			const out = controlToGoal(pose, head, state.nav)
			input = out.input
			navStatus = out.status
			if (out.status === 'arrived') {
				if (path.length > 0) {
					// Arrived at a planner waypoint: drop it and keep driving the rest.
					path = path.slice(1)
				} else {
					// Arrived at the true destination: pop it, replan toward the next,
					// and stop autonomy if the queue is now empty.
					goals = popGoal(goals)
					path = []
					if (goals.length === 0) {
						autonomous = false
						navStatus = 'idle'
					} else {
						const next = replan({ ...state, goals, path, lastPlanStep: state.stepCount })
						path = next.path
						planClosed = next.planClosed
						planOpen = next.planOpen
						lastPlanStep = next.lastPlanStep
					}
				}
			}
		}
	} else {
		// Manual mode: the controller isn't running, so report idle.
		navStatus = 'idle'
		path = []
	}

	const robot = stepDifferentialDrive(state.robot, input, dt)
	const scan = state.world ? createScan(state.lidar, robot.pose, state.world) : null
	// Integrate the scan into the occupancy grid. The grid object is preserved
	// across steps (mutated in place) so the map accumulates over time.
	if (scan && state.grid && state.world) applyScan(state.grid, scan, state.world)
	return {
		...state,
		time: state.time + dt,
		robot,
		input,
		goals,
		autonomous,
		navStatus,
		stepCount: state.stepCount + 1,
		scan,
		grid: state.grid,
		path,
		planClosed,
		planOpen,
		lastPlanStep,
	}
}

/**
 * Feed measured wall-clock delta into the accumulator and drain it in fixed
 * steps. `frameSeconds` is clamped by `maxFrameSeconds` so a stalled tab or
 * debugger pause can't trigger a "spiral of death" of catch-up steps.
 *
 * Returns the new state plus the intermediate snapshots produced during the
 * catch-up, so renderers can sample them for trails / motion blur if desired.
 *
 * Pure and deterministic: owns no timers; the caller supplies elapsed time.
 */
export function accumulate(
	state: SimState,
	frameSeconds: number,
	maxFrameSeconds: number = MAX_FRAME_TIME,
): { state: SimState; snapshots: SimState[] } {
	if (!state.running) return { state, snapshots: [] }
	const clamped = Math.max(0, Math.min(frameSeconds, maxFrameSeconds))
	let next: SimState = { ...state, accumulator: state.accumulator + clamped }
	const snapshots: SimState[] = []
	while (next.accumulator >= FIXED_DT) {
		next = stepSimulation(next, FIXED_DT)
		next = { ...next, accumulator: next.accumulator - FIXED_DT }
		snapshots.push(next)
		// Guards against misconfiguration spiralling into an infinite loop.
		if (FIXED_DT <= 0) {
			next = { ...next, accumulator: 0 }
			break
		}
	}
	return { state: next, snapshots }
}

/** Run the simulation for a fixed length of simulated time. Handy for tests. */
export function runFor(state: SimState, seconds: number, dt: number = FIXED_DT): SimState {
	const steps = Math.max(0, Math.round(seconds / dt))
	let s = state
	for (let i = 0; i < steps; i++) s = stepSimulation(s, dt)
	return s
}

/** Clear every cell of the occupancy grid back to unknown. No-op if no grid. */
export function clearOccupancyGrid(state: SimState): SimState {
	if (state.grid) resetGrid(state.grid)
	return state
}
