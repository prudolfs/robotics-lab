// Teleoperation mapping: pure, framework-independent functions that translate
// keyboard intents into differential-drive wheel speeds.
//
// This module is the deterministic heart of milestone 4. It owns no timers, no
// DOM, no React and no Zustand — only the rules for turning a key state into a
// `DriveInput`. The React hook (`useKeyboard`) feeds it observed key events and
// the simulation hook applies the resulting `DriveInput` to the loop each
// frame. Keeping the mapping here keeps it unit-testable in Node.
//
// Controls layout (QWERTY):
//
//   W / ArrowUp     forward
//   S / ArrowDown   reverse
//   A / ArrowLeft   turn left  (rotate counter-clockwise)
//   D / ArrowRight  turn right (rotate clockwise)
//   Shift           boost (apply the boost multiplier to the base throttle)
//   Space           emergency stop (zero input)
//
// The model is arcade-style: forward/back sets a linear throttle and left/right
// adds a turn component, both expressed as wheel speed deltas. This composes
// cleanly on top of the differential-drive model in `@robotics-lab/robot`.

import type { DriveInput } from '@/sim/loop'

/** Logical keyboard intents derived from raw key state. */
export type KeyboardState = {
	forward: boolean
	reverse: boolean
	left: boolean
	right: boolean
	boost: boolean
	/** Stuck-prop emergency stop, set while Space is held. */
	stop: boolean
}

/** Neutral keyboard state: no keys held. */
export const IDLE_KEYBOARD: KeyboardState = {
	forward: false,
	reverse: false,
	left: false,
	right: false,
	boost: false,
	stop: false,
}

export type TeleopConfig = {
	/** Base linear wheel speed applied when driving straight, in m/s. */
	baseSpeed: number
	/** Turn bias added between the wheels when turning, in m/s. */
	turnSpeed: number
	/** Multiplier applied to `baseSpeed` and `turnSpeed` while boosting. */
	boostMultiplier: number
}

export const DEFAULT_TELEOP_CONFIG: TeleopConfig = {
	baseSpeed: 0.4,
	turnSpeed: 0.3,
	boostMultiplier: 2,
}

/** Normalize a DOM `KeyboardEvent.key` into a logical intent slot, or null. */
export function keyToIntent(key: string): keyof KeyboardState | null {
	switch (key) {
		case 'w':
		case 'W':
		case 'ArrowUp':
			return 'forward'
		case 's':
		case 'S':
		case 'ArrowDown':
			return 'reverse'
		case 'a':
		case 'A':
		case 'ArrowLeft':
			return 'left'
		case 'd':
		case 'D':
		case 'ArrowRight':
			return 'right'
		case 'Shift':
			return 'boost'
		case ' ':
		case 'Spacebar':
			return 'stop'
		default:
			return null
	}
}

/** Apply a single key press/release to a keyboard state, immutably. */
export function applyKey(
	state: KeyboardState,
	intent: keyof KeyboardState,
	pressed: boolean,
): KeyboardState {
	if (state[intent] === pressed) return state
	return { ...state, [intent]: pressed }
}

/**
 * Compute the wheel speeds for the current keyboard state and teleop config.
 *
 * Forward/back drives both wheels together; left/right adds an opposing
 * component so the robot rotates in place or arcs while moving. When forward
 * and reverse cancel (or nothing is held) the linear component is zero and the
 * turn component still applies, so a held `A` pivots on the spot. Emergency
 * stop short-circuits everything and zeroes the input regardless of intent.
 */
export function driveInputFromKeyboard(
	state: KeyboardState,
	config: TeleopConfig = DEFAULT_TELEOP_CONFIG,
): DriveInput {
	if (state.stop) return { leftWheel: 0, rightWheel: 0 }

	const scale = state.boost ? config.boostMultiplier : 1
	const linear = (state.forward ? 1 : 0) - (state.reverse ? 1 : 0)
	const turn = (state.right ? 1 : 0) - (state.left ? 1 : 0)

	const base = config.baseSpeed * scale * linear
	const bias = config.turnSpeed * scale * turn

	// Differential drive: wheel = base +/- bias. A positive bias speeds the
	// left wheel and slows the right, turning right (clockwise, -heading).
	const leftWheel = base + bias
	const rightWheel = base - bias
	return { leftWheel, rightWheel }
}

/** True when no drive intent is active (ignoring the boost modifier). */
export function isIdle(state: KeyboardState): boolean {
	return !(state.forward || state.reverse || state.left || state.right || state.stop)
}
