#!/usr/bin/env node
// Captures all three apps sequentially, then atomically replaces the README GIF.
// Run from any directory: node scripts/generate-readme-gif.mjs [output.gif]
import { spawn, spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { chromium, expect } from '../apps/slam-demo/node_modules/@playwright/test/index.mjs'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, process.argv[2] ?? 'docs/readme-header.gif')
const count = Number(process.env.E2E_FRAME_COUNT ?? 8)
const frameMs = Number(process.env.E2E_FRAME_MS ?? 900)
const width = Number(process.env.WIDTH ?? 1200)
const fps = Number(process.env.FRAMERATE ?? 1000 / frameMs)
if (
	!Number.isInteger(count) ||
	count < 4 ||
	count > 60 ||
	!Number.isFinite(frameMs) ||
	frameMs < 100 ||
	!Number.isInteger(width) ||
	width < 320 ||
	width > 2560 ||
	!Number.isFinite(fps) ||
	fps <= 0 ||
	fps > 30
) {
	throw Error('Use 4–60 frames per app, >=100 ms between frames, 320–2560 px width, and 0–30 fps.')
}
function run(command, args, options = {}) {
	const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options })
	if (result.error) throw result.error
	if (result.status !== 0) throw Error(`${command} exited with ${result.status}`)
}
run('ffmpeg', ['-version'], { stdio: 'ignore' })
await mkdir(resolve(root, '.temp'), { recursive: true })
await mkdir(dirname(output), { recursive: true })
const temporary = await mkdtemp(resolve(root, '.temp/readme-header-'))
const frames = resolve(temporary, 'frames')
await mkdir(frames)
const framePath = (index) => resolve(frames, `frame-${String(index).padStart(4, '0')}.png`)

async function captureApp(app, port, capture) {
	const cwd = resolve(root, 'apps', app)
	process.stdout.write(`Building and capturing ${app}…\n`)
	run('pnpm', ['build'], { cwd })
	const server = spawn(
		process.execPath,
		[
			resolve(cwd, 'node_modules/vite/bin/vite.js'),
			'preview',
			'--host',
			'127.0.0.1',
			'--port',
			String(port),
			'--strictPort',
		],
		{ cwd, stdio: 'inherit' },
	)
	const closed = new Promise((resolve) => server.once('exit', resolve))
	let serverError
	server.on('error', (error) => {
		serverError = error
	})
	let browser
	try {
		const url = `http://127.0.0.1:${port}`
		const deadline = Date.now() + 30000
		while (true) {
			if (serverError) throw serverError
			if (server.exitCode !== null) throw Error(`${app} preview failed to start`)
			try {
				if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) break
			} catch {}
			if (Date.now() > deadline) throw Error(`${app} preview timed out`)
			await new Promise((resolve) => setTimeout(resolve, 200))
		}
		browser = await chromium.launch({
			channel: process.env.BROWSER_CHANNEL ?? 'chrome',
			headless: true,
			args: [
				'--enable-unsafe-webgpu',
				...(process.platform === 'darwin' ? ['--use-angle=metal'] : []),
			],
		})
		const page = await browser.newPage({
			viewport: { width: 1280, height: 720 },
			deviceScaleFactor: 1,
			colorScheme: 'dark',
		})
		const errors = []
		page.on('pageerror', (error) => errors.push(error.message))
		await page.goto(url)
		await page.locator('canvas').first().waitFor()
		await page.evaluate(() => document.fonts.ready)
		await capture(page)
		if (errors.length) throw Error(`${app}: ${errors.join('\n')}`)
	} finally {
		await browser?.close()
		server.kill('SIGTERM')
		await closed
	}
}

try {
	process.stdout.write('Capturing robot simulator…\n')
	run(
		'pnpm',
		[
			'-C',
			'apps/simulator',
			'exec',
			'playwright',
			'test',
			'--config',
			resolve(root, 'apps/simulator/screenshots/playwright.config.ts'),
			'--project',
			'chromium',
		],
		{
			env: {
				...process.env,
				E2E_FRAMES_DIR: frames,
				E2E_FRAME_COUNT: String(count),
				E2E_FRAME_MS: String(frameMs),
			},
		},
	)
	await captureApp('drone-mission-planner', 4194, async (page) => {
		await expect(page.getByRole('button', { name: 'Arm', exact: true })).toBeEnabled()
		await page.getByRole('button', { name: 'Arm', exact: true }).click()
		await page.getByRole('button', { name: 'Start', exact: true }).click()
		await page.waitForTimeout(2500)
		for (let i = 0; i < count; i++) {
			if (i === Math.floor(count / 2)) {
				await page.getByRole('button', { name: 'Chase camera', exact: true }).click()
				await page.waitForTimeout(1000)
			}
			await page.waitForTimeout(frameMs)
			await page.screenshot({ path: framePath(count + i) })
		}
	})
	await captureApp('slam-demo', 4195, async (page) => {
		await expect(page.getByRole('button', { name: 'Run inspection', exact: true })).toBeEnabled()
		await page.getByLabel('Sensor timing').selectOption('lockstep')
		await page.getByRole('button', { name: 'Run inspection', exact: true }).click()
		await expect
			.poll(
				async () =>
					Number(
						(await page.getByTestId('sensor-frame').textContent()).match(/Pair\s+(\d+)/)?.[1] ?? 0,
					),
				{ timeout: 30000 },
			)
			.toBeGreaterThan(20)
		const views = ['Overview', 'Follow robot', 'Robot eye', 'Workbench']
		let lastView
		for (let i = 0; i < count; i++) {
			const view = views[Math.floor((i * views.length) / count)]
			if (view !== lastView) {
				const button = page.getByRole('button', { name: view, exact: true })
				await button.click()
				await expect(button).toHaveAttribute('aria-pressed', 'true')
				await page.waitForTimeout(1200)
				lastView = view
			}
			await page.waitForTimeout(frameMs)
			await page.screenshot({ path: framePath(count * 2 + i) })
		}
	})
	if ((await readdir(frames)).filter((name) => name.endsWith('.png')).length !== count * 3)
		throw Error('Incomplete project capture')
	const palette = resolve(temporary, 'palette.png')
	const staged = resolve(temporary, 'header.gif')
	const input = [
		'-hide_banner',
		'-loglevel',
		'error',
		'-y',
		'-framerate',
		String(fps),
		'-i',
		resolve(frames, 'frame-%04d.png'),
	]
	run('ffmpeg', [
		...input,
		'-vf',
		`scale=${width}:-2:flags=lanczos,palettegen=stats_mode=full`,
		'-frames:v',
		'1',
		palette,
	])
	run('ffmpeg', [
		...input,
		'-i',
		palette,
		'-filter_complex',
		`[0:v]scale=${width}:-2:flags=lanczos[x];[x][1:v]paletteuse=dither=sierra2_4a`,
		'-loop',
		'0',
		staged,
	])
	await rename(staged, output)
	await writeFile(
		`${output.replace(/\.gif$/i, '')}.json`,
		`${JSON.stringify(
			{
				width,
				frames: count * 3,
				fps,
				projects: ['simulator', 'drone-mission-planner', 'slam-demo'].map((name, i) => ({
					name,
					firstFrame: i * count,
					frames: count,
				})),
			},
			null,
			2,
		)}\n`,
	)
	process.stdout.write(`Wrote ${output}: ${count * 3} frames across all three projects.\n`)
} finally {
	await rm(temporary, { recursive: true, force: true })
}
