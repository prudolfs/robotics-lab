import { useEffect, useRef, useState } from 'react'
import type { Scene } from '../api/client'

/** Local synthesized event cues, enabled only by an explicit user gesture. */
export function useCaretakerSound(scene: Scene | undefined, generation: number) {
	const context = useRef<AudioContext | null>(null)
	const [enabled, setEnabled] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const previous = useRef({
		generation,
		pickups: scene?.pickups ?? 0,
		delivered: scene?.delivered ?? false,
	})
	useEffect(() => {
		const old = previous.current
		previous.current = {
			generation,
			pickups: scene?.pickups ?? 0,
			delivered: scene?.delivered ?? false,
		}
		const audio = context.current
		if (
			!scene ||
			!enabled ||
			!audio ||
			audio.state !== 'running' ||
			document.hidden ||
			old.generation !== generation
		)
			return
		const delivered = scene.delivered && !old.delivered
		if (!delivered && scene.pickups <= old.pickups) return
		const start = audio.currentTime
		for (const [index, frequency] of (delivered ? [523, 659, 784] : [440, 587]).entries()) {
			const oscillator = audio.createOscillator()
			const gain = audio.createGain()
			const at = start + index * 0.09
			oscillator.type = 'sine'
			oscillator.frequency.value = frequency
			gain.gain.setValueAtTime(0, at)
			gain.gain.linearRampToValueAtTime(0.045, at + 0.012)
			gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.15)
			oscillator.connect(gain).connect(audio.destination)
			oscillator.start(at)
			oscillator.stop(at + 0.16)
			oscillator.onended = () => {
				oscillator.disconnect()
				gain.disconnect()
			}
		}
	}, [scene, generation, enabled])
	useEffect(
		() => () => {
			void context.current?.close()
		},
		[],
	)
	async function toggle() {
		try {
			if (enabled) {
				await context.current?.suspend()
				setEnabled(false)
				return
			}
			context.current ??= new AudioContext()
			await context.current.resume()
			setEnabled(true)
			setError(null)
		} catch {
			setError('Sound is unavailable in this browser.')
			setEnabled(false)
		}
	}
	return { enabled, error, toggle }
}
