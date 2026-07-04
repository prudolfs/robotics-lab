// Browser-only React hook that tracks the logical keyboard intents used for
// teleoperation. The deterministic mapping from keys -> wheel speeds lives in
// `@/sim/teleop`; this hook only renders DOM key events into a `KeyboardState`
// ref so the simulation loop can poll it each frame.
//
// Intent, not raw keys, is tracked so the mapping rules (WASD vs arrows, Shift
// boost, Space e-stop) stay in one testable place. Window-level listeners keep
// the hook working even when the canvas doesn't have focus, and arrow keys are
// prevented from scrolling the page while driving.

import { useEffect, useRef } from 'react'
import { applyKey, IDLE_KEYBOARD, type KeyboardState, keyToIntent } from '@/sim/teleop'

export type KeyboardRef = { current: KeyboardState }

/** Track teleop keyboard intents for the lifetime of the calling component. */
export function useKeyboard(): KeyboardRef {
	const ref = useRef<KeyboardState>(IDLE_KEYBOARD)

	useEffect(() => {
		const isRepeat = (e: KeyboardEvent) => e.repeat === true
		const onKeyDown = (e: KeyboardEvent) => {
			const intent = keyToIntent(e.key)
			if (!intent || isRepeat(e)) return
			// Stop arrows / space from scrolling or toggling focus while driving.
			if (intent !== 'boost') e.preventDefault()
			ref.current = applyKey(ref.current, intent, true)
		}
		const onKeyUp = (e: KeyboardEvent) => {
			const intent = keyToIntent(e.key)
			if (!intent) return
			ref.current = applyKey(ref.current, intent, false)
		}
		// Losing focus mid-drive must not leave the robot stuck throttling.
		const onBlur = () => {
			ref.current = IDLE_KEYBOARD
		}
		window.addEventListener('keydown', onKeyDown)
		window.addEventListener('keyup', onKeyUp)
		window.addEventListener('blur', onBlur)
		return () => {
			window.removeEventListener('keydown', onKeyDown)
			window.removeEventListener('keyup', onKeyUp)
			window.removeEventListener('blur', onBlur)
		}
	}, [])

	return ref
}
