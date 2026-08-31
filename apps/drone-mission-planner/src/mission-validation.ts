import {
	containsPoint,
	pointToSegmentDistance,
	type World,
	type WorldObstacleKind,
} from '@robotics-lab/core'
import type { Vec2 } from '@robotics-lab/geometry'
import { type MissionItem, missionRoutePoints } from '@/mission-plan'

export type MissionValidationSeverity = 'warning' | 'error'

export type MissionValidationCode =
	| 'takeoff-reachable'
	| 'waypoint-order'
	| 'altitude-bounds'
	| 'speed-bounds'
	| 'distance-bounds'
	| 'battery-feasibility'
	| 'map-collision'

export type MissionValidationIssue = {
	code: MissionValidationCode
	severity: MissionValidationSeverity
	itemId: string | null
	message: string
}

export type MissionValidationResult = {
	isValid: boolean
	issues: MissionValidationIssue[]
	errors: MissionValidationIssue[]
	warnings: MissionValidationIssue[]
	invalidItemIds: string[]
	estimatedDistanceMeters: number
	estimatedDurationSeconds: number
	estimatedBatteryUsePercent: number
	estimatedBatteryRemainingPercent: number
}

export type MissionValidationConfig = {
	minTakeoffAltitude: number
	maxTakeoffAltitude: number
	minAltitude: number
	maxAltitude: number
	minSpeed: number
	maxSpeed: number
	defaultSpeed: number
	landingSpeed: number
	maxLegDistance: number
	maxMissionDistance: number
	nominalEnduranceSeconds: number
	batteryReservePercent: number
	horizontalObstacleClearance: number
	verticalObstacleClearance: number
	collisionSampleSpacing: number
}

export const DEFAULT_MISSION_VALIDATION_CONFIG: MissionValidationConfig = {
	minTakeoffAltitude: 0.5,
	maxTakeoffAltitude: 10,
	minAltitude: 0.5,
	maxAltitude: 30,
	minSpeed: 0.5,
	maxSpeed: 15,
	defaultSpeed: 3,
	landingSpeed: 1.5,
	maxLegDistance: 20,
	maxMissionDistance: 75,
	nominalEnduranceSeconds: 600,
	batteryReservePercent: 15,
	horizontalObstacleClearance: 0.25,
	verticalObstacleClearance: 0.15,
	collisionSampleSpacing: 0.08,
}

const OBSTACLE_HEIGHTS: Record<WorldObstacleKind, number> = {
	wall: 0.4,
	box: 0.5,
	cylinder: 0.6,
}

export function validateMission(
	items: MissionItem[],
	world: World,
	batteryLevel: number,
	config: MissionValidationConfig = DEFAULT_MISSION_VALIDATION_CONFIG,
): MissionValidationResult {
	const issues: MissionValidationIssue[] = []
	validateOrder(items, issues)
	validateRanges(items, world, config, issues)
	const metrics = estimateMission(items, config)
	validateDistance(metrics, config, issues)
	validateBattery(metrics.durationSeconds, batteryLevel, config, issues)
	validateCollisions(items, world, config, issues)

	const errors = issues.filter((issue) => issue.severity === 'error')
	const warnings = issues.filter((issue) => issue.severity === 'warning')
	const batteryUse = (metrics.durationSeconds / config.nominalEnduranceSeconds) * 100
	return {
		isValid: errors.length === 0,
		issues,
		errors,
		warnings,
		invalidItemIds: [...new Set(issues.flatMap((issue) => (issue.itemId ? [issue.itemId] : [])))],
		estimatedDistanceMeters: metrics.distanceMeters,
		estimatedDurationSeconds: metrics.durationSeconds,
		estimatedBatteryUsePercent: batteryUse,
		estimatedBatteryRemainingPercent: Math.max(0, batteryLevel - batteryUse),
	}
}

function validateOrder(items: MissionItem[], issues: MissionValidationIssue[]) {
	const movementItems = items.filter((item) =>
		['takeoff', 'waypoint', 'rtl', 'land'].includes(item.type),
	)
	const takeoffs = items.filter((item) => item.type === 'takeoff')
	if (takeoffs.length === 0) {
		issues.push(issue('takeoff-reachable', 'error', null, 'Add a takeoff command before flight.'))
	} else if (movementItems[0]?.type !== 'takeoff') {
		issues.push(
			issue(
				'waypoint-order',
				'error',
				movementItems[0]?.id ?? null,
				'Takeoff must be the first movement command.',
			),
		)
	}
	for (const duplicate of takeoffs.slice(1)) {
		issues.push(
			issue('waypoint-order', 'error', duplicate.id, 'Only one takeoff command is allowed.'),
		)
	}

	const landIndex = items.findIndex((item) => item.type === 'land')
	if (landIndex < 0) {
		issues.push(
			issue('waypoint-order', 'error', null, 'Add a land command to complete the mission.'),
		)
	} else {
		for (const unreachable of items.slice(landIndex + 1)) {
			issues.push(
				issue('waypoint-order', 'error', unreachable.id, 'Commands after landing are unreachable.'),
			)
		}
	}
}

function validateRanges(
	items: MissionItem[],
	world: World,
	config: MissionValidationConfig,
	issues: MissionValidationIssue[],
) {
	for (const item of items) {
		if (item.type === 'takeoff') {
			if (
				!Number.isFinite(item.altitude) ||
				item.altitude < config.minTakeoffAltitude ||
				item.altitude > config.maxTakeoffAltitude
			) {
				issues.push(
					issue(
						'takeoff-reachable',
						'error',
						item.id,
						`Takeoff altitude must be ${config.minTakeoffAltitude}–${config.maxTakeoffAltitude} m.`,
					),
				)
			}
		}
		if (item.type === 'waypoint') {
			if (!containsPoint(world, item.position)) {
				issues.push(
					issue('distance-bounds', 'error', item.id, 'Waypoint lies outside the map bounds.'),
				)
			}
			if (
				item.altitude !== null &&
				(!Number.isFinite(item.altitude) ||
					item.altitude < config.minAltitude ||
					item.altitude > config.maxAltitude)
			) {
				issues.push(
					issue(
						'altitude-bounds',
						'error',
						item.id,
						`Waypoint altitude must be ${config.minAltitude}–${config.maxAltitude} m.`,
					),
				)
			}
		}
		if (
			item.type === 'speed' &&
			(!Number.isFinite(item.speed) || item.speed < config.minSpeed || item.speed > config.maxSpeed)
		) {
			issues.push(
				issue(
					'speed-bounds',
					'error',
					item.id,
					`Speed must be ${config.minSpeed}–${config.maxSpeed} m/s.`,
				),
			)
		}
	}
}

type MissionEstimate = {
	distanceMeters: number
	durationSeconds: number
	maxLeg: { distance: number; itemId: string | null }
}

function estimateMission(items: MissionItem[], config: MissionValidationConfig): MissionEstimate {
	let position = { x: 0, y: 0, z: 0 }
	let speed = config.defaultSpeed
	let distanceMeters = 0
	let durationSeconds = 0
	let maxLeg = { distance: 0, itemId: null as string | null }
	const home = { x: 0, y: 0, z: 0 }
	for (const item of items) {
		if (item.type === 'speed') {
			speed = Math.max(config.minSpeed, item.speed)
			continue
		}
		if (item.type === 'hold') {
			durationSeconds += Math.max(0, item.duration)
			continue
		}
		if (item.type === 'camera') continue
		const target =
			item.type === 'takeoff'
				? { ...home, y: item.altitude }
				: item.type === 'waypoint'
					? {
							x: item.position.x,
							y: item.altitude ?? position.y,
							z: item.position.y,
						}
					: item.type === 'rtl'
						? { ...home, y: position.y }
						: home
		const distance = distance3(position, target)
		const legSpeed = item.type === 'land' ? Math.min(speed, config.landingSpeed) : speed
		distanceMeters += distance
		durationSeconds += distance / Math.max(config.minSpeed, legSpeed)
		if (distance > maxLeg.distance) maxLeg = { distance, itemId: item.id }
		position = target
		if (item.type === 'land') break
	}
	return { distanceMeters, durationSeconds, maxLeg }
}

function validateDistance(
	metrics: MissionEstimate,
	config: MissionValidationConfig,
	issues: MissionValidationIssue[],
) {
	if (metrics.maxLeg.distance > config.maxLegDistance) {
		issues.push(
			issue(
				'distance-bounds',
				'error',
				metrics.maxLeg.itemId,
				`Leg is ${metrics.maxLeg.distance.toFixed(1)} m; maximum is ${config.maxLegDistance} m.`,
			),
		)
	}
	if (metrics.distanceMeters > config.maxMissionDistance) {
		issues.push(
			issue(
				'distance-bounds',
				'error',
				null,
				`Mission is ${metrics.distanceMeters.toFixed(1)} m; maximum is ${config.maxMissionDistance} m.`,
			),
		)
	}
}

function validateBattery(
	durationSeconds: number,
	batteryLevel: number,
	config: MissionValidationConfig,
	issues: MissionValidationIssue[],
) {
	const use = (durationSeconds / config.nominalEnduranceSeconds) * 100
	const remaining = batteryLevel - use
	if (remaining < 0) {
		issues.push(
			issue(
				'battery-feasibility',
				'error',
				null,
				`Mission needs ${use.toFixed(0)}% battery; only ${batteryLevel.toFixed(0)}% is available.`,
			),
		)
	} else if (remaining < config.batteryReservePercent) {
		issues.push(
			issue(
				'battery-feasibility',
				'warning',
				null,
				`Estimated reserve is ${remaining.toFixed(0)}%; target is ${config.batteryReservePercent}%.`,
			),
		)
	}
}

function validateCollisions(
	items: MissionItem[],
	world: World,
	config: MissionValidationConfig,
	issues: MissionValidationIssue[],
) {
	const points = missionRoutePoints(items)
	for (let index = 1; index < points.length; index += 1) {
		const start = points[index - 1]
		const end = points[index]
		if (!start || !end) continue
		const horizontalDistance = Math.hypot(
			end.position.x - start.position.x,
			end.position.z - start.position.z,
		)
		const steps = Math.max(1, Math.ceil(horizontalDistance / config.collisionSampleSpacing))
		let collision: WorldObstacleKind | null = null
		for (let step = 0; step <= steps && collision === null; step += 1) {
			const ratio = step / steps
			const point = {
				x: start.position.x + (end.position.x - start.position.x) * ratio,
				y: start.position.z + (end.position.z - start.position.z) * ratio,
			}
			const altitude = start.position.y + (end.position.y - start.position.y) * ratio
			collision = collisionAt(point, altitude, world, config)
		}
		if (collision) {
			issues.push(
				issue(
					'map-collision',
					'error',
					end.id === 'mission-home' ? null : end.id,
					`Route intersects a ${collision} before ${missionItemName(end.id, items)}.`,
				),
			)
		}
	}
}

function collisionAt(
	point: Vec2,
	altitude: number,
	world: World,
	config: MissionValidationConfig,
): WorldObstacleKind | null {
	const clearance = config.horizontalObstacleClearance
	if (altitude <= OBSTACLE_HEIGHTS.wall + config.verticalObstacleClearance) {
		for (const wall of world.walls) {
			if (pointToSegmentDistance(point, wall) <= clearance) return 'wall'
		}
	}
	if (altitude <= OBSTACLE_HEIGHTS.box + config.verticalObstacleClearance) {
		for (const box of world.boxes) {
			const dx = point.x - box.center.x
			const dy = point.y - box.center.y
			const cosine = Math.cos(-box.rotation)
			const sine = Math.sin(-box.rotation)
			const localX = dx * cosine - dy * sine
			const localY = dx * sine + dy * cosine
			if (
				Math.abs(localX) <= box.width / 2 + clearance &&
				Math.abs(localY) <= box.depth / 2 + clearance
			) {
				return 'box'
			}
		}
	}
	if (altitude <= OBSTACLE_HEIGHTS.cylinder + config.verticalObstacleClearance) {
		for (const cylinder of world.cylinders) {
			if (
				Math.hypot(point.x - cylinder.center.x, point.y - cylinder.center.y) <=
				cylinder.radius + clearance
			) {
				return 'cylinder'
			}
		}
	}
	return null
}

function issue(
	code: MissionValidationCode,
	severity: MissionValidationSeverity,
	itemId: string | null,
	message: string,
): MissionValidationIssue {
	return { code, severity, itemId, message }
}

function distance3(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
	return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
}

function missionItemName(id: string, items: MissionItem[]) {
	const item = items.find((candidate) => candidate.id === id)
	return item ? item.type.replace('-', ' ') : 'destination'
}
