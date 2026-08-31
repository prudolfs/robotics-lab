import type { ExecutableMissionItem } from '@robotics-lab/drone'
import type { Vec2 } from '@robotics-lab/geometry'

type MissionItemBase = {
	id: string
}

export type TakeoffMissionItem = MissionItemBase & {
	type: 'takeoff'
	altitude: number
}

export type LandMissionItem = MissionItemBase & {
	type: 'land'
}

export type WaypointMissionItem = MissionItemBase & {
	type: 'waypoint'
	position: Vec2
	altitude: number | null
}

export type RtlMissionItem = MissionItemBase & {
	type: 'rtl'
}

export type HoldMissionItem = MissionItemBase & {
	type: 'hold'
	duration: number
}

export type SpeedMissionItem = MissionItemBase & {
	type: 'speed'
	speed: number
}

export type CameraMissionItem = MissionItemBase & {
	type: 'camera'
	action: 'photo'
}

export type MissionItem =
	| TakeoffMissionItem
	| LandMissionItem
	| WaypointMissionItem
	| RtlMissionItem
	| HoldMissionItem
	| SpeedMissionItem
	| CameraMissionItem

export type MissionItemTemplate = MissionItem['type'] | 'waypoint-altitude'
export type InsertPlacement = 'above' | 'below'
export type MissionItemChanges = {
	position?: Vec2
	altitude?: number | null
	duration?: number
	speed?: number
}

export const DEFAULT_MISSION_ITEMS: MissionItem[] = [
	{ id: 'mission-takeoff', type: 'takeoff', altitude: 1.25 },
	{
		id: 'mission-waypoint-position',
		type: 'waypoint',
		position: { x: -2.5, y: -1.5 },
		altitude: null,
	},
	{ id: 'mission-waypoint-altitude', type: 'waypoint', position: { x: 3, y: -2.5 }, altitude: 2.5 },
	{ id: 'mission-hold', type: 'hold', duration: 5 },
	{ id: 'mission-speed', type: 'speed', speed: 8 },
	{ id: 'mission-camera', type: 'camera', action: 'photo' },
	{ id: 'mission-rtl', type: 'rtl' },
	{ id: 'mission-land', type: 'land' },
]

export function snapMissionAltitude(altitude: number, increment: number | null): number {
	const clamped = Math.max(0, altitude)
	return increment ? Math.round(clamped / increment) * increment : clamped
}

export function createMissionItem(
	template: MissionItemTemplate,
	id: string,
	position: Vec2 = { x: 0, y: 0 },
	defaultAltitude = 2.5,
): MissionItem {
	switch (template) {
		case 'takeoff':
			return { id, type: 'takeoff', altitude: defaultAltitude }
		case 'land':
			return { id, type: 'land' }
		case 'waypoint':
			return { id, type: 'waypoint', position, altitude: null }
		case 'waypoint-altitude':
			return { id, type: 'waypoint', position, altitude: defaultAltitude }
		case 'rtl':
			return { id, type: 'rtl' }
		case 'hold':
			return { id, type: 'hold', duration: 5 }
		case 'speed':
			return { id, type: 'speed', speed: 8 }
		case 'camera':
			return { id, type: 'camera', action: 'photo' }
	}
}

export function insertMissionItem(
	items: MissionItem[],
	item: MissionItem,
	referenceId: string | null = null,
	placement: InsertPlacement = 'below',
): MissionItem[] {
	if (!referenceId) return [...items, item]
	const referenceIndex = items.findIndex((candidate) => candidate.id === referenceId)
	if (referenceIndex < 0) return [...items, item]
	const index = referenceIndex + (placement === 'below' ? 1 : 0)
	return [...items.slice(0, index), item, ...items.slice(index)]
}

export function reorderMissionItems(
	items: MissionItem[],
	sourceId: string,
	targetId: string,
): MissionItem[] {
	const sourceIndex = items.findIndex((item) => item.id === sourceId)
	const targetIndex = items.findIndex((item) => item.id === targetId)
	if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return items
	const next = [...items]
	const [source] = next.splice(sourceIndex, 1)
	if (!source) return items
	next.splice(targetIndex, 0, source)
	return next
}

export function updateMissionItem(
	items: MissionItem[],
	id: string,
	changes: MissionItemChanges,
): MissionItem[] {
	return items.map((item) => (item.id === id ? ({ ...item, ...changes } as MissionItem) : item))
}

export function deleteMissionItem(items: MissionItem[], id: string): MissionItem[] {
	return items.filter((item) => item.id !== id)
}

export function missionWaypoints(items: MissionItem[]): WaypointMissionItem[] {
	return items.filter((item): item is WaypointMissionItem => item.type === 'waypoint')
}

export function executableMissionItems(items: MissionItem[]): ExecutableMissionItem[] {
	return items.map((item) =>
		item.type === 'waypoint'
			? { ...item, position: { x: item.position.x, z: item.position.y } }
			: { ...item },
	)
}

export type MissionRoutePoint = {
	id: string
	position: { x: number; y: number; z: number }
}

/** Resolve inherited waypoint altitudes into the same world-space path the vehicle executes. */
export function missionRoutePoints(items: MissionItem[]): MissionRoutePoint[] {
	let altitude = 0
	const points: MissionRoutePoint[] = [{ id: 'mission-home', position: { x: 0, y: 0, z: 0 } }]
	for (const item of items) {
		if (item.type === 'takeoff') {
			altitude = item.altitude
			points.push({ id: item.id, position: { x: 0, y: altitude, z: 0 } })
		} else if (item.type === 'waypoint') {
			altitude = item.altitude ?? altitude
			points.push({
				id: item.id,
				position: { x: item.position.x, y: altitude, z: item.position.y },
			})
		} else if (item.type === 'rtl') {
			points.push({ id: item.id, position: { x: 0, y: altitude, z: 0 } })
		} else if (item.type === 'land') {
			altitude = 0
			points.push({ id: item.id, position: { x: 0, y: 0, z: 0 } })
		}
	}
	return points
}
