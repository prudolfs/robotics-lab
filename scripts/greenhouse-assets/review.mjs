import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '../../apps/greenhouse-demo/node_modules/@playwright/test/index.mjs'

const output = new URL('../../docs/greenhouse-demo/phase3/', import.meta.url)
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 })
const errors = []
const assets = []
const snapshots = []
page.on('pageerror', (error) => errors.push(String(error)))
page.on('console', (message) => {
	if (message.type() === 'error') errors.push(message.text())
})
page.on('response', (response) => {
	if (response.url().endsWith('.glb'))
		assets.push({ url: response.url(), status: response.status() })
})
page.on('websocket', (socket) =>
	socket.on('framereceived', ({ payload }) => {
		const message = JSON.parse(String(payload))
		if (message.kind === 'snapshot') snapshots.push(message)
	}),
)
const endpoint = process.env.GREENHOUSE_REVIEW_URL ?? 'http://127.0.0.1:8086'
const report = { endpoint, errors, assets }
const save = (name) => page.screenshot({ path: new URL(`${name}.png`, output).pathname })
try {
	await page.addInitScript(() => {
		window.__soundCues = []
		const original = AudioContext.prototype.createOscillator
		AudioContext.prototype.createOscillator = function (...args) {
			const oscillator = original.apply(this, args)
			const start = oscillator.start.bind(oscillator)
			oscillator.start = (...parameters) => {
				window.__soundCues.push({ frequency: oscillator.frequency.value, state: this.state })
				return start(...parameters)
			}
			return oscillator
		}
	})
	const started = Date.now()
	await page.goto(endpoint)
	await page.getByTestId('renderer-status').filter({ hasText: 'WebGPU active' }).waitFor()
	await page.waitForFunction(() => !!window.__greenhouseReview?.pose)
	report.coldLoadMs = Date.now() - started
	report.browser = browser.version()
	report.gpu = await page.evaluate(async () => {
		const adapter = await navigator.gpu.requestAdapter()
		return {
			vendor: adapter.info.vendor,
			architecture: adapter.info.architecture,
			device: adapter.info.device,
			description: adapter.info.description,
		}
	})
	await page.waitForTimeout(1200)
	await save('overview')
	assert.equal(assets.length, 6)
	assert.ok(assets.every((asset) => asset.status === 200))
	assert.equal(
		await page.getByRole('button', { name: 'Sound off', exact: true }).getAttribute('aria-pressed'),
		'false',
	)
	await page.getByRole('button', { name: 'Sound off', exact: true }).click()
	await page.getByRole('button', { name: 'Sound on', exact: true }).waitFor()
	await page.getByRole('button', { name: 'Start collection', exact: true }).click()
	await page.waitForFunction(
		() => window.__greenhouseReview?.pose?.holding && window.__greenhouseReview.pose.lift > 0.2,
		null,
		{ timeout: 18000 },
	)
	await page.getByRole('button', { name: 'Pause collection', exact: true }).click()
	await page.getByRole('button', { name: 'Follow', exact: true }).click()
	await page.waitForTimeout(500)
	await save('carrying-follow')
	report.carrying = await page.evaluate(() => window.__greenhouseReview.pose)
	await page.getByRole('button', { name: 'Robot eye', exact: true }).click()
	await page.waitForTimeout(250)
	await save('robot-eye')
	await page.getByRole('button', { name: 'Resume collection', exact: true }).click()
	await page
		.getByTestId('run-status')
		.filter({ hasText: 'Delivery complete' })
		.waitFor({ timeout: 25000 })
	await page.getByRole('button', { name: 'Follow', exact: true }).click()
	await page.waitForTimeout(600)
	await save('delivery-detail')
	await page.getByRole('button', { name: 'Overview', exact: true }).click()
	await page.waitForTimeout(250)
	await save('delivery-overview')
	report.final = snapshots.at(-1)
	report.soundCues = await page.evaluate(() => window.__soundCues)
	assert.equal(report.soundCues.length, 5)
	assert.ok(report.soundCues.every((cue) => cue.state === 'running'))
	assert.equal(report.final.scene.collisions, 0)
	assert.equal(report.final.scene.invalid_actions, 0)
	assert.equal(report.final.scene.delivered, true)
	await page.evaluate(() => {
		window.__greenhouseReview.frameMs = []
	})
	await page.waitForFunction(() => window.__greenhouseReview.frameMs.length >= 180)
	report.performance = await page.evaluate(() => window.__greenhouseReview)
	const sorted = [...report.performance.frameMs].sort((a, b) => a - b)
	report.performance.p50FrameMs = sorted[Math.floor(sorted.length * 0.5)]
	report.performance.p95FrameMs = sorted[Math.floor(sorted.length * 0.95)]
	delete report.performance.frameMs
	report.resources = [report.performance.memory]
	for (let index = 0; index < 5; index++) {
		await page.getByRole('button', { name: 'New seed', exact: true }).click()
		await page.waitForFunction(
			(generation) =>
				document.querySelector('[data-testid="session-generation"]').textContent ===
				String(generation),
			index + 1,
		)
		await page.waitForTimeout(150)
		report.resources.push(await page.evaluate(() => window.__greenhouseReview.memory))
	}
	assert.ok(
		report.resources.every(
			(memory) =>
				memory.geometries === report.resources[0].geometries &&
				memory.textures === report.resources[0].textures,
		),
		'GPU geometry/texture allocation remains bounded across resets',
	)
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await page.waitForTimeout(100)
	report.reducedMotion = await page.evaluate(() => window.__greenhouseReview.pose)
	assert.equal(report.reducedMotion.headPan, 0)
	assert.equal(report.reducedMotion.headPitch, 0)
	assert.deepEqual(report.reducedMotion.lids, [false, false])
	await page.setViewportSize({ width: 390, height: 844 })
	await page.waitForTimeout(300)
	await page.screenshot({ path: new URL('mobile.png', output).pathname, fullPage: true })
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
	assert.ok(report.performance.drawCalls > 0 && report.performance.drawCalls <= 200)
	assert.ok(report.performance.p95FrameMs <= 33.4)
	assert.deepEqual(errors, [])
	await writeFile(new URL('browser-review.json', output), `${JSON.stringify(report, null, 2)}\n`)
	process.stdout.write(
		`${JSON.stringify(
			{
				coldLoadMs: report.coldLoadMs,
				performance: report.performance,
				errors,
				assetCount: assets.length,
			},
			null,
			2,
		)}\n`,
	)
} finally {
	await browser.close()
}
