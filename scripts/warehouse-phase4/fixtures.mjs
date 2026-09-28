import { writeFile } from 'node:fs/promises'
import { createServer } from '../../apps/warehouse-demo/node_modules/vite/dist/node/index.js'

const server = await createServer({
	root: 'apps/warehouse-demo',
	server: { middlewareMode: true, hmr: false },
	appType: 'custom',
})
try {
	const { motionRequest, emptyLayaRoute } = await server.ssrLoadModule(
		'/src/sim/laya-observation.ts',
	)
	const { createWorld } = await server.ssrLoadModule('/src/sim/world.ts')
	const { createLayaClient } = await server.ssrLoadModule('/src/sim/laya-client.ts')
	const ask = createLayaClient('http://127.0.0.1:8000/v1/systemone')
	const questions = motionRequest(createWorld(42), emptyLayaRoute()).questions
	const cases = []
	const alignments = {
		left: 'left',
		slight_left: 'slightly left',
		straight: 'straight ahead',
		slight_right: 'slightly right',
		right: 'right',
	}
	for (const [travel, range] of Object.entries({
		at: 'at',
		near: 'close to',
		far: 'far from',
	}))
		for (const gear of ['forward', 'reverse'])
			for (const [steering, alignment] of Object.entries(alignments)) {
				cases.push({
					state: `The forklift is ${range} its target. The travel direction is ${gear}. The alignment is ${alignment}. The forks are at the target height. No load operation is needed.`,
					expected: { travel, gear, steering, fork: 'level', action: 'none' },
				})
			}
	for (const [fork, height] of Object.entries({
		below: 'below the target height',
		above: 'above the target height',
		level: 'at the target height',
	}))
		for (const [action, operation] of Object.entries({
			none: 'No load operation is needed.',
			pickup: 'Collect the selected truck pallet.',
			place: 'Release the load into the selected empty bay.',
		}))
			for (const gear of ['forward', 'reverse']) {
				cases.push({
					state: `The forklift is at its target. The travel direction is ${gear}. The alignment is straight ahead. The forks are ${height}. ${operation}`,
					expected: { travel: 'at', gear, steering: 'straight', fork, action },
				})
			}
	for (const [fork, height] of Object.entries({
		below: 'below the target height',
		above: 'above the target height',
	}))
		for (const [steering, alignment] of Object.entries({
			left: 'left',
			slight_left: 'slightly left',
			slight_right: 'slightly right',
			right: 'right',
		})) {
			cases.push({
				state: `The forklift is at its target. The travel direction is forward. The alignment is ${alignment}. The forks are ${height}. No load operation is needed.`,
				expected: { travel: 'at', gear: 'forward', steering, fork, action: 'none' },
			})
		}
	const results = []
	for (const sample of cases) {
		const result = await ask({ state: sample.state, questions }, new AbortController().signal)
		results.push({ ...sample, ...result })
	}
	const summary = Object.fromEntries(
		Object.keys(questions).map((key) => [
			key,
			{
				correct: results.filter((r) => r.answers[key].choice === r.expected[key]).length,
				total: results.length,
				minimumWinningProbability: Math.min(
					...results.map((r) => r.answers[key].probabilities[r.answers[key].choice]),
				),
			},
		]),
	)
	await writeFile(
		'docs/warehouse-demo/phase4/fixtures.json',
		`${JSON.stringify({ generatedAt: new Date().toISOString(), summary, results }, null, 2)}\n`,
	)
	process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
	for (const r of results)
		for (const [key, expected] of Object.entries(r.expected))
			if (r.answers[key].choice !== expected)
				process.stdout.write(
					`${key}: expected ${expected}, got ${r.answers[key].choice}. ${r.state}\n`,
				)
} finally {
	await server.close()
}
