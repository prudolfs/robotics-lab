import { expect, test } from 'vitest'
import {
	accumulate,
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
