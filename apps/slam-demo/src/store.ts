import { create } from 'zustand'

type PresentationState = {
	showMap: boolean
	showKeyframes: boolean
	selectedMap: { kind: 'landmark' | 'keyframe'; id: number } | null
	selectMap: (selection: PresentationState['selectedMap']) => void
	camera: 'overview' | 'follow' | 'robot' | 'bench'
	quality: 'standard' | 'low'
	setQuality: (quality: 'standard' | 'low') => void
	showTruth: boolean
	showOdometry: boolean
	showRoute: boolean
	showVisual: boolean
	setCamera: (camera: 'overview' | 'follow' | 'robot' | 'bench') => void
	toggle: (
		key: 'showTruth' | 'showOdometry' | 'showRoute' | 'showVisual' | 'showMap' | 'showKeyframes',
	) => void
}
export const usePresentation = create<PresentationState>((set) => ({
	showMap: true,
	showKeyframes: true,
	selectedMap: null,
	selectMap: (selectedMap) => set({ selectedMap }),
	camera: 'overview',
	quality: 'standard',
	setQuality: (quality) => set({ quality }),
	showTruth: true,
	showOdometry: true,
	showRoute: true,
	showVisual: true,
	setCamera: (camera) => set({ camera }),
	toggle: (key) => set((state) => ({ [key]: !state[key] })),
}))
