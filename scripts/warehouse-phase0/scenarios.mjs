// Phase 0 fixture generator. Keep this independent of the browser and renderer.
export const REFERENCE_SEEDS = [3, 7, 42, 99, 2026, 4821]
export const CARGO_SLOTS = [
	{ id: 'left-front', lane: 'left', depth: 0, x: -2.8, y: -2.1 },
	{ id: 'right-front', lane: 'right', depth: 0, x: -1.0, y: -2.1 },
	{ id: 'left-rear', lane: 'left', depth: 1, x: -2.8, y: -4.1 },
	{ id: 'right-rear', lane: 'right', depth: 1, x: -1.0, y: -4.1 },
]
export const STORAGE_BAYS = Array.from({ length: 8 }, (_, i) => ({
	id: `B${i + 1}`,
	x: 4.9,
	y: 2.35 + i * 1.25,
}))

function random(seed) {
	let value = seed >>> 0
	return () => {
		value += 0x6d2b79f5
		let result = value
		result = Math.imul(result ^ (result >>> 15), result | 1)
		result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
		return ((result ^ (result >>> 14)) >>> 0) / 4294967296
	}
}

function shuffle(items, next) {
	const copy = [...items]
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(next() * (i + 1))
		;[copy[i], copy[j]] = [copy[j], copy[i]]
	}
	return copy
}

export function createScenario(seed) {
	if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
		throw new RangeError('seed must be a uint32')
	}
	const next = random(seed)
	const incomingCount = 3 + Math.floor(next() * 2)
	const existingCount = 1 + Math.floor(next() * 3)
	const cargoIds = shuffle(['C1', 'C2', 'C3', 'C4'], next).slice(0, incomingCount)
	const slots = shuffle(CARGO_SLOTS, next).slice(0, incomingCount)
	const cargo = slots.map((slot, index) => ({ ...slot, cargoId: cargoIds[index] }))
	const existing = shuffle(STORAGE_BAYS, next)
		.slice(0, existingCount)
		.map((bay, index) => ({ bayId: bay.id, stockId: `S${index + 1}` }))
	return { seed, cargo, existing }
}

export function accessibleCargo(cargo) {
	return cargo.filter(
		(item) => !cargo.some((other) => other.lane === item.lane && other.depth < item.depth),
	)
}

export function validateScenario(scenario) {
	const errors = []
	const occupiedBays = new Set(scenario.existing.map((item) => item.bayId))
	if (scenario.cargo.length < 3 || scenario.cargo.length > 4) errors.push('cargo count')
	if (scenario.existing.length < 1 || scenario.existing.length > 3) errors.push('existing count')
	if (occupiedBays.size !== scenario.existing.length) errors.push('duplicate existing bay')
	if (STORAGE_BAYS.length - occupiedBays.size < scenario.cargo.length)
		errors.push('insufficient bays')
	if (new Set(scenario.cargo.map((item) => item.id)).size !== scenario.cargo.length) {
		errors.push('duplicate truck slot')
	}
	if (new Set(scenario.cargo.map((item) => item.cargoId)).size !== scenario.cargo.length) {
		errors.push('duplicate cargo ID')
	}
	const remaining = [...scenario.cargo]
	while (remaining.length) {
		const candidates = accessibleCargo(remaining)
		if (!candidates.length) {
			errors.push('blocked cargo')
			break
		}
		remaining.splice(remaining.indexOf(candidates[0]), 1)
	}
	return errors
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
	const count = Number(process.argv[2] ?? 1000)
	if (!Number.isInteger(count) || count < 1 || count > 100000) throw new RangeError('invalid count')
	const failures = []
	const cargoOrders = new Set()
	const stockLayouts = new Set()
	for (let seed = 0; seed < count; seed++) {
		const scenario = createScenario(seed)
		const errors = validateScenario(scenario)
		if (errors.length) failures.push({ seed, errors })
		cargoOrders.add(scenario.cargo.map((item) => `${item.id}:${item.cargoId}`).join(','))
		stockLayouts.add(
			scenario.existing
				.map((item) => item.bayId)
				.sort()
				.join(','),
		)
	}
	process.stdout.write(
		`${JSON.stringify(
			{
				checked: count,
				failures,
				distinctCargoLayouts: cargoOrders.size,
				distinctStockLayouts: stockLayouts.size,
				references: REFERENCE_SEEDS.map(createScenario),
			},
			null,
			2,
		)}\n`,
	)
	if (failures.length) process.exitCode = 1
}
