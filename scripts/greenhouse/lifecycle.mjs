import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const runner = fileURLToPath(new URL('./dev.mjs', import.meta.url))
const reportDir = new URL('../../docs/greenhouse-demo/phase1/', import.meta.url)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function listen(port) {
	const server = createServer()
	await new Promise((resolve, reject) => {
		server.once('error', reject)
		server.listen(port, '127.0.0.1', resolve)
	})
	return server
}

async function portIsFree(port) {
	const server = await listen(port)
	await new Promise((resolve) => server.close(resolve))
}

function start() {
	const child = spawn(process.execPath, [runner], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
	let log = ''
	for (const stream of [child.stdout, child.stderr])
		stream.on('data', (chunk) => {
			log = (log + chunk).slice(-64000)
		})
	return { child, log: () => log }
}

async function waitFor(url, child) {
	const until = Date.now() + 20000
	while (Date.now() < until) {
		if (child.exitCode !== null) throw new Error('Development command exited before startup')
		try {
			if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return
		} catch {}
		await delay(100)
	}
	throw new Error(`Startup timed out: ${url}`)
}

await portIsFree(8001)
await portIsFree(8086)
const occupied = await listen(8001)
const conflict = start()
const [conflictCode] = await once(conflict.child, 'exit')
await new Promise((resolve) => occupied.close(resolve))
assert.equal(conflictCode, 1)
assert.match(conflict.log(), /Port 8001 is in use/)
await portIsFree(8086)

const cycles = []
for (let index = 0; index < 2; index++) {
	const run = start()
	const exit = once(run.child, 'exit')
	try {
		await waitFor('http://127.0.0.1:8001/api/v1/greenhouse/health', run.child)
		await waitFor('http://127.0.0.1:8086/', run.child)
		run.child.kill('SIGINT')
		const [code] = await Promise.race([
			exit,
			delay(8000).then(() => {
				throw new Error('Shutdown timed out')
			}),
		])
		assert.equal(code, 0)
		await portIsFree(8001)
		await portIsFree(8086)
		cycles.push({ startup: true, sigint_exit_code: code, both_ports_released: true })
	} finally {
		if (run.child.exitCode === null) run.child.kill('SIGTERM')
	}
}
await mkdir(reportDir, { recursive: true })
const report = { port_conflict_rejected_without_starting_frontend: true, cycles }
await writeFile(new URL('lifecycle.json', reportDir), `${JSON.stringify(report, null, 2)}\n`)
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
