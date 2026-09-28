import { writeFile } from 'node:fs/promises'

const variants = [
	{
		name: 'distance',
		states: [
			'The destination has been reached.',
			'The destination is nearby.',
			'The destination is far away.',
		],
		question: 'Where is the destination?',
		criteria: {
			stop: 'The destination has been reached.',
			creep: 'The destination is nearby.',
			cruise: 'The destination is far away.',
		},
	},
	{
		name: 'remaining',
		states: [
			'There is no distance remaining.',
			'There is a short distance remaining.',
			'There is a long distance remaining.',
		],
		question: 'How much distance remains?',
		criteria: {
			stop: 'No distance remains.',
			creep: 'A short distance remains.',
			cruise: 'A long distance remains.',
		},
	},
	{
		name: 'motion',
		states: [
			'The forklift is at its target.',
			'The forklift is close to its target.',
			'The forklift is far from its target.',
		],
		question: 'Where is the forklift relative to its target?',
		criteria: {
			stop: 'At the target.',
			creep: 'Close to the target.',
			cruise: 'Far from the target.',
		},
	},
]
const results = []
for (const variant of variants)
	for (const [index, state] of variant.states.entries())
		for (const gear of ['forward', 'reverse']) {
			const payload = {
				state: `${state} The travel direction is ${gear}. The alignment is straight ahead. The forks are at the required height. No load operation is needed.`,
				questions: {
					travel: { type: 'choice', instructions: variant.question, criteria: variant.criteria },
					gear: {
						type: 'choice',
						instructions: 'What is the travel direction?',
						criteria: { forward: 'Forward.', reverse: 'Reverse.' },
					},
				},
			}
			const started = performance.now()
			const response = await fetch('http://127.0.0.1:8000/v1/systemone', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})
			const result = await response.json()
			results.push({
				variant: variant.name,
				state: payload.state,
				expected: Object.keys(variant.criteria)[index],
				expectedGear: gear,
				answers: result.answers,
				latencyMs: performance.now() - started,
			})
		}
await writeFile(
	'docs/warehouse-demo/phase4/prompt-probe.json',
	`${JSON.stringify(results, null, 2)}\n`,
)
for (const r of results)
	process.stdout.write(
		`${r.variant} ${r.expected}/${r.expectedGear}: ${r.answers.travel.choice}/${r.answers.gear.choice}\n`,
	)
