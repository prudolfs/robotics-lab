import {
	advanceDroneSimulation,
	applyManualControl,
	armDrone,
	armMissionExecution,
	type ControlResponse,
	createDroneSimulation,
	createMissionExecution,
	type DroneSimulation,
	disarmDrone,
	disarmMissionExecution,
	type ExecutableMissionItem,
	emergencyStopMission,
	isDroneArmed,
	type ManualControlInput,
	type MissionExecution,
	NEUTRAL_MANUAL_CONTROL,
	pauseDroneSimulation,
	pauseMissionExecution,
	requestMissionLand,
	requestMissionRtl,
	resetDroneSimulation,
	resumeDroneSimulation,
	resumeMissionExecution,
	setDroneSimulationTimeScale,
	startMissionExecution,
	stepMissionExecution,
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
	armMission: () => void
	startMission: () => void
	pauseMission: () => void
	resumeMission: () => void
	rtlMission: () => void
	landMission: () => void
	toggleArm: () => void
	togglePause: () => void
}

export function useDroneSimulation(missionItems: ExecutableMissionItem[]): {
	simulation: DroneSimulation
	missionExecution: MissionExecution
	controls: DroneSimulationControls
	flightControl: FlightControlState
} {
	const simulationRef = useRef<DroneSimulation | null>(null)
	if (simulationRef.current === null) {
		simulationRef.current = createDroneSimulation(PREVIEW_DRONE_STATE)
	}
	const [simulation, setSimulation] = useState(simulationRef.current)
	const missionExecutionRef = useRef<MissionExecution | null>(null)
	if (missionExecutionRef.current === null) {
		missionExecutionRef.current = createMissionExecution(
			missionItems,
			simulationRef.current.drone,
			simulationRef.current.params,
		)
	}
	const [missionExecution, setMissionExecution] = useState<MissionExecution>(
		missionExecutionRef.current,
	)
	const publishedMissionExecutionRef = useRef(missionExecutionRef.current)
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
	const updateMission = useCallback((updater: (current: MissionExecution) => MissionExecution) => {
		const next = updater(missionExecutionRef.current as MissionExecution)
		missionExecutionRef.current = next
		publishedMissionExecutionRef.current = next
		setMissionExecution(next)
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
		updateMission(armMissionExecution)
		update((current) => ({ ...current, drone: armDrone(current.drone, current.params) }))
	}, [update, updateMission])
	const disarm = useCallback(() => {
		emergencyStoppedRef.current = false
		setEmergencyStopped(false)
		updateMission(disarmMissionExecution)
		update((current) => ({ ...current, drone: disarmDrone(current.drone) }))
	}, [update, updateMission])
	const emergencyStop = useCallback(() => {
		emergencyStoppedRef.current = true
		pressedKeysRef.current.clear()
		setEmergencyStopped(true)
		updateMission(emergencyStopMission)
		update((current) => ({ ...current, drone: disarmDrone(current.drone) }))
	}, [update, updateMission])
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
		update((current) => {
			const next = resetDroneSimulation(current)
			const nextMission = createMissionExecution(missionItems, next.drone, next.params)
			missionExecutionRef.current = nextMission
			publishedMissionExecutionRef.current = nextMission
			setMissionExecution(nextMission)
			return next
		})
	}, [missionItems, update])
	const armMission = arm
	const startMission = useCallback(() => {
		emergencyStoppedRef.current = false
		setEmergencyStopped(false)
		updateMission(startMissionExecution)
		update((current) => ({
			...resumeDroneSimulation(current),
			drone: armDrone(current.drone, current.params),
		}))
	}, [update, updateMission])
	const pauseMission = useCallback(() => updateMission(pauseMissionExecution), [updateMission])
	const resumeMission = useCallback(() => updateMission(resumeMissionExecution), [updateMission])
	const rtlMission = useCallback(() => {
		updateMission(requestMissionRtl)
		update((current) => ({
			...resumeDroneSimulation(current),
			drone: armDrone(current.drone, current.params),
		}))
	}, [update, updateMission])
	const landMission = useCallback(() => {
		updateMission(requestMissionLand)
		update((current) => ({
			...resumeDroneSimulation(current),
			drone: armDrone(current.drone, current.params),
		}))
	}, [update, updateMission])

	useEffect(() => {
		const current = missionExecutionRef.current as MissionExecution
		if (current.running) return
		const currentSimulation = simulationRef.current as DroneSimulation
		const next = createMissionExecution(
			missionItems,
			currentSimulation.drone,
			currentSimulation.params,
		)
		missionExecutionRef.current = next
		publishedMissionExecutionRef.current = next
		setMissionExecution(next)
	}, [missionItems])

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
			const missionActive = (missionExecutionRef.current as MissionExecution).running
			const input =
				emergencyStoppedRef.current || missionActive
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
			let nextMission = missionExecutionRef.current as MissionExecution
			const next = advanceDroneSimulation(
				controlled,
				deltaSeconds,
				missionActive
					? (stepDrone, fixedDeltaSeconds) => {
							const result = stepMissionExecution(
								missionExecutionRef.current as MissionExecution,
								stepDrone,
								current.params,
								fixedDeltaSeconds,
							)
							missionExecutionRef.current = result.execution
							nextMission = result.execution
							return result.drone
						}
					: undefined,
			)
			if (nextMission !== publishedMissionExecutionRef.current) {
				publishedMissionExecutionRef.current = nextMission
				setMissionExecution(nextMission)
			}
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
		missionExecution,
		controls: {
			arm,
			armMission,
			disarm,
			emergencyStop,
			landMission,
			pause,
			pauseMission,
			reset,
			resume,
			resumeMission,
			rtlMission,
			setControlResponse,
			setTimeScale,
			startMission,
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
