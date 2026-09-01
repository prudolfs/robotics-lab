import { createWorld } from '@robotics-lab/core'
import { loadMap } from '@robotics-lab/maps'
import { EXAMPLE_MISSIONS } from './mission-examples'
import {
	createMissionFile,
	deserializeMission,
	loadRecentMissions,
	MAX_RECENT_MISSIONS,
	MISSION_FILE_FORMAT,
	MISSION_SCHEMA_VERSION,
	type MissionSnapshot,
	missionFilename,
	missionSnapshot,
	saveRecentMission,
	serializeMission,
} from './mission-persistence'
import { DEFAULT_MISSION_ITEMS } from './mission-plan'
import { validateMission } from './mission-validation'

const snapshot: MissionSnapshot = {
	name: 'Riverside survey',
	map: 'obstacles',
	settings: { cruiseAltitude: 2.5, cruiseSpeed: 8, returnToHome: true },
	items: DEFAULT_MISSION_ITEMS,
}

describe('mission persistence', () => {
	it('round-trips the current versioned JSON format without sharing item state', () => {
		const json = serializeMission(snapshot, '2026-09-01T08:00:00.000Z')
		const loaded = deserializeMission(json)

		expect(loaded).toMatchObject({
			format: MISSION_FILE_FORMAT,
			version: MISSION_SCHEMA_VERSION,
			savedAt: '2026-09-01T08:00:00.000Z',
			...snapshot,
		})
		expect(missionSnapshot(loaded)).toEqual(snapshot)
		expect(loaded.items).not.toBe(snapshot.items)
		expect(missionFilename(snapshot.name)).toBe('riverside-survey.mission.json')
	})

	it('migrates the flat v1 mission shape into current settings and items', () => {
		const migrated = deserializeMission(
			JSON.stringify({
				format: MISSION_FILE_FORMAT,
				version: 1,
				name: snapshot.name,
				map: snapshot.map,
				cruiseAltitude: 2.5,
				cruiseSpeed: 8,
				returnToHome: true,
				missionItems: snapshot.items,
			}),
		)

		expect(migrated.version).toBe(MISSION_SCHEMA_VERSION)
		expect(migrated.settings).toEqual(snapshot.settings)
		expect(migrated.items).toEqual(snapshot.items)
	})

	it('rejects malformed, unsupported, and structurally invalid files', () => {
		expect(() => deserializeMission('{')).toThrow('Invalid mission JSON')
		expect(() =>
			deserializeMission(JSON.stringify({ format: MISSION_FILE_FORMAT, version: 99 })),
		).toThrow('Unsupported mission schema version')
		expect(() =>
			deserializeMission(
				serializeMission({ ...snapshot, items: [{ id: 'bad', type: 'speed', speed: Number.NaN }] }),
			),
		).toThrow('Invalid speed')
	})

	it('stores five recent missions and replaces entries with the same name', () => {
		const storage = new MemoryStorage()
		for (let index = 0; index < MAX_RECENT_MISSIONS + 2; index += 1) {
			saveRecentMission(
				createMissionFile({ ...snapshot, name: `Mission ${index}` }, `2026-09-01T08:0${index}:00Z`),
				storage,
			)
		}
		const replaced = saveRecentMission(
			createMissionFile({ ...snapshot, name: 'Mission 6', map: 'empty' }),
			storage,
		)

		expect(replaced).toHaveLength(MAX_RECENT_MISSIONS)
		expect(replaced[0]).toMatchObject({ name: 'Mission 6', map: 'empty' })
		expect(loadRecentMissions(storage)).toEqual(replaced)
	})

	it('provides three valid bundled example missions', () => {
		expect(EXAMPLE_MISSIONS.map((mission) => mission.id)).toEqual([
			'simple-waypoint-tour',
			'survey-grid',
			'inspection-loop',
		])
		for (const mission of EXAMPLE_MISSIONS) {
			const result = validateMission(mission.items, createWorld(loadMap(mission.map)), 96)
			expect(result.errors, mission.name).toEqual([])
		}
	})
})

class MemoryStorage implements Storage {
	readonly values = new Map<string, string>()

	get length() {
		return this.values.size
	}

	clear() {
		this.values.clear()
	}

	getItem(key: string) {
		return this.values.get(key) ?? null
	}

	key(index: number) {
		return [...this.values.keys()][index] ?? null
	}

	removeItem(key: string) {
		this.values.delete(key)
	}

	setItem(key: string, value: string) {
		this.values.set(key, value)
	}
}
