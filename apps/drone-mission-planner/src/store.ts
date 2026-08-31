import type { World } from '@robotics-lab/core'
import { create } from 'zustand'
import { DEFAULT_MAP_NAME, loadPlannerWorld, type WorldScale } from '@/world'

export type Theme = 'dark' | 'light'

type PlannerState = {
	missionName: string
	theme: Theme
	cruiseAltitude: number
	cruiseSpeed: number
	returnToHome: boolean
	selectedMap: string
	world: World
	worldScale: WorldScale
	setMissionName: (missionName: string) => void
	toggleTheme: () => void
	setCruiseAltitude: (cruiseAltitude: number) => void
	setCruiseSpeed: (cruiseSpeed: number) => void
	setReturnToHome: (returnToHome: boolean) => void
	setSelectedMap: (selectedMap: string) => void
	setWorldScale: (worldScale: WorldScale) => void
}

export const usePlannerStore = create<PlannerState>((set) => ({
	missionName: 'Riverside survey',
	theme: 'dark',
	cruiseAltitude: 24,
	cruiseSpeed: 8,
	returnToHome: true,
	selectedMap: DEFAULT_MAP_NAME,
	world: loadPlannerWorld(DEFAULT_MAP_NAME),
	worldScale: 1,
	setMissionName: (missionName) => set({ missionName }),
	toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
	setCruiseAltitude: (cruiseAltitude) => set({ cruiseAltitude }),
	setCruiseSpeed: (cruiseSpeed) => set({ cruiseSpeed }),
	setReturnToHome: (returnToHome) => set({ returnToHome }),
	setSelectedMap: (selectedMap) => set({ selectedMap, world: loadPlannerWorld(selectedMap) }),
	setWorldScale: (worldScale) => set({ worldScale }),
}))
