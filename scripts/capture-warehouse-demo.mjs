#!/usr/bin/env node
// Capture four current WebGPU views, a README GIF and a short square MP4.
// Start pnpm -C apps/warehouse-demo dev, then run this script from the repository root.
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '../apps/warehouse-demo/node_modules/@playwright/test/index.mjs'

const root = resolve(import.meta.dirname, '..')
const url = process.env.WAREHOUSE_URL ?? 'http://127.0.0.1:8084'
const screenshots = resolve(root, 'apps/warehouse-demo/screenshots')
const media = resolve(root, 'apps/warehouse-demo/media')
const videoOnly = process.argv.includes('--video-only')
await mkdir(resolve(root, '.temp'), { recursive: true })
const temporary = await mkdtemp(resolve(root, '.temp/warehouse-capture-'))
const frames = resolve(temporary, 'frames')
await mkdir(frames)
await mkdir(screenshots, { recursive: true })
await mkdir(media, { recursive: true })
function ffmpeg(args) {
	const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
		cwd: root,
		stdio: 'inherit',
	})
	if (result.error) throw result.error
	if (result.status !== 0) throw Error(`ffmpeg exited with ${result.status}`)
}
let browser
const errors = []
try {
	browser = await chromium.launch({ channel: 'chrome', headless: true })
	const page = await browser.newPage({
		viewport: { width: 1080, height: 1080 },
		deviceScaleFactor: 1,
		colorScheme: 'dark',
	})
	page.on('pageerror', (error) => errors.push(error.message))
	await page.goto(url)
	await expect(page.getByTestId('renderer-status')).toContainText('WEBGPU ACTIVE')
	await expect(page.getByRole('button', { name: 'Start delivery' })).toBeEnabled()
	await page.evaluate(() => document.fonts.ready)
	const shot = async (name) => {
		await page.waitForTimeout(600)
		await page.screenshot({ path: resolve(temporary, `${name}.png`) })
	}
	if (!videoOnly) {
		await shot('overview')
		await page.getByRole('button', { name: 'Start delivery' }).click()
		await page.getByTestId('stage').filter({ hasText: 'Lifting cargo' }).waitFor({ timeout: 30000 })
		await page.getByRole('button', { name: 'Pause' }).click()
		await page.getByRole('button', { name: 'Dock', exact: true }).click()
		await shot('dock-pickup')
		await page.getByRole('button', { name: 'Resume' }).click()
		await page.getByTestId('stage').filter({ hasText: 'Driving to bay' }).waitFor({ timeout: 120000 })
		await page.getByRole('button', { name: 'Pause' }).click()
		await page.getByRole('button', { name: 'Follow forklift' }).click()
		await shot('follow-forklift')
		await page.getByRole('button', { name: 'Resume' }).click()
		await page.getByTestId('stage').filter({ hasText: 'Lowering cargo' }).waitFor({ timeout: 120000 })
		await page.getByRole('button', { name: 'Pause' }).click()
		await page.getByRole('button', { name: 'Rack', exact: true }).click()
		await shot('rack-placement')
	}

	// The video uses a fresh, uninterrupted seed-42 run and only public controls.
	if (!videoOnly) await page.getByRole('button', { name: 'Restart same seed' }).click()
	await page.getByRole('button', { name: 'Overview' }).click()
	await page.getByLabel('Playback speed').selectOption('8')
	await page.getByRole('button', { name: 'Start delivery' }).click()
	let total = 0
	for (; total < 90; total++) {
		if (total === 12) await page.getByRole('button', { name: 'Dock', exact: true }).click()
		if (total === 24) await page.getByRole('button', { name: 'Follow forklift' }).click()
		if (total === 36) await page.getByRole('button', { name: 'Rack', exact: true }).click()
		if (total === 48) await page.getByRole('button', { name: 'Overview' }).click()
		await page.screenshot({ path: resolve(frames, `frame-${String(total).padStart(4, '0')}.png`) })
		if ((await page.getByTestId('run-status').textContent()) === 'Delivery complete') {
			total++
			break
		}
		await page.waitForTimeout(650)
	}
	if ((await page.getByTestId('run-status').textContent()) !== 'Delivery complete')
		throw Error('The recorded predictable shipment did not complete')
	if (errors.length) throw Error(errors.join('\n'))
	const input = resolve(frames, 'frame-%04d.png')
	const stagedMp4 = resolve(temporary, 'x-preview.mp4')
	const stagedGif = resolve(temporary, 'preview.gif')
	const palette = resolve(temporary, 'palette.png')
	ffmpeg(['-framerate', '3', '-i', input, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '22', '-movflags', '+faststart', stagedMp4])
	ffmpeg(['-framerate', '3', '-i', input, '-vf', 'fps=3,scale=640:-2:flags=lanczos,palettegen', '-frames:v', '1', palette])
	ffmpeg(['-framerate', '3', '-i', input, '-i', palette, '-filter_complex', '[0:v]fps=3,scale=640:-2:flags=lanczos[x];[x][1:v]paletteuse', '-loop', '0', stagedGif])
	if (!videoOnly)
		for (const name of ['overview', 'dock-pickup', 'follow-forklift', 'rack-placement'])
			await copyFile(resolve(temporary, `${name}.png`), resolve(screenshots, `${name}.png`))
	await rename(stagedMp4, resolve(media, 'x-preview.mp4'))
	await rename(stagedGif, resolve(media, 'preview.gif'))
	process.stdout.write(`Captured ${videoOnly ? 'video only' : 'four views and video'}, ${total} frames, and a complete seed-42 run.\n`)
} finally {
	await browser?.close()
	await rm(temporary, { recursive: true, force: true })
}
