import { create } from 'zustand'

type PresentationState = {
	camera: 'overview' | 'follow'
	showTruth: boolean
	showOdometry: boolean
	showRoute: boolean
	setCamera: (camera: 'overview' | 'follow') => void
	toggle: (key: 'showTruth' | 'showOdometry' | 'showRoute') => void
}
export const usePresentation = create<PresentationState>((set) => ({
	camera: 'overview',
	showTruth: true,
	showOdometry: true,
	showRoute: true,
	setCamera: (camera) => set({ camera }),
	toggle: (key) => set((state) => ({ [key]: !state[key] })),
}))
