import { applyManualControl, armDrone, disarmDrone, mixManualMotorSpeeds } from './controls'
import { createDroneState, DEFAULT_QUADCOPTER_PARAMS } from './index'

const params = DEFAULT_QUADCOPTER_PARAMS

describe('manual flight controls', () => {
	it('mixes neutral input into balanced hover speed', () => {
		const speeds = mixManualMotorSpeeds({ throttle: 0, yaw: 0, pitch: 0, roll: 0 }, params)
		expect(new Set(speeds).size).toBe(1)
		expect(speeds[0]).toBeCloseTo(params.hoverThrottle * params.maxMotorSpeed)
	})

	it('mixes independent yaw, pitch, and roll commands', () => {
		const yaw = mixManualMotorSpeeds({ throttle: 0, yaw: 1, pitch: 0, roll: 0 }, params)
		const pitch = mixManualMotorSpeeds({ throttle: 0, yaw: 0, pitch: 1, roll: 0 }, params)
		const roll = mixManualMotorSpeeds({ throttle: 0, yaw: 0, pitch: 0, roll: 1 }, params)

		expect(yaw[0]).toBeGreaterThan(yaw[1])
		expect(yaw[2]).toBeGreaterThan(yaw[3])
		expect(pitch[0]).toBeGreaterThan(pitch[3])
		expect(pitch[1]).toBeGreaterThan(pitch[2])
		expect(roll[0]).toBeGreaterThan(roll[1])
		expect(roll[3]).toBeGreaterThan(roll[2])
	})

	it('scales control authority and clamps motor speeds', () => {
		const normal = mixManualMotorSpeeds({ throttle: 0, yaw: 0, pitch: 0, roll: 1 }, params, 1)
		const fast = mixManualMotorSpeeds({ throttle: 0, yaw: 0, pitch: 0, roll: 1 }, params, 1.5)
		const saturated = mixManualMotorSpeeds({ throttle: 1, yaw: 1, pitch: 1, roll: 1 }, params, 1.5)

		expect(fast[0] - fast[1]).toBeGreaterThan(normal[0] - normal[1])
		expect(saturated.every((speed) => speed >= 0 && speed <= params.maxMotorSpeed)).toBe(true)
	})

	it('arms, applies input, and disarms with stopped motors', () => {
		const landed = createDroneState()
		const armed = armDrone(landed, params)
		const flying = applyManualControl(armed, { throttle: 1, yaw: 0, pitch: 0, roll: 0 }, params)
		const disarmed = disarmDrone(flying)

		expect(armed.missionState).toBe('armed')
		expect(flying.missionState).toBe('flying')
		expect(disarmed.missionState).toBe('disarmed')
		expect(disarmed.motorSpeeds).toEqual([0, 0, 0, 0])
	})
})
