import { mkdir, writeFile } from 'node:fs/promises'
import { cpus, platform, release, totalmem } from 'node:os'
import { chromium } from '../../apps/warehouse-demo/node_modules/@playwright/test/index.mjs'

const out = 'docs/warehouse-demo/phase3'
await mkdir(out, { recursive: true })
const quick = process.argv.includes('--quick')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const report = {
	capturedAt: new Date().toISOString(),
	url: process.env.WAREHOUSE_URL || 'http://127.0.0.1:8084',
	browser: browser.version(),
	hardware: cpus()[0].model,
	memoryGB: Math.round(totalmem() / 1024 ** 3),
	os: `${platform()} ${release()}`,
	viewport: { width: 1440, height: 1000 },
	views: {},
	errors: [],
}
try {
	const page = await browser.newPage({ viewport: report.viewport })
	page.on('pageerror', (error) => report.errors.push(error.message))
	const started = Date.now()
	await page.goto(report.url)
	await page.getByRole('button', { name: 'Start delivery' }).waitFor()
	await page.waitForFunction(() => !document.querySelector('.renderer-overlay'), { timeout: 30000 })
	report.interactiveLoadMs = Date.now() - started
	report.canvas = await page.evaluate(() => {
		const canvas = document.querySelector('canvas')
		return { width: canvas.width, height: canvas.height, dpr: window.devicePixelRatio }
	})
	report.backend = await page.getByTestId('renderer-status').textContent()
	report.gpu = await page.evaluate(async () => {
		const adapter = await navigator.gpu?.requestAdapter()
		return adapter
			? {
					vendor: adapter.info.vendor,
					architecture: adapter.info.architecture,
					device: adapter.info.device,
					description: adapter.info.description,
				}
			: null
	})
	const capture = async (name) => {
		await page.screenshot({ path: `${out}/${name}.png` })
	}
	const measure = async (name) => {
		await page.evaluate(() => {
			window.__warehouseRenderMetrics.frameMs = []
		})
		await page.waitForTimeout(8000)
		const metrics = await page.evaluate(() => window.__warehouseRenderMetrics)
		const frames = metrics.frameMs.slice(20).sort((a, b) => a - b)
		report.views[name] = {
			backend: metrics.backend,
			calls: metrics.calls,
			triangles: metrics.triangles,
			frames: frames.length,
			medianMs: frames[Math.floor(frames.length * 0.5)],
			p95Ms: frames[Math.floor(frames.length * 0.95)],
			fps: 1000 / (frames.reduce((sum, v) => sum + v, 0) / frames.length),
		}
	}
	await page.waitForTimeout(1500)
	if (!quick) await measure('overview')
	await capture('overview')
	if (quick) {
		for (const [button, name] of [
			['Dock', 'dock-pickup'],
			['Rack', 'rack-placement'],
			['Follow forklift', 'follow'],
		]) {
			await page.getByRole('button', { name: button, exact: button !== 'Follow forklift' }).click()
			await page.waitForTimeout(1000)
			await capture(name)
		}
	} else {
		await page.getByRole('button', { name: 'Dock', exact: true }).click()
		await page.getByRole('button', { name: 'Start delivery' }).click()
		await page.getByTestId('stage').filter({ hasText: 'Lifting cargo' }).waitFor({ timeout: 15000 })
		await page.getByRole('button', { name: 'Pause', exact: false }).click()
		await capture('dock-pickup')
		await page.getByRole('button', { name: 'Follow forklift' }).click()
		await page.getByRole('button', { name: 'Resume' }).click()
		await measure('moving-follow')
		await capture('follow')
		await page.getByRole('button', { name: 'Pause' }).click()
		await page.getByRole('button', { name: 'Rack', exact: true }).click()
		await page.getByLabel('Playback speed').selectOption('8')
		await page.getByRole('button', { name: 'Resume' }).click()
		await page
			.getByTestId('stage')
			.filter({ hasText: 'Driving to bay' })
			.waitFor({ timeout: 15000 })
		await page.getByLabel('Playback speed').selectOption('1')
		await page
			.getByTestId('stage')
			.filter({ hasText: 'Lowering cargo' })
			.waitFor({ timeout: 30000 })
		await page.getByRole('button', { name: 'Pause' }).click()
		await capture('rack-placement')
		await page.getByLabel('Playback speed').selectOption('8')
		await page.getByRole('button', { name: 'Resume' }).click()
		await page
			.getByTestId('run-status')
			.filter({ hasText: 'Delivery complete' })
			.waitFor({ timeout: 90000 })
		await page.getByRole('button', { name: 'Overview' }).click()
		await page.waitForTimeout(1000)
		await capture('complete')
		report.complete = await page.getByTestId('run-status').textContent()
		report.simulatedTime = await page.getByTestId('elapsed').textContent()
	}
	report.resources = await page.evaluate(() =>
		performance
			.getEntriesByType('resource')
			.filter((r) => /\.glb|\.js|\.css/.test(r.name))
			.map((r) => ({
				name: new URL(r.name).pathname,
				bytes: r.encodedBodySize,
				durationMs: r.duration,
			})),
	)
	if (!quick) await writeFile(`${out}/browser-review.json`, `${JSON.stringify(report, null, 2)}\n`)
	process.stdout.write(`${JSON.stringify({ ...report, resources: undefined }, null, 2)}\n`)
	if (report.errors.length) throw new Error(report.errors.join('\n'))
} finally {
	await browser.close()
}
