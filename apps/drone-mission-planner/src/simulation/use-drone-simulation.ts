import {
	advanceDroneSimulation,
	applyManualControl,
	armDrone,
	type ControlResponse,
	createDroneSimulation,
	type DroneSimulation,
	disarmDrone,
	isDroneArmed,
	type ManualControlInput,
	NEUTRAL_MANUAL_CONTROL,
	pauseDroneSimulation,
	resetDroneSimulation,
	resumeDroneSimulation,
	setDroneSimulationTimeScale,
	type TimeScale,
} from '@robotics-lab/drone'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PREVIEW_DRONE_STATE } from '@/drone-preview'
import {
	combineFlightInputs,
	gamepadFlightInput,
	keyboardFlightInput,
	sameFlightInput,
} from '@/simulation/manual-input'

export type FlightControlState = {
	armed: boolean
	emergencyStopped: boolean
	gamepadConnected: boolean
	input: ManualControlInput
	response: ControlResponse
}

export type DroneSimulationControls = {
	arm: () => void
	disarm: () => void
	emergencyStop: () => void
	pause: () => void
	reset: () => void
	resume: () => void
	setControlResponse: (response: ControlResponse) => void
	setTimeScale: (timeScale: TimeScale) => void
	toggleArm: () => void
	togglePause: () => void
}

export function useDroneSimulation(): {
	simulation: DroneSimulation
	controls: DroneSimulationControls
	flightControl: FlightControlState
} {
	const simulationRef = useRef<DroneSimulation | null>(null)
	if (simulationRef.current === null) {
		simulationRef.current = createDroneSimulation(PREVIEW_DRONE_STATE)
	}
	const [simulation, setSimulation] = useState(simulationRef.current)
	const [controlResponse, setControlResponseState] = useState<ControlResponse>(1)
	const [emergencyStopped, setEmergencyStopped] = useState(false)
	const [gamepadConnected, setGamepadConnected] = useState(false)
	const [manualInput, setManualInput] = useState<ManualControlInput>(NEUTRAL_MANUAL_CONTROL)
	const controlResponseRef = useRef<ControlResponse>(1)
	const emergencyStoppedRef = useRef(false)
	const gamepadConnectedRef = useRef(false)
	const manualInputRef = useRef<ManualControlInput>(NEUTRAL_MANUAL_CONTROL)
	const pressedKeysRef = useRef(new Set<string>())

	const update = useCallback((updater: (current: DroneSimulation) => DroneSimulation) => {
		const next = updater(simulationRef.current as DroneSimulation)
		simulationRef.current = next
		setSimulation(next)
	}, [])

	const pause = useCallback(() => update(pauseDroneSimulation), [update])
	const resume = useCallback(() => update(resumeDroneSimulation), [update])
	const setTimeScale = useCallback(
		(timeScale: TimeScale) => update((current) => setDroneSimulationTimeScale(current, timeScale)),
		[update],
	)
	const togglePause = useCallback(() => {
		update((current) =>
			current.clock.running ? pauseDroneSimulation(current) : resumeDroneSimulation(current),
		)
	}, [update])
	const setControlResponse = useCallback((response: ControlResponse) => {
		controlResponseRef.current = response
		setControlResponseState(response)
	}, [])
	const arm = useCallback(() => {
		emergencyStoppedRef.current = false
		setEmergencyStopped(false)
		update((current) => ({ ...current, drone: armDrone(current.drone, current.params) }))
	}, [update])
	const disarm = useCallback(() => {
		emergencyStoppedRef.current = false
		setEmergencyStopped(false)
		update((current) => ({ ...current, drone: disarmDrone(current.drone) }))
	}, [update])
	const emergencyStop = useCallback(() => {
		emergencyStoppedRef.current = true
		pressedKeysRef.current.clear()
		setEmergencyStopped(true)
		update((current) => ({ ...current, drone: disarmDrone(current.drone) }))
	}, [update])
	const toggleArm = useCallback(() => {
		const current = simulationRef.current as DroneSimulation
		if (isDroneArmed(current.drone)) disarm()
		else arm()
	}, [arm, disarm])
	const reset = useCallback(() => {
		emergencyStoppedRef.current = false
		pressedKeysRef.current.clear()
		manualInputRef.current = NEUTRAL_MANUAL_CONTROL
		setEmergencyStopped(false)
		setManualInput(NEUTRAL_MANUAL_CONTROL)
		update(resetDroneSimulation)
	}, [update])

	useEffect(() => {
		const isEditableTarget = (target: EventTarget | null) =>
			target instanceof HTMLElement &&
			(target.isContentEditable ||
				['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName))
		const flightKeys = new Set([
			'ArrowUp',
			'ArrowDown',
			'ArrowLeft',
			'ArrowRight',
			'KeyW',
			'KeyA',
			'KeyS',
			'KeyD',
		])
		const onKeyDown = (event: KeyboardEvent) => {
			if (isEditableTarget(event.target)) return
			if (flightKeys.has(event.code)) {
				event.preventDefault()
				pressedKeysRef.current.add(event.code)
				return
			}
			if (event.repeat) return
			if (event.code === 'Space') {
				event.preventDefault()
				emergencyStop()
			} else if (event.code === 'KeyR') {
				toggleArm()
			} else if (event.code === 'Digit1') setControlResponse(0.5)
			else if (event.code === 'Digit2') setControlResponse(1)
			else if (event.code === 'Digit3') setControlResponse(1.5)
		}
		const onKeyUp = (event: KeyboardEvent) => pressedKeysRef.current.delete(event.code)
		const clearKeys = () => pressedKeysRef.current.clear()
		window.addEventListener('keydown', onKeyDown)
		window.addEventListener('keyup', onKeyUp)
		window.addEventListener('blur', clearKeys)
		return () => {
			window.removeEventListener('keydown', onKeyDown)
			window.removeEventListener('keyup', onKeyUp)
			window.removeEventListener('blur', clearKeys)
		}
	}, [emergencyStop, setControlResponse, toggleArm])

	useEffect(() => {
		let animationFrame = 0
		let previousTime: number | null = null

		const frame = (time: number) => {
			if (previousTime === null) previousTime = time
			const deltaSeconds = (time - previousTime) / 1000
			previousTime = time
			const gamepad = navigator.getGamepads?.().find((candidate) => candidate?.connected) ?? null
			const connected = gamepad !== null
			if (connected !== gamepadConnectedRef.current) {
				gamepadConnectedRef.current = connected
				setGamepadConnected(connected)
			}
			const input = emergencyStoppedRef.current
				? NEUTRAL_MANUAL_CONTROL
				: combineFlightInputs(
						keyboardFlightInput(pressedKeysRef.current),
						gamepad ? gamepadFlightInput(gamepad.axes) : NEUTRAL_MANUAL_CONTROL,
					)
			if (!sameFlightInput(input, manualInputRef.current)) {
				manualInputRef.current = input
				setManualInput(input)
			}
			const current = simulationRef.current as DroneSimulation
			const drone = applyManualControl(
				current.drone,
				input,
				current.params,
				controlResponseRef.current,
			)
			const controlled = drone === current.drone ? current : { ...current, drone }
			const next = advanceDroneSimulation(controlled, deltaSeconds)
			if (next !== current) {
				simulationRef.current = next
				setSimulation(next)
			}
			animationFrame = requestAnimationFrame(frame)
		}

		animationFrame = requestAnimationFrame(frame)
		return () => cancelAnimationFrame(animationFrame)
	}, [])

	return {
		simulation,
		controls: {
			arm,
			disarm,
			emergencyStop,
			pause,
			reset,
			resume,
			setControlResponse,
			setTimeScale,
			toggleArm,
			togglePause,
		},
		flightControl: {
			armed: isDroneArmed(simulation.drone),
			emergencyStopped,
			gamepadConnected,
			input: manualInput,
			response: controlResponse,
		},
	}
}
