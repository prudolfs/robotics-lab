import {
	advanceDroneSimulation,
	createDroneSimulation,
	type DroneSimulation,
	pauseDroneSimulation,
	resetDroneSimulation,
	resumeDroneSimulation,
	setDroneSimulationTimeScale,
	type TimeScale,
} from '@robotics-lab/drone'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PREVIEW_DRONE_STATE } from '@/drone-preview'

export type DroneSimulationControls = {
	pause: () => void
	reset: () => void
	resume: () => void
	setTimeScale: (timeScale: TimeScale) => void
	togglePause: () => void
}

export function useDroneSimulation(): {
	simulation: DroneSimulation
	controls: DroneSimulationControls
} {
	const simulationRef = useRef<DroneSimulation | null>(null)
	if (simulationRef.current === null) {
		simulationRef.current = createDroneSimulation(PREVIEW_DRONE_STATE)
	}
	const [simulation, setSimulation] = useState(simulationRef.current)

	const update = useCallback((updater: (current: DroneSimulation) => DroneSimulation) => {
		const next = updater(simulationRef.current as DroneSimulation)
		simulationRef.current = next
		setSimulation(next)
	}, [])

	useEffect(() => {
		let animationFrame = 0
		let previousTime: number | null = null

		const frame = (time: number) => {
			if (previousTime === null) previousTime = time
			const deltaSeconds = (time - previousTime) / 1000
			previousTime = time
			const current = simulationRef.current as DroneSimulation
			const next = advanceDroneSimulation(current, deltaSeconds)
			if (next !== current) {
				simulationRef.current = next
				setSimulation(next)
			}
			animationFrame = requestAnimationFrame(frame)
		}

		animationFrame = requestAnimationFrame(frame)
		return () => cancelAnimationFrame(animationFrame)
	}, [])

	const pause = useCallback(() => update(pauseDroneSimulation), [update])
	const resume = useCallback(() => update(resumeDroneSimulation), [update])
	const reset = useCallback(() => update(resetDroneSimulation), [update])
	const setTimeScale = useCallback(
		(timeScale: TimeScale) => update((current) => setDroneSimulationTimeScale(current, timeScale)),
		[update],
	)
	const togglePause = useCallback(() => {
		update((current) =>
			current.clock.running ? pauseDroneSimulation(current) : resumeDroneSimulation(current),
		)
	}, [update])

	return { simulation, controls: { pause, reset, resume, setTimeScale, togglePause } }
}
