import { BAYS, TRUCK_SLOTS } from './scenario'
import type { Command, WarehouseState } from './world'

export type TransferStage = 'approach' | 'pickup' | 'retreat' | 'turn' | 'cross' | 'place' | 'done'
export type TransferRoute = {
	stage: TransferStage
	palletId: string
	slotId: string
	bayId: string
	retreatY: number
}

function clamp(value: number): number {
	return Math.max(-1, Math.min(1, value))
}

function angleDelta(target: number, current: number): number {
	return Math.atan2(Math.sin(target - current), Math.cos(target - current))
}

export function transferStep(
	state: WarehouseState,
	route: TransferRoute,
	baselineDelivered = 0,
): { route: TransferRoute; command: Command } {
	const { forklift } = state
	const slot = TRUCK_SLOTS.find((item) => item.id === route.slotId)
	const bay = BAYS.find((item) => item.id === route.bayId)
	if (!slot || !bay) throw new Error('Transfer route references a missing slot or bay')
	if (route.stage === 'approach') {
		const targetY = slot.y + 1.55
		if (forklift.y <= targetY + 0.23) return { route: { ...route, stage: 'pickup' }, command: {} }
		return {
			route,
			command: {
				throttle: 0.58,
				steering: clamp(
					(slot.x - forklift.x) * 1.5 + angleDelta(-Math.PI / 2, forklift.heading) * 2.2,
				),
			},
		}
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
		return {
			route,
			command: {
				throttle: -0.8,
				steering: clamp(
					(slot.x - forklift.x) * 1.5 - angleDelta(-Math.PI / 2, forklift.heading) * 2.2,
				),
			},
		}
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
		if (state.delivered > baselineDelivered)
			return { route: { ...route, stage: 'done' }, command: {} }
		return { route, command: { action: { kind: 'place', bayId: route.bayId } } }
	}
	return { route, command: {} }
}
