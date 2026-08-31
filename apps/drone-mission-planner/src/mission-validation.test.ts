import { createWorld } from '@robotics-lab/core'
import { loadMap } from '@robotics-lab/maps'
import { DEFAULT_MISSION_ITEMS, type MissionItem } from './mission-plan'
import { DEFAULT_MISSION_VALIDATION_CONFIG, validateMission } from './mission-validation'

const obstacleWorld = createWorld(loadMap('obstacles'))

describe('mission validation', () => {
	it('accepts the default mission and estimates distance, duration, and battery', () => {
		const result = validateMission(DEFAULT_MISSION_ITEMS, obstacleWorld, 96)

		expect(result.isValid).toBe(true)
		expect(result.issues).toEqual([])
		expect(result.estimatedDistanceMeters).toBeGreaterThan(10)
		expect(result.estimatedDurationSeconds).toBeGreaterThan(5)
		expect(result.estimatedBatteryRemainingPercent).toBeLessThan(96)
	})

	it('rejects unreachable takeoff, invalid ordering, altitude, speed, and distance', () => {
		const invalid: MissionItem[] = [
			{ id: 'early-waypoint', type: 'waypoint', position: { x: 7, y: 0 }, altitude: 40 },
			{ id: 'takeoff', type: 'takeoff', altitude: 12 },
			{ id: 'speed', type: 'speed', speed: 20 },
			{ id: 'land', type: 'land' },
			{ id: 'late-camera', type: 'camera', action: 'photo' },
		]
		const result = validateMission(invalid, obstacleWorld, 96)
		const codes = new Set(result.errors.map((error) => error.code))

		expect(codes).toEqual(
			new Set([
				'takeoff-reachable',
				'waypoint-order',
				'altitude-bounds',
				'speed-bounds',
				'distance-bounds',
			]),
		)
		expect(result.invalidItemIds).toContain('early-waypoint')
		expect(result.isValid).toBe(false)
	})

	it('reports battery reserve warnings separately from blocking errors', () => {
		const config = {
			...DEFAULT_MISSION_VALIDATION_CONFIG,
			nominalEnduranceSeconds: 15,
			batteryReservePercent: 30,
		}
		const result = validateMission(DEFAULT_MISSION_ITEMS, obstacleWorld, 96, config)

		expect(result.errors).toEqual([])
		expect(result.warnings.map((warning) => warning.code)).toContain('battery-feasibility')
		expect(result.isValid).toBe(true)
	})

	it('blocks a low route through an obstacle and permits clearance above it', () => {
		const lowRoute: MissionItem[] = [
			{ id: 'takeoff', type: 'takeoff', altitude: 0.5 },
			{ id: 'box', type: 'waypoint', position: { x: -2, y: 1 }, altitude: 0.5 },
			{ id: 'rtl', type: 'rtl' },
			{ id: 'land', type: 'land' },
		]
		const highRoute: MissionItem[] = lowRoute.map((item) =>
			item.type === 'takeoff' || item.type === 'waypoint' ? { ...item, altitude: 1.25 } : item,
		)

		expect(validateMission(lowRoute, obstacleWorld, 96).errors).toContainEqual(
			expect.objectContaining({ code: 'map-collision', itemId: 'box' }),
		)
		expect(
			validateMission(highRoute, obstacleWorld, 96).issues.some(
				(issue) => issue.code === 'map-collision',
			),
		).toBe(false)
	})

	it('blocks missions that exceed the available battery', () => {
		const result = validateMission(DEFAULT_MISSION_ITEMS, obstacleWorld, 5, {
			...DEFAULT_MISSION_VALIDATION_CONFIG,
			nominalEnduranceSeconds: 30,
		})

		expect(result.errors).toContainEqual(expect.objectContaining({ code: 'battery-feasibility' }))
	})
})
