import type { RobotParams } from '@robotics-lab/robot'
import { expect, test } from 'vitest'
import {
	accumulate,
	clearOdometryTrail,
	createSimulation,
	FIXED_DT,
	pause,
	resetSimulation,
	resume,
	robotSpeed,
	runFor,
	setInput,
	setRunning,
	stepSimulation,
} from './loop'

const _eps = 1e-9

test('createSimulation starts running at the origin with zeroed clock', () => {
	const sim = createSimulation()
	expect(sim.running).toBe(true)
	expect(sim.time).toBe(0)
	expect(sim.stepCount).toBe(0)
	expect(sim.accumulator).toBe(0)
	expect(sim.robot.pose).toEqual({ x: 0, y: 0, heading: 0 })
	expect(sim.input).toEqual({ leftWheel: 0, rightWheel: 0 })
})

test('stepSimulation advances the clock by the fixed dt and counts a step', () => {
	const sim = createSimulation({ input: { leftWheel: 1, rightWheel: 1 } })
	const after = stepSimulation(sim, FIXED_DT)
	expect(after.time).toBeCloseTo(FIXED_DT, 12)
	expect(after.stepCount).toBe(1)
	expect(after.robot.pose.x).toBeCloseTo(FIXED_DT, 12)
})

test('stepSimulation uses FIXED_DT by default when omitted', () => {
	const sim = createSimulation({ input: { leftWheel: 1, rightWheel: 1 } })
	expect(stepSimulation(sim).time).toBeCloseTo(FIXED_DT, 12)
})

test('pause freezes time and robot but resumes from the same pose', () => {
	const sim = createSimulation({ input: { leftWheel: 1, rightWheel: 1 } })
	const moving = stepSimulation(sim)
	const paused = pause(moving)
	expect(paused.running).toBe(false)
	// A paused step is a no-op: clock and robot unchanged.
	const noop = stepSimulation(paused)
	expect(noop.time).toBe(paused.time)
	expect(noop.robot.pose).toEqual(paused.robot.pose)
	const resumed = resume(noop)
	expect(resumed.running).toBe(true)
	const moved = stepSimulation(resumed)
	expect(moved.time).toBeGreaterThan(noop.time)
})

test('resume on an already-running state is referentially stable', () => {
	const sim = createSimulation()
	expect(resume(sim)).toBe(sim)
	expect(setRunning(sim, true)).toBe(sim)
	expect(setRunning(sim, false)).not.toBe(sim)
})

test('setInput replaces the drive input only when it changes', () => {
	const sim = createSimulation()
	const same = setInput(sim, { leftWheel: 0, rightWheel: 0 })
	expect(same).toBe(sim)
	const next = setInput(sim, { leftWheel: 0.2, rightWheel: 0.6 })
	expect(next.input).toEqual({ leftWheel: 0.2, rightWheel: 0.6 })
	expect(sim.input).toEqual({ leftWheel: 0, rightWheel: 0 }) // immutable
})

test('resetSimulation restores spawn pose and zeroes the clock but keeps running/input', () => {
	const spawn = { x: 3, y: -2, heading: Math.PI / 4 }
	const sim = createSimulation({ spawnPose: spawn, input: { leftWheel: 1, rightWheel: 1 } })
	const moved = runFor(sim, 1)
	expect(moved.time).toBeGreaterThan(0)
	expect(moved.stepCount).toBeGreaterThan(0)
	const reset = resetSimulation(moved)
	expect(reset.robot.pose).toEqual(spawn)
	expect(reset.time).toBe(0)
	expect(reset.stepCount).toBe(0)
	expect(reset.accumulator).toBe(0)
	expect(reset.running).toBe(true)
	expect(reset.input).toEqual({ leftWheel: 1, rightWheel: 1 })
})

test('accumulate drains fixed steps and keeps the remainder in the accumulator', () => {
	const sim = createSimulation({ input: { leftWheel: 1, rightWheel: 1 } })
	// 0.1s at 1/60 dt => 6 steps, remainder ~0.0001s
	const { state, snapshots } = accumulate(sim, 0.1)
	expect(snapshots).toHaveLength(6)
	expect(state.stepCount).toBe(6)
	expect(state.time).toBeCloseTo(6 * FIXED_DT, 12)
	expect(state.accumulator).toBeLessThan(FIXED_DT)
	expect(state.accumulator).toBeGreaterThanOrEqual(0)
	expect(state.robot.pose.x).toBeCloseTo(6 * FIXED_DT, 8)
})

test('accumulate clamps stutters so a frozen tab cannot spiral of death', () => {
	const sim = createSimulation({ input: { leftWheel: 1, rightWheel: 1 } })
	const { state } = accumulate(sim, 5) // 5s gap, but clamped to MAX_FRAME_TIME
	expect(state.stepCount).toBe(Math.round(0.25 / FIXED_DT))
})

test('accumulate accumulates across multiple frames until a full step is reached', () => {
	const sim = createSimulation({ input: { leftWheel: 1, rightWheel: 1 } })
	// Feed tiny deltas that individually yield no step.
	let out = accumulate(sim, FIXED_DT / 3)
	expect(out.snapshots).toHaveLength(0)
	out = accumulate(out.state, FIXED_DT / 3)
	expect(out.snapshots).toHaveLength(0)
	out = accumulate(out.state, FIXED_DT / 3)
	// 3 thirds => exactly one full step.
	expect(out.snapshots).toHaveLength(1)
	expect(out.state.accumulator).toBeCloseTo(0, 12)
})

test('accumulate is deterministic: identical inputs produce identical states', () => {
	const a = createSimulation({ input: { leftWheel: 0.4, rightWheel: 0.8 } })
	const b = createSimulation({ input: { leftWheel: 0.4, rightWheel: 0.8 } })
	let sa = a
	let sb = b
	for (const dt of [0.016, 0.02, 0.01, 0.05, 0.003]) {
		sa = accumulate(sa, dt).state
		sb = accumulate(sb, dt).state
	}
	expect(sa.time).toBeCloseTo(sb.time, 12)
	expect(sa.stepCount).toBe(sb.stepCount)
	expect(sa.robot.pose.x).toBeCloseTo(sb.robot.pose.x, 12)
	expect(sa.robot.pose.y).toBeCloseTo(sb.robot.pose.y, 12)
	expect(sa.robot.pose.heading).toBeCloseTo(sb.robot.pose.heading, 12)
})

test('runFor advances that many seconds of simulation', () => {
	const sim = createSimulation({ input: { leftWheel: 1, rightWheel: 1 } })
	const after = runFor(sim, 2)
	expect(after.time).toBeCloseTo(2, 9)
	expect(after.stepCount).toBe((2 / FIXED_DT) | 0)
	expect(after.robot.pose.x).toBeCloseTo(2, 9)
	expect(after.robot.pose.y).toBeCloseTo(0, 9)
})

test('robotSpeed reports the linear speed magnitude', () => {
	const sim = stepSimulation(createSimulation({ input: { leftWheel: 1, rightWheel: 1 } }))
	expect(robotSpeed(sim.robot)).toBeCloseTo(1, 9)
})

test('pause halts accumulate inputs (no steps produced)', () => {
	const sim = pause(createSimulation({ input: { leftWheel: 1, rightWheel: 1 } }))
	const { state, snapshots } = accumulate(sim, 0.1)
	expect(snapshots).toHaveLength(0)
	expect(state.time).toBe(0)
	const resumed = resume(state)
	const out = accumulate(resumed, 0.1)
	expect(out.snapshots.length).toBeGreaterThan(0)
})

test('advance by exactly the same dt with runFor and accumulate over many frames', () => {
	const sim = createSimulation({ input: { leftWheel: 0.6, rightWheel: 0.3 } })
	// Two equivalent ways to simulate 1s: one big runFor vs 60 fixed frames.
	const oneShot = runFor(sim, 1)
	let frame = sim
	for (let i = 0; i < 60; i++) frame = accumulate(frame, FIXED_DT).state
	expect(frame.time).toBeCloseTo(oneShot.time, 9)
	expect(frame.robot.pose.x).toBeCloseTo(oneShot.robot.pose.x, 9)
	expect(frame.robot.pose.heading).toBeCloseTo(oneShot.robot.pose.heading, 9)
})

// --- Lidar integration -----------------------------------------------------

import { createWorld } from '@robotics-lab/core'
import { createLidarConfig } from '@robotics-lab/sensors'

const SENSOR_WORLD = createWorld({
	name: 'lidar-test',
	width: 10,
	depth: 10,
	walls: [
		{ start: { x: -5, y: -5 }, end: { x: 5, y: -5 } },
		{ start: { x: 5, y: -5 }, end: { x: 5, y: 5 } },
		{ start: { x: 5, y: 5 }, end: { x: -5, y: 5 } },
		{ start: { x: -5, y: 5 }, end: { x: -5, y: -5 } },
		{ start: { x: 2, y: -1 }, end: { x: 2, y: 1 } }, // wall ahead at x=2
	],
	boxes: [],
	cylinders: [],
} as never)

test('a world-attached sim produces an initial scan from the spawn pose', () => {
	const sim = createSimulation({
		spawnPose: { x: 0, y: 0, heading: 0 },
		world: SENSOR_WORLD,
		lidar: createLidarConfig({ rayCount: 360, fieldOfView: Math.PI * 2, range: 10 }),
	})
	expect(sim.scan).not.toBeNull()
	expect(sim.scan?.samples).toHaveLength(360)
	// Find the sample nearest angle 0 (forward) and assert the wall at x=2.
	const forward = sim.scan?.samples.find((s) => Math.abs(s.angle) < 1e-12)
	expect(forward).toBeDefined()
	expect(forward?.hit).toBe('wall')
	expect(forward?.distance).toBeCloseTo(2, 6)
})

test('stepSimulation advances the robot and recomputes the scan for the new pose', () => {
	const sim = createSimulation({
		spawnPose: { x: 0, y: 0, heading: 0 },
		world: SENSOR_WORLD,
		lidar: createLidarConfig({ rayCount: 360, fieldOfView: Math.PI * 2, range: 10 }),
		input: { leftWheel: 1, rightWheel: 1 },
	})
	const first = forwardDistance(sim.scan)
	const after = stepSimulation(sim, FIXED_DT)
	expect(after.robot.pose.x).toBeGreaterThan(0)
	// Closer to the wall => forward distance must have shrunk.
	const next = forwardDistance(after.scan)
	expect(next).toBeLessThan(first)
})

test('setSimWorld reattaches a world and recomputes the scan immediately', () => {
	const sim = createSimulation({ spawnPose: { x: 0, y: 0, heading: 0 } })
	expect(sim.scan).toBeNull() // no world attached
	const attached = setSimWorld(sim, SENSOR_WORLD)
	expect(attached.scan).not.toBeNull()
	expect(forwardDistance(attached.scan)).toBeCloseTo(2, 6)
	// Detaching nulls the scan.
	const detached = setSimWorld(attached, null)
	expect(detached.scan).toBeNull()
})

test('resetSimulation recomputes the scan from the spawn pose', () => {
	const sim = runFor(
		createSimulation({
			spawnPose: { x: 0, y: 0, heading: 0 },
			world: SENSOR_WORLD,
			input: { leftWheel: 1, rightWheel: 1 },
		}),
		0.5,
	)
	expect(sim.robot.pose.x).toBeGreaterThan(0)
	// After reset the forward distance must return to the spawn's 2m hit.
	const reset = resetSimulation(sim)
	expect(forwardDistance(reset.scan)).toBeCloseTo(2, 6)
})

test('setLidarConfig recomputes the scan against the new config', () => {
	const sim = createSimulation({
		spawnPose: { x: 0, y: 0, heading: 0 },
		world: SENSOR_WORLD,
	})
	// Range 1m => wall at x=2 unreachable => every sample a miss at distance 1.
	const short = setLidarConfig(sim, createLidarConfig({ range: 1, rayCount: 8 }))
	expect(short.scan?.samples.every((s) => s.hit === null && s.distance === 1)).toBe(true)
})

test('paused state carries the scan unchanged through a no-op step', () => {
	const sim = pause(
		createSimulation({
			spawnPose: { x: 0, y: 0, heading: 0 },
			world: SENSOR_WORLD,
		}),
	)
	const before = sim.scan
	const noop = stepSimulation(sim)
	expect(noop.scan).toBe(before)
})

import { setLidarConfig, setSimWorld } from './loop'

/** Forward sample distance of a scan (angle nearest 0), assuming 360 rays. */
function forwardDistance(scan: { samples: { angle: number; distance: number }[] } | null): number {
	if (scan === null) throw new Error('expected a scan')
	const sample = scan.samples.find((s) => Math.abs(s.angle) < 1e-12)
	if (sample === undefined) throw new Error('no forward sample in scan')
	return sample.distance
}

// --- Navigation integration (milestone 7) -----------------------------------

import { DEFAULT_NAV_CONFIG, type NavConfig } from '@robotics-lab/navigation'
import { clearGoals, setAutonomous, setGoal, setGoals, setNavConfig } from './loop'

test('createSimulation starts with an empty goal queue and autonomy off', () => {
	const sim = createSimulation()
	expect(sim.goals).toEqual([])
	expect(sim.autonomous).toBe(false)
	expect(sim.navStatus).toBe('idle')
	expect(sim.nav).toBe(DEFAULT_NAV_CONFIG)
})

test('setGoal turns autonomy on and stores a single goal', () => {
	const sim = createSimulation()
	const out = setGoal(sim, { x: 1, y: 2 })
	expect(out.goals).toEqual([{ x: 1, y: 2 }])
	expect(out.autonomous).toBe(true)
})

test('setGoals stores a queue and enables autonomy', () => {
	const sim = createSimulation()
	const out = setGoals(sim, [
		{ x: 1, y: 0 },
		{ x: 2, y: 0 },
	])
	expect(out.goals).toHaveLength(2)
	expect(out.autonomous).toBe(true)
})

test('clearGoals empties the queue', () => {
	const sim = setGoals(createSimulation(), [
		{ x: 1, y: 0 },
		{ x: 2, y: 0 },
	])
	const out = clearGoals(sim)
	expect(out.goals).toEqual([])
})

test('setAutonomous turns autonomy off and zeroes the input so the robot stops', () => {
	const sim = setGoal(createSimulation(), { x: 1, y: 0 })
	const off = setAutonomous(sim, false)
	expect(off.autonomous).toBe(false)
	expect(off.input).toEqual({ leftWheel: 0, rightWheel: 0 })
})

test('setAutonomous true on an already-true state is referentially stable', () => {
	const sim = setGoal(createSimulation(), { x: 1, y: 0 })
	expect(setAutonomous(sim, true)).toBe(sim)
})

test('autonomous step drives the robot towards the goal', () => {
	const sim = setGoal(createSimulation(), { x: 2, y: 0 })
	const after = runFor(sim, 0.2)
	expect(after.robot.pose.x).toBeGreaterThan(0)
	expect(after.autonomous).toBe(true)
})

test('autonomous step reports rotating status when misaligned', () => {
	// Facing +x, goal in -y direction: robot must rotate first.
	const sim = setGoal(createSimulation({ spawnPose: { x: 0, y: 0, heading: 0 } }), { x: 0, y: -2 })
	const after = stepSimulation(sim, FIXED_DT)
	expect(after.navStatus).toBe('rotating')
})

test('autonomous step pops the goal on arrival and drops autonomy when queue empties', () => {
	const config: NavConfig = { ...DEFAULT_NAV_CONFIG, arrivalRadius: 0.3 }
	const sim = setNavConfig(
		setGoal(createSimulation({ spawnPose: { x: 0, y: 0, heading: 0 } }), { x: 1, y: 0 }),
		config,
	)
	const after = runFor(sim, 8)
	expect(after.goals).toEqual([])
	expect(after.autonomous).toBe(false)
	// Autonomy was dropped on arrival; subsequent steps report idle in manual mode.
	expect(after.navStatus).toBe('idle')
})

test('queued goals advance sequentially: the second goal becomes the active one', () => {
	const config: NavConfig = { ...DEFAULT_NAV_CONFIG, arrivalRadius: 0.3, maxSpeed: 0.4 }
	const sim = setNavConfig(
		setGoals(createSimulation({ spawnPose: { x: 0, y: 0, heading: 0 } }), [
			{ x: 1, y: 0 },
			{ x: 1, y: 4 },
		]),
		config,
	)
	// 3 s should reach the first goal but not the second (which is further away).
	const after = runFor(sim, 3)
	expect(after.goals).toEqual([{ x: 1, y: 4 }])
	expect(after.autonomous).toBe(true)
})

test('paused override keeps teleop input ignored: autonomy step is a no-op while paused', () => {
	const sim = pause(setGoal(createSimulation(), { x: 2, y: 0 }))
	const after = stepSimulation(sim, FIXED_DT)
	expect(after.time).toBe(0)
	expect(after.robot.pose).toEqual({ x: 0, y: 0, heading: 0 })
})

test('resetSimulation clears the goal queue and turns autonomy off', () => {
	const sim = runFor(setGoal(createSimulation(), { x: 2, y: 0 }), 0.5)
	expect(sim.autonomous).toBe(true)
	const reset = resetSimulation(sim)
	expect(reset.goals).toEqual([])
	expect(reset.autonomous).toBe(false)
	expect(reset.navStatus).toBe('idle')
})

test('manual teleop input is ignored while autonomous drives the robot', () => {
	// Both autonomous and a forward teleop input set: autonomy must win.
	const sim = setGoal(createSimulation({ input: { leftWheel: 1, rightWheel: 1 } }), {
		x: 0,
		y: 2,
	})
	const after = stepSimulation(sim, FIXED_DT)
	// Goal is straight ahead (+y) but robot faces +x => rotating, mostly turn-in-place.
	// A pure-turn command would have driven the pose a tiny bit; the manual "drive
	// forward straight on" path would have moved mostly +x. Assert the x-component
	// stays near 0, meaning autonomy's rotate dominated (not manual forward).
	expect(Math.abs(after.robot.pose.x)).toBeLessThan(0.02)
})

// --- Localization (milestone 11) -----------------------------------------

test('createSimulation seeds dead-reckoning odometry at the spawn pose', () => {
	const sim = createSimulation({ spawnPose: { x: 2, y: -1, heading: 0.7 } })
	expect(sim.odometry.pose).toEqual({ x: 2, y: -1, heading: 0.7 })
	expect(sim.odometry.history).toEqual([{ x: 2, y: -1, heading: 0.7 }])
})

test('dead reckoning tracks ground truth under perfect motion (no noise)', () => {
	const sim = createSimulation({ input: { leftWheel: 1, rightWheel: 0.8 } })
	const after = runFor(sim, 1)
	expect(after.odometry.pose.x).toBeCloseTo(after.robot.pose.x, 6)
	expect(after.odometry.pose.y).toBeCloseTo(after.robot.pose.y, 6)
	expect(after.odometry.pose.heading).toBeCloseTo(after.robot.pose.heading, 6)
})

test('dead reckoning drifts from ground truth once motion noise is enabled', () => {
	const params: Partial<RobotParams> = {
		noise: { wheelSlipSigma: 0.15, encoderDriftSigma: 0.05 },
	}
	const sim = createSimulation({
		input: { leftWheel: 1, rightWheel: 0.8 },
		robotParams: params,
	})
	const after = runFor(sim, 5)
	const drift = Math.hypot(
		after.odometry.pose.x - after.robot.pose.x,
		after.odometry.pose.y - after.robot.pose.y,
	)
	// With slip + drift the estimate must diverge from the truth.
	expect(drift).toBeGreaterThan(0.01)
})

test('odometry history accumulates a trail as the robot moves', () => {
	const sim = createSimulation({ input: { leftWheel: 1, rightWheel: 1 } })
	const after = runFor(sim, 1)
	expect(after.odometry.history.length).toBeGreaterThan(1)
	expect(after.odometry.history.length).toBeLessThanOrEqual(after.odometry.params.historyLimit)
})

test('resetSimulation clears the odometry estimate back to spawn', () => {
	const sim = createSimulation({
		spawnPose: { x: 0, y: 0, heading: 0 },
		input: { leftWheel: 1, rightWheel: 1 },
	})
	const moved = runFor(sim, 2)
	expect(moved.odometry.history.length).toBeGreaterThan(1)
	expect(moved.odometry.stepCount).toBeGreaterThan(0)
	const reset = resetSimulation(moved)
	expect(reset.odometry.pose).toEqual({ x: 0, y: 0, heading: 0 })
	expect(reset.odometry.stepCount).toBe(0)
	expect(reset.odometry.history).toEqual([{ x: 0, y: 0, heading: 0 }])
})

test('paused simulation does not advance the odometry estimate', () => {
	const sim = createSimulation({ input: { leftWheel: 1, rightWheel: 1 } })
	const paused = pause(sim)
	const after = stepSimulation(paused, FIXED_DT)
	expect(after.odometry.pose).toEqual(paused.odometry.pose)
	expect(after.odometry.stepCount).toBe(paused.odometry.stepCount)
})

test('clearOdometryTrail drops the trail but keeps the current estimate', () => {
	const sim = createSimulation({ input: { leftWheel: 1, rightWheel: 1 } })
	const moved = runFor(sim, 1)
	expect(moved.odometry.history.length).toBeGreaterThan(1)
	const cleared = clearOdometryTrail(moved)
	expect(cleared.odometry.history).toEqual([cleared.odometry.pose])
	expect(cleared.odometry.pose).toEqual(moved.odometry.pose)
})
