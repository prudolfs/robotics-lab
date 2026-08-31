import { clamp } from '@robotics-lab/math'
import {
	armDrone,
	type DroneState,
	disarmDrone,
	type QuadcopterParams,
	type Vector3State,
} from './index'
import { droneGroundClearance } from './physics'

export type ExecutableMissionItem =
	| { id: string; type: 'takeoff'; altitude: number }
	| { id: string; type: 'land' }
	| { id: string; type: 'waypoint'; position: { x: number; z: number }; altitude: number | null }
	| { id: string; type: 'rtl' }
	| { id: string; type: 'hold'; duration: number }
	| { id: string; type: 'speed'; speed: number }
	| { id: string; type: 'camera'; action: 'photo' }

export type MissionPhase =
	| 'idle'
	| 'armed'
	| 'taking-off'
	| 'flying'
	| 'holding'
	| 'landing'
	| 'disarmed'

export type MissionExecutionMode = 'mission' | 'rtl' | 'land'

export type MissionExecutionConfig = {
	cruiseSpeed: number
	arrivalRadius: number
	velocityDamping: number
	maxYawRate: number
	groundHeight: number
}

export type MissionExecution = {
	items: ExecutableMissionItem[]
	phase: MissionPhase
	mode: MissionExecutionMode
	currentIndex: number
	itemElapsedSeconds: number
	running: boolean
	paused: boolean
	completed: boolean
	emergencyStopped: boolean
	home: Vector3State
	target: Vector3State | null
	cruiseSpeed: number
	progress: number
}

export type MissionStepResult = {
	execution: MissionExecution
	drone: DroneState
}

export const DEFAULT_MISSION_EXECUTION_CONFIG: MissionExecutionConfig = {
	cruiseSpeed: 3,
	arrivalRadius: 0.15,
	velocityDamping: 5,
	maxYawRate: 2.2,
	groundHeight: 0,
}

export function createMissionExecution(
	items: ExecutableMissionItem[],
	drone: DroneState,
	params: QuadcopterParams,
	config: MissionExecutionConfig = DEFAULT_MISSION_EXECUTION_CONFIG,
): MissionExecution {
	return {
		items,
		phase: 'idle',
		mode: 'mission',
		currentIndex: 0,
		itemElapsedSeconds: 0,
		running: false,
		paused: false,
		completed: false,
		emergencyStopped: false,
		home: {
			x: drone.position.x,
			y: config.groundHeight + droneGroundClearance(params),
			z: drone.position.z,
		},
		target: null,
		cruiseSpeed: config.cruiseSpeed,
		progress: 0,
	}
}

export function armMissionExecution(execution: MissionExecution): MissionExecution {
	return {
		...execution,
		phase: 'armed',
		completed: false,
		emergencyStopped: false,
	}
}

export function startMissionExecution(execution: MissionExecution): MissionExecution {
	return {
		...execution,
		phase: 'armed',
		mode: 'mission',
		currentIndex: execution.completed ? 0 : execution.currentIndex,
		itemElapsedSeconds: 0,
		running: true,
		paused: false,
		completed: false,
		emergencyStopped: false,
		target: null,
		progress: execution.completed ? 0 : execution.progress,
	}
}

export function pauseMissionExecution(execution: MissionExecution): MissionExecution {
	return execution.running ? { ...execution, paused: true } : execution
}

export function resumeMissionExecution(execution: MissionExecution): MissionExecution {
	return execution.running ? { ...execution, paused: false } : execution
}

export function requestMissionRtl(execution: MissionExecution): MissionExecution {
	return {
		...execution,
		mode: 'rtl',
		phase: 'flying',
		running: true,
		paused: false,
		completed: false,
		emergencyStopped: false,
		target: null,
	}
}

export function requestMissionLand(execution: MissionExecution): MissionExecution {
	return {
		...execution,
		mode: 'land',
		phase: 'landing',
		running: true,
		paused: false,
		target: null,
	}
}

export function emergencyStopMission(execution: MissionExecution): MissionExecution {
	return {
		...execution,
		phase: 'disarmed',
		running: false,
		paused: false,
		emergencyStopped: true,
		target: null,
	}
}

export function disarmMissionExecution(execution: MissionExecution): MissionExecution {
	return {
		...execution,
		phase: 'disarmed',
		running: false,
		paused: false,
		target: null,
	}
}

export function stepMissionExecution(
	execution: MissionExecution,
	drone: DroneState,
	params: QuadcopterParams,
	deltaSeconds: number,
	config: MissionExecutionConfig = DEFAULT_MISSION_EXECUTION_CONFIG,
): MissionStepResult {
	if (!execution.running || execution.paused || deltaSeconds <= 0) {
		return { execution, drone }
	}
	const armedDrone = armDrone(drone, params)
	if (execution.mode === 'rtl') {
		const target = {
			x: execution.home.x,
			y: Math.max(armedDrone.position.y, execution.home.y + 2),
			z: execution.home.z,
		}
		const moved = moveDroneTowards(
			armedDrone,
			target,
			execution.cruiseSpeed,
			deltaSeconds,
			params,
			config,
		)
		if (moved.arrived) {
			return {
				execution: { ...execution, mode: 'land', phase: 'landing', target: execution.home },
				drone: moved.drone,
			}
		}
		return { execution: { ...execution, phase: 'flying', target }, drone: moved.drone }
	}
	if (execution.mode === 'land') {
		const moved = moveDroneTowards(
			armedDrone,
			execution.home,
			Math.min(execution.cruiseSpeed, 1.5),
			deltaSeconds,
			params,
			config,
		)
		if (moved.arrived) {
			return completeMission(execution, moved.drone)
		}
		return {
			execution: { ...execution, phase: 'landing', target: execution.home },
			drone: moved.drone,
		}
	}

	let current = execution
	let currentDrone = armedDrone
	for (let skipped = 0; skipped <= execution.items.length; skipped += 1) {
		const item = current.items[current.currentIndex]
		if (!item) return completeMission(current, currentDrone)

		if (item.type === 'speed') {
			current = advanceItem({ ...current, cruiseSpeed: Math.max(0.1, item.speed) })
			continue
		}
		if (item.type === 'camera') {
			current = advanceItem(current)
			continue
		}
		if (item.type === 'hold') {
			const elapsed = current.itemElapsedSeconds + deltaSeconds
			const heldDrone = hoverDrone(currentDrone, params, 'holding')
			if (elapsed >= item.duration) return { execution: advanceItem(current), drone: heldDrone }
			return {
				execution: { ...current, phase: 'holding', itemElapsedSeconds: elapsed, target: null },
				drone: heldDrone,
			}
		}

		const phase: MissionPhase =
			item.type === 'takeoff' ? 'taking-off' : item.type === 'land' ? 'landing' : 'flying'
		const target = targetForItem(item, current, currentDrone, config)
		const speed = item.type === 'land' ? Math.min(current.cruiseSpeed, 1.5) : current.cruiseSpeed
		const moved = moveDroneTowards(currentDrone, target, speed, deltaSeconds, params, config, phase)
		if (!moved.arrived) {
			return { execution: { ...current, phase, target }, drone: moved.drone }
		}
		if (item.type === 'land') return completeMission(current, moved.drone)
		current = advanceItem(current)
		currentDrone = moved.drone
		return { execution: current, drone: currentDrone }
	}
	return completeMission(current, currentDrone)
}

function targetForItem(
	item: Exclude<ExecutableMissionItem, { type: 'speed' | 'camera' | 'hold' }>,
	execution: MissionExecution,
	drone: DroneState,
	config: MissionExecutionConfig,
): Vector3State {
	if (item.type === 'takeoff') {
		return { x: execution.home.x, y: config.groundHeight + item.altitude, z: execution.home.z }
	}
	if (item.type === 'land') return execution.home
	if (item.type === 'rtl') {
		return { x: execution.home.x, y: drone.position.y, z: execution.home.z }
	}
	return {
		x: item.position.x,
		y: item.altitude ?? drone.position.y,
		z: item.position.z,
	}
}

function moveDroneTowards(
	drone: DroneState,
	target: Vector3State,
	speed: number,
	deltaSeconds: number,
	params: QuadcopterParams,
	config: MissionExecutionConfig,
	phase: MissionPhase = 'flying',
): { drone: DroneState; arrived: boolean } {
	const offset = {
		x: target.x - drone.position.x,
		y: target.y - drone.position.y,
		z: target.z - drone.position.z,
	}
	const distance = Math.hypot(offset.x, offset.y, offset.z)
	if (distance <= config.arrivalRadius) {
		return {
			drone: hoverDrone({ ...drone, position: { ...target } }, params, phase),
			arrived: true,
		}
	}
	const desiredSpeed = Math.min(speed, distance * 2.5)
	const desiredVelocity = {
		x: (offset.x / distance) * desiredSpeed,
		y: (offset.y / distance) * desiredSpeed,
		z: (offset.z / distance) * desiredSpeed,
	}
	const velocityAlpha = 1 - Math.exp(-config.velocityDamping * deltaSeconds)
	const velocity = {
		x: drone.velocity.x + (desiredVelocity.x - drone.velocity.x) * velocityAlpha,
		y: drone.velocity.y + (desiredVelocity.y - drone.velocity.y) * velocityAlpha,
		z: drone.velocity.z + (desiredVelocity.z - drone.velocity.z) * velocityAlpha,
	}
	const stepDistance = Math.hypot(velocity.x, velocity.y, velocity.z) * deltaSeconds
	const position =
		stepDistance >= distance
			? { ...target }
			: {
					x: drone.position.x + velocity.x * deltaSeconds,
					y: drone.position.y + velocity.y * deltaSeconds,
					z: drone.position.z + velocity.z * deltaSeconds,
				}
	const horizontalDistance = Math.hypot(offset.x, offset.z)
	const currentYaw = quaternionYaw(drone.orientation)
	const desiredYaw =
		horizontalDistance > config.arrivalRadius ? Math.atan2(offset.z, offset.x) : currentYaw
	const yawDelta = normalizeAngle(desiredYaw - currentYaw)
	const yawStep = clamp(
		yawDelta,
		-config.maxYawRate * deltaSeconds,
		config.maxYawRate * deltaSeconds,
	)
	const yaw = currentYaw + yawStep
	const hoverSpeed = Math.sqrt((params.mass * 9.81) / (4 * params.thrustCoefficient))
	return {
		drone: {
			...drone,
			position,
			velocity,
			angularVelocity: { x: 0, y: yawStep / deltaSeconds, z: 0 },
			orientation: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
			missionState: phase,
			motorSpeeds: [hoverSpeed, hoverSpeed, hoverSpeed, hoverSpeed],
		},
		arrived: false,
	}
}

function hoverDrone(drone: DroneState, params: QuadcopterParams, phase: MissionPhase): DroneState {
	const hoverSpeed = Math.sqrt((params.mass * 9.81) / (4 * params.thrustCoefficient))
	return {
		...drone,
		velocity: { x: 0, y: 0, z: 0 },
		angularVelocity: { x: 0, y: 0, z: 0 },
		missionState: phase,
		motorSpeeds: [hoverSpeed, hoverSpeed, hoverSpeed, hoverSpeed],
	}
}

function advanceItem(execution: MissionExecution): MissionExecution {
	const currentIndex = execution.currentIndex + 1
	return {
		...execution,
		currentIndex,
		itemElapsedSeconds: 0,
		target: null,
		progress: Math.min(1, currentIndex / Math.max(1, execution.items.length)),
	}
}

function completeMission(execution: MissionExecution, drone: DroneState): MissionStepResult {
	return {
		execution: {
			...execution,
			phase: 'disarmed',
			currentIndex: execution.items.length,
			itemElapsedSeconds: 0,
			running: false,
			paused: false,
			completed: true,
			target: null,
			progress: 1,
		},
		drone: disarmDrone({ ...drone, velocity: { x: 0, y: 0, z: 0 } }),
	}
}

function normalizeAngle(angle: number): number {
	return Math.atan2(Math.sin(angle), Math.cos(angle))
}

function quaternionYaw(orientation: DroneState['orientation']): number {
	return Math.atan2(
		2 * (orientation.w * orientation.y + orientation.x * orientation.z),
		1 - 2 * (orientation.y * orientation.y + orientation.z * orientation.z),
	)
}
