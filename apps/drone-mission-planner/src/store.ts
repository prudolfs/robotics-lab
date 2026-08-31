import type { World } from '@robotics-lab/core'
import type { Vec2 } from '@robotics-lab/geometry'
import { create } from 'zustand'
import {
	createMissionItem,
	DEFAULT_MISSION_ITEMS,
	deleteMissionItem as deleteMissionItemFromPlan,
	type InsertPlacement,
	insertMissionItem as insertMissionItemIntoPlan,
	type MissionItem,
	type MissionItemChanges,
	type MissionItemTemplate,
	reorderMissionItems,
	snapMissionAltitude,
	updateMissionItem as updateMissionItemInPlan,
} from '@/mission-plan'
import { DEFAULT_MAP_NAME, loadPlannerWorld, type WorldScale } from '@/world'

export type Theme = 'dark' | 'light'
export type MissionEditMode = 'select' | 'add-waypoint'

let missionItemSequence = 1
const nextMissionItemId = () => `mission-item-${Date.now()}-${missionItemSequence++}`

type PlannerState = {
	missionName: string
	theme: Theme
	cruiseAltitude: number
	cruiseSpeed: number
	returnToHome: boolean
	selectedMap: string
	world: World
	worldScale: WorldScale
	missionItems: MissionItem[]
	missionPast: MissionItem[][]
	missionFuture: MissionItem[][]
	selectedMissionItemId: string | null
	missionEditMode: MissionEditMode
	altitudeSnap: number | null
	setMissionName: (missionName: string) => void
	toggleTheme: () => void
	setCruiseAltitude: (cruiseAltitude: number) => void
	setCruiseSpeed: (cruiseSpeed: number) => void
	setReturnToHome: (returnToHome: boolean) => void
	setSelectedMap: (selectedMap: string) => void
	setWorldScale: (worldScale: WorldScale) => void
	addMissionItem: (
		template: MissionItemTemplate,
		referenceId?: string | null,
		placement?: InsertPlacement,
	) => void
	addWaypointAt: (position: Vec2) => void
	deleteMissionItem: (id: string) => void
	moveMissionWaypoint: (id: string, position: Vec2) => void
	reorderMissionItem: (sourceId: string, targetId: string) => void
	setAltitudeSnap: (increment: number | null) => void
	setMissionEditMode: (mode: MissionEditMode) => void
	setSelectedMissionItem: (id: string | null) => void
	updateMissionItem: (id: string, changes: MissionItemChanges) => void
	undoMissionEdit: () => void
	redoMissionEdit: () => void
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
	missionItems: DEFAULT_MISSION_ITEMS,
	missionPast: [],
	missionFuture: [],
	selectedMissionItemId: DEFAULT_MISSION_ITEMS[1]?.id ?? null,
	missionEditMode: 'select',
	altitudeSnap: 5,
	setMissionName: (missionName) => set({ missionName }),
	toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
	setCruiseAltitude: (cruiseAltitude) => set({ cruiseAltitude }),
	setCruiseSpeed: (cruiseSpeed) => set({ cruiseSpeed }),
	setReturnToHome: (returnToHome) => set({ returnToHome }),
	setSelectedMap: (selectedMap) => set({ selectedMap, world: loadPlannerWorld(selectedMap) }),
	setWorldScale: (worldScale) => set({ worldScale }),
	addMissionItem: (template, referenceId = null, placement = 'below') =>
		set((state) => {
			const id = nextMissionItemId()
			const altitude = snapMissionAltitude(state.cruiseAltitude, state.altitudeSnap)
			const item = createMissionItem(template, id, { x: 0, y: 0 }, altitude)
			return {
				missionItems: insertMissionItemIntoPlan(state.missionItems, item, referenceId, placement),
				missionPast: [...state.missionPast.slice(-49), state.missionItems],
				missionFuture: [],
				selectedMissionItemId: id,
			}
		}),
	addWaypointAt: (position) =>
		set((state) => {
			const id = nextMissionItemId()
			const altitude = snapMissionAltitude(state.cruiseAltitude, state.altitudeSnap)
			const item = createMissionItem('waypoint-altitude', id, position, altitude)
			return {
				missionItems: [...state.missionItems, item],
				missionPast: [...state.missionPast.slice(-49), state.missionItems],
				missionFuture: [],
				selectedMissionItemId: id,
			}
		}),
	deleteMissionItem: (id) =>
		set((state) => ({
			missionItems: deleteMissionItemFromPlan(state.missionItems, id),
			missionPast: [...state.missionPast.slice(-49), state.missionItems],
			missionFuture: [],
			selectedMissionItemId:
				state.selectedMissionItemId === id ? null : state.selectedMissionItemId,
		})),
	moveMissionWaypoint: (id, position) =>
		set((state) => ({
			missionItems: updateMissionItemInPlan(state.missionItems, id, { position }),
			missionPast: [...state.missionPast.slice(-49), state.missionItems],
			missionFuture: [],
			selectedMissionItemId: id,
		})),
	reorderMissionItem: (sourceId, targetId) =>
		set((state) => {
			const missionItems = reorderMissionItems(state.missionItems, sourceId, targetId)
			if (missionItems === state.missionItems) return state
			return {
				missionItems,
				missionPast: [...state.missionPast.slice(-49), state.missionItems],
				missionFuture: [],
			}
		}),
	setAltitudeSnap: (altitudeSnap) => set({ altitudeSnap }),
	setMissionEditMode: (missionEditMode) => set({ missionEditMode }),
	setSelectedMissionItem: (selectedMissionItemId) => set({ selectedMissionItemId }),
	updateMissionItem: (id, changes) =>
		set((state) => {
			const altitude =
				changes.altitude === null || changes.altitude === undefined
					? changes.altitude
					: snapMissionAltitude(changes.altitude, state.altitudeSnap)
			const normalized = altitude === undefined ? changes : { ...changes, altitude }
			return {
				missionItems: updateMissionItemInPlan(state.missionItems, id, normalized),
				missionPast: [...state.missionPast.slice(-49), state.missionItems],
				missionFuture: [],
			}
		}),
	undoMissionEdit: () =>
		set((state) => {
			const previous = state.missionPast.at(-1)
			if (!previous) return state
			return {
				missionItems: previous,
				missionPast: state.missionPast.slice(0, -1),
				missionFuture: [state.missionItems, ...state.missionFuture.slice(0, 49)],
			}
		}),
	redoMissionEdit: () =>
		set((state) => {
			const next = state.missionFuture[0]
			if (!next) return state
			return {
				missionItems: next,
				missionPast: [...state.missionPast.slice(-49), state.missionItems],
				missionFuture: state.missionFuture.slice(1),
			}
		}),
}))
