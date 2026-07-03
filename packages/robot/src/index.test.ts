import { expect, test } from 'vitest'
import { createRobot, stepDifferentialDrive } from './index'

test('forward motion moves along heading', () => {
	let robot = createRobot({ x: 0, y: 0, heading: Math.PI / 2 })
	robot = stepDifferentialDrive(robot, { leftWheel: 1, rightWheel: 1 }, 1)
	// heading is +y, so forward motion increases y
	expect(robot.pose.y).toBeCloseTo(1, 10)
	expect(robot.pose.x).toBeCloseTo(0, 10)
})

test('equal opposite wheels rotate in place', () => {
	let robot = createRobot({ x: 0, y: 0, heading: 0 })
	robot = stepDifferentialDrive(robot, { leftWheel: -1, rightWheel: 1 }, 1)
	expect(robot.pose.x).toBeCloseTo(0, 10)
	expect(robot.pose.y).toBeCloseTo(0, 10)
	expect(robot.pose.heading).toBeGreaterThan(0)
})
