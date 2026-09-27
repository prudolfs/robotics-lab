import { BAYS, TRUCK_SLOTS } from './scenario'
import type { Command, WarehouseState } from './world'

export type ShowcaseStage = 'approach' | 'pickup' | 'retreat' | 'turn' | 'cross' | 'place' | 'done'
export type ShowcaseRoute = {
	stage: ShowcaseStage
	palletId: string
	slotId: string
	bayId: string
	retreatY: number
}

export function createShowcaseRoute(state: WarehouseState): ShowcaseRoute {
	const candidate = state.scenario.cargo
		.filter(
			(item) =>
				!state.scenario.cargo.some((other) => other.lane === item.lane && other.depth < item.depth),
		)
		.sort((a, b) => a.x - b.x)[0]
	const occupied = new Set(state.scenario.existing.map((item) => item.bayId))
	const bay = BAYS.find((item) => !occupied.has(item.id))
	if (!candidate || !bay) throw new Error('No showcase transfer available')
	return {
		stage: 'approach',
		palletId: candidate.cargoId,
		slotId: candidate.id,
		bayId: bay.id,
		retreatY: Math.min(10.5, Math.max(4.5, bay.y + 2.05)),
	}
}

function clamp(value: number): number {
	return Math.max(-1, Math.min(1, value))
}

function angleDelta(target: number, current: number): number {
	return Math.atan2(Math.sin(target - current), Math.cos(target - current))
}

export function showcaseStep(
	state: WarehouseState,
	route: ShowcaseRoute,
): { route: ShowcaseRoute; command: Command } {
	const { forklift } = state
	const slot = TRUCK_SLOTS.find((item) => item.id === route.slotId)
	const bay = BAYS.find((item) => item.id === route.bayId)
	if (!slot || !bay) throw new Error('Showcase route references a missing slot or bay')
	if (route.stage === 'approach') {
		const targetY = slot.y + 1.55
		if (forklift.y <= targetY + 0.23) return { route: { ...route, stage: 'pickup' }, command: {} }
		return { route, command: { throttle: 0.58, steering: clamp((slot.x - forklift.x) * 1.5) } }
	}
	if (route.stage === 'pickup') {
		if (forklift.speed > 0.035) return { route, command: {} }
		if (forklift.carriedId === route.palletId)
			return { route: { ...route, stage: 'retreat' }, command: {} }
		return { route, command: { action: { kind: 'pickup', palletId: route.palletId } } }
	}
	if (route.stage === 'retreat') {
		if (forklift.y >= route.retreatY - 0.13)
			return { route: { ...route, stage: 'turn' }, command: {} }
		return { route, command: { throttle: -0.8, steering: clamp((forklift.x - slot.x) * 1.5) } }
	}
	if (route.stage === 'turn') {
		if (forklift.heading >= -0.04) return { route: { ...route, stage: 'cross' }, command: {} }
		return { route, command: { throttle: 0.7, steering: 1 } }
	}
	if (route.stage === 'cross') {
		const targetX = bay.x - 1.55
		const dx = targetX - forklift.x
		const dy = bay.y - forklift.y
		const range = Math.hypot(dx, dy)
		if (range < 0.1) return { route: { ...route, stage: 'place' }, command: {} }
		const desired = Math.atan2(dy, dx)
		const headingError = angleDelta(desired, forklift.heading)
		const steering = clamp(headingError * 2.2 - forklift.heading * (range < 1.2 ? 1.1 : 0))
		const throttle = range < 1.2 ? 0.28 : range < 2.3 ? 0.45 : 0.75
		return { route, command: { throttle, steering } }
	}
	if (route.stage === 'place') {
		if (Math.abs(forklift.speed) > 0.035) return { route, command: {} }
		if (state.delivered > 0) return { route: { ...route, stage: 'done' }, command: {} }
		return { route, command: { action: { kind: 'place', bayId: route.bayId } } }
	}
	return { route, command: {} }
}
