import { clamp } from '@robotics-lab/math'
import { DEFAULT_QUADCOPTER_PARAMS, type DroneState, type QuadcopterParams } from './index'
import { DEFAULT_PHYSICS_CONFIG, type DronePhysicsConfig, stepDronePhysics } from './physics'

export const DEFAULT_FIXED_DELTA_SECONDS = 1 / 120
export const MAX_RENDER_DELTA_SECONDS = 0.25
export const MAX_SUBSTEPS = 120
export const TIME_SCALE_OPTIONS = [0.25, 0.5, 1, 2, 4] as const
const STEP_EPSILON = 1e-12

export type TimeScale = (typeof TIME_SCALE_OPTIONS)[number]

export type SimulationClock = {
	elapsedSeconds: number
	accumulatorSeconds: number
	fixedDeltaSeconds: number
	interpolationAlpha: number
	running: boolean
	stepCount: number
	timeScale: TimeScale
}

export type DroneSimulation = {
	drone: DroneState
	initialDrone: DroneState
	params: QuadcopterParams
	physics: DronePhysicsConfig
	clock: SimulationClock
}

export type SimulationOptions = {
	fixedDeltaSeconds?: number
	params?: QuadcopterParams
	physics?: DronePhysicsConfig
	running?: boolean
	timeScale?: TimeScale
}

function cloneDroneState(state: DroneState): DroneState {
	return {
		...state,
		position: { ...state.position },
		orientation: { ...state.orientation },
		velocity: { ...state.velocity },
		angularVelocity: { ...state.angularVelocity },
		motorSpeeds: [...state.motorSpeeds],
	}
}

export function createDroneSimulation(
	initialDrone: DroneState,
	options: SimulationOptions = {},
): DroneSimulation {
	const fixedDeltaSeconds = options.fixedDeltaSeconds ?? DEFAULT_FIXED_DELTA_SECONDS
	if (!Number.isFinite(fixedDeltaSeconds) || fixedDeltaSeconds <= 0) {
		throw new Error('Simulation fixed delta must be greater than zero')
	}
	const drone = cloneDroneState(initialDrone)
	return {
		drone,
		initialDrone: cloneDroneState(initialDrone),
		params: options.params ?? DEFAULT_QUADCOPTER_PARAMS,
		physics: options.physics ?? DEFAULT_PHYSICS_CONFIG,
		clock: {
			elapsedSeconds: 0,
			accumulatorSeconds: 0,
			fixedDeltaSeconds,
			interpolationAlpha: 0,
			running: options.running ?? true,
			stepCount: 0,
			timeScale: options.timeScale ?? 1,
		},
	}
}

/**
 * Drain a measured render-frame delta through integer fixed simulation steps.
 * The leftover accumulator becomes an interpolation fraction for renderers.
 */
export function advanceDroneSimulation(
	simulation: DroneSimulation,
	renderDeltaSeconds: number,
): DroneSimulation {
	if (!simulation.clock.running || renderDeltaSeconds <= 0) return simulation

	const frameDelta = clamp(renderDeltaSeconds, 0, MAX_RENDER_DELTA_SECONDS)
	const fixedDelta = simulation.clock.fixedDeltaSeconds
	let accumulator = simulation.clock.accumulatorSeconds + frameDelta * simulation.clock.timeScale
	let elapsedSeconds = simulation.clock.elapsedSeconds
	let stepCount = simulation.clock.stepCount
	let drone = simulation.drone
	let substeps = 0

	while (accumulator >= fixedDelta - STEP_EPSILON && substeps < MAX_SUBSTEPS) {
		drone = stepDronePhysics(drone, simulation.params, fixedDelta, simulation.physics)
		accumulator = Math.max(0, accumulator - fixedDelta)
		elapsedSeconds += fixedDelta
		stepCount += 1
		substeps += 1
	}

	// Drop excess accumulated time after the safety ceiling instead of entering
	// a spiral of death after a heavily throttled browser tab resumes.
	if (substeps === MAX_SUBSTEPS && accumulator >= fixedDelta) {
		accumulator %= fixedDelta
	}

	return {
		...simulation,
		drone,
		clock: {
			...simulation.clock,
			accumulatorSeconds: accumulator,
			elapsedSeconds,
			interpolationAlpha: accumulator / fixedDelta,
			stepCount,
		},
	}
}

export function pauseDroneSimulation(simulation: DroneSimulation): DroneSimulation {
	if (!simulation.clock.running) return simulation
	return { ...simulation, clock: { ...simulation.clock, running: false } }
}

export function resumeDroneSimulation(simulation: DroneSimulation): DroneSimulation {
	if (simulation.clock.running) return simulation
	return { ...simulation, clock: { ...simulation.clock, running: true } }
}

export function resetDroneSimulation(simulation: DroneSimulation): DroneSimulation {
	return createDroneSimulation(simulation.initialDrone, {
		fixedDeltaSeconds: simulation.clock.fixedDeltaSeconds,
		params: simulation.params,
		physics: simulation.physics,
		running: false,
		timeScale: 1,
	})
}

export function setDroneSimulationTimeScale(
	simulation: DroneSimulation,
	timeScale: TimeScale,
): DroneSimulation {
	if (simulation.clock.timeScale === timeScale) return simulation
	return { ...simulation, clock: { ...simulation.clock, timeScale } }
}
