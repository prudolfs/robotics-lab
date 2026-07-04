import { createWorld, type World } from '@robotics-lab/core'
import { loadMap, mapNames } from '@robotics-lab/maps'
import { create } from 'zustand'

export type SimulatorStore = {
	/** Names of all maps available to switch between. */
	mapNames: string[]
	/** Currently selected map name. */
	selectedMap: string
	/** The current world model, derived from the selected map. Pure + frozen. */
	world: World
	/** Switch the active map and recompute the world. */
	selectMap: (name: string) => void
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
		selectMap: (name) => {
			if (!names.includes(name)) return
			set({ selectedMap: name, world: buildWorld(name) })
		},
	}
})
