import { mkdir, writeFile } from 'node:fs/promises'

const endpoint = process.env.LAYA_ENDPOINT ?? 'http://127.0.0.1:8000/v1/systemone'
const output = new URL('../../docs/warehouse-demo/phase0/laya-probe.json', import.meta.url)

const directionCriteria = {
	left: 'The target is on the forklift left side.',
	ahead: 'The target is directly ahead of the forklift.',
	right: 'The target is on the forklift right side.',
}
const cases = [
	{
		id: 'nav-left',
		group: 'navigation',
		state: 'The target is clearly left of the forklift. The forward path is clear.',
		expected: 'left',
	},
	{
		id: 'nav-right',
		group: 'navigation',
		state: 'The target is clearly right of the forklift. The forward path is clear.',
		expected: 'right',
	},
	{
		id: 'nav-ahead',
		group: 'navigation',
		state: 'The target is directly ahead of the forklift. The forward path is clear.',
		expected: 'ahead',
	},
	{
		id: 'nav-near-left',
		group: 'navigation',
		state: 'The target is ahead and slightly left of the forklift. The forward path is clear.',
		expected: 'left',
	},
	{
		id: 'pickup-ready',
		group: 'pickup',
		state:
			'The forks are at pickup height, centered in the pallet pockets, and the pallet is within reach.',
		expected: true,
	},
	{
		id: 'pickup-offset',
		group: 'pickup',
		state:
			'The forks are at pickup height, but they are clearly to the left of the pallet pockets.',
		expected: false,
	},
	{
		id: 'pickup-high',
		group: 'pickup',
		state: 'The forks are centered in the pallet pockets, but they are too high to enter.',
		expected: false,
	},
	{
		id: 'pickup-far',
		group: 'pickup',
		state: 'The forks are at pickup height and centered, but the pallet is out of reach.',
		expected: false,
	},
	{
		id: 'place-ready',
		group: 'placement',
		state:
			'The carried pallet is centered over an empty storage bay, at placement height, and clear of the rack.',
		expected: true,
	},
	{
		id: 'place-occupied',
		group: 'placement',
		state:
			'The carried pallet is centered over a storage bay, but another pallet already occupies that bay.',
		expected: false,
	},
	{
		id: 'place-offset',
		group: 'placement',
		state: 'The storage bay is empty, but the carried pallet is clearly to the right of the bay.',
		expected: false,
	},
	{
		id: 'place-high',
		group: 'placement',
		state:
			'The storage bay is empty and the pallet is centered, but the forks are too high to place it.',
		expected: false,
	},
]

const variants = {
	navigation: [
		{
			id: 'direct',
			instructions: 'Which direction should the forklift steer to face the target?',
			criteria: {
				left: 'Steer left toward the target.',
				ahead: 'Continue straight toward the target.',
				right: 'Steer right toward the target.',
			},
		},
		{
			id: 'relative',
			instructions: 'Where is the target relative to the forklift?',
			criteria: directionCriteria,
		},
		{
			id: 'position',
			instructions: 'Which direction from the forklift contains the target?',
			criteria: directionCriteria,
		},
	],
	pickup: [
		{ id: 'direct', instructions: 'Should the forklift pick up the pallet now?' },
		{
			id: 'readiness',
			instructions:
				'Are the forks correctly aligned, at pickup height, and within reach of the pallet?',
		},
		{ id: 'conditions', instructions: 'Are all conditions for picking up this pallet satisfied?' },
	],
	placement: [
		{ id: 'direct', instructions: 'Should the forklift place the carried pallet now?' },
		{
			id: 'readiness',
			instructions: 'Is the bay empty and the pallet correctly centered and at placement height?',
		},
		{
			id: 'conditions',
			instructions: 'Are all conditions for placing this pallet in the bay satisfied?',
		},
	],
}

async function ask(test, variant) {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), 5000)
	const started = performance.now()
	try {
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				state: test.state,
				questions: {
					decision: {
						type: test.group === 'navigation' ? 'choice' : 'noul',
						instructions: variant.instructions,
						...(variant.criteria ? { criteria: variant.criteria } : {}),
					},
				},
			}),
			signal: controller.signal,
		})
		const result = await response.json()
		if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(result)}`)
		const answer = result.answers?.decision
		const selected = test.group === 'navigation' ? answer.choice : answer.noul >= 0.5
		return {
			caseId: test.id,
			group: test.group,
			variant: variant.id,
			expected: test.expected,
			selected,
			correct: selected === test.expected,
			latencyMs: Math.round(performance.now() - started),
			probabilities: answer.probabilities ?? { true: answer.noul, false: 1 - answer.noul },
		}
	} finally {
		clearTimeout(timer)
	}
}

const results = []
for (const test of cases) {
	for (const variant of variants[test.group]) {
		try {
			results.push(await ask(test, variant))
		} catch (error) {
			results.push({
				caseId: test.id,
				group: test.group,
				variant: variant.id,
				error: String(error),
			})
		}
	}
}
const summary = Object.fromEntries(
	Object.keys(variants).map((group) => [
		group,
		Object.fromEntries(
			variants[group].map(({ id }) => {
				const subset = results.filter((item) => item.group === group && item.variant === id)
				const valid = subset.filter((item) => !item.error)
				const latencies = valid.map((item) => item.latencyMs).sort((a, b) => a - b)
				return [
					id,
					{
						correct: valid.filter((item) => item.correct).length,
						total: valid.length,
						medianLatencyMs: latencies[Math.floor(latencies.length / 2)] ?? null,
						errors: subset.length - valid.length,
					},
				]
			}),
		),
	]),
)
const report = {
	endpoint,
	generatedAt: new Date().toISOString(),
	caseCount: cases.length,
	summary,
	results,
}
await mkdir(new URL('.', output), { recursive: true })
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
if (results.some((item) => item.error)) process.exitCode = 1
