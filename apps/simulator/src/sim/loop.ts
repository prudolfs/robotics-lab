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
	type CoverageConfig,
	controlToGoal,
	coveragePath,
	DEFAULT_COVERAGE_CONFIG,
	DEFAULT_NAV_CONFIG,
	type Goal,
	type NavConfig,
	type NavStatus,
	type PlannerOptions,
	type PlanResult,
	planPath,
	popGoal,
} from '@robotics-lab/navigation'
import { seededRng } from '@robotics-lab/noise'
import {
	applyScan,
	cellCenterWorld,
	createGrid,
	type OccupancyGrid,
	resetGrid,
	worldToCell,
} from '@robotics-lab/occupancy-grid'
import {
	clearOdometryHistory,
	createOdometry,
	createRobot,
	type OdometryState,
	type RobotParams,
	resetOdometry,
	stepDifferentialDrive,
	stepOdometry,
	type WheelSpeeds,
} from '@robotics-lab/robot'
import {
	createLidarConfig,
	createScan,
	type LidarConfig,
	type LidarScan,
} from '@robotics-lab/sensors'

import { motionIsClear, NAV_CLEARANCE, robotFootprintRadius } from './collision'
import { navigationGrid } from './navigation-grid'

export type NavigationPlanStatus = PlanResult['status'] | 'idle' | 'direct'

/** Default occupancy grid resolution (metres per cell). */
export const DEFAULT_GRID_RESOLUTION = 0.2
/** Margin around the world floor built into the occupancy grid, in metres. */
export const DEFAULT_GRID_MARGIN = 4
/** Fixed steps between autonomous replan/retry cycles. Goal and world changes
 * replan immediately; the independent swept guard enforces physical safety. */
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
	/** Physical world for collision, known-map planning and lidar. */
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
	/** Last search result; a failed search never falls back to driving straight. */
	planStatus: NavigationPlanStatus
	/** A movement command met a physical obstacle on this step. */
	collision: boolean
	/** Planner tuning (algorithm, inflation, etc.) exposed for the UI. */
	planner: PlannerOptions
	/** When true, the go-to-goal controller overrides the manual drive input
	 *  each fixed step. Toggle off to drop back to keyboard teleop. */
	autonomous: boolean
	/** Status reported by the controller on the last fixed step. Mirrors the
	 *  controller's own enum so the HUD can read it from the sim snapshot. */
	navStatus: NavStatus
	/** When true, the robot is following a generated coverage path. */
	coverageMode: boolean
	/** Whether the coverage run has finished. */
	coverageComplete: boolean
	/** Dead-reckoning odometry estimate derived from commanded wheel speeds
	 *  (milestone 11). Tracks the robot pose independently of ground truth so
	 *  the gap visibly opens up once motion noise is enabled (milestone 10). */
	odometry: OdometryState
}

export type SimOptions = {
	spawnPose?: Pose
	robotParams?: Partial<RobotParams>
	input?: DriveInput
	running?: boolean
	/** Lidar configuration; defaults to a standard 360° 10m sensor. */
	lidar?: LidarConfig
	/** Physical world; null enables obstacle-free kinematics without sensors. */
	world?: World | null
	/** Occupancy grid resolution in metres per cell. */
	gridResolution?: number
	/** Metres of margin around the world floor added to the occupancy grid. */
	gridMargin?: number
	/** Navigation controller tuning; defaults to `DEFAULT_NAV_CONFIG`. */
	nav?: NavConfig
	/** Planner tuning (algorithm / inflation / allow-unknown). Defaults to A*
	 *  with footprint clearance enforced by the navigation costmap. */
	planner?: PlannerOptions
	/** When true, the sim drives the robot towards its queued goals; default false. */
	autonomous?: boolean
}

export const DEFAULT_LIDAR_CONFIG = createLidarConfig()

/** A* on the known map. The costmap already includes full-footprint clearance;
 * inflationRadius adds optional extra clearance in grid cells. */
export const DEFAULT_PLANNER_OPTIONS: PlannerOptions = {
	algorithm: 'astar',
	diagonal: true,
	inflationRadius: 0,
	allowUnknown: true,
}

/** Create an initial simulation state. Defaults to running at the origin. */
export function createSimulation(options: SimOptions = {}): SimState {
	const spawnPose = options.spawnPose ?? { x: 0, y: 0, heading: 0 }
	const robot = createRobot(spawnPose, options.robotParams ?? {})
	const world = options.world ?? null
	const lidar = options.lidar ?? DEFAULT_LIDAR_CONFIG
	const grid = world ? buildGrid(world, options.gridResolution, options.gridMargin) : null
	const odometry = createOdometry(spawnPose, { wheelBase: robot.params.wheelBase })
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
		planStatus: 'idle',
		collision: false,
		lastPlanStep: 0,
		autonomous: options.autonomous ?? false,
		navStatus: 'idle',
		coverageMode: false,
		coverageComplete: false,
		odometry,
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
 *  Plans a path on the loaded map immediately so the robot starts following
 *  the smoothed waypoints on the next fixed step. If no safe route exists, the
 *  destination stays queued and the robot holds position. */
export function setGoal(state: SimState, goal: Goal): SimState {
	const base: SimState = {
		...state,
		goals: [goal],
		autonomous: true,
		coverageMode: false,
		coverageComplete: false,
	}
	return replan(base)
}

/** Replace the goal queue with a list of destinations, turning autonomy on. */
export function setGoals(state: SimState, goals: Goal[]): SimState {
	const base: SimState = {
		...state,
		goals,
		autonomous: goals.length > 0,
		coverageMode: false,
		coverageComplete: false,
	}
	return goals.length === 0
		? {
				...base,
				path: [],
				planStatus: 'idle',
				navStatus: 'idle',
				input: { leftWheel: 0, rightWheel: 0 },
			}
		: replan(base)
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
		planStatus: 'idle',
		collision: false,
		lastPlanStep: 0,
		autonomous: false,
		coverageMode: false,
		coverageComplete: false,
		navStatus: 'idle',
		input: { leftWheel: 0, rightWheel: 0 },
	}
}

/** Replace the planner tuning (algorithm / inflation / unknown handling).
 *  Schedules an immediate replan so the new knobs take effect at once. */
export function setPlannerOptions(state: SimState, planner: PlannerOptions): SimState {
	return { ...state, planner, lastPlanStep: state.stepCount - REPLAN_STEP_INTERVAL }
}

// --- Coverage planning (milestone 9) ---------------------------------------

/** Generate reachable coverage lanes on the footprint-safe map. Each lane
 * destination and every transition is reached through the same A* pipeline. */
export function startCoverage(state: SimState, config?: Partial<CoverageConfig>): SimState {
	if (!state.grid) return state
	if (!state.world) return state
	const merged = { ...DEFAULT_COVERAGE_CONFIG, stripWidth: state.grid.resolution * 2, ...config }
	const safeGrid = navigationGrid(
		state.world,
		state.grid,
		state.robot.params,
		Math.max(merged.inflationRadius, state.planner.inflationRadius ?? 0),
	)
	const robotWorld: Vec2 = { x: state.robot.pose.x, y: state.robot.pose.y }
	const result = coveragePath(safeGrid, robotWorld, { ...merged, inflationRadius: 0 })
	if (result.status !== 'ok' || result.waypoints.length === 0) return state
	return replan({
		...state,
		goals: result.waypoints,
		path: [],
		planClosed: [],
		planOpen: [],
		autonomous: true,
		coverageMode: true,
		coverageComplete: false,
		lastPlanStep: state.stepCount,
	})
}

/** Exit coverage mode, clear goals, and stop the robot. */
export function cancelCoverage(state: SimState): SimState {
	return {
		...state,
		goals: [],
		path: [],
		autonomous: false,
		coverageMode: false,
		coverageComplete: false,
		planStatus: 'idle',
		navStatus: 'idle',
		input: { leftWheel: 0, rightWheel: 0 },
	}
}

// --- Path planning integration (milestone 8) --------------------------------
// `goals` are user/coverage destinations. `path` is the validated A*/Dijkstra
// polyline to the active destination; the controller consumes its corners.

/** Plan against the loaded world's footprint-aware costmap. Lidar mapping is
 * kept separate: noise or an unobserved obstacle cannot erase physical walls.
 * A failed search holds the goal and stops; it never commands a direct fallback.
 */
export function replan(state: SimState): SimState {
	const target = state.goals[0]
	const empty = { ...state, path: [], planClosed: [], planOpen: [], lastPlanStep: state.stepCount }
	if (!target) return { ...empty, planStatus: 'idle' }
	if (!state.world) return { ...empty, planStatus: 'direct' }
	if (!state.grid)
		return {
			...empty,
			planStatus: 'no_path',
			navStatus: 'blocked',
			input: { leftWheel: 0, rightWheel: 0 },
		}
	const radius = robotFootprintRadius(state.robot.params) + NAV_CLEARANCE
	if (!motionIsClear(state.world, target, target, radius)) {
		return {
			...empty,
			planStatus: 'invalid_goal',
			navStatus: 'blocked',
			input: { leftWheel: 0, rightWheel: 0 },
		}
	}
	const grid = navigationGrid(
		state.world,
		state.grid,
		state.robot.params,
		state.planner.inflationRadius,
	)
	const start: Vec2 = state.robot.pose
	const options = { ...state.planner, inflationRadius: 0 }
	let result = planPath(grid, start, target, options)
	let connector: Goal | null = null
	// Recover from manual contact: the body may be clear while its grid cell
	// lies inside the planner's extra margin. Sweep to a nearby free cell first.
	const bodyRadius = robotFootprintRadius(state.robot.params)
	if (result.status === 'invalid_start' && motionIsClear(state.world, start, start, bodyRadius)) {
		const cell = worldToCell(grid, start)
		const candidates: Goal[] = []
		for (let dr = -4; dr <= 4; dr++) {
			for (let dc = -4; dc <= 4; dc++) {
				const col = cell.col + dc,
					row = cell.row + dr
				if (
					col >= 0 &&
					row >= 0 &&
					col < grid.width &&
					row < grid.height &&
					grid.cells[row * grid.width + col] < 0
				) {
					candidates.push(cellCenterWorld(grid, col, row))
				}
			}
		}
		candidates.sort(
			(a, b) => Math.hypot(a.x - start.x, a.y - start.y) - Math.hypot(b.x - start.x, b.y - start.y),
		)
		for (const candidate of candidates) {
			if (!motionIsClear(state.world, start, candidate, bodyRadius)) continue
			const connected = planPath(grid, candidate, target, options)
			if (connected.status === 'ok') {
				result = connected
				connector = candidate
				break
			}
		}
	}
	const path: Goal[] = connector
		? [connector, ...result.waypoints]
		: result.waypoints.map((point) => ({ ...point }))
	if (result.status === 'ok') {
		// Preserve the clicked destination rather than silently ending at its cell
		// center. Only replace the terminal point if the resulting segment is clear.
		const previous = path.length > 1 ? path[path.length - 2] : start
		if (motionIsClear(state.world, previous, target, radius)) path[path.length - 1] = target
		else path.push(target)
		let point: Vec2 = start
		for (const [index, waypoint] of path.entries()) {
			if (
				!motionIsClear(state.world, point, waypoint, connector && index === 0 ? bodyRadius : radius)
			) {
				return {
					...empty,
					planStatus: 'no_path',
					navStatus: 'blocked',
					input: { leftWheel: 0, rightWheel: 0 },
				}
			}
			point = waypoint
		}
	}
	return {
		...state,
		path,
		planClosed: result.closed,
		planOpen: result.open,
		lastPlanStep: state.stepCount,
		planStatus: result.status,
		navStatus: result.status === 'ok' ? 'idle' : 'blocked',
		input: { leftWheel: 0, rightWheel: 0 },
	}
}

/** Toggle autonomous driving on/off. When off, manual teleop input applies. */
export function setAutonomous(state: SimState, autonomous: boolean): SimState {
	// When autonomy is turned off the controller stops driving; zero the input
	// so the robot doesn't keep coasting on the last commanded speeds until the
	// keyboard hook refreshes it next frame.
	if (state.autonomous === autonomous) return state
	if (!autonomous)
		return {
			...state,
			autonomous,
			path: [],
			planStatus: 'idle',
			navStatus: 'idle',
			input: { leftWheel: 0, rightWheel: 0 },
		}
	return { ...state, autonomous }
}

/** Attach (or detach) the world the lidar raycasts against, recomputing the scan. */
export function setSimWorld(state: SimState, world: World | null): SimState {
	if (state.world === world) return state
	const scan = world ? createScan(state.lidar, state.robot.pose, world) : null
	const grid = world ? buildGrid(world) : null
	return replan({ ...state, world, scan, grid, path: [], collision: false })
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
		a.noise === b.noise &&
		a.dropoutRate === b.dropoutRate
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
	const odometry = resetOdometry(state.odometry, state.spawnPose)
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
		planStatus: 'idle',
		collision: false,
		lastPlanStep: 0,
		autonomous: false,
		navStatus: 'idle',
		coverageMode: false,
		coverageComplete: false,
		odometry,
	}
}

/** Linear speed magnitude of a robot. Helper for HUDs and assertions. */
export function robotSpeed(robot: { velocity: Velocity }): number {
	return Math.hypot(robot.velocity.vx, robot.velocity.vy)
}

/** Replace the spawn pose (used on Reset / map switch). Does not move the
 *  current robot; call `resetSimulation` afterwards to send it there. */
export function setSpawnPose(state: SimState, spawnPose: Pose): SimState {
	return state.spawnPose === spawnPose ? state : { ...state, spawnPose }
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

	let {
		goals,
		path,
		planClosed,
		planOpen,
		lastPlanStep,
		planStatus,
		autonomous,
		navStatus,
		input,
		coverageComplete,
	} = state
	const pose = state.robot.pose
	const radius = robotFootprintRadius(state.robot.params)
	const adoptPlan = (planned: SimState) => {
		path = planned.path
		planClosed = planned.planClosed
		planOpen = planned.planOpen
		lastPlanStep = planned.lastPlanStep
		planStatus = planned.planStatus
	}
	if (autonomous) {
		const destination = goals[0]
		input = { leftWheel: 0, rightWheel: 0 }
		if (!destination) {
			autonomous = false
			navStatus = 'idle'
			planStatus = 'idle'
			path = []
			if (state.coverageMode) coverageComplete = true
		} else if (
			(planStatus === 'ok' || planStatus === 'direct') &&
			Math.hypot(destination.x - pose.x, destination.y - pose.y) <= state.nav.arrivalRadius
		) {
			// Only reaching the actual destination can advance the user's goal queue.
			goals = popGoal(goals)
			path = []
			navStatus = 'arrived'
			if (goals.length === 0) {
				autonomous = false
				planStatus = 'idle'
				if (state.coverageMode) coverageComplete = true
			} else adoptPlan(replan({ ...state, goals }))
		} else {
			const due = state.stepCount - lastPlanStep >= REPLAN_STEP_INTERVAL
			if (due || (path.length === 0 && (planStatus === 'ok' || planStatus === 'idle'))) {
				adoptPlan(replan({ ...state, goals }))
			}
			// Consume only reached intermediate waypoints, preserving every corner.
			while (
				path.length > 1 &&
				Math.hypot(path[0].x - pose.x, path[0].y - pose.y) <=
					Math.min(state.nav.arrivalRadius, 0.035) &&
				(!state.world || motionIsClear(state.world, pose, path[1], radius + NAV_CLEARANCE))
			) {
				path = path.slice(1)
			}
			const head = planStatus === 'direct' ? destination : path[0]
			if (head) {
				const out = controlToGoal(
					pose,
					head,
					path.length > 1
						? { ...state.nav, arrivalRadius: Math.min(state.nav.arrivalRadius, 0.035) }
						: state.nav,
				)
				input = out.input
				navStatus = out.status
			} else navStatus = 'blocked'
		}
	} else {
		navStatus = 'idle'
		path = []
		planStatus = 'idle'
	}

	const rng = seededRng(state.stepCount + 1)
	const commandedInput = input
	let robot = stepDifferentialDrive(state.robot, commandedInput, dt, rng)
	let collision = false
	if (state.world && !motionIsClear(state.world, pose, robot.pose, radius)) {
		collision = true
		// Find the last safe position along the *entire* swept movement, rather
		// than accepting a clear endpoint on the far side of a thin obstacle.
		let low = 0
		let high = 1
		for (let i = 0; i < 20; i++) {
			const t = (low + high) / 2
			const point = {
				x: pose.x + (robot.pose.x - pose.x) * t,
				y: pose.y + (robot.pose.y - pose.y) * t,
			}
			if (motionIsClear(state.world, pose, point, radius)) low = t
			else high = t
		}
		robot = {
			...robot,
			pose: {
				...robot.pose,
				x: pose.x + (robot.pose.x - pose.x) * low,
				y: pose.y + (robot.pose.y - pose.y) * low,
			},
			velocity: { vx: 0, vy: 0, omega: robot.velocity.omega },
		}
		if (autonomous) {
			input = { leftWheel: 0, rightWheel: 0 }
			path = []
			navStatus = 'blocked'
			planStatus = 'no_path'
			lastPlanStep = state.stepCount - REPLAN_STEP_INTERVAL
		}
	}

	// Dead reckoning (milestone 11): integrate the *commanded* wheel speeds —
	// the encoder's view, before the noise model perturbs them — so the
	// estimate tracks the truth under perfect motion and visibly drifts once
	// wheel slip / encoder drift are enabled (milestone 10).
	const odometry = stepOdometry(state.odometry, commandedInput, dt)
	const scan = state.world ? createScan(state.lidar, robot.pose, state.world, rng) : null
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
		planStatus,
		collision,
		coverageComplete,
		odometry,
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

/** Clear the dead-reckoning pose history (trail), keeping only the current
 *  estimate. The estimate pose itself is left untouched. (milestone 11) */
export function clearOdometryTrail(state: SimState): SimState {
	return { ...state, odometry: clearOdometryHistory(state.odometry) }
}
