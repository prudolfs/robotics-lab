#!/usr/bin/env node
// Capture a square, active seed-42 reference collection for X.
// Start pnpm dev:greenhouse, then run pnpm video:greenhouse:x.
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '../apps/greenhouse-demo/node_modules/@playwright/test/index.mjs'

const root = resolve(import.meta.dirname, '..')
const url = process.env.GREENHOUSE_URL ?? 'http://127.0.0.1:8086'
const media = resolve(root, 'apps/greenhouse-demo/media')
await mkdir(resolve(root, '.temp'), { recursive: true })
await mkdir(media, { recursive: true })
const temporary = await mkdtemp(resolve(root, '.temp/greenhouse-x-'))
let browser
try {
	browser = await chromium.launch({
		channel: 'chrome',
		headless: true,
		args: [
			'--enable-unsafe-webgpu',
			...(process.platform === 'darwin' ? ['--use-angle=metal'] : []),
		],
	})
	const page = await browser.newPage({
		viewport: { width: 1080, height: 1080 },
		deviceScaleFactor: 1,
		colorScheme: 'dark',
	})
	const errors = []
	page.on('pageerror', (error) => errors.push(error.message))
	await page.goto(url)
	await expect(page.getByTestId('renderer-status')).toHaveText('WebGPU active', { timeout: 30000 })
	await expect(page.getByRole('button', { name: 'Start collection', exact: true })).toBeEnabled()
	await page.evaluate(() => document.fonts.ready)
	await page.getByRole('button', { name: 'Start collection', exact: true }).click()
	let total = 0
	let following = false
	const deadline = Date.now() + 90000
	while (Date.now() < deadline) {
		const lift = await page.evaluate(() => window.__greenhouseReview?.pose?.lift ?? 0)
		if (!following && lift > 0.2) {
			await page.getByRole('button', { name: 'Follow', exact: true }).click()
			following = true
		}
		await page.screenshot({
			path: resolve(temporary, `frame-${String(total++).padStart(4, '0')}.png`),
		})
		if ((await page.getByTestId('run-status').textContent()) === 'Delivery complete') break
		if (total % 60 === 0)
			process.stdout.write(
				`Captured ${total} frames, tick ${await page.getByTestId('simulation-tick').textContent()}, ${await page.getByTestId('run-status').textContent()}\n`,
			)
		await page.waitForTimeout(100)
	}
	await expect(page.getByTestId('delivery-count')).toHaveText('1 / 1 delivered')
	await expect(page.getByTestId('run-status')).toHaveText('Delivery complete')
	await expect(page.getByTestId('collisions')).toHaveText('0')
	await expect(page.getByTestId('invalid-actions')).toHaveText('0')
	if (!following) throw Error('Collection did not reach the carrying view')
	if (errors.length) throw Error(errors.join('\n'))
	const staged = resolve(temporary, 'x-preview.mp4')
	const result = spawnSync(
		'ffmpeg',
		[
			'-hide_banner',
			'-loglevel',
			'error',
			'-y',
			'-framerate',
			'6',
			'-i',
			resolve(temporary, 'frame-%04d.png'),
			'-vf',
			'fps=30,format=yuv420p',
			'-c:v',
			'libx264',
			'-crf',
			'22',
			'-movflags',
			'+faststart',
			staged,
		],
		{ stdio: 'inherit' },
	)
	if (result.error) throw result.error
	if (result.status !== 0) throw Error(`ffmpeg exited with ${result.status}`)
	await rename(staged, resolve(media, 'x-preview.mp4'))
	const report = {
		file: 'x-preview.mp4',
		source:
			'Live scripted-reference collection through public controls; overview then follow camera, ending at delivery. Captured frames played at 6 fps.',
		controller: 'scripted_reference',
		seed: 42,
		viewport: { width: 1080, height: 1080 },
		frames: total,
		captureFps: 6,
		outputFps: 30,
		durationSeconds: total / 6,
		delivered: true,
		collisions: 0,
		invalidActions: 0,
		errors,
	}
	await writeFile(resolve(media, 'x-preview.json'), `${JSON.stringify(report, null, 2)}\n`)
	process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} finally {
	await browser?.close()
	await rm(temporary, { recursive: true, force: true })
}
