import { combineFlightInputs, gamepadFlightInput, keyboardFlightInput } from './manual-input'

describe('manual flight input', () => {
	it('maps keyboard controls to all four flight axes', () => {
		expect(keyboardFlightInput(new Set(['ArrowUp', 'ArrowLeft', 'KeyW', 'KeyD']))).toEqual({
			throttle: 1,
			yaw: -1,
			pitch: 1,
			roll: 1,
		})
	})

	it('maps dual-stick gamepads and filters stick drift', () => {
		expect(gamepadFlightInput([0.5, -0.8, -0.4, 0.05])).toEqual({
			throttle: 0.8,
			yaw: 0.5,
			pitch: 0,
			roll: -0.4,
		})
	})

	it('uses the strongest input on each axis', () => {
		const keyboard = keyboardFlightInput(new Set(['KeyW']))
		const gamepad = gamepadFlightInput([0.6, -0.5, 0.4, 0.8])
		expect(combineFlightInputs(keyboard, gamepad)).toEqual({
			throttle: 0.5,
			yaw: 0.6,
			pitch: 1,
			roll: 0.4,
		})
	})
})
