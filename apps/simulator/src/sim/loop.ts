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
import {
	controlToGoal,
	DEFAULT_NAV_CONFIG,
	type Goal,
	type NavConfig,
	type NavStatus,
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
	/** FIFO of pending navigation goals. The head is the active goal. */
	goals: Goal[]
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
	/** When true, the sim drives the robot towards its queued goals; default false. */
	autonomous?: boolean
}

export const DEFAULT_LIDAR_CONFIG = createLidarConfig()

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
		goals: [],
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

/** Replace the goal queue with a single goal, turning autonomy on. */
export function setGoal(state: SimState, goal: Goal): SimState {
	return { ...state, goals: [goal], autonomous: true }
}

/** Replace the goal queue with a list of goals, turning autonomy on. */
export function setGoals(state: SimState, goals: Goal[]): SimState {
	return { ...state, goals, autonomous: true }
}

/** Append a goal to the back of the queue. Leaves the autonomous flag alone
 *  so the user can pre-stage waypoints before enabling autonomy. */
export function enqueueGoal(state: SimState, goal: Goal): SimState {
	return { ...state, goals: [...state.goals, goal] }
}

/** Empty the goal queue but leave autonomy as-is so the robot stops. */
export function clearGoals(state: SimState): SimState {
	return state.goals.length === 0 ? state : { ...state, goals: [] }
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
	let goals = state.goals
	let autonomous = state.autonomous
	let navStatus = state.navStatus
	let input = state.input
	if (state.autonomous) {
		const head = goals.length > 0 ? goals[0] : null
		if (head === null) {
			// Autonomy on but nothing to chase: idle the controller and stop the robot.
			navStatus = 'idle'
			input = { leftWheel: 0, rightWheel: 0 }
			autonomous = false
		} else {
			const out = controlToGoal(state.robot.pose, head, state.nav)
			input = out.input
			navStatus = out.status
			if (out.status === 'arrived') {
				goals = popGoal(goals)
				if (goals.length === 0) autonomous = false // nothing left to chase
			}
		}
	} else {
		// Manual mode: the controller isn't running, so report idle.
		navStatus = 'idle'
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
