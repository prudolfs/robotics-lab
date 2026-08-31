import { createDroneState, DEFAULT_QUADCOPTER_PARAMS } from './index'
import {
	armMissionExecution,
	createMissionExecution,
	emergencyStopMission,
	pauseMissionExecution,
	requestMissionRtl,
	resumeMissionExecution,
	startMissionExecution,
	stepMissionExecution,
} from './mission'
import { droneGroundClearance } from './physics'

const params = DEFAULT_QUADCOPTER_PARAMS
const fixedDelta = 1 / 120

describe('mission execution', () => {
	it('flies a complete mission through every flight phase and disarms', () => {
		let drone = createDroneState({
			position: { x: 0, y: droneGroundClearance(params), z: 0 },
		})
		let execution = startMissionExecution(
			armMissionExecution(
				createMissionExecution(
					[
						{ id: 'takeoff', type: 'takeoff', altitude: 0.6 },
						{ id: 'waypoint', type: 'waypoint', position: { x: 0.8, z: 0.4 }, altitude: 0.8 },
						{ id: 'hold', type: 'hold', duration: 0.1 },
						{ id: 'speed', type: 'speed', speed: 2 },
						{ id: 'camera', type: 'camera', action: 'photo' },
						{ id: 'rtl', type: 'rtl' },
						{ id: 'land', type: 'land' },
					],
					drone,
					params,
				),
			),
		)
		const phases = new Set([execution.phase])

		for (let step = 0; step < 5000 && execution.running; step += 1) {
			const result = stepMissionExecution(execution, drone, params, fixedDelta)
			execution = result.execution
			drone = result.drone
			phases.add(execution.phase)
		}

		expect(phases).toEqual(
			new Set(['armed', 'taking-off', 'flying', 'holding', 'landing', 'disarmed']),
		)
		expect(execution).toMatchObject({ completed: true, progress: 1, running: false })
		expect(drone.position).toEqual(execution.home)
		expect(drone.motorSpeeds).toEqual([0, 0, 0, 0])
	})

	it('pauses and resumes without advancing the vehicle', () => {
		const drone = createDroneState()
		let execution = startMissionExecution(
			createMissionExecution([{ id: 'takeoff', type: 'takeoff', altitude: 2 }], drone, params),
		)
		execution = pauseMissionExecution(execution)
		const paused = stepMissionExecution(execution, drone, params, 1)

		expect(paused.drone).toBe(drone)
		expect(paused.execution.currentIndex).toBe(0)
		expect(resumeMissionExecution(paused.execution).paused).toBe(false)
	})

	it('aligns yaw with travel heading and detects arrival', () => {
		let drone = createDroneState()
		let execution = startMissionExecution(
			createMissionExecution(
				[{ id: 'east', type: 'waypoint', position: { x: 0, z: 1 }, altitude: 0 }],
				drone,
				params,
			),
		)

		for (let step = 0; step < 1000 && execution.running; step += 1) {
			const result = stepMissionExecution(execution, drone, params, fixedDelta)
			execution = result.execution
			drone = result.drone
		}

		const yaw = Math.atan2(
			2 * (drone.orientation.w * drone.orientation.y),
			1 - 2 * drone.orientation.y * drone.orientation.y,
		)
		expect(yaw).toBeCloseTo(Math.PI / 2, 1)
		expect(execution.completed).toBe(true)
	})

	it('supports RTL override and emergency stop', () => {
		const drone = createDroneState({ position: { x: 4, y: 3, z: -2 } })
		const created = createMissionExecution([], drone, params)
		const rtl = requestMissionRtl(created)
		const stopped = emergencyStopMission(rtl)

		expect(rtl).toMatchObject({ mode: 'rtl', running: true, phase: 'flying' })
		expect(stopped).toMatchObject({ running: false, phase: 'disarmed', emergencyStopped: true })
	})
})
