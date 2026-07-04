// React glue that drives the framework-independent simulation loop with
// `requestAnimationFrame` and pushes observed state into the Zustand store.
//
// The hook is the only piece that touches browser timing. The simulation itself
// (fixed timestep, integration, pause/resume/reset) lives in `@/sim/loop` and
// is deterministic. React only observes the snapshots written to the store.
//
// Teleop: the keyboard hook owns the live `KeyboardState` ref, and the loop
// hook reads it each frame and runs it through the pure teleop mapping in
// `@/sim/teleop` to derive the `DriveInput` the sim applies. The teleop config
// (base speed, turn speed, boost) is UI app-state kept in the store so the HUD
// slider can tune the throttle without touching the loop.

import { useEffect, useRef } from 'react'
import {
	accumulate,
	setInput as applyInput,
	createSimulation,
	type DriveInput,
	pause as pauseSim,
	resetSimulation,
	resume as resumeSim,
	type SimState,
} from '@/sim/loop'
import {
	DEFAULT_TELEOP_CONFIG,
	driveInputFromKeyboard,
	type KeyboardState,
	type TeleopConfig,
} from '@/sim/teleop'
import { useKeyboard } from '@/sim/use-keyboard'
import { SPAWN_POSE, useSimulatorStore } from '@/store'

export type SimulationControls = {
	pause: () => void
	resume: () => void
	togglePause: () => void
	reset: () => void
	/** Zero drive input immediately, overriding the keyboard. */
	emergencyStop: () => void
	/** Release an emergency stop back to keyboard control. */
	clearEmergencyStop: () => void
}

const freshSim = () => createSimulation({ spawnPose: SPAWN_POSE })

const ZERO_INPUT: DriveInput = { leftWheel: 0, rightWheel: 0 }
const INPUT_EQ = (a: DriveInput, b: DriveInput) =>
	a.leftWheel === b.leftWheel && a.rightWheel === b.rightWheel

/**
 * Start the simulation loop. Returns imperative controls for the UI (pause /
 * resume / reset / e-stop). The loop runs for the lifetime of the component
 * that mounts it; it resets the sim when the selected map changes so the robot
 * always spawns at the new map's origin.
 */
export function useSimulationLoop(): SimulationControls {
	const observe = useSimulatorStore((s) => s.observe)
	const selectedMap = useSimulatorStore((s) => s.selectedMap)

	const simRef = useRef<SimState>(freshSim())
	const keyboardRef = useKeyboard()
	// A snapshot of teleop config read once per frame: avoids re-subscribing
	// the rAF effect on every slider drag (the loop polls it off the store).
	const teleopRef = useRef<TeleopConfig>(DEFAULT_TELEOP_CONFIG)
	const lastFrameRef = useRef<number | null>(null)
	const lastMapRef = useRef<string>(selectedMap)
	const lastInputRef = useRef<DriveInput>(ZERO_INPUT)

	// Reset the sim when the active map changes.
	useEffect(() => {
		if (lastMapRef.current === selectedMap) return
		lastMapRef.current = selectedMap
		simRef.current = freshSim()
		lastFrameRef.current = null
		lastInputRef.current = ZERO_INPUT
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

			// Poll teleop config straight from the store (UI app state).
			teleopRef.current = useSimulatorStore.getState().teleop

			// Translate the live keyboard intents into a drive input and apply
			// it before stepping. `setInput` is a no-op when nothing changes,
			// so a steady keyboard state adds zero allocation pressure.
			const keyboard: KeyboardState = keyboardRef.current
			const desired = driveInputFromKeyboard(keyboard, teleopRef.current)
			if (!INPUT_EQ(lastInputRef.current, desired)) {
				simRef.current = applyInput(simRef.current, desired)
				lastInputRef.current = desired
			}

			simRef.current = accumulate(simRef.current, dt).state
			observe(simRef.current)
		}
		raf = requestAnimationFrame(tick)
		return () => cancelAnimationFrame(raf)
	}, [observe, keyboardRef])

	// Controls read from the ref (the authority) and are cheap to recreate.
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
			// Force the input back to whatever the keyboard is asking for.
			const desired = driveInputFromKeyboard(keyboardRef.current, teleopRef.current)
			simRef.current = applyInput(simRef.current, desired)
			lastInputRef.current = desired
			observe(simRef.current)
		},
		emergencyStop: () => {
			// Reflect the stop into the keyboard ref so the next frame doesn't
			// immediately re-apply a non-zero input from still-held keys. The
			// Space keydown already does this, but a button-triggered stop must
			// stand on its own.
			keyboardRef.current = { ...keyboardRef.current, stop: true }
			simRef.current = applyInput(simRef.current, ZERO_INPUT)
			lastInputRef.current = ZERO_INPUT
			observe(simRef.current)
		},
		clearEmergencyStop: () => {
			keyboardRef.current = { ...keyboardRef.current, stop: false }
		},
	}
}
