import { BAYS, createScenario, type Scenario, TRUCK_SLOTS } from './scenario'

export const FIXED_DT = 1 / 60
export const FORKLIFT = {
	length: 1.8,
	width: 1,
	wheelbase: 1.2,
	maxForward: 1,
	maxReverse: 0.6,
	maxSteering: 0.55,
	maxForkHeight: 1.2,
	minForkHeight: 0.08,
	forkSpeed: 0.35,
	loadForward: 1.55,
} as const

export type Point = { x: number; y: number }
export type ForkliftState = Point & {
	heading: number
	speed: number
	steering: number
	forkHeight: number
	carriedId: string | null
}
export type Pallet = {
	id: string
	origin: 'delivery' | 'stock'
	location: { kind: 'truck'; slotId: string } | { kind: 'bay'; bayId: string } | { kind: 'carried' }
}
export type WarehouseEvent = {
	id: number
	time: number
	kind: 'info' | 'success' | 'warning'
	text: string
}
export type WarehouseState = {
	seed: number
	generation: number
	scenario: Scenario
	status: 'ready' | 'running' | 'paused' | 'complete'
	tick: number
	elapsed: number
	forklift: ForkliftState
	pallets: Pallet[]
	delivered: number
	contact: boolean
	contactCount: number
	invalidActions: number
	events: WarehouseEvent[]
	nextEventId: number
}
export type Action = { kind: 'pickup'; palletId: string } | { kind: 'place'; bayId: string }
export type Command = { throttle?: number; steering?: number; fork?: number; action?: Action }

export function palletPosition(pallet: Pallet, state: WarehouseState): Point & { height: number } {
	if (pallet.location.kind === 'truck') {
		const slotId = pallet.location.slotId
		const slot = TRUCK_SLOTS.find((item) => item.id === slotId)
		if (!slot) throw new Error(`Unknown truck slot ${pallet.location.slotId}`)
		return { x: slot.x, y: slot.y, height: 0.15 }
	}
	if (pallet.location.kind === 'bay') {
		const bayId = pallet.location.bayId
		const bay = BAYS.find((item) => item.id === bayId)
		if (!bay) throw new Error(`Unknown storage bay ${pallet.location.bayId}`)
		return { x: bay.x, y: bay.y, height: 0.15 }
	}
	const { forklift } = state
	return {
		x: forklift.x + Math.cos(forklift.heading) * FORKLIFT.loadForward,
		y: forklift.y + Math.sin(forklift.heading) * FORKLIFT.loadForward,
		height: forklift.forkHeight + 0.12,
	}
}

export function appendEvent(
	state: WarehouseState,
	kind: WarehouseEvent['kind'],
	text: string,
): WarehouseState {
	const event = { id: state.nextEventId, time: state.elapsed, kind, text }
	return {
		...state,
		events: [...state.events, event].slice(-8),
		nextEventId: state.nextEventId + 1,
	}
}

export function createWorld(seed: number, generation = 0): WarehouseState {
	const scenario = createScenario(seed)
	const accessible = scenario.cargo
		.filter(
			(item) =>
				item.depth === 0 ||
				!scenario.cargo.some((other) => other.lane === item.lane && other.depth === 0),
		)
		.sort((a, b) => a.x - b.x)[0]
	const pallets: Pallet[] = [
		...scenario.cargo.map((item) => ({
			id: item.cargoId,
			origin: 'delivery' as const,
			location: { kind: 'truck' as const, slotId: item.id },
		})),
		...scenario.existing.map((item) => ({
			id: item.stockId,
			origin: 'stock' as const,
			location: { kind: 'bay' as const, bayId: item.bayId },
		})),
	]
	const world: WarehouseState = {
		seed,
		generation,
		scenario,
		status: 'ready',
		tick: 0,
		elapsed: 0,
		forklift: {
			x: accessible.x,
			y: 1.7,
			heading: -Math.PI / 2,
			speed: 0,
			steering: 0,
			forkHeight: 0.1,
			carriedId: null,
		},
		pallets,
		delivered: 0,
		contact: false,
		contactCount: 0,
		invalidActions: 0,
		events: [],
		nextEventId: 1,
	}
	return appendEvent(world, 'info', `Delivery ${seed} ready: ${scenario.cargo.length} pallets`)
}

type Box = { x: number; y: number; halfLength: number; halfWidth: number; heading: number }

function axes(heading: number): [Point, Point] {
	return [
		{ x: Math.cos(heading), y: Math.sin(heading) },
		{ x: -Math.sin(heading), y: Math.cos(heading) },
	]
}

function corners(box: Box): Point[] {
	const [forward, lateral] = axes(box.heading)
	return [-1, 1].flatMap((lengthSign) =>
		[-1, 1].map((widthSign) => ({
			x: box.x + lengthSign * box.halfLength * forward.x + widthSign * box.halfWidth * lateral.x,
			y: box.y + lengthSign * box.halfLength * forward.y + widthSign * box.halfWidth * lateral.y,
		})),
	)
}

function overlaps(a: Box, b: Box): boolean {
	const aAxes = axes(a.heading)
	const bAxes = axes(b.heading)
	for (const axis of [...aAxes, ...bAxes]) {
		const delta = Math.abs((a.x - b.x) * axis.x + (a.y - b.y) * axis.y)
		const aRadius =
			a.halfLength * Math.abs(aAxes[0].x * axis.x + aAxes[0].y * axis.y) +
			a.halfWidth * Math.abs(aAxes[1].x * axis.x + aAxes[1].y * axis.y)
		const bRadius =
			b.halfLength * Math.abs(bAxes[0].x * axis.x + bAxes[0].y * axis.y) +
			b.halfWidth * Math.abs(bAxes[1].x * axis.x + bAxes[1].y * axis.y)
		if (delta >= aRadius + bRadius - 1e-6) return false
	}
	return true
}

function insideFloor(point: Point): boolean {
	if (point.y >= 0) return point.x >= -5.95 && point.x <= 5.95 && point.y <= 15.45
	return point.x >= -3.75 && point.x <= -0.15 && point.y >= -6.15
}

export function canOccupy(state: WarehouseState, forklift: ForkliftState): boolean {
	const chassis: Box = {
		x: forklift.x,
		y: forklift.y,
		heading: forklift.heading,
		halfLength: FORKLIFT.length / 2,
		halfWidth: FORKLIFT.width / 2,
	}
	if (corners(chassis).some((corner) => !insideFloor(corner))) return false
	const rackBack: Box = { x: 5.77, y: 6.75, heading: 0, halfLength: 0.18, halfWidth: 5.1 }
	const bodyBoxes = [chassis]
	if (forklift.carriedId) {
		bodyBoxes.push({
			x: forklift.x + Math.cos(forklift.heading) * FORKLIFT.loadForward,
			y: forklift.y + Math.sin(forklift.heading) * FORKLIFT.loadForward,
			heading: forklift.heading,
			halfLength: 0.55,
			halfWidth: 0.55,
		})
	}
	if (
		bodyBoxes.some(
			(box) => overlaps(box, rackBack) || corners(box).some((corner) => !insideFloor(corner)),
		)
	)
		return false
	for (const pallet of state.pallets) {
		if (pallet.location.kind === 'carried') continue
		const position = palletPosition(pallet, state)
		const obstacle: Box = {
			x: position.x,
			y: position.y,
			heading: 0,
			halfLength: 0.55,
			halfWidth: 0.55,
		}
		if (bodyBoxes.some((box) => overlaps(box, obstacle))) return false
	}
	return true
}

function actionResult(state: WarehouseState, action: Action): WarehouseState {
	const { forklift } = state
	if (action.kind === 'pickup') {
		const pallet = state.pallets.find((item) => item.id === action.palletId)
		if (pallet?.location.kind !== 'truck') return invalid(state, 'Pallet is not in the truck')
		if (forklift.carriedId) return invalid(state, 'Forklift already carries a pallet')
		const slotId = pallet.location.slotId
		const slot = TRUCK_SLOTS.find((item) => item.id === slotId)
		if (!slot) return invalid(state, 'Truck slot is missing')
		if (
			state.pallets.some((other) => {
				if (other.location.kind !== 'truck') return false
				const otherSlotId = other.location.slotId
				const otherSlot = TRUCK_SLOTS.find((item) => item.id === otherSlotId)
				if (!otherSlot) return false
				return otherSlot.lane === slot.lane && otherSlot.depth < slot.depth
			})
		)
			return invalid(state, 'Near pallet blocks this cargo')
		const deltaX = slot.x - forklift.x
		const deltaY = slot.y - forklift.y
		const forward = deltaX * Math.cos(forklift.heading) + deltaY * Math.sin(forklift.heading)
		const lateral = -deltaX * Math.sin(forklift.heading) + deltaY * Math.cos(forklift.heading)
		const headingError = Math.abs(
			Math.atan2(
				Math.sin(forklift.heading + Math.PI / 2),
				Math.cos(forklift.heading + Math.PI / 2),
			),
		)
		if (
			Math.abs(lateral) > 0.12 ||
			Math.abs(forward - FORKLIFT.loadForward) > 0.2 ||
			headingError > Math.PI / 18 ||
			forklift.forkHeight < 0.08 ||
			forklift.forkHeight > 0.16
		) {
			return invalid(state, 'Align forks with pallet pockets at pickup height')
		}
		const pallets = state.pallets.map(
			(item): Pallet => (item.id === pallet.id ? { ...item, location: { kind: 'carried' } } : item),
		)
		return appendEvent(
			{ ...state, pallets, forklift: { ...forklift, carriedId: pallet.id } },
			'success',
			`${pallet.id} picked up`,
		)
	}
	if (!forklift.carriedId) return invalid(state, 'No pallet to place')
	const bay = BAYS.find((item) => item.id === action.bayId)
	if (!bay) return invalid(state, 'Unknown storage bay')
	if (
		state.pallets.some((item) => item.location.kind === 'bay' && item.location.bayId === bay.id)
	) {
		return invalid(state, `${bay.id} is occupied`)
	}
	const dx = bay.x - forklift.x
	const dy = bay.y - forklift.y
	const forward = dx * Math.cos(forklift.heading) + dy * Math.sin(forklift.heading)
	const lateral = -dx * Math.sin(forklift.heading) + dy * Math.cos(forklift.heading)
	const headingError = Math.abs(Math.atan2(Math.sin(forklift.heading), Math.cos(forklift.heading)))
	if (
		Math.abs(lateral) > 0.12 ||
		Math.abs(forward - FORKLIFT.loadForward) > 0.2 ||
		headingError > Math.PI / 18 ||
		forklift.forkHeight < 0.08 ||
		forklift.forkHeight > 0.16
	) {
		return invalid(state, 'Align load with empty bay at placement height')
	}
	const pallets = state.pallets.map(
		(item): Pallet =>
			item.id === forklift.carriedId ? { ...item, location: { kind: 'bay', bayId: bay.id } } : item,
	)
	const delivered = state.delivered + 1
	const complete = delivered === state.scenario.cargo.length
	const next = appendEvent(
		{
			...state,
			pallets,
			delivered,
			forklift: { ...forklift, carriedId: null },
			status: complete ? 'complete' : state.status,
		},
		'success',
		`${forklift.carriedId} stored in ${bay.id}`,
	)
	return complete ? appendEvent(next, 'success', 'Shipment complete') : next
}

function invalid(state: WarehouseState, text: string): WarehouseState {
	return appendEvent({ ...state, invalidActions: state.invalidActions + 1 }, 'warning', text)
}

export function advance(
	state: WarehouseState,
	command: Command = {},
	dt = FIXED_DT,
): WarehouseState {
	if (state.status !== 'running') return state
	const previous = state.forklift
	const targetSpeed =
		Math.max(-1, Math.min(1, command.throttle ?? 0)) *
		(command.throttle && command.throttle < 0 ? FORKLIFT.maxReverse : FORKLIFT.maxForward)
	const speedDelta = Math.max(-1.5 * dt, Math.min(1.5 * dt, targetSpeed - previous.speed))
	const speed = previous.speed + speedDelta
	const targetSteering = Math.max(-1, Math.min(1, command.steering ?? 0)) * FORKLIFT.maxSteering
	const steering =
		previous.steering + Math.max(-1.5 * dt, Math.min(1.5 * dt, targetSteering - previous.steering))
	const heading = previous.heading + (speed * Math.tan(steering) * dt) / FORKLIFT.wheelbase
	const forkHeight = Math.max(
		FORKLIFT.minForkHeight,
		Math.min(
			FORKLIFT.maxForkHeight,
			previous.forkHeight + Math.max(-1, Math.min(1, command.fork ?? 0)) * FORKLIFT.forkSpeed * dt,
		),
	)
	const proposed: ForkliftState = {
		...previous,
		x: previous.x + Math.cos(heading) * speed * dt,
		y: previous.y + Math.sin(heading) * speed * dt,
		heading,
		speed,
		steering,
		forkHeight,
	}
	const contact = !canOccupy(state, proposed)
	let next: WarehouseState = {
		...state,
		tick: state.tick + 1,
		elapsed: state.elapsed + dt,
		forklift: contact ? { ...previous, speed: 0, forkHeight } : proposed,
		contact,
		contactCount: state.contactCount + (contact && !state.contact ? 1 : 0),
	}
	if (contact && !state.contact)
		next = appendEvent(next, 'warning', 'Forklift stopped at an obstacle')
	if (command.action) next = actionResult(next, command.action)
	return next
}

export function setRunStatus(state: WarehouseState, status: 'running' | 'paused'): WarehouseState {
	if (state.status === 'complete') return state
	if (state.status === status) return state
	return appendEvent(
		{ ...state, status },
		'info',
		status === 'running' ? 'Run started' : 'Run paused',
	)
}
