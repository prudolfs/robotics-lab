import { useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'

/**
 * A headless frames-per-second sampler. Hook it inside a Canvas; it reports
 * the current FPS through its `onUpdate` callback roughly once per second so
 * React can render the value in a HUD without re-rendering on every frame.
 */
export function FpsCounter({
	intervalMs = 500,
	onUpdate,
}: {
	intervalMs?: number
	onUpdate: (fps: number) => void
}) {
	const frames = useRef(0)
	const last = useRef(performance.now())
	const { invalidate } = useThree() as { invalidate?: () => void }

	// Trigger continuous rendering so the FPS counter is meaningful when the
	// scene would otherwise be static.
	useEffect(() => {
		if (invalidate) {
			const id = window.setInterval(invalidate, 1000 / 60)
			return () => window.clearInterval(id)
		}
	}, [invalidate])

	// Keep a local copy so the component reads even without a React consumer.
	const [, setFps] = useState(0)

	useEffect(() => {
		const id = window.setInterval(() => {
			const now = performance.now()
			const elapsed = now - last.current
			if (elapsed <= 0) return
			const fps = (frames.current / elapsed) * 1000
			setFps(fps)
			onUpdate(fps)
			frames.current = 0
			last.current = now
		}, intervalMs)

		// rAF tick to count frames. Wrapped in an event-style loop instead of a
		// subscription so it works for any R3F setup.
		let raf = 0
		const tick = () => {
			frames.current += 1
			raf = window.requestAnimationFrame(tick)
		}
		raf = window.requestAnimationFrame(tick)

		return () => {
			window.clearInterval(id)
			window.cancelAnimationFrame(raf)
		}
	}, [intervalMs, onUpdate])

	return null
}
