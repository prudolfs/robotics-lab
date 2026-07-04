// React glue that drives the framework-independent simulation loop with
// `requestAnimationFrame` and pushes observed state into the Zustand store.
//
// The hook is the only piece that touches browser timing. The simulation itself
// (fixed timestep, integration, pause/resume/reset) lives in `@/sim/loop` and
// is deterministic. React only observes the snapshots written to the store.

import { useEffect, useRef } from 'react'
import {
	accumulate,
	createSimulation,
	type DriveInput,
	pause as pauseSim,
	resetSimulation,
	resume as resumeSim,
	type SimState,
} from '@/sim/loop'
import { SPAWN_POSE, useSimulatorStore } from '@/store'

export type SimulationControls = {
	pause: () => void
	resume: () => void
	togglePause: () => void
	reset: () => void
}

/** Default cruise input so the loop visibly drives the robot until teleop. */
const DEFAULT_INPUT: DriveInput = { leftWheel: 0.2, rightWheel: 0.18 }

const freshSim = () => createSimulation({ spawnPose: SPAWN_POSE, input: DEFAULT_INPUT })

/**
 * Start the simulation loop. Returns imperative controls for the UI (pause /
 * resume / reset). The loop runs for the lifetime of the component that mounts
 * it; it resets the sim when the selected map changes so the robot always
 * spawns at the new map's origin.
 */
export function useSimulationLoop(): SimulationControls {
	const observe = useSimulatorStore((s) => s.observe)
	const selectedMap = useSimulatorStore((s) => s.selectedMap)

	const simRef = useRef<SimState>(freshSim())
	const lastFrameRef = useRef<number | null>(null)
	const lastMapRef = useRef<string>(selectedMap)

	// Reset the sim when the active map changes. Running the effect on
	// `selectedMap` keeps the sim authoritative about its own spawn pose.
	useEffect(() => {
		if (lastMapRef.current === selectedMap) return
		lastMapRef.current = selectedMap
		simRef.current = freshSim()
		lastFrameRef.current = null
		observe(simRef.current)
	}, [selectedMap, observe])

	// The render-rate driver: measure wall clock, drain fixed steps, observe.
	useEffect(() => {
		let raf = 0
		const tick = (nowMs: number) => {
			raf = requestAnimationFrame(tick)
			const last = lastFrameRef.current ?? nowMs
			const dt = (nowMs - last) / 1000
			lastFrameRef.current = nowMs
			simRef.current = accumulate(simRef.current, dt).state
			observe(simRef.current)
		}
		raf = requestAnimationFrame(tick)
		return () => cancelAnimationFrame(raf)
	}, [observe])

	// Controls read from the ref (the authority) and are stable enough to hand
	// to buttons; they're cheap to recreate and capture only refs + `observe`.
	return {
		pause: () => {
			simRef.current = pauseSim(simRef.current)
			observe(simRef.current)
		},
		resume: () => {
			simRef.current = resumeSim(simRef.current)
			observe(simRef.current)
		},
		togglePause: () => {
			simRef.current = simRef.current.running ? pauseSim(simRef.current) : resumeSim(simRef.current)
			observe(simRef.current)
		},
		reset: () => {
			simRef.current = resetSimulation(simRef.current)
			observe(simRef.current)
		},
	}
}
