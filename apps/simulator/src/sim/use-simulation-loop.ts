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
//
// Sensors: the world (from the selected map) and the lidar config are app
// state in the store; the loop refects them onto the sim via `setSimWorld` /
// `setLidarConfig` whenever they change so the scan stays in sync.

import { useCallback, useEffect, useRef } from 'react'
import {
	accumulate,
	setInput as applyInput,
	clearOccupancyGrid,
	createSimulation,
	type DriveInput,
	pause as pauseSim,
	resetSimulation,
	resume as resumeSim,
	type SimState,
	setLidarConfig,
	setSimWorld,
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

/** Build a fresh sim seeded with the current world + lidar config. */
function freshSim(): SimState {
	const { world, lidar } = useSimulatorStore.getState()
	return createSimulation({ spawnPose: SPAWN_POSE, world, lidar })
}

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
	const world = useSimulatorStore((s) => s.world)
	const lidar = useSimulatorStore((s) => s.lidar)

	const simRef = useRef<SimState | null>(null)
	if (simRef.current === null) simRef.current = freshSim()
	// After the guard above, `simRef.current` is never null for the lifetime of
	// the hook; `cur` is the typed accessor closure used everywhere below. Wrapped
	// in `useCallback` so it has a stable identity for effect deps.
	const cur = useCallback((): SimState => simRef.current as SimState, [])
	const keyboardRef = useKeyboard()
	// A snapshot of teleop config read once per frame: avoids re-subscribing
	// the rAF effect on every slider drag (the loop polls it off the store).
	const teleopRef = useRef<TeleopConfig>(DEFAULT_TELEOP_CONFIG)
	const lastFrameRef = useRef<number | null>(null)
	const lastMapRef = useRef<string>(selectedMap)
	const lastInputRef = useRef<DriveInput>(ZERO_INPUT)

	// Reset the sim when the active map changes, seeding with the new world.
	useEffect(() => {
		if (lastMapRef.current === selectedMap) return
		lastMapRef.current = selectedMap
		simRef.current = freshSim()
		lastFrameRef.current = null
		lastInputRef.current = ZERO_INPUT
		observe(cur())
	}, [selectedMap, observe, cur])

	// Manual "clear map" action: clear the occupancy grid without resetting the
	// robot. Watched via a monotonic nonce so the grid is cleared exactly once
	// per click. The initial nonce (0) is skipped with a guard ref.
	const mapNonce = useSimulatorStore((s) => s.mapNonce)
	const lastNonceRef = useRef<number>(mapNonce)
	useEffect(() => {
		if (lastNonceRef.current === mapNonce) return
		lastNonceRef.current = mapNonce
		if (mapNonce === 0) return
		simRef.current = clearOccupancyGrid(cur())
		observe(cur())
	}, [mapNonce, observe, cur])

	// Reflect world changes onto the sim without resetting the robot. The map
	// change path above already rebuilds a fresh sim, so this effect handles
	// the case where the world object identity changes for other reasons.
	useEffect(() => {
		simRef.current = setSimWorld(cur(), world)
		observe(cur())
	}, [world, observe, cur])

	// Reflect lidar config changes onto the sim.
	useEffect(() => {
		simRef.current = setLidarConfig(cur(), lidar)
		observe(cur())
	}, [lidar, observe, cur])

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
				simRef.current = applyInput(cur(), desired)
				lastInputRef.current = desired
			}

			simRef.current = accumulate(cur(), dt).state
			observe(cur())
		}
		raf = requestAnimationFrame(tick)
		return () => cancelAnimationFrame(raf)
	}, [observe, keyboardRef, cur])

	// Controls read from the ref (the authority) and are cheap to recreate.
	return {
		pause: () => {
			simRef.current = pauseSim(cur())
			observe(cur())
		},
		resume: () => {
			simRef.current = resumeSim(cur())
			observe(cur())
		},
		togglePause: () => {
			const s = cur()
			simRef.current = s.running ? pauseSim(s) : resumeSim(s)
			observe(cur())
		},
		reset: () => {
			simRef.current = resetSimulation(cur())
			// Force the input back to whatever the keyboard is asking for.
			const desired = driveInputFromKeyboard(keyboardRef.current, teleopRef.current)
			simRef.current = applyInput(cur(), desired)
			lastInputRef.current = desired
			observe(cur())
		},
		emergencyStop: () => {
			// Reflect the stop into the keyboard ref so the next frame doesn't
			// immediately re-apply a non-zero input from still-held keys. The
			// Space keydown already does this, but a button-triggered stop must
			// stand on its own.
			keyboardRef.current = { ...keyboardRef.current, stop: true }
			simRef.current = applyInput(cur(), ZERO_INPUT)
			lastInputRef.current = ZERO_INPUT
			observe(cur())
		},
		clearEmergencyStop: () => {
			keyboardRef.current = { ...keyboardRef.current, stop: false }
		},
	}
}
