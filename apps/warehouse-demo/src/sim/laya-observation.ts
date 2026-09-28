import type { ChoiceQuestion, LayaRequest } from './laya-client'
import { accessibleCargo, BAYS, TRUCK_SLOTS } from './scenario'
import type { Command, WarehouseState } from './world'

export type LayaStage =
	| 'select'
	| 'approach'
	| 'pickup'
	| 'lift'
	| 'retreat'
	| 'turn'
	| 'cross'
	| 'lower'
	| 'place'
	| 'backtrack'
	| 'turn-to-dock'
	| 'lane-clear'
	| 'lane-turn'
	| 'done'
	| 'stalled'
export type LayaRoute = {
	stage: LayaStage
	palletId: string
	slotId: string
	bayId: string
	goal: { x: number; y: number } | null
	baselineDelivered: number
	backtrackY: number
	failReason: string | null
}
export const emptyLayaRoute = (): LayaRoute => ({
	stage: 'select',
	palletId: '',
	slotId: '',
	bayId: '',
	goal: null,
	baselineDelivered: 0,
	backtrackY: 0,
	failReason: null,
})
export const angleDelta = (target: number, current: number) =>
	Math.atan2(Math.sin(target - current), Math.cos(target - current))
export const choice = (instructions: string, criteria: Record<string, string>): ChoiceQuestion => ({
	type: 'choice',
	instructions,
	criteria,
})

export function candidates(state: WarehouseState) {
	return {
		cargo: accessibleCargo(
			state.scenario.cargo.filter((slot) =>
				state.pallets.some((p) => p.id === slot.cargoId && p.location.kind === 'truck'),
			),
		),
		bays: BAYS.filter(
			(bay) => !state.pallets.some((p) => p.location.kind === 'bay' && p.location.bayId === bay.id),
		),
	}
}

export function taskRequest(state: WarehouseState): LayaRequest {
	const { cargo, bays } = candidates(state)
	return {
		state: `Choose a shipment task. Accessible cargo: ${cargo.map((c) => `${c.cargoId} in the ${c.lane} truck lane, ${Math.abs(c.x - state.forklift.x) < 0.3 ? 'aligned with the forklift' : 'in the other lane'}`).join('; ')}. Empty storage bays: ${bays.map((b) => b.id).join(', ')}. All listed bays can receive any cargo.`,
		questions: {
			cargo: choice(
				'Which accessible cargo should be collected next? Prefer cargo aligned with the forklift when available.',
				{
					...Object.fromEntries(
						cargo.map((c) => [c.cargoId, `Collect cargo ${c.cargoId} in the ${c.lane} lane.`]),
					),
					unsure: 'No suitable cargo can be chosen.',
				},
			),
			bay: choice('Which empty storage bay should receive the cargo?', {
				...Object.fromEntries(bays.map((b) => [b.id, `Store cargo in empty bay ${b.id}.`])),
				unsure: 'No suitable bay can be chosen.',
			}),
		},
	}
}

export function selectLayaTask(state: WarehouseState, palletId: string, bayId: string): LayaRoute {
	const available = candidates(state)
	const slot = available.cargo.find((item) => item.cargoId === palletId)
	if (!slot || !available.bays.some((b) => b.id === bayId))
		throw new Error('Laya could not choose an accessible cargo and empty bay')
	const stage =
		state.delivered > 0
			? 'backtrack'
			: Math.abs(state.forklift.x - slot.x) > 0.3
				? 'lane-clear'
				: 'approach'
	return updateLayaRoute(state, {
		stage,
		palletId,
		slotId: slot.id,
		bayId,
		goal: null,
		baselineDelivered: state.delivered,
		backtrackY: state.forklift.y,
		failReason: null,
	})
}

/** Geometric milestones describe a lane path; they never return motor commands. */
export function updateLayaRoute(state: WarehouseState, previous: LayaRoute): LayaRoute {
	if (state.status === 'complete') return { ...previous, stage: 'done', goal: null }
	if (previous.stage === 'select' || previous.stage === 'stalled') return previous
	const f = state.forklift
	const slot = TRUCK_SLOTS.find((s) => s.id === previous.slotId)
	const bay = BAYS.find((b) => b.id === previous.bayId)
	if (!slot || !bay) throw new Error('Missing Laya task geometry')
	let stage: LayaStage = previous.stage
	const stopped = Math.abs(f.speed) < 0.035
	if (stage === 'approach' && f.y <= slot.y + 1.55 + 0.13 && stopped) stage = 'pickup'
	if (stage === 'pickup' && f.carriedId === previous.palletId) stage = 'lift'
	if (stage === 'lift' && f.forkHeight >= 0.3) stage = 'retreat'
	if (stage === 'retreat' && f.y >= bay.y + 2.05 - 0.12 && stopped) stage = 'turn'
	if (stage === 'turn' && f.heading >= -0.025 && stopped) stage = 'cross'
	if (stage === 'cross' && Math.hypot(bay.x - 1.55 - f.x, bay.y - f.y) < 0.13 && stopped)
		stage = 'lower'
	if (stage === 'lower' && f.forkHeight <= 0.105 && stopped) stage = 'place'
	if (stage === 'place' && state.delivered > previous.baselineDelivered) stage = 'select'
	if (stage === 'backtrack' && f.x <= slot.x - 2.03 + 0.12 && stopped) stage = 'turn-to-dock'
	if (stage === 'turn-to-dock' && f.heading <= -Math.PI / 2 + 0.025 && stopped) stage = 'approach'
	if (stage === 'lane-clear' && f.y >= 5 && stopped) stage = 'lane-turn'
	if (stage === 'lane-turn' && f.heading >= -0.025 && stopped) stage = 'backtrack'
	const goal =
		stage === 'select'
			? null
			: stage === 'backtrack'
				? { x: slot.x - 2.03, y: previous.backtrackY }
				: stage === 'lane-clear'
					? { x: f.x, y: 5.1 }
					: stage === 'turn-to-dock'
						? { x: slot.x, y: previous.backtrackY - 2.03 }
						: ['retreat', 'turn', 'lane-turn'].includes(stage)
							? { x: slot.x, y: bay.y + 2.05 }
							: ['cross', 'lower', 'place'].includes(stage)
								? { x: bay.x - 1.55, y: bay.y }
								: { x: slot.x, y: slot.y + 1.55 }
	return {
		...previous,
		stage,
		goal,
		backtrackY: previous.stage === 'lane-turn' && stage === 'backtrack' ? f.y : previous.backtrackY,
	}
}

export const TRAVEL = {
	forward: 0.65,
	creep: 0.22,
	reverse: -0.7,
	reverse_creep: -0.3,
	stop: 0,
} as const
export const STEERING = {
	left: 1,
	slight_left: 0.18,
	straight: 0,
	slight_right: -0.18,
	right: -1,
} as const
export const FORKS = { below: 1, above: -1, level: 0 } as const

export function motionGeometry(state: WarehouseState, route: LayaRoute) {
	const f = state.forklift
	const goal = route.goal ?? f
	const turning = ['turn', 'lane-turn', 'turn-to-dock'].includes(route.stage)
	const reversing = ['retreat', 'backtrack', 'lane-clear'].includes(route.stage)
	const stationary = ['pickup', 'lift', 'lower', 'place'].includes(route.stage)
	let distance = Math.hypot(goal.x - f.x, goal.y - f.y)
	let error = 0
	if (turning) {
		error = angleDelta(route.stage === 'turn-to-dock' ? -Math.PI / 2 : 0, f.heading)
		distance = Math.abs(error) * 2
	} else if (
		route.stage === 'approach' ||
		route.stage === 'retreat' ||
		route.stage === 'lane-clear'
	) {
		distance = route.stage === 'approach' ? f.y - goal.y : goal.y - f.y
		const heading = -Math.PI / 2 + Math.atan2((goal.x - f.x) * (reversing ? -1 : 1), 1.5)
		error = angleDelta(heading, f.heading) * (reversing ? -1 : 1)
	} else if (route.stage === 'backtrack') {
		distance = f.x - goal.x
		error = -angleDelta(Math.atan2(f.y - goal.y, 1.5), f.heading)
	} else if (route.stage === 'cross') {
		const bearing = Math.atan2(goal.y - f.y, Math.max(0.3, goal.x - f.x))
		error = angleDelta(bearing, f.heading)
	}
	const arrived =
		stationary ||
		(turning
			? Math.abs(error) < 0.025 ||
				(route.stage === 'turn-to-dock' ? f.heading < -Math.PI / 2 : f.heading > 0)
			: distance < 0.1)
	return { turning, reversing, stationary, distance, error, arrived }
}

export function motionRequest(state: WarehouseState, route: LayaRoute): LayaRequest {
	const g = motionGeometry(state, route)
	const direction =
		g.error > 0.025
			? g.turning || g.error > 0.18
				? 'left'
				: 'slightly left'
			: g.error < -0.025
				? g.turning || g.error < -0.18
					? 'right'
					: 'slightly right'
				: 'straight ahead'
	const travel = g.arrived
		? 'at its target'
		: g.distance < 0.85 || g.turning
			? 'close to its target'
			: 'far from its target'
	const fork =
		route.stage === 'lift'
			? state.forklift.forkHeight < 0.3
				? 'below the target height'
				: 'at the target height'
			: ['lower', 'pickup', 'place'].includes(route.stage)
				? state.forklift.forkHeight > 0.105
					? 'above the target height'
					: 'at the target height'
				: 'at the target height'
	return {
		state: `The forklift is ${travel}. The travel direction is ${g.reversing ? 'reverse' : 'forward'}. The alignment is ${direction}. The forks are ${fork}. ${route.stage === 'pickup' ? 'Collect the selected truck pallet.' : route.stage === 'place' ? 'Release the load into the selected empty bay.' : 'No load operation is needed.'}`,
		questions: {
			travel: choice('Where is the forklift relative to its target?', {
				at: 'At the target.',
				near: 'Close to the target.',
				far: 'Far from the target.',
			}),
			gear: choice('What is the travel direction?', { forward: 'Forward.', reverse: 'Reverse.' }),
			steering: choice('Which alignment is described?', {
				left: 'Left.',
				slight_left: 'Slightly left.',
				straight: 'Straight ahead.',
				slight_right: 'Slightly right.',
				right: 'Right.',
			}),
			fork: choice('Where are the forks relative to the target height?', {
				below: 'Below the target height.',
				above: 'Above the target height.',
				level: 'At the target height.',
			}),
			action: choice('Which load operation is described?', {
				pickup: 'Collect the selected truck pallet.',
				place: 'Release the load into the selected empty bay.',
				none: 'No load operation is needed.',
			}),
		},
	}
}

export function motorCommand(choices: Record<string, string>, route: LayaRoute): Command {
	return {
		throttle:
			choices.travel === 'at'
				? 0
				: choices.gear === 'reverse'
					? choices.travel === 'near'
						? TRAVEL.reverse_creep
						: TRAVEL.reverse
					: choices.travel === 'near'
						? TRAVEL.creep
						: TRAVEL.forward,
		steering: STEERING[choices.steering as keyof typeof STEERING],
		fork: FORKS[choices.fork as keyof typeof FORKS],
		...(choices.action === 'pickup'
			? { action: { kind: 'pickup', palletId: route.palletId } as const }
			: choices.action === 'place'
				? { action: { kind: 'place', bayId: route.bayId } as const }
				: {}),
	}
}
