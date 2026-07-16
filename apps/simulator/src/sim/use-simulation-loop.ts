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
//
// Navigation (milestone 7): the goal queue, autonomy flag and nav config are
// app-state in the store too. The loop reflects them onto the sim; on each
// fixed step the controller then overrides the manual drive input while
// autonomy is on. The manual keyboard takes precedence: touching a drive key
// while autonomous drops autonomy back to manual teleop.

import { useCallback, useEffect, useRef } from 'react'
import {
	accumulate,
	setInput as applyInput,
	cancelCoverage as cancelSimCoverage,
	clearOccupancyGrid,
	clearOdometryTrail as clearSimOdometryTrail,
	createSimulation,
	type DriveInput,
	pause as pauseSim,
	resetSimulation,
	resume as resumeSim,
	type SimState,
	setLidarConfig,
	setAutonomous as setSimAutonomous,
	setGoals as setSimGoals,
	setNavConfig as setSimNav,
	setPlannerOptions as setSimPlanner,
	setSpawnPose as setSimSpawnPose,
	setSimWorld,
	startCoverage as startSimCoverage,
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
	/** Start coverage (robotic vacuum) mode. */
	startCoverage: () => void
	/** Cancel coverage mode. */
	cancelCoverage: () => void
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

	// Manual "clear odometry trail" action: drop the recorded pose history
	// without touching the current estimate or the robot. (milestone 11)
	const odometryNonce = useSimulatorStore((s) => s.odometryNonce)
	const lastOdometryNonceRef = useRef<number>(odometryNonce)
	useEffect(() => {
		if (lastOdometryNonceRef.current === odometryNonce) return
		lastOdometryNonceRef.current = odometryNonce
		if (odometryNonce === 0) return
		simRef.current = clearSimOdometryTrail(cur())
		observe(cur())
	}, [odometryNonce, observe, cur])

	// Editor (milestone 12): rebase the spawn pose to the robot's current pose
	// and reset, dropping the robot onto its new spawn. Watched via a monotonic
	// nonce so it fires exactly once per click. The loop owns the sim; the store
	// raised the nonce after updating `spawnPose`.
	const spawnNonce = useSimulatorStore((s) => s.spawnNonce)
	const lastSpawnNonceRef = useRef<number>(spawnNonce)
	useEffect(() => {
		if (lastSpawnNonceRef.current === spawnNonce) return
		lastSpawnNonceRef.current = spawnNonce
		if (spawnNonce === 0) return
		const { spawnPose } = useSimulatorStore.getState()
		simRef.current = setSimSpawnPose(cur(), spawnPose)
		simRef.current = resetSimulation(cur())
		// Reset cleared the goal queue / autonomy in the sim; mirror that into
		// the store so the HUD updates synchronously.
		useSimulatorStore.getState().clearGoals()
		// Re-derive the input from the keyboard so the robot doesn't keep rolling.
		const desired = driveInputFromKeyboard(keyboardRef.current, teleopRef.current)
		if (!INPUT_EQ(cur().input, desired)) simRef.current = applyInput(cur(), desired)
		lastInputRef.current = desired
		observe(cur())
	}, [spawnNonce, observe, cur, keyboardRef.current])

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

	// --- Navigation (milestone 7) ---------------------------------------------
	// App-state goals / autonomy / nav config are pushed onto the sim whenever
	// they change; the controller then drives the robot each fixed step. The
	// store mirrors the sim's own goal queue + autonomous flag, so this effect
	// runs both on user edits (clicking a goal) and on sim-driven changes
	// (arrival popped a goal). Comparing the queue contents keeps it idempotent.
	const goals = useSimulatorStore((s) => s.goals)
	const autonomous = useSimulatorStore((s) => s.autonomous)
	const navConfig = useSimulatorStore((s) => s.nav)
	const planner = useSimulatorStore((s) => s.planner)
	useEffect(() => {
		const s = cur()
		const sameGoals =
			s.goals.length === goals.length &&
			s.goals.every((g, i) => g.x === goals[i].x && g.y === goals[i].y)
		if (!sameGoals) simRef.current = setSimGoals(cur(), goals)
		observe(cur())
	}, [goals, observe, cur])
	useEffect(() => {
		if (cur().autonomous !== autonomous) simRef.current = setSimAutonomous(cur(), autonomous)
		observe(cur())
	}, [autonomous, observe, cur])
	useEffect(() => {
		simRef.current = setSimNav(cur(), navConfig)
		observe(cur())
	}, [navConfig, observe, cur])

	// Reflect planner tuning (algorithm / inflation / unknown handling) onto
	// the sim. `setSimPlanner` schedules an immediate replan so the new knobs
	// take effect on the next fixed step rather than waiting for the cadence.
	useEffect(() => {
		simRef.current = setSimPlanner(cur(), planner)
		observe(cur())
	}, [planner, observe, cur])

	// Coverage mode: watch for start/cancel commands from the store.
	const coverageMode = useSimulatorStore((s) => s.coverageMode)
	const coverageComplete = useSimulatorStore((s) => s.coverageComplete)
	useEffect(() => {
		if (cur().coverageMode === coverageMode && cur().coverageComplete === coverageComplete) return
		if (coverageMode && !cur().coverageMode) {
			simRef.current = startSimCoverage(cur())
		} else if (!coverageMode && cur().coverageMode) {
			simRef.current = cancelSimCoverage(cur())
		}
		observe(cur())
	}, [coverageMode, coverageComplete, observe, cur])

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

			// Translate the live keyboard intents into a drive input. In manual
			// mode this is the command applied each step; in autonomous mode it is
			// only used to detect a takeover (see below).
			const keyboard: KeyboardState = keyboardRef.current
			const desired = driveInputFromKeyboard(keyboard, teleopRef.current)

			// Manual teleop precedence: if the user touches a drive key while the
			// controller is driving, drop autonomy so keyboard control takes over
			// from the controller. The flag is mirrored into the store so the HUD
			// reads the takeover instantly.
			if (cur().autonomous && (desired.leftWheel !== 0 || desired.rightWheel !== 0)) {
				simRef.current = setSimAutonomous(cur(), false)
				useSimulatorStore.getState().setAutonomous(false)
			}

			// In manual mode apply the teleop mapping. Always write rather than
			// deduping against `lastInputRef`, because a fresh takeover from
			// autonomy may have left the sim's stored input at the controller's
			// last (nonzero) commanded speeds — we must overwrite that. While
			// autonomous, the controller owns the input each step and we skip.
			if (!cur().autonomous && !INPUT_EQ(cur().input, desired)) {
				simRef.current = applyInput(cur(), desired)
			}
			lastInputRef.current = desired

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
			// Reset cleared the goal queue / autonomy in the sim; mirror that into
			// the store so the HUD updates synchronously.
			useSimulatorStore.getState().clearGoals()
			// Re-derive the input from the keyboard so the robot doesn't keep
			// rolling on the controller's last command.
			const desired = driveInputFromKeyboard(keyboardRef.current, teleopRef.current)
			if (!INPUT_EQ(cur().input, desired)) simRef.current = applyInput(cur(), desired)
			lastInputRef.current = desired
			observe(cur())
		},
		emergencyStop: () => {
			// Reflect the stop into the keyboard ref so the next frame doesn't
			// immediately re-apply a non-zero input from still-held keys. The
			// Space keydown already does this, but a button-triggered stop must
			// stand on its own.
			keyboardRef.current = { ...keyboardRef.current, stop: true }
			// E-stop also drops autonomy: the controller would otherwise immediately
			// re-command nonzero wheel speeds once Space is released.
			if (cur().autonomous) {
				simRef.current = setSimAutonomous(cur(), false)
				useSimulatorStore.getState().setAutonomous(false)
			}
			simRef.current = applyInput(cur(), ZERO_INPUT)
			lastInputRef.current = ZERO_INPUT
			observe(cur())
		},
		clearEmergencyStop: () => {
			keyboardRef.current = { ...keyboardRef.current, stop: false }
		},
		startCoverage: () => {
			simRef.current = startSimCoverage(cur())
			observe(cur())
		},
		cancelCoverage: () => {
			simRef.current = cancelSimCoverage(cur())
			observe(cur())
		},
	}
}
