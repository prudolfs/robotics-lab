import { create } from 'zustand'

export type Theme = 'dark' | 'light'

type PlannerState = {
	missionName: string
	theme: Theme
	cruiseAltitude: number
	cruiseSpeed: number
	returnToHome: boolean
	setMissionName: (missionName: string) => void
	toggleTheme: () => void
	setCruiseAltitude: (cruiseAltitude: number) => void
	setCruiseSpeed: (cruiseSpeed: number) => void
	setReturnToHome: (returnToHome: boolean) => void
}

export const usePlannerStore = create<PlannerState>((set) => ({
	missionName: 'Riverside survey',
	theme: 'dark',
	cruiseAltitude: 24,
	cruiseSpeed: 8,
	returnToHome: true,
	setMissionName: (missionName) => set({ missionName }),
	toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
	setCruiseAltitude: (cruiseAltitude) => set({ cruiseAltitude }),
	setCruiseSpeed: (cruiseSpeed) => set({ cruiseSpeed }),
	setReturnToHome: (returnToHome) => set({ returnToHome }),
}))
