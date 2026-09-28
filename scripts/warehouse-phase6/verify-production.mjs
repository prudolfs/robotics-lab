#!/usr/bin/env node
// With the built app preview on :4184, check real WebGPU, fallback messaging and a full delivery.
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, expect } from '../../apps/warehouse-demo/node_modules/@playwright/test/index.mjs'

const url = process.env.WAREHOUSE_URL ?? 'http://127.0.0.1:4184'
const out = 'docs/warehouse-demo/phase6'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const report = { browser: browser.version(), url, errors: [] }
try {
	const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
	page.on('pageerror', (error) => report.errors.push(error.message))
	const began = Date.now()
	await page.goto(url)
	await expect(page.getByRole('button', { name: 'Start delivery' })).toBeEnabled()
	report.readyMs = Date.now() - began
	report.backend = await page.getByTestId('renderer-status').textContent()
	await expect(page.getByTestId('renderer-status')).toContainText('WEBGPU ACTIVE')
	report.gpu = await page.evaluate(async () => {
		const adapter = await navigator.gpu?.requestAdapter()
		return adapter ? { vendor: adapter.info.vendor, architecture: adapter.info.architecture } : null
	})
	await page.evaluate(() => {
		window.__warehouseRenderMetrics.frameMs = []
	})
	await page.waitForTimeout(3000)
	const metrics = await page.evaluate(() => window.__warehouseRenderMetrics)
	const samples = metrics.frameMs.slice(20).sort((a, b) => a - b)
	report.render = {
		backend: metrics.backend,
		geometries: metrics.geometries,
		textures: metrics.textures,
		medianMs: samples[Math.floor(samples.length / 2)],
		p95Ms: samples[Math.floor(samples.length * 0.95)],
	}
	await page.getByLabel('Playback speed').selectOption('8')
	await page.getByRole('button', { name: 'Start delivery' }).click()
	await expect(page.getByTestId('run-status')).toHaveText('Delivery complete', { timeout: 90000 })
	report.complete = {
		status: await page.getByTestId('run-status').textContent(),
		elapsed: await page.getByTestId('elapsed').textContent(),
		summary: await page.getByRole('region', { name: 'Run summary' }).innerText(),
	}
	await page.screenshot({ path: `${out}/production-complete.png` })
	const unsupported = await browser.newPage()
	await unsupported.addInitScript(() => {
		Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true })
	})
	await unsupported.goto(url)
	await expect(unsupported.getByText('WebGPU is unavailable')).toBeVisible()
	await expect(unsupported.getByRole('button', { name: 'Start delivery' })).toBeDisabled()
	report.unsupportedMessage = await unsupported.getByText('WebGPU is unavailable').textContent()
	if (report.errors.length) throw Error(report.errors.join('\n'))
	await writeFile(`${out}/production-review.json`, `${JSON.stringify(report, null, 2)}\n`)
	process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} finally {
	await browser.close()
}
