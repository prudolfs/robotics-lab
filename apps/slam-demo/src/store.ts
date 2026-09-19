import { create } from 'zustand'

type PresentationState = {
	camera: 'overview' | 'follow' | 'robot' | 'bench'
	quality: 'standard' | 'low'
	setQuality: (quality: 'standard' | 'low') => void
	showTruth: boolean
	showOdometry: boolean
	showRoute: boolean
	setCamera: (camera: 'overview' | 'follow' | 'robot' | 'bench') => void
	toggle: (key: 'showTruth' | 'showOdometry' | 'showRoute') => void
}
export const usePresentation = create<PresentationState>((set) => ({
	camera: 'overview',
	quality: 'standard',
	setQuality: (quality) => set({ quality }),
	showTruth: true,
	showOdometry: true,
	showRoute: true,
	setCamera: (camera) => set({ camera }),
	toggle: (key) => set((state) => ({ [key]: !state[key] })),
}))
