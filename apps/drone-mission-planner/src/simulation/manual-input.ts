import type { ManualControlInput } from '@robotics-lab/drone'

const DEADZONE = 0.12

function axis(value = 0): number {
	if (Math.abs(value) < DEADZONE) return 0
	return Math.max(-1, Math.min(1, value))
}

export function keyboardFlightInput(keys: ReadonlySet<string>): ManualControlInput {
	return {
		throttle: Number(keys.has('ArrowUp')) - Number(keys.has('ArrowDown')),
		yaw: Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft')),
		pitch: Number(keys.has('KeyW')) - Number(keys.has('KeyS')),
		roll: Number(keys.has('KeyD')) - Number(keys.has('KeyA')),
	}
}

/** Standard gamepad mapping: left stick throttle/yaw, right stick pitch/roll. */
export function gamepadFlightInput(axes: readonly number[]): ManualControlInput {
	return {
		throttle: axis(-(axes[1] ?? 0)),
		yaw: axis(axes[0]),
		pitch: axis(-(axes[3] ?? 0)),
		roll: axis(axes[2]),
	}
}

export function combineFlightInputs(
	keyboard: ManualControlInput,
	gamepad: ManualControlInput,
): ManualControlInput {
	const stronger = (first: number, second: number) =>
		Math.abs(second) > Math.abs(first) ? second : first
	return {
		throttle: stronger(keyboard.throttle, gamepad.throttle),
		yaw: stronger(keyboard.yaw, gamepad.yaw),
		pitch: stronger(keyboard.pitch, gamepad.pitch),
		roll: stronger(keyboard.roll, gamepad.roll),
	}
}

export function sameFlightInput(a: ManualControlInput, b: ManualControlInput): boolean {
	return a.throttle === b.throttle && a.yaw === b.yaw && a.pitch === b.pitch && a.roll === b.roll
}
