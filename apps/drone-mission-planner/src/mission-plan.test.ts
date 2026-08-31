import {
	createMissionItem,
	DEFAULT_MISSION_ITEMS,
	deleteMissionItem,
	executableMissionItems,
	insertMissionItem,
	missionRoutePoints,
	missionWaypoints,
	reorderMissionItems,
	snapMissionAltitude,
	updateMissionItem,
} from './mission-plan'

describe('mission plan editing', () => {
	it('bootstraps every supported mission item', () => {
		const types = new Set(DEFAULT_MISSION_ITEMS.map((item) => item.type))
		expect(types).toEqual(
			new Set(['takeoff', 'land', 'waypoint', 'rtl', 'hold', 'speed', 'camera']),
		)
		expect(missionWaypoints(DEFAULT_MISSION_ITEMS).some((item) => item.altitude === null)).toBe(
			true,
		)
		expect(missionWaypoints(DEFAULT_MISSION_ITEMS).some((item) => item.altitude !== null)).toBe(
			true,
		)
	})

	it('creates and inserts items above or below a reference', () => {
		const item = createMissionItem('waypoint-altitude', 'new', { x: 2, y: 3 }, 25)
		const above = insertMissionItem(DEFAULT_MISSION_ITEMS, item, 'mission-hold', 'above')
		const below = insertMissionItem(DEFAULT_MISSION_ITEMS, item, 'mission-hold', 'below')

		expect(above.findIndex((candidate) => candidate.id === 'new')).toBe(3)
		expect(below.findIndex((candidate) => candidate.id === 'new')).toBe(4)
	})

	it('reorders, edits, and deletes mission items immutably', () => {
		const reordered = reorderMissionItems(DEFAULT_MISSION_ITEMS, 'mission-land', 'mission-takeoff')
		const updated = updateMissionItem(reordered, 'mission-speed', { speed: 12 })
		const deleted = deleteMissionItem(updated, 'mission-camera')

		expect(reordered[0]?.type).toBe('land')
		expect(updated.find((item) => item.type === 'speed')).toMatchObject({ speed: 12 })
		expect(deleted.some((item) => item.type === 'camera')).toBe(false)
		expect(DEFAULT_MISSION_ITEMS.at(-1)?.type).toBe('land')
	})

	it('snaps altitude when enabled and preserves it when disabled', () => {
		expect(snapMissionAltitude(17, 5)).toBe(15)
		expect(snapMissionAltitude(17, null)).toBe(17)
		expect(snapMissionAltitude(-3, 5)).toBe(0)
	})

	it('converts editor coordinates and resolves the executable route', () => {
		const executable = executableMissionItems(DEFAULT_MISSION_ITEMS)
		const positionWaypoint = executable.find((item) => item.id === 'mission-waypoint-position')
		const route = missionRoutePoints(DEFAULT_MISSION_ITEMS)

		expect(positionWaypoint).toMatchObject({ position: { x: -2.5, z: -1.5 } })
		expect(executable[0]).toMatchObject({ type: 'takeoff', altitude: 1.25 })
		expect(route.find((point) => point.id === 'mission-waypoint-position')?.position.y).toBe(1.25)
		expect(route.find((point) => point.id === 'mission-waypoint-altitude')?.position.y).toBe(2.5)
		expect(route.at(-1)?.position).toEqual({ x: 0, y: 0, z: 0 })
	})
})
