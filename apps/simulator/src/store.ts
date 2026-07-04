import { createWorld, type World } from '@robotics-lab/core'
import { loadMap, mapNames } from '@robotics-lab/maps'
import type { RobotState } from '@robotics-lab/robot'
import { create } from 'zustand'
import { createSimulation, robotSpeed, type SimState } from '@/sim/loop'

// Default spawn pose: center of the floor, facing +x.
export const SPAWN_POSE = { x: 0, y: 0, heading: 0 }

export type SimulatorStore = {
	/** App state: names of all maps available to switch between. */
	mapNames: string[]
	/** App state: currently selected map name. */
	selectedMap: string
	/** App state: the world model derived from the selected map. */
	world: World
	/** Observed: latest robot snapshot sampled from the simulation. */
	robot: RobotState
	/** Observed: simulation clock in seconds. */
	simTime: number
	/** Observed: linear robot speed in m/s. */
	speed: number
	/** Observed: whether the simulation loop is currently advancing. */
	running: boolean
	/** App action: switch the active map (the loop resets the sim on change). */
	selectMap: (name: string) => void
	/** Observer: push the latest simulation snapshot for rendering / HUD. */
	observe: (next: SimState) => void
}

function buildWorld(name: string): World {
	return createWorld(loadMap(name))
}

export function sampleState(next: SimState) {
	return {
		robot: next.robot,
		simTime: next.time,
		speed: robotSpeed(next.robot),
		running: next.running,
	}
}

export const useSimulatorStore = create<SimulatorStore>((set) => {
	const names = mapNames()
	const initial = names[0] ?? ''
	return {
		mapNames: names,
		selectedMap: initial,
		world: buildWorld(initial),
		// The loop is the authority; the store only mirrors its state so React
		// can observe it. The hook calls `observe` every frame after stepping.
		...sampleState(createSimulation({ spawnPose: SPAWN_POSE })),
		selectMap: (name) => {
			if (!names.includes(name)) return
			set({ selectedMap: name, world: buildWorld(name) })
		},
		observe: (next) => set(sampleState(next)),
	}
})
