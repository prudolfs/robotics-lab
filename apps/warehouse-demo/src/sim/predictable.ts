import { accessibleCargo, BAYS, TRUCK_SLOTS } from './scenario'
import { type TransferRoute, type TransferStage, transferStep } from './transfer'
import type { Command, WarehouseState } from './world'

export type RoutePoint = { x: number; y: number }
export type RoutePose = RoutePoint & { heading: number }
export type RouteNodeId = 'dock' | 'pickup' | 'truckExit' | 'bayApproach' | 'rackClear' | 'dockTurn'
export type RouteGraph = {
	nodes: Record<RouteNodeId, RoutePose>
	edges: readonly (readonly [RouteNodeId, RouteNodeId])[]
}
export type PredictableStage =
	| TransferStage
	| 'backtrack'
	| 'turn-to-dock'
	| 'recover-pickup'
	| 'recover-place'
	| 'stalled'
export type PredictableRoute = Omit<TransferRoute, 'stage'> & {
	stage: PredictableStage
	baselineDelivered: number
	backtrackX: number
	backtrackY: number
	goal: RoutePoint | null
	recoveryCount: number
	seenInvalidActions: number
	failReason: string | null
}

// The steering limit gives a 1.96 m minimum radius. Allow for steering ramp-up.
const RETURN_TURN_RADIUS = 2.03

export function buildRouteGraph(slotId: string, bayId: string): RouteGraph {
	const slot = TRUCK_SLOTS.find((item) => item.id === slotId)
	const bay = BAYS.find((item) => item.id === bayId)
	if (!slot || !bay) throw new Error('Route graph references a missing slot or bay')
	return {
		nodes: {
			dock: { x: slot.x, y: 1.7, heading: -Math.PI / 2 },
			pickup: { x: slot.x, y: slot.y + 1.55, heading: -Math.PI / 2 },
			truckExit: { x: slot.x, y: bay.y + 2.05, heading: -Math.PI / 2 },
			bayApproach: { x: bay.x - 1.55, y: bay.y, heading: 0 },
			rackClear: { x: slot.x - RETURN_TURN_RADIUS, y: bay.y, heading: 0 },
			dockTurn: { x: slot.x, y: bay.y - RETURN_TURN_RADIUS, heading: -Math.PI / 2 },
		},
		edges: [
			['dock', 'pickup'],
			['pickup', 'truckExit'],
			['truckExit', 'bayApproach'],
			['bayApproach', 'rackClear'],
			['rackClear', 'dockTurn'],
			['dockTurn', 'dock'],
		],
	}
}

function clamp(value: number) {
	return Math.max(-1, Math.min(1, value))
}

function angleDelta(target: number, current: number) {
	return Math.atan2(Math.sin(target - current), Math.cos(target - current))
}

/** Left truck lane first, near cargo before rear cargo, then cargo ID. Highest free bay first. */
export function selectTask(
	state: WarehouseState,
): Pick<PredictableRoute, 'palletId' | 'slotId' | 'bayId' | 'retreatY'> | null {
	const truckCargo = state.scenario.cargo.filter((slot) =>
		state.pallets.some((pallet) => pallet.id === slot.cargoId && pallet.location.kind === 'truck'),
	)
	const candidate = accessibleCargo(truckCargo).sort(
		(a, b) => a.x - b.x || a.depth - b.depth || a.cargoId.localeCompare(b.cargoId),
	)[0]
	const bay = [...BAYS]
		.reverse()
		.find(
			(item) =>
				!state.pallets.some(
					(pallet) => pallet.location.kind === 'bay' && pallet.location.bayId === item.id,
				),
		)
	if (!candidate || !bay) return null
	const graph = buildRouteGraph(candidate.id, bay.id)
	return {
		palletId: candidate.cargoId,
		slotId: candidate.id,
		bayId: bay.id,
		retreatY: graph.nodes.truckExit.y,
	}
}

export function createPredictableRoute(state: WarehouseState): PredictableRoute {
	const task = selectTask(state)
	if (!task) throw new Error('No reachable truck pallet and empty bay')
	const graph = buildRouteGraph(task.slotId, task.bayId)
	return {
		...task,
		stage: 'approach',
		baselineDelivered: state.delivered,
		backtrackX: state.forklift.x,
		backtrackY: state.forklift.y,
		goal: graph.nodes.pickup,
		recoveryCount: 0,
		seenInvalidActions: state.invalidActions,
		failReason: null,
	}
}

export function predictableStep(
	state: WarehouseState,
	route: PredictableRoute,
): { route: PredictableRoute; command: Command } {
	const { forklift } = state
	if (route.stage === 'done' || route.stage === 'stalled') return { route, command: {} }
	if (
		(route.stage === 'pickup' || route.stage === 'place') &&
		state.invalidActions > route.seenInvalidActions
	) {
		const count = route.recoveryCount + 1
		if (count > 2) {
			return {
				route: {
					...route,
					stage: 'stalled',
					recoveryCount: count,
					seenInvalidActions: state.invalidActions,
					failReason: `${route.palletId}: alignment failed after two retries`,
				},
				command: {},
			}
		}
		return {
			route: {
				...route,
				stage: route.stage === 'pickup' ? 'recover-pickup' : 'recover-place',
				recoveryCount: count,
				seenInvalidActions: state.invalidActions,
			},
			command: {},
		}
	}
	if (route.stage === 'recover-pickup') {
		const slot = TRUCK_SLOTS.find((item) => item.id === route.slotId)
		if (!slot) throw new Error('Recovery truck slot is missing')
		if (forklift.y >= slot.y + 2.75) {
			return { route: { ...route, stage: 'approach' }, command: {} }
		}
		return {
			route: { ...route, goal: { x: slot.x, y: slot.y + 2.75 } },
			command: {
				throttle: -0.34,
				steering: clamp(
					(slot.x - forklift.x) * 1.5 - angleDelta(-Math.PI / 2, forklift.heading) * 2.2,
				),
			},
		}
	}
	if (route.stage === 'recover-place') {
		const bay = BAYS.find((item) => item.id === route.bayId)
		if (!bay) throw new Error('Recovery storage bay is missing')
		if (forklift.x <= bay.x - 2.45) {
			return { route: { ...route, stage: 'cross' }, command: {} }
		}
		return {
			route: { ...route, goal: { x: bay.x - 2.45, y: bay.y } },
			command: {
				throttle: -0.3,
				steering: clamp(-angleDelta(0, forklift.heading) * 2.2 - (forklift.y - bay.y) * 1.2),
			},
		}
	}
	if (route.stage === 'place' && state.delivered > route.baselineDelivered) {
		if (state.status === 'complete')
			return { route: { ...route, stage: 'done', goal: null }, command: {} }
		const task = selectTask(state)
		if (!task) throw new Error('Delivery remains but no next task is available')
		const slot = TRUCK_SLOTS.find((item) => item.id === task.slotId)
		if (!slot) throw new Error('Selected truck slot is missing')
		const graph = buildRouteGraph(task.slotId, task.bayId)
		return {
			route: {
				...route,
				...task,
				stage: 'backtrack',
				baselineDelivered: state.delivered,
				backtrackX: graph.nodes.rackClear.x,
				backtrackY: forklift.y,
				goal: { x: graph.nodes.rackClear.x, y: forklift.y },
				recoveryCount: 0,
				seenInvalidActions: state.invalidActions,
				failReason: null,
			},
			command: {},
		}
	}
	if (route.stage === 'backtrack') {
		if (forklift.x <= route.backtrackX + 0.23 && Math.abs(forklift.speed) < 0.04) {
			return { route: { ...route, stage: 'turn-to-dock' }, command: {} }
		}
		const distance = forklift.x - route.backtrackX
		const throttle = distance < 0.18 ? 0 : distance < 1.1 ? -0.24 : -0.65
		const steering = clamp(
			-angleDelta(0, forklift.heading) * 2 - (forklift.y - route.backtrackY) * 1.4,
		)
		return { route, command: { throttle, steering } }
	}
	if (route.stage === 'turn-to-dock') {
		if (forklift.heading <= -Math.PI / 2 + 0.025) {
			return { route: { ...route, stage: 'approach' }, command: {} }
		}
		return { route, command: { throttle: 0.45, steering: -1 } }
	}
	const result = transferStep(state, route as TransferRoute, route.baselineDelivered)
	const slot = TRUCK_SLOTS.find((item) => item.id === route.slotId)
	const bay = BAYS.find((item) => item.id === route.bayId)
	const goal =
		result.route.stage === 'approach' || result.route.stage === 'pickup'
			? slot
				? { x: slot.x, y: slot.y + 1.55 }
				: null
			: result.route.stage === 'retreat' || result.route.stage === 'turn'
				? { x: slot?.x ?? forklift.x, y: route.retreatY }
				: result.route.stage === 'cross' || result.route.stage === 'place'
					? bay
						? { x: bay.x - 1.55, y: bay.y }
						: null
					: null
	return { route: { ...route, stage: result.route.stage, goal }, command: result.command }
}
