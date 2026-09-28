import { writeFile } from 'node:fs/promises'

const variants = [
	{
		name: 'relative',
		states: [
			'The forks are below the target height.',
			'The forks are above the target height.',
			'The forks are at the target height.',
		],
		question: 'Where are the forks relative to the target height?',
		criteria: {
			below: 'Below the target height.',
			above: 'Above the target height.',
			level: 'At the target height.',
		},
	},
	{
		name: 'level',
		states: [
			'The forks are too low.',
			'The forks are too high.',
			'The forks are at the correct height.',
		],
		question: 'How high are the forks?',
		criteria: { below: 'Too low.', above: 'Too high.', level: 'At the correct height.' },
	},
	{
		name: 'platform',
		states: [
			'The lifting platform is below its target.',
			'The lifting platform is above its target.',
			'The lifting platform is level with its target.',
		],
		question: 'Where is the lifting platform relative to its target?',
		criteria: {
			below: 'Below its target.',
			above: 'Above its target.',
			level: 'Level with its target.',
		},
	},
]
const results = []
for (const v of variants)
	for (const [index, state] of v.states.entries())
		for (const operation of [
			'No load operation is needed.',
			'Collect the selected truck pallet.',
			'Release the load into the selected empty bay.',
		]) {
			const payload = {
				state: `${state} The forklift is at its target. The travel direction is forward. The alignment is straight ahead. ${operation}`,
				questions: { fork: { type: 'choice', instructions: v.question, criteria: v.criteria } },
			}
			const response = await fetch('http://127.0.0.1:8000/v1/systemone', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})
			const result = await response.json()
			results.push({
				variant: v.name,
				state: payload.state,
				expected: Object.keys(v.criteria)[index],
				answer: result.answers.fork,
			})
		}
await writeFile(
	'docs/warehouse-demo/phase4/fork-perception-probe.json',
	`${JSON.stringify(results, null, 2)}\n`,
)
for (const v of variants)
	process.stdout.write(
		`${v.name}: ${results.filter((r) => r.variant === v.name && r.answer.choice === r.expected).length}/9\n`,
	)
