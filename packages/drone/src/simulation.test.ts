import { createDroneState } from './index'
import {
	advanceDroneSimulation,
	createDroneSimulation,
	pauseDroneSimulation,
	resetDroneSimulation,
	resumeDroneSimulation,
	setDroneSimulationTimeScale,
} from './simulation'

describe('fixed-step drone simulation', () => {
	it('advances at a fixed rate independent of render cadence', () => {
		const initial = createDroneState()
		let thirtyFps = createDroneSimulation(initial)
		let oneFortyFourFps = createDroneSimulation(initial)

		for (let frame = 0; frame < 30; frame += 1) {
			thirtyFps = advanceDroneSimulation(thirtyFps, 1 / 30)
		}
		for (let frame = 0; frame < 144; frame += 1) {
			oneFortyFourFps = advanceDroneSimulation(oneFortyFourFps, 1 / 144)
		}

		expect(thirtyFps.clock.stepCount).toBe(120)
		expect(oneFortyFourFps.clock.stepCount).toBe(120)
		expect(thirtyFps.clock.elapsedSeconds).toBeCloseTo(1)
		expect(oneFortyFourFps.clock.elapsedSeconds).toBeCloseTo(1)
	})

	it('pauses and resumes without advancing paused time', () => {
		let simulation = createDroneSimulation(createDroneState())
		simulation = advanceDroneSimulation(simulation, 0.1)
		const beforePause = simulation.clock.stepCount
		simulation = pauseDroneSimulation(simulation)
		simulation = advanceDroneSimulation(simulation, 0.2)

		expect(simulation.clock.stepCount).toBe(beforePause)
		expect(simulation.clock.running).toBe(false)

		simulation = resumeDroneSimulation(simulation)
		simulation = advanceDroneSimulation(simulation, 0.1)
		expect(simulation.clock.stepCount).toBeGreaterThan(beforePause)
	})

	it('applies time scaling to the simulation clock', () => {
		let simulation = createDroneSimulation(createDroneState())
		simulation = setDroneSimulationTimeScale(simulation, 4)
		simulation = advanceDroneSimulation(simulation, 0.1)

		expect(simulation.clock.elapsedSeconds).toBeCloseTo(0.4)
		expect(simulation.clock.stepCount).toBe(48)
	})

	it('resets state, clock, playback state and time scale', () => {
		let simulation = createDroneSimulation(createDroneState({ batteryLevel: 82 }))
		simulation = setDroneSimulationTimeScale(simulation, 2)
		simulation = advanceDroneSimulation(simulation, 0.1)
		simulation = resetDroneSimulation(simulation)

		expect(simulation.drone.batteryLevel).toBe(82)
		expect(simulation.clock.elapsedSeconds).toBe(0)
		expect(simulation.clock.stepCount).toBe(0)
		expect(simulation.clock.running).toBe(false)
		expect(simulation.clock.timeScale).toBe(1)
	})
})
