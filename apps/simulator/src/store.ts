import { createWorld, type World } from '@robotics-lab/core'
import { loadMap, mapNames } from '@robotics-lab/maps'
import { createRobot, type RobotState } from '@robotics-lab/robot'
import { create } from 'zustand'

// Default spawn pose: center of the floor, facing +x.
const SPAWN_POSE = { x: 0, y: 0, heading: 0 }

export type SimulatorStore = {
	/** Names of all maps available to switch between. */
	mapNames: string[]
	/** Currently selected map name. */
	selectedMap: string
	/** The current world model, derived from the selected map. Pure + frozen. */
	world: World
	/** The robot. Stepped by the simulation loop (Milestone 3); static so far. */
	robot: RobotState
	/** Switch the active map and recompute the world. */
	selectMap: (name: string) => void
	/** Reset the robot to its spawn pose. */
	resetRobot: () => void
}

function buildWorld(name: string): World {
	return createWorld(loadMap(name))
}

export const useSimulatorStore = create<SimulatorStore>((set) => {
	const names = mapNames()
	const initial = names[0] ?? ''
	return {
		mapNames: names,
		selectedMap: initial,
		world: buildWorld(initial),
		robot: createRobot(SPAWN_POSE),
		selectMap: (name) => {
			if (!names.includes(name)) return
			set({ selectedMap: name, world: buildWorld(name), robot: createRobot(SPAWN_POSE) })
		},
		resetRobot: () => set({ robot: createRobot(SPAWN_POSE) }),
	}
})
