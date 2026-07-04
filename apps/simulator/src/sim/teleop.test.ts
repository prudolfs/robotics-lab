import { expect, test } from 'vitest'
import {
	applyKey,
	DEFAULT_TELEOP_CONFIG,
	driveInputFromKeyboard,
	IDLE_KEYBOARD,
	isIdle,
	keyToIntent,
} from './teleop'

test('keyToIntent maps movement keys and rejects unrelated keys', () => {
	expect(keyToIntent('w')).toBe('forward')
	expect(keyToIntent('ArrowUp')).toBe('forward')
	expect(keyToIntent('S')).toBe('reverse')
	expect(keyToIntent('ArrowLeft')).toBe('left')
	expect(keyToIntent('d')).toBe('right')
	expect(keyToIntent('Shift')).toBe('boost')
	expect(keyToIntent(' ')).toBe('stop')
	expect(keyToIntent('Enter')).toBeNull()
})

test('applyKey is immutable and referentially stable on no-op', () => {
	const next = applyKey(IDLE_KEYBOARD, 'forward', true)
	expect(next).not.toBe(IDLE_KEYBOARD)
	expect(next.forward).toBe(true)
	// Applying the same value again returns the same reference.
	expect(applyKey(next, 'forward', true)).toBe(next)
	// Releasing reverts to the original idle footprint.
	const released = applyKey(next, 'forward', false)
	expect(released).toEqual(IDLE_KEYBOARD)
})

test('idle keyboard has zero wheel speeds', () => {
	expect(driveInputFromKeyboard(IDLE_KEYBOARD)).toEqual({ leftWheel: 0, rightWheel: 0 })
	expect(isIdle(IDLE_KEYBOARD)).toBe(true)
})

test('forward drives both wheels at the base speed equally', () => {
	const state = applyKey(IDLE_KEYBOARD, 'forward', true)
	const input = driveInputFromKeyboard(state)
	expect(input.leftWheel).toBeCloseTo(DEFAULT_TELEOP_CONFIG.baseSpeed, 12)
	expect(input.rightWheel).toBeCloseTo(DEFAULT_TELEOP_CONFIG.baseSpeed, 12)
})

test('reverse drives both wheels negatively', () => {
	const state = applyKey(IDLE_KEYBOARD, 'reverse', true)
	const input = driveInputFromKeyboard(state)
	expect(input.leftWheel).toBeCloseTo(-DEFAULT_TELEOP_CONFIG.baseSpeed, 12)
	expect(input.rightWheel).toBeCloseTo(-DEFAULT_TELEOP_CONFIG.baseSpeed, 12)
})

test('turning right speeds the left wheel and slows the right (cw heading)', () => {
	const state = applyKey(IDLE_KEYBOARD, 'right', true)
	const input = driveInputFromKeyboard(state)
	expect(input.leftWheel).toBeCloseTo(DEFAULT_TELEOP_CONFIG.turnSpeed, 12)
	expect(input.rightWheel).toBeCloseTo(-DEFAULT_TELEOP_CONFIG.turnSpeed, 12)
})

test('turning left speeds the right wheel and slows the left (ccw heading)', () => {
	const state = applyKey(IDLE_KEYBOARD, 'left', true)
	const input = driveInputFromKeyboard(state)
	expect(input.leftWheel).toBeCloseTo(-DEFAULT_TELEOP_CONFIG.turnSpeed, 12)
	expect(input.rightWheel).toBeCloseTo(DEFAULT_TELEOP_CONFIG.turnSpeed, 12)
})

test('forward + right produces an arc (both wheels positive, left faster)', () => {
	const fwd = applyKey(IDLE_KEYBOARD, 'forward', true)
	const right = applyKey(fwd, 'right', true)
	const input = driveInputFromKeyboard(right)
	const { baseSpeed, turnSpeed } = DEFAULT_TELEOP_CONFIG
	expect(input.leftWheel).toBeCloseTo(baseSpeed + turnSpeed, 12)
	expect(input.rightWheel).toBeCloseTo(baseSpeed - turnSpeed, 12)
	expect(input.rightWheel).toBeGreaterThan(0) // still moving forward
})

test('forward and reverse cancel, leaving only the turn component', () => {
	const fwd = applyKey(IDLE_KEYBOARD, 'forward', true)
	const both = applyKey(fwd, 'reverse', true)
	const input = driveInputFromKeyboard(both)
	expect(input.leftWheel).toBeCloseTo(0, 12)
	expect(input.rightWheel).toBeCloseTo(0, 12)
})

test('boost multiplies both base and turn components', () => {
	const fwd = applyKey(IDLE_KEYBOARD, 'forward', true)
	const boosted = applyKey(fwd, 'boost', true)
	const input = driveInputFromKeyboard(boosted)
	expect(input.leftWheel).toBeCloseTo(
		DEFAULT_TELEOP_CONFIG.baseSpeed * DEFAULT_TELEOP_CONFIG.boostMultiplier,
		12,
	)
	expect(input.rightWheel).toBeCloseTo(
		DEFAULT_TELEOP_CONFIG.baseSpeed * DEFAULT_TELEOP_CONFIG.boostMultiplier,
		12,
	)
})

test('emergency stop zeroes the output even while other keys are held', () => {
	const fwd = applyKey(IDLE_KEYBOARD, 'forward', true)
	const right = applyKey(fwd, 'right', true)
	const stopped = applyKey(right, 'stop', true)
	const input = driveInputFromKeyboard(stopped)
	expect(input).toEqual({ leftWheel: 0, rightWheel: 0 })
})

test('a custom config is respected', () => {
	const config = { baseSpeed: 1, turnSpeed: 0.5, boostMultiplier: 3 }
	const fwd = applyKey(IDLE_KEYBOARD, 'forward', true)
	expect(driveInputFromKeyboard(fwd, config).leftWheel).toBeCloseTo(1, 12)
	const boosted = applyKey(fwd, 'boost', true)
	expect(driveInputFromKeyboard(boosted, config).leftWheel).toBeCloseTo(3, 12)
})
