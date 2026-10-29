import { mkdir, writeFile } from 'node:fs/promises'

const endpoint = process.env.GREENHOUSE_API_URL ?? 'http://127.0.0.1:8001'
const output = new URL('../../docs/greenhouse-demo/phase5/', import.meta.url)
await mkdir(output, { recursive: true })
const response = await fetch(`${endpoint}/api/v1/greenhouse/training/jobs`, {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ epochs: 120, correction_rounds: 3, random_seed: 7, budget_seconds: 180 }),
})
if (!response.ok) throw new Error(await response.text())
let job = await response.json()
const id = job.job_id
let last = ''
const deadline = Date.now() + 210000
while (!['completed', 'cancelled', 'failed'].includes(job.state)) {
	if (Date.now() > deadline)
		throw new Error('Job status timed out; inspect the persistent job in the UI.')
	const line = `${job.state}: ${job.phase}, round ${job.round}, epoch ${job.epoch}, loss ${job.fitting_loss ?? '—'}`
	if (line !== last) {
		process.stdout.write(`${line}\n`)
		last = line
	}
	await new Promise((resolve) => setTimeout(resolve, 1000))
	job = await (await fetch(`${endpoint}/api/v1/greenhouse/training/jobs/${id}`)).json()
}
await writeFile(new URL('training-job.json', output), `${JSON.stringify(job, null, 2)}\n`)
if (job.state !== 'completed') throw new Error(job.message)
const catalog = await (await fetch(`${endpoint}/api/v1/greenhouse/training`)).json()
const candidates = catalog.checkpoints.filter((item) => item.job_id === id)
await writeFile(
	new URL('checkpoint-comparison.json', output),
	`${JSON.stringify(candidates, null, 2)}\n`,
)
for (const item of candidates) {
	const detail = await (
		await fetch(`${endpoint}/api/v1/greenhouse/training/checkpoints/${item.checkpoint_id}`)
	).json()
	// Full rollout states stay in local artifacts; preserve the complete 30-seed
	// outcome table and summary as review evidence without duplicating large traces.
	detail.evaluation.episodes = detail.evaluation.episodes.map(
		({ initial, frames, final, ...result }) => result,
	)
	delete detail.template
	await writeFile(
		new URL(`round-${item.round}.json`, output),
		`${JSON.stringify(detail, null, 2)}\n`,
	)
}
process.stdout.write(
	`${JSON.stringify({ job: id, selected: job.selected_checkpoint, seconds: job.elapsed_seconds, candidates: candidates.map((item) => ({ round: item.round, loss: item.fitting_loss, successes: item.evaluation.successes, clean: item.evaluation.clean_successes })) })}\n`,
)
