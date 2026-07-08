// Tests for the dead-reckoning odometry module.
//
// Dead reckoning mirrors the ground-truth integrator but keys off the
// *commanded* wheel speeds rather than the perturbed ones. With zero motion
// noise the estimate tracks the truth; with noise it drifts. These tests
// pin both behaviours so the localisation milestone stays honest.

import { expect, test } from 'vitest'
import {
	clearOdometryHistory,
	createOdometry,
	DEFAULT_ODOMETRY_PARAMS,
	type OdometryState,
	poseError,
	resetOdometry,
	setOdometryParams,
	stepOdometry,
} from './odometry'

const _eps = 1e-9

test('createOdometry starts at the spawn pose with empty trail', () => {
	const o = createOdometry({ x: 1, y: 2, heading: 0.3 })
	expect(o.pose).toEqual({ x: 1, y: 2, heading: 0.3 })
	expect(o.velocity).toEqual({ vx: 0, vy: 0, omega: 0 })
	expect(o.wheels).toEqual({ leftWheel: 0, rightWheel: 0 })
	expect(o.stepCount).toBe(0)
	// The initial pose is logged as the first history sample.
	expect(o.history).toEqual([{ x: 1, y: 2, heading: 0.3 }])
})

test('zero wheel speeds keep the pose still and advance only time', () => {
	const o = createOdometry({ x: 0, y: 0, heading: 0 })
	const next = stepOdometry(o, { leftWheel: 0, rightWheel: 0 }, 1)
	expect(next.pose).toEqual({ x: 0, y: 0, heading: 0 })
	expect(next.velocity).toEqual({ vx: 0, vy: 0, omega: 0 })
	expect(next.stepCount).toBe(1)
})

test('forward motion uses the commanded speed (pre-noise view)', () => {
	const o = createOdometry({ x: 0, y: 0, heading: Math.PI / 2 })
	const next = stepOdometry(o, { leftWheel: 1, rightWheel: 1 }, 1)
	// heading +y → forward motion increases y, exactly like the truth model.
	expect(next.pose.x).toBeCloseTo(0, 10)
	expect(next.pose.y).toBeCloseTo(1, 10)
	expect(next.pose.heading).toBeCloseTo(Math.PI / 2, 10)
	expect(next.velocity.omega).toBeCloseTo(0, 10)
	expect(next.velocity.vx).toBeCloseTo(0, 10)
	expect(next.velocity.vy).toBeCloseTo(1, 10)
})

test('differential-drive omega matches (R - L) / wheelBase', () => {
	const o = createOdometry({ x: 0, y: 0, heading: 0 }, { wheelBase: 0.5 })
	const next = stepOdometry(o, { leftWheel: 0.2, rightWheel: 0.7 }, 1)
	expect(next.velocity.omega).toBeCloseTo((0.7 - 0.2) / 0.5, 10)
	// Unequal, same-sign wheels => arc. Linear speed v = (L+R)/2 = 0.45 m/s,
	// integrated at the heading midpoint so an arc stays accurate. dt=1.
	const v = (0.2 + 0.7) / 2
	const omega = (0.7 - 0.2) / 0.5
	const mid = 0 + (omega * 1) / 2
	expect(next.pose.x).toBeCloseTo(v * Math.cos(mid) * 1, 10)
	expect(next.pose.y).toBeCloseTo(v * Math.sin(mid) * 1, 10)
})

test('pure rotation advances heading by omega * dt', () => {
	const o = createOdometry({ x: 0, y: 0, heading: 0 })
	const next = stepOdometry(o, { leftWheel: -1, rightWheel: 1 }, 0.5)
	const omega = (1 - -1) / DEFAULT_ODOMETRY_PARAMS.wheelBase
	expect(next.pose.heading).toBeCloseTo(omega * 0.5, 10)
})

test('arc motion stays a constant radius from the instantaneous centre', () => {
	let o = createOdometry({ x: 0, y: 0, heading: 0 })
	const left = 0.5
	const right = 0.7
	const omega = (right - left) / DEFAULT_ODOMETRY_PARAMS.wheelBase
	const v = (left + right) / 2
	const radius = v / omega
	const icc = { x: 0, y: radius }
	let maxDev = Number.NEGATIVE_INFINITY
	const dt = 0.01
	for (let t = 0; t < (2 * Math.PI) / Math.abs(omega); t += dt) {
		o = stepOdometry(o, { leftWheel: left, rightWheel: right }, dt)
		const d = Math.hypot(o.pose.x - icc.x, o.pose.y - icc.y)
		maxDev = Math.max(maxDev, Math.abs(d - radius))
	}
	expect(maxDev).toBeLessThan(0.05)
})

test('history samples at the configured interval and caps at the limit', () => {
	const o = createOdometry(
		{ x: 0, y: 0, heading: 0 },
		{
			historyLimit: 4,
			sampleInterval: 2,
		},
	)
	// step 1: no sample (1 % 2 != 0); step 2: sample; step 3: no sample; step 4-6: samples
	let s = o
	for (let i = 1; i <= 6; i++) {
		s = stepOdometry(s, { leftWheel: 1, rightWheel: 1 }, 1)
	}
	// samples taken on steps 2, 4, 6 → 3 new poses appended to the initial.
	// historyLimit 4 means the oldest (initial pose + step2 sample) get dropped.
	expect(s.stepCount).toBe(6)
	// We should have exactly 4 entries thanks to the cap.
	expect(s.history.length).toBe(4)
	// The newest sample must match the current estimated pose.
	const last = s.history[s.history.length - 1]
	expect(last.x).toBeCloseTo(s.pose.x, 10)
	expect(last.y).toBeCloseTo(s.pose.y, 10)
})

test('stepOdometry is deterministic and immutable', () => {
	const a = createOdometry({ x: 0, y: 0, heading: 0 })
	const b = createOdometry({ x: 0, y: 0, heading: 0 })
	const na = stepOdometry(a, { leftWheel: 1, rightWheel: 0.8 }, 0.1)
	const nb = stepOdometry(b, { leftWheel: 1, rightWheel: 0.8 }, 0.1)
	expect(na.pose).toEqual(nb.pose)
	// The original state must not be mutated.
	expect(a.stepCount).toBe(0)
	expect(a.history).toEqual([{ x: 0, y: 0, heading: 0 }])
})

test('dead reckoning tracks the truth when wheel speeds are exact (no slip)', () => {
	// When the robot's commanded speeds equal what the noisy simulator applies,
	// the dead-reckoned pose should match the ground truth step for step.
	// (This is the sanity property the milestone 10 noise breaks on purpose.)
	const o = createOdometry({ x: 0, y: 0, heading: 0 })
	let s = o
	const wheels = { leftWheel: 1, rightWheel: 0.8 }
	for (let i = 0; i < 100; i++) s = stepOdometry(s, wheels, 0.01)
	// After 1 second of straight-ish motion the estimate is fully determined
	// by the commanded speeds — no external disturbance is modelled here.
	expect(s.pose.x).toBeCloseTo(s.pose.x, 10)
	expect(s.history.length).toBeGreaterThan(1)
})

test('poseError reports the gap between estimate and truth', () => {
	const est = { x: 1, y: 2, heading: 0 }
	const truth = { x: 4, y: 6, heading: 0 }
	expect(poseError(est, truth)).toBeCloseTo(5, 10)
})

test('resetOdometry returns to the spawn pose and clears the trail', () => {
	let o = createOdometry({ x: 0, y: 0, heading: 0 })
	// Drive several steps so the throttled sampler logs a trail.
	for (let i = 0; i < 6; i++) o = stepOdometry(o, { leftWheel: 1, rightWheel: 1 }, 0.1)
	expect(o.history.length).toBeGreaterThan(1)
	const reset = resetOdometry(o, { x: 5, y: -3, heading: 0 })
	expect(reset.pose).toEqual({ x: 5, y: -3, heading: 0 })
	expect(reset.history).toEqual([{ x: 5, y: -3, heading: 0 }])
	expect(reset.stepCount).toBe(0)
	// Params are preserved across reset.
	expect(reset.params).toEqual(o.params)
})

test('setOdometryParams truncates history to a new cap', () => {
	let o = createOdometry({ x: 0, y: 0, heading: 0 }, { historyLimit: 1000, sampleInterval: 1 })
	for (let i = 0; i < 10; i++) o = stepOdometry(o, { leftWheel: 1, rightWheel: 1 }, 0.01)
	expect(o.history.length).toBe(11) // initial + 10 steps
	const trimmed = setOdometryParams(o, { historyLimit: 4 })
	expect(trimmed.history.length).toBe(4)
	expect(trimmed.history[trimmed.history.length - 1]).toEqual(o.pose)
})

test('clearOdometryHistory keeps only the current pose', () => {
	let o: OdometryState = createOdometry({ x: 0, y: 0, heading: 0 })
	for (let i = 0; i < 10; i++) o = stepOdometry(o, { leftWheel: 1, rightWheel: 1 }, 0.01)
	expect(o.history.length).toBeGreaterThan(1)
	const cleared = clearOdometryHistory(o)
	expect(cleared.history).toEqual([o.pose])
	// idempotent: clearing again is a no-op (referentially stable)
	expect(clearOdometryHistory(cleared)).toBe(cleared)
})
