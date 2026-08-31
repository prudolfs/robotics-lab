import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_MISSION_ITEMS, missionWaypoints } from './mission-plan'
import { usePlannerStore } from './store'

function resetMissionState() {
	usePlannerStore.setState({
		cruiseAltitude: 24,
		missionItems: structuredClone(DEFAULT_MISSION_ITEMS),
		missionPast: [],
		missionFuture: [],
		selectedMissionItemId: DEFAULT_MISSION_ITEMS[1]?.id ?? null,
		missionEditMode: 'select',
		altitudeSnap: 5,
	})
}

describe('mission editor store', () => {
	beforeEach(resetMissionState)

	it('adds map waypoints with snapped altitude and moves them', () => {
		const store = usePlannerStore.getState()
		store.addWaypointAt({ x: 1.25, y: -2.5 })
		let waypoint = missionWaypoints(usePlannerStore.getState().missionItems).at(-1)
		expect(waypoint).toMatchObject({ position: { x: 1.25, y: -2.5 }, altitude: 25 })

		usePlannerStore.getState().moveMissionWaypoint(waypoint?.id ?? '', { x: 3, y: 4 })
		waypoint = missionWaypoints(usePlannerStore.getState().missionItems).at(-1)
		expect(waypoint?.position).toEqual({ x: 3, y: 4 })
	})

	it('updates editable values and supports undo and redo', () => {
		const speed = usePlannerStore.getState().missionItems.find((item) => item.type === 'speed')
		usePlannerStore.getState().updateMissionItem(speed?.id ?? '', { speed: 14 })
		expect(
			usePlannerStore.getState().missionItems.find((item) => item.type === 'speed'),
		).toMatchObject({ speed: 14 })

		usePlannerStore.getState().undoMissionEdit()
		expect(
			usePlannerStore.getState().missionItems.find((item) => item.type === 'speed'),
		).toMatchObject({ speed: 8 })

		usePlannerStore.getState().redoMissionEdit()
		expect(
			usePlannerStore.getState().missionItems.find((item) => item.type === 'speed'),
		).toMatchObject({ speed: 14 })
	})

	it('inserts, reorders, and deletes items through store actions', () => {
		const initial = usePlannerStore.getState().missionItems
		const land = initial.find((item) => item.type === 'land')
		usePlannerStore.getState().addMissionItem('camera', land?.id, 'above')
		const camera = usePlannerStore
			.getState()
			.missionItems.find(
				(item) => item.type === 'camera' && !initial.some((existing) => existing.id === item.id),
			)
		expect(
			usePlannerStore.getState().missionItems.findIndex((item) => item.id === camera?.id),
		).toBe(usePlannerStore.getState().missionItems.findIndex((item) => item.id === land?.id) - 1)

		usePlannerStore.getState().reorderMissionItem(camera?.id ?? '', initial[0]?.id ?? '')
		expect(usePlannerStore.getState().missionItems[0]?.id).toBe(camera?.id)

		usePlannerStore.getState().deleteMissionItem(camera?.id ?? '')
		expect(usePlannerStore.getState().missionItems.some((item) => item.id === camera?.id)).toBe(
			false,
		)
	})
})
