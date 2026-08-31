import { clamp } from '@robotics-lab/math'
import {
	calculateThrustVector,
	calculateTorqueVector,
	type DroneState,
	type QuadcopterParams,
	type QuaternionState,
	type Vector3State,
} from './index'

export type DronePhysicsConfig = {
	gravity: number
	linearDrag: number
	angularDrag: number
	groundHeight: number
	groundRestitution: number
	angularInertia: Vector3State
	maxAngularSpeed: number
}

export type ForceBreakdown = {
	gravity: Vector3State
	thrust: Vector3State
	drag: Vector3State
	groundReaction: Vector3State
	total: Vector3State
}

export const DEFAULT_PHYSICS_CONFIG: DronePhysicsConfig = {
	gravity: 9.81,
	linearDrag: 0.18,
	angularDrag: 0.025,
	groundHeight: 0,
	groundRestitution: 0,
	angularInertia: { x: 0.018, y: 0.032, z: 0.018 },
	maxAngularSpeed: 5,
}

function addVectors(...vectors: Vector3State[]): Vector3State {
	return vectors.reduce(
		(total, vector) => ({
			x: total.x + vector.x,
			y: total.y + vector.y,
			z: total.z + vector.z,
		}),
		{ x: 0, y: 0, z: 0 },
	)
}

export function calculateGravityForce(
	params: QuadcopterParams,
	config: DronePhysicsConfig = DEFAULT_PHYSICS_CONFIG,
): Vector3State {
	return { x: 0, y: -params.mass * config.gravity, z: 0 }
}

export function rotateVectorByQuaternion(
	vector: Vector3State,
	quaternion: QuaternionState,
): Vector3State {
	const { x, y, z, w } = quaternion
	const ix = w * vector.x + y * vector.z - z * vector.y
	const iy = w * vector.y + z * vector.x - x * vector.z
	const iz = w * vector.z + x * vector.y - y * vector.x
	const iw = -x * vector.x - y * vector.y - z * vector.z
	return {
		x: ix * w + iw * -x + iy * -z - iz * -y,
		y: iy * w + iw * -y + iz * -x - ix * -z,
		z: iz * w + iw * -z + ix * -y - iy * -x,
	}
}

export function calculateWorldThrustForce(
	state: DroneState,
	params: QuadcopterParams,
): Vector3State {
	return rotateVectorByQuaternion(
		calculateThrustVector(state.motorSpeeds, params),
		state.orientation,
	)
}

export function calculateDragForce(
	velocity: Vector3State,
	config: DronePhysicsConfig = DEFAULT_PHYSICS_CONFIG,
): Vector3State {
	return {
		x: -velocity.x * config.linearDrag,
		y: -velocity.y * config.linearDrag,
		z: -velocity.z * config.linearDrag,
	}
}

export function droneGroundClearance(params: QuadcopterParams): number {
	return params.bodyRadius * 0.55
}

export function calculateGroundReactionForce(
	state: DroneState,
	forceWithoutGround: Vector3State,
	params: QuadcopterParams,
	config: DronePhysicsConfig = DEFAULT_PHYSICS_CONFIG,
): Vector3State {
	const groundLevel = config.groundHeight + droneGroundClearance(params)
	const atGround = state.position.y <= groundLevel + 1e-6
	if (!atGround || state.velocity.y > 0 || forceWithoutGround.y >= 0) {
		return { x: 0, y: 0, z: 0 }
	}
	return { x: 0, y: -forceWithoutGround.y, z: 0 }
}

export function calculateForces(
	state: DroneState,
	params: QuadcopterParams,
	config: DronePhysicsConfig = DEFAULT_PHYSICS_CONFIG,
): ForceBreakdown {
	const gravity = calculateGravityForce(params, config)
	const thrust = calculateWorldThrustForce(state, params)
	const drag = calculateDragForce(state.velocity, config)
	const forceWithoutGround = addVectors(gravity, thrust, drag)
	const groundReaction = calculateGroundReactionForce(state, forceWithoutGround, params, config)
	return {
		gravity,
		thrust,
		drag,
		groundReaction,
		total: addVectors(forceWithoutGround, groundReaction),
	}
}

function integrateOrientation(
	orientation: QuaternionState,
	angularVelocity: Vector3State,
	deltaSeconds: number,
): QuaternionState {
	const { x, y, z, w } = orientation
	const halfDelta = deltaSeconds * 0.5
	const next = {
		x: x + halfDelta * (w * angularVelocity.x + y * angularVelocity.z - z * angularVelocity.y),
		y: y + halfDelta * (w * angularVelocity.y + z * angularVelocity.x - x * angularVelocity.z),
		z: z + halfDelta * (w * angularVelocity.z + x * angularVelocity.y - y * angularVelocity.x),
		w: w - halfDelta * (x * angularVelocity.x + y * angularVelocity.y + z * angularVelocity.z),
	}
	const magnitude = Math.hypot(next.x, next.y, next.z, next.w) || 1
	return {
		x: next.x / magnitude,
		y: next.y / magnitude,
		z: next.z / magnitude,
		w: next.w / magnitude,
	}
}

/** Extract heading about the scene's +y up axis. */
export function quaternionYaw(orientation: QuaternionState): number {
	return Math.atan2(
		2 * (orientation.w * orientation.y + orientation.x * orientation.z),
		1 - 2 * (orientation.y * orientation.y + orientation.z * orientation.z),
	)
}

/** Apply one deterministic semi-implicit Euler physics step. */
export function stepDronePhysics(
	state: DroneState,
	params: QuadcopterParams,
	deltaSeconds: number,
	config: DronePhysicsConfig = DEFAULT_PHYSICS_CONFIG,
): DroneState {
	if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return state

	const forces = calculateForces(state, params, config)
	const velocity = {
		x: state.velocity.x + (forces.total.x / params.mass) * deltaSeconds,
		y: state.velocity.y + (forces.total.y / params.mass) * deltaSeconds,
		z: state.velocity.z + (forces.total.z / params.mass) * deltaSeconds,
	}
	const position = {
		x: state.position.x + velocity.x * deltaSeconds,
		y: state.position.y + velocity.y * deltaSeconds,
		z: state.position.z + velocity.z * deltaSeconds,
	}

	const torque = calculateTorqueVector(state.motorSpeeds, params)
	const angularVelocity = {
		x: clamp(
			state.angularVelocity.x +
				((torque.x - state.angularVelocity.x * config.angularDrag) / config.angularInertia.x) *
					deltaSeconds,
			-config.maxAngularSpeed,
			config.maxAngularSpeed,
		),
		y: clamp(
			state.angularVelocity.y +
				((torque.y - state.angularVelocity.y * config.angularDrag) / config.angularInertia.y) *
					deltaSeconds,
			-config.maxAngularSpeed,
			config.maxAngularSpeed,
		),
		z: clamp(
			state.angularVelocity.z +
				((torque.z - state.angularVelocity.z * config.angularDrag) / config.angularInertia.z) *
					deltaSeconds,
			-config.maxAngularSpeed,
			config.maxAngularSpeed,
		),
	}
	const orientation = integrateOrientation(state.orientation, angularVelocity, deltaSeconds)

	const groundLevel = config.groundHeight + droneGroundClearance(params)
	let missionState = state.missionState
	if (position.y < groundLevel) {
		position.y = groundLevel
		if (velocity.y < 0) velocity.y = -velocity.y * config.groundRestitution
		if (state.missionState === 'flying') missionState = 'landed'
	}

	return { ...state, position, velocity, angularVelocity, orientation, missionState }
}
