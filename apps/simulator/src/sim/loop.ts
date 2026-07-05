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
}

export const DEFAULT_LIDAR_CONFIG = createLidarConfig()

/** Create an initial simulation state. Defaults to running at the origin. */
export function createSimulation(options: SimOptions = {}): SimState {
	const spawnPose = options.spawnPose ?? { x: 0, y: 0, heading: 0 }
	const robot = createRobot(spawnPose, options.robotParams ?? {})
	const world = options.world ?? null
	const lidar = options.lidar ?? DEFAULT_LIDAR_CONFIG
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
		scan: world ? createScan(lidar, robot.pose, world) : null,
	}
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

/** Attach (or detach) the world the lidar raycasts against, recomputing the scan. */
export function setSimWorld(state: SimState, world: World | null): SimState {
	if (state.world === world) return state
	const scan = world ? createScan(state.lidar, state.robot.pose, world) : null
	return { ...state, world, scan }
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
 * The latest scan is recomputed from the reset pose.
 */
export function resetSimulation(state: SimState): SimState {
	const robot = createRobot(state.spawnPose, state.robot.params)
	const scan = state.world ? createScan(state.lidar, robot.pose, state.world) : null
	return {
		...state,
		time: 0,
		accumulator: 0,
		stepCount: 0,
		robot,
		scan,
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
 * the result as the current state. While running the robot is stepped via the
 * differential-drive model, then the lidar scan is recomputed against the new
 * pose (when a world is attached).
 */
export function stepSimulation(state: SimState, dt: number = FIXED_DT): SimState {
	if (!state.running) return state
	const robot = stepDifferentialDrive(state.robot, state.input, dt)
	const scan = state.world ? createScan(state.lidar, robot.pose, state.world) : null
	return {
		...state,
		time: state.time + dt,
		robot,
		stepCount: state.stepCount + 1,
		scan,
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
