import { mkdir, writeFile } from 'node:fs/promises'

const endpoint = process.env.GREENHOUSE_API_URL ?? 'http://127.0.0.1:8001'
const output = new URL('../../docs/greenhouse-demo/phase6/', import.meta.url)
await mkdir(output, { recursive: true })
async function api(path, body) {
	const response = await fetch(
		`${endpoint}/api/v1/greenhouse${path}`,
		body
			? {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
				}
			: undefined,
	)
	if (!response.ok) throw new Error(await response.text())
	return response.json()
}
const initial = await api('/training')
const parent =
	process.env.GREENHOUSE_PARENT_CHECKPOINT ??
	initial.jobs.find((job) => job.state === 'completed' && (job.request.algorithm ?? 'bc') === 'bc')
		?.selected_checkpoint
if (!parent) throw new Error('Train an eligible Phase 5 imitation policy first.')
const results = []
for (const seed of [7, 17, 27]) {
	let catalogBefore = await api('/training')
	while (catalogBefore.active_job) {
		await new Promise((resolve) => setTimeout(resolve, 500))
		catalogBefore = await api('/training')
	}
	let job = catalogBefore.jobs.find(
		(item) =>
			item.state === 'completed' &&
			item.request.algorithm === 'ppo' &&
			item.request.parent_checkpoint === parent &&
			item.request.random_seed === seed &&
			item.request.ppo_steps === 36864,
	)
	job ??= await api('/training/jobs', {
		algorithm: 'ppo',
		parent_checkpoint: parent,
		random_seed: seed,
		ppo_steps: 36864,
		budget_seconds: 240,
	})
	const deadline = Date.now() + 270000
	let last = ''
	while (!['completed', 'cancelled', 'failed'].includes(job.state)) {
		if (Date.now() > deadline)
			throw new Error('Worker status deadline; inspect/cancel the persisted job.')
		const line = `seed ${seed}: ${job.state}, ${job.phase}, ${job.practice_steps} steps`
		if (line !== last) {
			process.stdout.write(`${line}\n`)
			last = line
		}
		await new Promise((resolve) => setTimeout(resolve, 1000))
		job = await api(`/training/jobs/${job.job_id}`)
	}
	await writeFile(new URL(`job-seed-${seed}.json`, output), `${JSON.stringify(job, null, 2)}\n`)
	if (job.state !== 'completed') throw new Error(job.message)
	const catalog = await api('/training')
	const candidates = catalog.checkpoints.filter((item) => item.job_id === job.job_id)
	for (const candidate of candidates) {
		const detail = await api(`/training/checkpoints/${candidate.checkpoint_id}`)
		await writeFile(
			new URL(`validation-${seed}-r${candidate.round}.json`, output),
			`${JSON.stringify(
				{
					checkpoint: detail.checkpoint,
					evaluation: {
						...detail.evaluation,
						episodes: detail.evaluation.episodes.map(
							({ initial, frames, final, ...result }) => result,
						),
					},
				},
				null,
				2,
			)}\n`,
		)
	}
	results.push({
		seed,
		job_id: job.job_id,
		selected: job.selected_checkpoint,
		seconds: job.elapsed_seconds,
		peak_rss_mb: job.peak_worker_rss_mb,
		candidates: candidates.map((item) => ({
			checkpoint: item.checkpoint_id,
			steps: item.practice_steps,
			...item.evaluation,
		})),
	})
	await writeFile(
		new URL('experiment.json', output),
		`${JSON.stringify(
			{
				parent,
				training_seeds: [7, 17, 27],
				steps_per_run: 36864,
				final_test_used: false,
				runs: results,
			},
			null,
			2,
		)}\n`,
	)
	process.stdout.write(`${JSON.stringify(results.at(-1))}\n`)
}
