import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const windows = process.platform === 'win32'
const pnpm = windows ? 'pnpm.cmd' : 'pnpm'
const children = []
let stopping = false
let exitCode = 0

async function checkPort(port) {
	await new Promise((resolve, reject) => {
		const server = createServer()
		server.once('error', (error) =>
			reject(
				new Error(
					error.code === 'EADDRINUSE'
						? `Port ${port} is in use. Stop the existing service before starting Greenhouse Caretaker.`
						: `Cannot bind port ${port}: ${error.message}`,
				),
			),
		)
		server.listen(port, '127.0.0.1', () => server.close(resolve))
	})
}

function signal(child, name) {
	if (!child.pid) return
	try {
		if (windows) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'])
		else process.kill(-child.pid, name)
	} catch (error) {
		if (error.code !== 'ESRCH') process.stderr.write(`${error.message}\n`)
	}
}

function stop(code) {
	if (stopping) return
	stopping = true
	exitCode = code
	process.exitCode = code
	process.stdout.write('\n[greenhouse] Stopping frontend and Python server…\n')
	for (const child of children) signal(child, 'SIGTERM')
	const timer = setTimeout(() => {
		for (const child of children) signal(child, 'SIGKILL')
	}, 5000)
	timer.unref()
	Promise.all(
		children.map((child) =>
			child.exitCode !== null || child.signalCode !== null || !child.pid
				? Promise.resolve()
				: new Promise((resolve) => child.once('exit', resolve)),
		),
	).then(() => {
		clearTimeout(timer)
		process.exitCode = exitCode
	})
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
try {
	await checkPort(8001)
	await checkPort(8086)
	for (const [name, directory] of [
		['server', 'apps/greenhouse-server'],
		['web', 'apps/greenhouse-demo'],
	]) {
		const child = spawn(pnpm, ['-C', directory, 'dev'], {
			cwd: root,
			detached: !windows,
			stdio: ['ignore', 'pipe', 'pipe'],
		})
		children.push(child)
		for (const stream of [child.stdout, child.stderr]) {
			createInterface({ input: stream }).on('line', (line) =>
				process.stdout.write(`[${name}] ${line}\n`),
			)
		}
		child.once('error', (error) => {
			process.stderr.write(`[${name}] ${error.message}\n`)
			stop(1)
		})
		child.once('exit', (code, sig) => {
			if (!stopping) {
				process.stderr.write(`[${name}] exited (${code ?? sig}).\n`)
				stop(code || 1)
			}
		})
	}
	process.stdout.write(
		'[greenhouse] Browser http://127.0.0.1:8086/ · API http://127.0.0.1:8001/docs\n',
	)
} catch (error) {
	process.stderr.write(`[greenhouse] ${error.message}\n`)
	process.exitCode = 1
}
