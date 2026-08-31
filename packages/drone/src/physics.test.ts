import { createDroneState, DEFAULT_QUADCOPTER_PARAMS, throttleToMotorSpeed } from './index'
import {
	calculateForces,
	DEFAULT_PHYSICS_CONFIG,
	droneGroundClearance,
	stepDronePhysics,
} from './physics'

const params = DEFAULT_QUADCOPTER_PARAMS
const noDrag = { ...DEFAULT_PHYSICS_CONFIG, linearDrag: 0, angularDrag: 0 }

describe('drone physics', () => {
	it('balances gravity and thrust at the configured hover throttle', () => {
		const hoverSpeed = throttleToMotorSpeed(params.hoverThrottle, params)
		const state = createDroneState({
			position: { x: 0, y: 1, z: 0 },
			missionState: 'flying',
			motorSpeeds: [hoverSpeed, hoverSpeed, hoverSpeed, hoverSpeed],
		})
		const forces = calculateForces(state, params, noDrag)

		expect(forces.gravity.y).toBeCloseTo(-params.mass * noDrag.gravity)
		expect(forces.thrust.y).toBeCloseTo(params.mass * noDrag.gravity)
		expect(forces.total.y).toBeCloseTo(0)
	})

	it('uses semi-implicit Euler for velocity and position', () => {
		const state = createDroneState({
			position: { x: 0, y: 1, z: 0 },
			missionState: 'flying',
		})
		const next = stepDronePhysics(state, params, 0.01, noDrag)

		expect(next.velocity.y).toBeCloseTo(-0.0981)
		expect(next.position.y).toBeCloseTo(0.999019)
	})

	it('opposes linear motion with drag', () => {
		const state = createDroneState({
			position: { x: 0, y: 1, z: 0 },
			velocity: { x: 4, y: 0, z: -2 },
		})
		const forces = calculateForces(state, params)

		expect(forces.drag.x).toBeLessThan(0)
		expect(forces.drag.z).toBeGreaterThan(0)
	})

	it('supports a resting drone with a ground reaction', () => {
		const groundLevel = droneGroundClearance(params)
		const state = createDroneState({ position: { x: 0, y: groundLevel, z: 0 } })
		const forces = calculateForces(state, params, noDrag)
		const next = stepDronePhysics(state, params, 0.1, noDrag)

		expect(forces.groundReaction.y).toBeCloseTo(params.mass * noDrag.gravity)
		expect(next.position.y).toBeCloseTo(groundLevel)
		expect(next.velocity.y).toBe(0)
	})

	it('integrates yaw from opposing rotor pairs', () => {
		const state = createDroneState({
			position: { x: 0, y: 1, z: 0 },
			motorSpeeds: [700, 500, 700, 500],
		})
		const next = stepDronePhysics(state, params, 0.01, noDrag)

		expect(next.angularVelocity.y).toBeGreaterThan(0)
		expect(next.orientation.y).toBeGreaterThan(0)
	})

	it('approximates roll and pitch from unbalanced thrust', () => {
		const state = createDroneState({
			position: { x: 0, y: 1, z: 0 },
			motorSpeeds: [700, 500, 500, 500],
		})
		const next = stepDronePhysics(state, params, 0.01, noDrag)

		expect(next.angularVelocity.x).not.toBe(0)
		expect(next.angularVelocity.z).not.toBe(0)
		expect(next.orientation.x).not.toBe(0)
		expect(next.orientation.z).not.toBe(0)
	})
})
