import { expect, test } from 'vitest'
import {
	controlToGoal,
	DEFAULT_NAV_CONFIG,
	hasArrived,
	idleOutput,
	type NavConfig,
} from './controller'
import {
	clearGoals,
	currentGoal,
	enqueueGoal,
	enqueueGoals,
	popGoal,
	setGoals,
	setSingleGoal,
} from './goals'
import { distanceToGoal, type Goal, headingController, headingTowards } from './index'

// --- Existing primitives ----------------------------------------------------

test('headingController returns proportional turn sign', () => {
	const pose = { x: 0, y: 0, heading: 0 }
	expect(headingController(pose, Math.PI / 2)).toBeGreaterThan(0)
	expect(headingController(pose, -Math.PI / 2)).toBeLessThan(0)
})

test('headingTowards points at the goal', () => {
	const pose = { x: 0, y: 0, heading: 0 }
	expect(headingTowards(pose, { x: 1, y: 0 })).toBeCloseTo(0, 10)
	expect(headingTowards(pose, { x: 0, y: 1 })).toBeCloseTo(Math.PI / 2, 10)
})

test('distanceToGoal is Euclidean', () => {
	const pose = { x: 0, y: 0, heading: 0 }
	expect(distanceToGoal(pose, { x: 3, y: 4 })).toBe(5)
})

// --- Controller -------------------------------------------------------------

const ALIGNED_POSE = { x: 0, y: 0, heading: 0 }
const GOAL_AHEAD = { x: 2, y: 0 }

test('controlToGoal with no queued goal returns a zeroed idle output', () => {
	const out = controlToGoal(ALIGNED_POSE, null, DEFAULT_NAV_CONFIG)
	expect(out.status).toBe('idle')
	expect(out.input).toEqual({ leftWheel: 0, rightWheel: 0 })
})

test('controlToGoal drives both wheels forward when aligned with a goal ahead', () => {
	const out = controlToGoal(ALIGNED_POSE, GOAL_AHEAD, DEFAULT_NAV_CONFIG)
	expect(out.status).toBe('driving')
	expect(out.input.leftWheel).toBeGreaterThan(0)
	expect(out.input.rightWheel).toBeGreaterThan(0)
	// Aligned straight ahead: both wheels should be equal.
	expect(out.input.leftWheel).toBeCloseTo(out.input.rightWheel, 9)
})

test('controlToGoal rotates in place when facing the wrong way', () => {
	// Facing +x, goal at -x => must turn ~PI (clockwise => negative bias =>
	// right wheel faster, left wheel slower per the wheel convention).
	const pose = { x: 0, y: 0, heading: 0 }
	const goalBehind = { x: -1, y: 0 }
	const out = controlToGoal(pose, goalBehind, DEFAULT_NAV_CONFIG)
	expect(out.status).toBe('rotating')
	// Net forward speed ~0 (misaligned), wheels drive in opposite directions so
	// the robot spins in place.
	expect(Math.abs(out.input.leftWheel + out.input.rightWheel)).toBeLessThan(1e-6)
	expect(out.input.leftWheel).not.toBeCloseTo(out.input.rightWheel, 6)
})

test('controlToGoal turns left when the goal is to the left', () => {
	// Goal at +y (left of a robot facing +x): must rotate counter-clockwise.
	// CCW rotation in our convention (rightwheel - leftwheel > 0) needs the right
	// wheel faster than the left, i.e. leftWheel < rightWheel.
	const pose = { x: 0, y: 0, heading: 0 }
	const goalLeft = { x: 0, y: 2 }
	const out = controlToGoal(pose, goalLeft, DEFAULT_NAV_CONFIG)
	expect(out.headingError).toBeGreaterThan(0)
	expect(out.input.rightWheel).toBeGreaterThan(out.input.leftWheel)
})

test('controlToGoal reports arrived and zeroes the wheels within the arrival radius', () => {
	const arrival = { ...DEFAULT_NAV_CONFIG, arrivalRadius: 0.5 }
	const pose = { x: 1.7, y: 0, heading: 0 } // 0.3 m short of the goal at x=2
	const out = controlToGoal(pose, GOAL_AHEAD, arrival)
	expect(out.status).toBe('arrived')
	expect(out.input).toEqual({ leftWheel: 0, rightWheel: 0 })
})

test('controlToGoal never commands a wheel beyond maxSpeed', () => {
	const config: NavConfig = { ...DEFAULT_NAV_CONFIG, maxSpeed: 0.6 }
	// A very distant goal maxes the proportional term; both wheels must clamp.
	const out = controlToGoal({ x: 0, y: 0, heading: 0 }, { x: 50, y: 0 }, config)
	expect(Math.abs(out.input.leftWheel)).toBeLessThanOrEqual(config.maxSpeed + 1e-9)
	expect(Math.abs(out.input.rightWheel)).toBeLessThanOrEqual(config.maxSpeed + 1e-9)
})

test('controlToGoal brakes close to the goal: wheels slower than far away', () => {
	const far = controlToGoal(ALIGNED_POSE, { x: 3, y: 0 }, DEFAULT_NAV_CONFIG)
	const close = controlToGoal({ x: 1.8, y: 0, heading: 0 }, { x: 2, y: 0 }, DEFAULT_NAV_CONFIG)
	expect(close.input.leftWheel).toBeLessThan(far.input.leftWheel)
	expect(close.input.rightWheel).toBeLessThan(far.input.rightWheel)
})

test('hasArrived flags arrival inside radius, false outside', () => {
	const config = { ...DEFAULT_NAV_CONFIG, arrivalRadius: 0.2 }
	expect(hasArrived({ x: 0, y: 0, heading: 0 }, { x: 0.1, y: 0.05 }, config)).toBe(true)
	expect(hasArrived({ x: 0, y: 0, heading: 0 }, { x: 1, y: 0 }, config)).toBe(false)
})

test('idleOutput zeroes commands and reports distance', () => {
	const out = idleOutput({ x: 1, y: 1, heading: 0 }, { x: 4, y: 5 })
	expect(out.status).toBe('idle')
	expect(out.input).toEqual({ leftWheel: 0, rightWheel: 0 })
	expect(out.distance).toBeCloseTo(5, 9)
})

// --- Goal queue -------------------------------------------------------------

const G = { x: 1, y: 2 }

test('enqueueGoal appends immutably', () => {
	const q = enqueueGoal([], G)
	const q2 = enqueueGoal(q, { x: 3, y: 0 })
	expect(q2).toEqual([G, { x: 3, y: 0 }])
	expect(q).toEqual([G]) // original untouched
})

test('enqueueGoals concatenates multiple goals', () => {
	const q = enqueueGoal([], G)
	const q2 = enqueueGoals(q, [
		{ x: 0, y: 0 },
		{ x: 5, y: 5 },
	])
	expect(q2).toEqual([G, { x: 0, y: 0 }, { x: 5, y: 5 }])
})

test('currentGoal is the head or null when empty', () => {
	expect(currentGoal([])).toBeNull()
	expect(currentGoal([G, { x: 0, y: 0 }])).toEqual(G)
})

test('popGoal drops the head immutably; no-op on empty', () => {
	const q: Goal[] = enqueueGoals([], [G, { x: 0, y: 0 }])
	const after = popGoal(q)
	expect(after).toEqual([{ x: 0, y: 0 }])
	expect(q).toHaveLength(2) // original untouched
	expect(popGoal([])).toEqual([])
})

test('setSingleGoal / setGoals replace the queue', () => {
	const q = enqueueGoals([], [G, { x: 0, y: 0 }])
	expect(setSingleGoal(q, { x: 9, y: 9 })).toEqual([{ x: 9, y: 9 }])
	expect(
		setGoals(q, [
			{ x: 1, y: 1 },
			{ x: 2, y: 2 },
		]),
	).toEqual([
		{ x: 1, y: 1 },
		{ x: 2, y: 2 },
	])
})

test('clearGoals returns an empty queue', () => {
	const q = enqueueGoals([], [G, { x: 0, y: 0 }])
	expect(clearGoals(q)).toEqual([])
})

// --- Closed-loop reach ------------------------------------------------------

import { createRobot, DEFAULT_ROBOT_PARAMS, stepDifferentialDrive } from '@robotics-lab/robot'

/** Closed-loop: run the closed-loop controller against the diff-drive plant
 *  for `seconds` and report the final robot pose. Fixed dt, deterministic. */
function closedLoop(
	goal: { x: number; y: number },
	seconds: number,
	config: NavConfig = DEFAULT_NAV_CONFIG,
	dt = 1 / 60,
) {
	let robot = createRobot({ x: 0, y: 0, heading: Math.PI }, DEFAULT_ROBOT_PARAMS)
	const steps = Math.round(seconds / dt)
	for (let i = 0; i < steps; i++) {
		const out = controlToGoal(robot.pose, goal, config)
		if (out.status === 'arrived') break
		robot = stepDifferentialDrive(robot, out.input, dt)
	}
	return robot.pose
}

test('closed-loop controller reaches a goal ahead within the arrival radius', () => {
	const goal = { x: 2, y: 0 }
	const pose = closedLoop(goal, 20)
	expect(distanceToGoal(pose, goal)).toBeLessThan(DEFAULT_NAV_CONFIG.arrivalRadius + 1e-6)
})

test('closed-loop controller reaches an off-axis goal within the arrival radius', () => {
	const goal = { x: 1, y: 1.5 }
	const pose = closedLoop(goal, 25)
	expect(distanceToGoal(pose, goal)).toBeLessThan(DEFAULT_NAV_CONFIG.arrivalRadius + 1e-6)
})

test('closed-loop controller reaches a goal behind the spawn orientation', () => {
	const goal = { x: -1.5, y: -0.5 }
	const pose = closedLoop(goal, 30)
	expect(distanceToGoal(pose, goal)).toBeLessThan(DEFAULT_NAV_CONFIG.arrivalRadius + 1e-6)
})
