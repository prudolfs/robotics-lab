import { seededRng } from '@robotics-lab/noise'
import { expect, test } from 'vitest'
import { createRobot, stepDifferentialDrive } from './index'

// Fixed-seed RNG for reproducible noise tests.
const fixed = () => seededRng(42)
const _rng = () => seededRng(42)

// Linear speed magnitude of a robot after a step.
const speed = (v: { vx: number; vy: number }) => Math.hypot(v.vx, v.vy)

test('differential-drive equations: v = (L+R)/2, omega = (R-L)/wheelBase', () => {
	const robot = createRobot({ x: 0, y: 0, heading: 0 })
	const next = stepDifferentialDrive(robot, { leftWheel: 0.3, rightWheel: 0.9 }, 1)
	expect(next.velocity.omega).toBeCloseTo((0.9 - 0.3) / robot.params.wheelBase, 10)
	expect(speed(next.velocity)).toBeCloseTo(0.6, 10)
})

test('forward motion moves along heading', () => {
	let robot = createRobot({ x: 0, y: 0, heading: Math.PI / 2 })
	robot = stepDifferentialDrive(robot, { leftWheel: 1, rightWheel: 1 }, 1)
	// heading is +y, so forward motion increases y
	expect(robot.pose.y).toBeCloseTo(1, 10)
	expect(robot.pose.x).toBeCloseTo(0, 10)
	expect(robot.pose.heading).toBeCloseTo(Math.PI / 2, 10)
})

test('reverse motion moves opposite to heading', () => {
	let robot = createRobot({ x: 0, y: 0, heading: 0 })
	robot = stepDifferentialDrive(robot, { leftWheel: -1, rightWheel: -1 }, 1)
	// heading is +x, reverse decreases x and increases y speed direction flips
	expect(robot.pose.x).toBeCloseTo(-1, 10)
	expect(robot.pose.y).toBeCloseTo(0, 10)
	expect(speed(robot.velocity)).toBeCloseTo(1, 10)
})

test('equal opposite wheels rotate in place (position unchanged)', () => {
	let robot = createRobot({ x: 0, y: 0, heading: 0 })
	robot = stepDifferentialDrive(robot, { leftWheel: -1, rightWheel: 1 }, 1)
	expect(robot.pose.x).toBeCloseTo(0, 10)
	expect(robot.pose.y).toBeCloseTo(0, 10)
	// omega = (R - L) / wheelBase = (1 - -1)/0.4 = 5 rad/s over 1s
	expect(robot.pose.heading).toBeCloseTo(5, 10)
	expect(robot.velocity.omega).toBeCloseTo(5, 10)
})

test('rotation sign flips when wheel speeds swap', () => {
	const robot = createRobot({ x: 0, y: 0, heading: 0 })
	const cw = stepDifferentialDrive(robot, { leftWheel: 1, rightWheel: -1 }, 1)
	const ccw = stepDifferentialDrive(robot, { leftWheel: -1, rightWheel: 1 }, 1)
	expect(cw.pose.heading).toBeLessThan(0)
	expect(ccw.pose.heading).toBeGreaterThan(0)
})

test('arc movement keeps a constant distance from the turn center', () => {
	// Unequal, same-sign wheel speeds => arc turning about the instantaneous
	// center of curvature (ICC). The robot stays a constant distance R = v/omega
	// from the ICC perpendicular to its heading, for every step.
	let robot = createRobot({ x: 0, y: 0, heading: 0 })
	const left = 0.5
	const right = 0.7
	const omega = (right - left) / robot.params.wheelBase
	const v = (left + right) / 2
	const radius = v / omega
	// ICC for heading == 0 is straight to the left of the robot.
	const icc = { x: robot.pose.x, y: robot.pose.y + radius }
	let deviation = Number.NEGATIVE_INFINITY
	const dt = 0.01
	for (let t = 0; t < (2 * Math.PI) / Math.abs(omega); t += dt) {
		robot = stepDifferentialDrive(robot, { leftWheel: left, rightWheel: right }, dt)
		const d = Math.hypot(robot.pose.x - icc.x, robot.pose.y - icc.y)
		deviation = Math.max(deviation, Math.abs(d - radius))
	}
	expect(deviation).toBeLessThan(0.05)
})

test('wheel speeds are stored on the robot state', () => {
	const robot = createRobot()
	const next = stepDifferentialDrive(robot, { leftWheel: 0.4, rightWheel: 0.8 }, 0.5)
	expect(next.wheels).toEqual({ leftWheel: 0.4, rightWheel: 0.8 })
})

// --- Motion noise (milestone 10) ------------------------------------------

test('step with zero noise uses exact wheel speeds', () => {
	const robot = createRobot({ x: 0, y: 0, heading: 0 })
	const next = stepDifferentialDrive(robot, { leftWheel: 1, rightWheel: 1 }, 1, fixed())
	expect(next.pose.x).toBeCloseTo(1, 10)
})

test('wheel slip perturbs forward distance', () => {
	const robot = createRobot(
		{ x: 0, y: 0, heading: 0 },
		{ noise: { wheelSlipSigma: 0.1, encoderDriftSigma: 0 } },
	)
	const rng = seededRng(123)
	const next = stepDifferentialDrive(robot, { leftWheel: 1, rightWheel: 1 }, 1, rng)
	// With slip, the distance deviates from the perfect 1.0 m.
	expect(next.pose.x).not.toBeCloseTo(1, 3)
})

test('encoder drift perturbs heading', () => {
	const robot = createRobot(
		{ x: 0, y: 0, heading: 0 },
		{ noise: { wheelSlipSigma: 0, encoderDriftSigma: 0.05 } },
	)
	const rng = seededRng(456)
	const next = stepDifferentialDrive(robot, { leftWheel: 1, rightWheel: 1 }, 1, rng)
	// Heading should deviate from 0 with drift.
	expect(next.pose.heading).not.toBe(0)
})

test('motion noise is deterministic with a fixed seed', () => {
	const params = { noise: { wheelSlipSigma: 0.1, encoderDriftSigma: 0.02 } }
	const a = createRobot({ x: 0, y: 0, heading: 0 }, params)
	const b = createRobot({ x: 0, y: 0, heading: 0 }, params)
	const rng = seededRng(999)
	const nextA = stepDifferentialDrive(a, { leftWheel: 1, rightWheel: 0.8 }, 1, rng)
	const rng2 = seededRng(999)
	const nextB = stepDifferentialDrive(b, { leftWheel: 1, rightWheel: 0.8 }, 1, rng2)
	expect(nextA.pose).toEqual(nextB.pose)
	expect(nextA.wheels).toEqual(nextB.wheels)
})
