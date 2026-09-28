import { useEffect, useState, useSyncExternalStore } from 'react'
import { createController } from './controller'
import { createLayaClient } from './laya-client'
import { FIXED_DT } from './world'

export function useWarehouse(playbackSpeed = 1) {
	const [controller] = useState(() =>
		createController(42, {
			transport: createLayaClient(import.meta.env.VITE_LAYA_ENDPOINT || '/api/laya/v1/systemone'),
		}),
	)
	const state = useSyncExternalStore(
		controller.subscribe,
		controller.getSnapshot,
		controller.getSnapshot,
	)
	useEffect(() => {
		let frame = 0
		let last = performance.now()
		let accumulator = 0
		const animate = (now: number) => {
			const delta = Math.min(0.25, Math.max(0, (now - last) / 1000))
			last = now
			if (controller.getSnapshot().status === 'running') {
				accumulator +=
					delta * (controller.getMode() === 'laya' && !controller.getPlayback() ? 1 : playbackSpeed)
				while (accumulator >= FIXED_DT) {
					controller.step()
					accumulator -= FIXED_DT
				}
			} else {
				accumulator = 0
			}
			frame = requestAnimationFrame(animate)
		}
		frame = requestAnimationFrame(animate)
		return () => {
			cancelAnimationFrame(frame)
			controller.suspend()
		}
	}, [controller, playbackSpeed])
	return { controller, state }
}
