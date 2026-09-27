import manifest from '../../../../assets/warehouse-demo/manifest.json'

export type TruckSlot = { id: string; lane: 'left' | 'right'; depth: 0 | 1; x: number; y: number }
export type StorageBay = { id: string; x: number; y: number }
export type Scenario = {
	seed: number
	cargo: (TruckSlot & { cargoId: string })[]
	existing: { bayId: string; stockId: string }[]
}

export const TRUCK_SLOTS = manifest.truckSlots as TruckSlot[]
export const BAYS: StorageBay[] = manifest.bays
export const REFERENCE_SEEDS = [3, 7, 42, 99, 2026, 4821]

function random(seed: number): () => number {
	let value = seed >>> 0
	return () => {
		value += 0x6d2b79f5
		let result = value
		result = Math.imul(result ^ (result >>> 15), result | 1)
		result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
		return ((result ^ (result >>> 14)) >>> 0) / 4294967296
	}
}

function shuffle<T>(items: readonly T[], next: () => number): T[] {
	const result = [...items]
	for (let index = result.length - 1; index > 0; index--) {
		const target = Math.floor(next() * (index + 1))
		;[result[index], result[target]] = [result[target], result[index]]
	}
	return result
}

export function createScenario(seed: number): Scenario {
	if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
		throw new RangeError('seed must be a uint32')
	}
	const next = random(seed)
	const incomingCount = 3 + Math.floor(next() * 2)
	const existingCount = 1 + Math.floor(next() * 3)
	const cargoIds = shuffle(['C1', 'C2', 'C3', 'C4'], next).slice(0, incomingCount)
	const slots = shuffle(TRUCK_SLOTS, next).slice(0, incomingCount)
	const cargo = slots.map((slot, index) => ({ ...slot, cargoId: cargoIds[index] }))
	const existing = shuffle(BAYS, next)
		.slice(0, existingCount)
		.map((bay, index) => ({ bayId: bay.id, stockId: `S${index + 1}` }))
	return { seed, cargo, existing }
}

export function accessibleCargo(cargo: Scenario['cargo']): Scenario['cargo'] {
	return cargo.filter(
		(item) => !cargo.some((other) => other.lane === item.lane && other.depth < item.depth),
	)
}

export function validateScenario(scenario: Scenario): string[] {
	const errors: string[] = []
	const occupied = new Set(scenario.existing.map((item) => item.bayId))
	if (scenario.cargo.length < 3 || scenario.cargo.length > 4) errors.push('cargo count')
	if (scenario.existing.length < 1 || scenario.existing.length > 3) errors.push('existing count')
	if (occupied.size !== scenario.existing.length) errors.push('duplicate bay')
	if (BAYS.length - occupied.size < scenario.cargo.length) errors.push('capacity')
	if (new Set(scenario.cargo.map((item) => item.id)).size !== scenario.cargo.length)
		errors.push('duplicate truck slot')
	if (new Set(scenario.cargo.map((item) => item.cargoId)).size !== scenario.cargo.length)
		errors.push('duplicate cargo ID')
	const remaining = [...scenario.cargo]
	while (remaining.length) {
		const candidate = accessibleCargo(remaining)[0]
		if (!candidate) {
			errors.push('blocked cargo')
			break
		}
		remaining.splice(remaining.indexOf(candidate), 1)
	}
	return errors
}
