import { mapNames } from '@robotics-lab/maps'
import type { MissionItem } from '@/mission-plan'

export const MISSION_FILE_FORMAT = 'robotics-lab/drone-mission'
export const MISSION_SCHEMA_VERSION = 2
export const RECENT_MISSIONS_STORAGE_KEY = 'robotics-lab.drone-mission-planner.recents.v2'
export const MAX_RECENT_MISSIONS = 5

export type MissionSnapshot = {
	name: string
	map: string
	settings: {
		cruiseAltitude: number
		cruiseSpeed: number
		returnToHome: boolean
	}
	items: MissionItem[]
}

export type MissionFile = MissionSnapshot & {
	format: typeof MISSION_FILE_FORMAT
	version: typeof MISSION_SCHEMA_VERSION
	savedAt: string
}

type LegacyMissionFileV1 = {
	format: typeof MISSION_FILE_FORMAT
	version: 1
	savedAt?: string
	name: string
	map: string
	cruiseAltitude: number
	cruiseSpeed: number
	returnToHome: boolean
	missionItems: MissionItem[]
}

export function createMissionFile(
	snapshot: MissionSnapshot,
	savedAt = new Date().toISOString(),
): MissionFile {
	return {
		format: MISSION_FILE_FORMAT,
		version: MISSION_SCHEMA_VERSION,
		savedAt,
		...cloneSnapshot(snapshot),
	}
}

export function serializeMission(
	snapshot: MissionSnapshot,
	savedAt = new Date().toISOString(),
): string {
	return JSON.stringify(createMissionFile(snapshot, savedAt), null, 2)
}

export function deserializeMission(json: string): MissionFile {
	let data: unknown
	try {
		data = JSON.parse(json)
	} catch (error) {
		throw new Error(`Invalid mission JSON: ${(error as Error).message}`)
	}
	return parseMissionFile(data)
}

export function parseMissionFile(data: unknown): MissionFile {
	const object = record(data, 'Mission file must be a JSON object.')
	if (object.format !== MISSION_FILE_FORMAT) {
		throw new Error(`Unsupported mission format: ${String(object.format)}`)
	}
	if (object.version === 1) return migrateMissionV1(object)
	if (object.version !== MISSION_SCHEMA_VERSION) {
		throw new Error(`Unsupported mission schema version: ${String(object.version)}`)
	}
	return parseV2(object)
}

export function missionSnapshot(file: MissionFile): MissionSnapshot {
	return cloneSnapshot(file)
}

export function missionSignature(snapshot: MissionSnapshot): string {
	return JSON.stringify(cloneSnapshot(snapshot))
}

export function missionFilename(name: string): string {
	const slug = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
	return `${slug || 'drone-mission'}.mission.json`
}

export function loadRecentMissions(storage: Storage | null = browserStorage()): MissionFile[] {
	if (!storage) return []
	try {
		const raw = storage.getItem(RECENT_MISSIONS_STORAGE_KEY)
		if (!raw) return []
		const data: unknown = JSON.parse(raw)
		if (!Array.isArray(data)) return []
		return data.flatMap((candidate) => {
			try {
				return [parseMissionFile(candidate)]
			} catch {
				return []
			}
		})
	} catch {
		return []
	}
}

export function saveRecentMission(
	mission: MissionFile,
	storage: Storage | null = browserStorage(),
): MissionFile[] {
	const recent = [
		mission,
		...loadRecentMissions(storage).filter(
			(candidate) => candidate.name.toLowerCase() !== mission.name.toLowerCase(),
		),
	].slice(0, MAX_RECENT_MISSIONS)
	if (storage) {
		try {
			storage.setItem(RECENT_MISSIONS_STORAGE_KEY, JSON.stringify(recent))
		} catch {
			// Storage can be unavailable or full; file persistence still works.
		}
	}
	return recent
}

function parseV2(object: Record<string, unknown>): MissionFile {
	const settings = record(object.settings, 'Mission settings are missing.')
	const snapshot = parseSnapshot({
		name: object.name,
		map: object.map,
		settings,
		items: object.items,
	})
	return createMissionFile(snapshot, isoDate(object.savedAt))
}

function migrateMissionV1(object: Record<string, unknown>): MissionFile {
	const legacy = object as Partial<LegacyMissionFileV1>
	const snapshot = parseSnapshot({
		name: legacy.name,
		map: legacy.map,
		settings: {
			cruiseAltitude: legacy.cruiseAltitude,
			cruiseSpeed: legacy.cruiseSpeed,
			returnToHome: legacy.returnToHome,
		},
		items: legacy.missionItems,
	})
	return createMissionFile(snapshot, isoDate(legacy.savedAt))
}

function parseSnapshot(data: {
	name: unknown
	map: unknown
	settings: unknown
	items: unknown
}): MissionSnapshot {
	const settings = record(data.settings, 'Mission settings are missing.')
	const name = nonEmptyString(data.name, 'Mission name is missing.')
	const map = nonEmptyString(data.map, 'Mission map is missing.')
	if (!mapNames().includes(map)) throw new Error(`Unknown mission map: ${map}`)
	if (!Array.isArray(data.items) || data.items.length === 0) {
		throw new Error('Mission must contain at least one item.')
	}
	const items = data.items.map((item, index) => parseMissionItem(item, index))
	if (new Set(items.map((item) => item.id)).size !== items.length) {
		throw new Error('Mission item IDs must be unique.')
	}
	return {
		name,
		map,
		settings: {
			cruiseAltitude: finiteNumber(settings.cruiseAltitude, 'Invalid cruise altitude.'),
			cruiseSpeed: finiteNumber(settings.cruiseSpeed, 'Invalid cruise speed.'),
			returnToHome: boolean(settings.returnToHome, 'Invalid return-to-home setting.'),
		},
		items,
	}
}

function parseMissionItem(data: unknown, index: number): MissionItem {
	const item = record(data, `Mission item ${index + 1} must be an object.`)
	const id = nonEmptyString(item.id, `Mission item ${index + 1} has no ID.`)
	switch (item.type) {
		case 'takeoff':
			return {
				id,
				type: 'takeoff',
				altitude: finiteNumber(item.altitude, `Invalid takeoff altitude at item ${index + 1}.`),
			}
		case 'land':
			return { id, type: 'land' }
		case 'waypoint': {
			const position = record(item.position, `Invalid waypoint position at item ${index + 1}.`)
			return {
				id,
				type: 'waypoint',
				position: {
					x: finiteNumber(position.x, `Invalid waypoint X at item ${index + 1}.`),
					y: finiteNumber(position.y, `Invalid waypoint Z at item ${index + 1}.`),
				},
				altitude:
					item.altitude === null
						? null
						: finiteNumber(item.altitude, `Invalid waypoint altitude at item ${index + 1}.`),
			}
		}
		case 'rtl':
			return { id, type: 'rtl' }
		case 'hold':
			return {
				id,
				type: 'hold',
				duration: finiteNumber(item.duration, `Invalid hold duration at item ${index + 1}.`),
			}
		case 'speed':
			return {
				id,
				type: 'speed',
				speed: finiteNumber(item.speed, `Invalid speed at item ${index + 1}.`),
			}
		case 'camera':
			if (item.action !== 'photo') throw new Error(`Invalid camera action at item ${index + 1}.`)
			return { id, type: 'camera', action: 'photo' }
		default:
			throw new Error(`Unsupported mission item type at item ${index + 1}: ${String(item.type)}`)
	}
}

function cloneSnapshot(snapshot: MissionSnapshot): MissionSnapshot {
	return {
		name: snapshot.name,
		map: snapshot.map,
		settings: { ...snapshot.settings },
		items: snapshot.items.map((item) =>
			item.type === 'waypoint' ? { ...item, position: { ...item.position } } : { ...item },
		),
	}
}

function browserStorage(): Storage | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage
	} catch {
		return null
	}
}

function record(value: unknown, message: string): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message)
	return value as Record<string, unknown>
}

function nonEmptyString(value: unknown, message: string): string {
	if (typeof value !== 'string' || value.trim().length === 0) throw new Error(message)
	return value.trim()
}

function finiteNumber(value: unknown, message: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(message)
	return value
}

function boolean(value: unknown, message: string): boolean {
	if (typeof value !== 'boolean') throw new Error(message)
	return value
}

function isoDate(value: unknown): string {
	if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return new Date(0).toISOString()
	return new Date(value).toISOString()
}
