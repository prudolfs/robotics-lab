// Reproduce a complete learning path with empty local artifacts and owned services.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(
	process.env.GREENHOUSE_CHECKOUT_ROOT ?? new URL('../../', import.meta.url).pathname,
)
const output = resolve(
	process.env.GREENHOUSE_RELEASE_OUTPUT ??
		new URL('../../docs/greenhouse-demo/phase8/', import.meta.url).pathname,
)
const runtime = await mkdtemp(resolve(root, '.temp/greenhouse-release-'))
const api = 'http://127.0.0.1:8007/api/v1/greenhouse'
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const services = []
const logs = []
function start(command, args, cwd, env) {
	const child = spawn(command, args, {
		cwd,
		env: { ...process.env, ...env },
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	services.push(child)
	for (const stream of [child.stdout, child.stderr])
		stream.on('data', (chunk) => logs.push(String(chunk)))
	child.on('error', (error) => logs.push(String(error)))
	return child
}
async function json(path, body, method = body === undefined ? 'GET' : 'POST') {
	const response = await fetch(api + path, {
		method,
		headers: { 'Content-Type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
		signal: AbortSignal.timeout(10000),
	})
	if (!response.ok) throw Error(`${path}: ${response.status} ${await response.text()}`)
	return response.status === 204 ? null : response.json()
}
async function until(task, check, timeout = 240000) {
	const deadline = Date.now() + timeout
	while (Date.now() < deadline) {
		const result = await task()
		if (check(result)) return result
		await delay(100)
	}
	throw Error('Release smoke operation timed out')
}
async function live(checkpoint) {
	const session = await json('/sessions', { seed: 42 })
	const socket = new WebSocket(
		`ws://127.0.0.1:8007/api/v1/greenhouse/sessions/${session.session_id}/stream`,
	)
	let snapshot = null
	const acks = new Map()
	socket.addEventListener('message', (event) => {
		const message = JSON.parse(event.data)
		if (message.kind === 'snapshot') snapshot = message
		if (message.kind === 'ack') acks.set(message.request_id, message)
	})
	await until(async () => snapshot, Boolean, 10000)
	async function command(kind, extra = {}) {
		await delay(120)
		const request_id = crypto.randomUUID()
		socket.send(
			JSON.stringify({
				api_version: '1',
				kind,
				session_id: session.session_id,
				generation: snapshot.generation,
				request_id,
				...extra,
			}),
		)
		const ack = await until(async () => acks.get(request_id), Boolean, 10000)
		assert.equal(ack.accepted, true, JSON.stringify(ack))
	}
	try {
		if (checkpoint)
			await command('set_controller', { controller: 'learned_policy', checkpoint_id: checkpoint })
		await command('start')
		await until(
			async () => snapshot,
			(item) => item.scene.status === 'complete' || item.scene.status === 'failed',
			40000,
		)
		assert.equal(snapshot.scene.delivered, true, JSON.stringify(snapshot.scene))
		if (checkpoint) assert.equal(snapshot.checkpoint_id, checkpoint)
		const result = {
			controller: snapshot.scene.controller,
			ticks: snapshot.tick,
			delivered: snapshot.scene.delivered,
			collisions: snapshot.scene.collisions,
			invalid_actions: snapshot.scene.invalid_actions,
		}
		await command('reset')
		await until(
			async () => snapshot,
			(item) => item.generation === 1 && item.tick === 0,
			10000,
		)
		return result
	} finally {
		socket.close()
		await json(`/sessions/${session.session_id}`, undefined, 'DELETE')
	}
}
try {
	start(
		resolve(root, 'apps/greenhouse-server/.venv/bin/python'),
		['-m', 'uvicorn', 'greenhouse.api.main:app', '--host', '127.0.0.1', '--port', '8007'],
		resolve(root, 'apps/greenhouse-server'),
		{
			GREENHOUSE_DATASET_DIR: resolve(runtime, 'datasets'),
			GREENHOUSE_TRAINING_DIR: resolve(runtime, 'training'),
			GREENHOUSE_MISSION_DIR: resolve(runtime, 'missions'),
			GREENHOUSE_ALLOWED_ORIGINS: 'http://127.0.0.1:4197',
		},
	)
	start(
		process.execPath,
		[
			resolve(root, 'apps/greenhouse-demo/node_modules/vite/bin/vite.js'),
			'preview',
			'--host',
			'127.0.0.1',
			'--port',
			'4197',
			'--strictPort',
		],
		resolve(root, 'apps/greenhouse-demo'),
		{ GREENHOUSE_SERVER_ORIGIN: 'http://127.0.0.1:8007' },
	)
	await until(
		async () => {
			try {
				return (await fetch('http://127.0.0.1:4197/api/v1/greenhouse/health')).ok
			} catch {
				return false
			}
		},
		Boolean,
		30000,
	)
	assert.equal((await json('/training')).checkpoints.length, 0)
	const reference = await live()
	process.stdout.write('Reference delivery verified. Collecting fresh expert data and training…\n')
	const dataset = await json('/dataset/expert', { seeds: Array.from({ length: 20 }, (_, i) => i) })
	assert.equal(dataset.eligible_train, 20)
	const request = { epochs: 120, correction_rounds: 3, random_seed: 7, budget_seconds: 180 }
	const job = await json('/training/jobs', request)
	const completed = await until(
		() => json(`/training/jobs/${job.job_id}`),
		(item) => ['completed', 'failed', 'cancelled'].includes(item.state),
	)
	assert.equal(completed.state, 'completed', completed.message)
	await until(
		() => json('/training'),
		(item) => !item.active_job,
	)
	const learned = await live(completed.selected_checkpoint)
	const cancellation = []
	for (let cycle = 0; cycle < 2; cycle++) {
		const running = await json('/training/jobs', {
			epochs: 300,
			correction_rounds: 3,
			budget_seconds: 180,
		})
		const duplicate = await fetch(`${api}/training/jobs`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{}',
		})
		assert.equal(duplicate.status, 409)
		await json(`/training/jobs/${running.job_id}/cancel`, {})
		const ended = await until(
			() => json(`/training/jobs/${running.job_id}`),
			(item) => item.state === 'cancelled',
		)
		await until(
			() => json('/training'),
			(item) => !item.active_job,
		)
		cancellation.push({ state: ended.state, concurrent_job_status: duplicate.status })
	}
	const detail = await json(`/training/checkpoints/${completed.selected_checkpoint}`)
	const report = {
		empty_artifact_start: true,
		frontend_proxy_health: true,
		reference,
		request,
		training: {
			job_id: job.job_id,
			checkpoint: completed.selected_checkpoint,
			elapsed_seconds: completed.elapsed_seconds,
			peak_worker_rss_mb: completed.peak_worker_rss_mb,
			validation: detail.checkpoint.evaluation,
		},
		learned,
		cancellation,
		runtime,
	}
	await mkdir(output, { recursive: true })
	await writeFile(resolve(output, 'fresh-learning.json'), `${JSON.stringify(report, null, 2)}\n`)
	process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} finally {
	for (const service of services) service.kill('SIGTERM')
	await Promise.all(
		services.map((service) =>
			service.exitCode !== null
				? undefined
				: new Promise((resolve) => service.once('exit', resolve)),
		),
	)
	await mkdir(output, { recursive: true })
	await writeFile(resolve(runtime, 'services.log'), logs.join(''))
}
