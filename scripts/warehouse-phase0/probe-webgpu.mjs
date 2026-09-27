import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { chromium } from '../../apps/slam-demo/node_modules/@playwright/test/index.mjs'

const base = new URL('../../docs/warehouse-demo/phase0/', import.meta.url)
const disabled = process.argv.includes('--disable-webgpu')
const browser = await chromium.launch({
	channel: 'chrome',
	headless: true,
	args: ['--enable-unsafe-webgpu'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
if (process.argv.includes('--layout-only')) {
	await page.setViewportSize({ width: 1360, height: 860 })
	await page.goto(
		new URL('../../docs/warehouse-demo/phase0/layout-and-style.svg', import.meta.url).href,
	)
	await page.screenshot({ path: new URL('layout-and-style.png', base).pathname })
	await browser.close()
	process.stdout.write('Captured layout-and-style.png\n')
	process.exit(0)
}
if (disabled) {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true })
	})
}
const pageErrors = []
const pageWarnings = []
const failedResources = []
page.on('pageerror', (error) => pageErrors.push(String(error)))
page.on('console', (message) => {
	if (message.type() === 'error' && !message.text().includes('404 (Not Found)'))
		pageErrors.push(message.text())
	if (message.type() === 'warning') pageWarnings.push(message.text())
})
page.on('response', (response) => {
	if (response.status() >= 400)
		failedResources.push({ status: response.status(), url: response.url() })
})
await page.goto('http://127.0.0.1:8084/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)
const first = await page.getByTestId('backend').textContent()
const modelLoaded = await page.getByTestId('model').textContent()
const gpu = await page.evaluate(async () => {
	const adapter = await navigator.gpu?.requestAdapter()
	return {
		available: !!navigator.gpu,
		adapter: !!adapter,
		features: adapter ? [...adapter.features] : [],
	}
})
const canvasBefore = await page.locator('canvas').count()
if (!disabled) await page.screenshot({ path: new URL('webgpu-probe.png', base).pathname })
const beforeDrag = await page.locator('canvas').screenshot()
await page.mouse.move(780, 410)
await page.mouse.down()
await page.mouse.move(930, 470, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(250)
const afterDrag = await page.locator('canvas').screenshot()
const controlsChangedView =
	createHash('sha256').update(beforeDrag).digest('hex') !==
	createHash('sha256').update(afterDrag).digest('hex')
await page.getByRole('button', { name: 'Toggle canvas' }).click()
const canvasAfterUnmount = await page.locator('canvas').count()
await page.getByRole('button', { name: 'Toggle canvas' }).click()
await page.waitForTimeout(1500)
const second = await page.getByTestId('backend').textContent()
const canvasAfterRemount = await page.locator('canvas').count()
const report = {
	url: page.url(),
	disabled,
	browser: await browser.version(),
	userAgent: await page.evaluate(() => navigator.userAgent),
	gpu,
	first,
	second,
	modelLoaded,
	controlsChangedView,
	canvasBefore,
	canvasAfterUnmount,
	canvasAfterRemount,
	pageErrors,
	pageWarnings,
	failedResources,
}
await writeFile(
	new URL(disabled ? 'webgpu-disabled-probe.json' : 'webgpu-probe.json', base),
	`${JSON.stringify(report, null, 2)}\n`,
)
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
await browser.close()
const expectedBackend = disabled ? 'webgl-fallback' : 'webgpu'
if (
	!first?.includes(expectedBackend) ||
	!second?.includes(expectedBackend) ||
	modelLoaded !== 'GLB loaded: true' ||
	!controlsChangedView ||
	pageErrors.length ||
	failedResources.some((item) => !item.url.endsWith('/favicon.ico'))
)
	process.exitCode = 1
