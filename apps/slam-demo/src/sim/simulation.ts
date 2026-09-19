import type { Pose } from '@robotics-lab/core'
import { seededRng } from '@robotics-lab/noise'
import {
	createOdometry,
	createRobot,
	type OdometryState,
	type RobotState,
	stepDifferentialDrive,
	stepOdometry,
	type WheelSpeeds,
} from '@robotics-lab/robot'
import { CRUISE_SPEED, ROUTE_DURATION, routeSegment, SPAWN } from './route'
import { collides } from './world'
export const FIXED_DT = 1 / 60
export const HISTORY_LIMIT = 1800
export type Mode = 'guided' | 'manual'
export type Status = 'ready' | 'running' | 'paused' | 'complete'
export type ManualCommand = { forward: number; turn: number }
export type Config = { seed: number; noise: boolean; mode: Mode }
export type EstimatorSnapshot = {
	status: 'not-connected'
	pose: null
	landmarkCount: 0
	keyframeCount: 0
}
export type Simulation = {
	config: Config
	status: Status
	tick: number
	elapsed: number
	distance: number
	truth: RobotState
	odometry: OdometryState
	estimator: EstimatorSnapshot
	truthTrail: Pose[]
	collision: boolean
	collisionCount: number
	segment: string
}
const stoppedWheels: WheelSpeeds = { leftWheel: 0, rightWheel: 0 }
export function createSimulation(config: Partial<Config> = {}): Simulation {
	const settings = { seed: 42, noise: true, mode: 'guided' as Mode, ...config }
	return {
		config: settings,
		status: 'ready',
		tick: 0,
		elapsed: 0,
		distance: 0,
		truth: createRobot(
			{ ...SPAWN },
			{
				wheelBase: 0.4,
				wheelRadius: 0.08,
				noise: { wheelSlipSigma: settings.noise ? 0.025 : 0, encoderDriftSigma: 0 },
			},
		),
		odometry: createOdometry(
			{ ...SPAWN },
			{ wheelBase: 0.4, historyLimit: HISTORY_LIMIT, sampleInterval: 6 },
		),
		estimator: { status: 'not-connected', pose: null, landmarkCount: 0, keyframeCount: 0 },
		truthTrail: [{ ...SPAWN }],
		collision: false,
		collisionCount: 0,
		segment: 'At charging dock',
	}
}
export function setStatus(state: Simulation, status: Status): Simulation {
	if (status === 'running' && state.status === 'complete') return state
	return {
		...state,
		status,
		truth: { ...state.truth, wheels: stoppedWheels, velocity: { vx: 0, vy: 0, omega: 0 } },
		odometry: { ...state.odometry, wheels: stoppedWheels, velocity: { vx: 0, vy: 0, omega: 0 } },
	}
}
export function stepSimulation(
	state: Simulation,
	input: ManualCommand = { forward: 0, turn: 0 },
): Simulation {
	if (state.status !== 'running') return state
	const rng = seededRng((state.config.seed ^ Math.imul(state.tick + 1, 0x9e3779b9)) >>> 0)
	let truth = state.truth,
		odometry = state.odometry,
		elapsed = state.elapsed,
		remaining = FIXED_DT,
		distance = state.distance,
		collision = false,
		segment = state.segment
	// Split a fixed tick only at route command boundaries, so render cadence cannot change the route.
	while (remaining > 1e-10) {
		const part = state.config.mode === 'guided' ? routeSegment(elapsed) : null
		if (state.config.mode === 'guided' && !part) break
		const dt = part ? Math.min(remaining, part.end - elapsed) : remaining
		const v = part ? CRUISE_SPEED : Math.max(-1, Math.min(1, input.forward)) * 0.45
		const omega = part ? part.omega : Math.max(-1, Math.min(1, input.turn)) * 1.2
		const wheels = { leftWheel: v - omega * 0.2, rightWheel: v + omega * 0.2 }
		let next = stepDifferentialDrive(truth, wheels, dt, rng)
		const blocked = collides(next.pose)
		if (blocked) {
			next = {
				...next,
				pose: truth.pose,
				wheels: stoppedWheels,
				velocity: { vx: 0, vy: 0, omega: 0 },
			}
			collision = true
		}
		// Encoders integrate commanded contact speeds, with explicit calibration bias in noisy mode.
		// During contact, wheels are modeled as stalled: no fabricated encoder travel through a wall.
		const bias = state.config.noise ? 0.006 : 0
		const reported = blocked
			? stoppedWheels
			: { leftWheel: wheels.leftWheel * (1 + bias), rightWheel: wheels.rightWheel * (1 - bias) }
		odometry = stepOdometry(odometry, reported, dt)
		distance += Math.hypot(next.pose.x - truth.pose.x, next.pose.y - truth.pose.y)
		truth = next
		elapsed += dt
		remaining -= dt
		segment = part?.label ?? 'Manual control'
	}
	const tick = state.tick + 1
	const complete = state.config.mode === 'guided' && elapsed >= ROUTE_DURATION - 1e-9
	const truthTrail =
		tick % 6 === 0 || complete
			? [...state.truthTrail, truth.pose].slice(-HISTORY_LIMIT)
			: state.truthTrail
	const next: Simulation = {
		...state,
		truth,
		odometry,
		elapsed,
		tick,
		distance,
		truthTrail,
		collision,
		collisionCount: state.collisionCount + (collision && !state.collision ? 1 : 0),
		segment: complete ? 'Loop complete' : segment,
		status: complete
			? 'complete'
			: collision && state.config.mode === 'guided'
				? 'paused'
				: 'running',
	}
	return next.status === 'running' ? next : setStatus(next, next.status)
}
