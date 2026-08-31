import {
	calculateThrustVector,
	calculateTorqueVector,
	createDroneState,
	createRotorLayout,
	DEFAULT_QUADCOPTER_PARAMS,
	type MotorSpeeds,
	throttleToMotorSpeed,
} from './index'

describe('quadcopter model', () => {
	it('creates a complete landed state', () => {
		expect(createDroneState()).toEqual({
			position: { x: 0, y: 0, z: 0 },
			orientation: { x: 0, y: 0, z: 0, w: 1 },
			velocity: { x: 0, y: 0, z: 0 },
			batteryLevel: 100,
			missionState: 'landed',
			motorSpeeds: [0, 0, 0, 0],
		})
	})

	it('defines four X-frame rotors with balanced spin directions', () => {
		const layout = createRotorLayout(DEFAULT_QUADCOPTER_PARAMS)

		expect(layout).toHaveLength(4)
		expect(new Set(layout.map((motor) => motor.id)).size).toBe(4)
		expect(layout.reduce((sum, motor) => sum + motor.spinDirection, 0)).toBe(0)
	})

	it('derives a hover throttle that balances vehicle weight', () => {
		const params = DEFAULT_QUADCOPTER_PARAMS
		const hoverSpeed = throttleToMotorSpeed(params.hoverThrottle, params)
		const speeds: MotorSpeeds = [hoverSpeed, hoverSpeed, hoverSpeed, hoverSpeed]
		const thrust = calculateThrustVector(speeds, params)
		const torque = calculateTorqueVector(speeds, params)

		expect(params.hoverThrottle).toBeGreaterThan(0)
		expect(params.hoverThrottle).toBeLessThan(1)
		expect(thrust).toEqual({ x: 0, y: expect.closeTo(params.mass * 9.81, 8), z: 0 })
		expect(torque.x).toBeCloseTo(0)
		expect(torque.y).toBeCloseTo(0)
		expect(torque.z).toBeCloseTo(0)
	})

	it('clamps battery level and throttle inputs', () => {
		expect(createDroneState({ batteryLevel: 120 }).batteryLevel).toBe(100)
		expect(throttleToMotorSpeed(-1, DEFAULT_QUADCOPTER_PARAMS)).toBe(0)
		expect(throttleToMotorSpeed(2, DEFAULT_QUADCOPTER_PARAMS)).toBe(
			DEFAULT_QUADCOPTER_PARAMS.maxMotorSpeed,
		)
	})
})
