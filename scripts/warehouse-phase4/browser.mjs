import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '../../apps/warehouse-demo/node_modules/@playwright/test/index.mjs'

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const responses = []
page.on('response', async (response) => {
	if (response.url().includes('/api/laya/'))
		responses.push({ status: response.status(), time: Date.now() })
})
try {
	await page.goto(process.env.WAREHOUSE_URL ?? process.argv[2] ?? 'http://127.0.0.1:8084')
	await page.getByRole('button', { name: 'Start delivery' }).waitFor()
	await page.waitForFunction(() => document.querySelector('.primary-button')?.disabled === false)
	await page.getByLabel('Autonomous control').selectOption('laya')
	await page.getByRole('button', { name: 'Start delivery' }).click()
	await mkdir('docs/warehouse-demo/phase4', { recursive: true })
	const started = Date.now()
	let captured = false
	while (Date.now() - started < 950000) {
		await page.waitForTimeout(1000)
		const status = await page.getByTestId('run-status').textContent()
		const stage = await page.getByTestId('stage').textContent()
		if (!captured && /Lifting|Leaving|Driving to bay/.test(stage ?? '')) {
			await page.getByRole('button', { name: 'Follow forklift' }).click()
			await page.locator('.laya-section summary').click()
			await page.waitForTimeout(800)
			await page.screenshot({ path: 'docs/warehouse-demo/phase4/live-control.png' })
			await page.getByRole('button', { name: 'Overview' }).click()
			await page.locator('.laya-section summary').click()
			captured = true
		}
		if (status === 'Delivery complete' || status === 'Controller paused') break
	}
	await page.getByRole('button', { name: 'Overview' }).click()
	await page.screenshot({ path: 'docs/warehouse-demo/phase4/live-result.png' })
	const report = {
		browser: browser.version(),
		status: await page.getByTestId('run-status').textContent(),
		stage: await page.getByTestId('stage').textContent(),
		elapsed: await page.getByTestId('elapsed').textContent(),
		wallSeconds: (Date.now() - started) / 1000,
		requests: responses.length,
		errors,
		inspector: await page.getByRole('complementary').innerText(),
		backend: await page.getByTestId('renderer-status').textContent(),
	}
	await writeFile(
		'docs/warehouse-demo/phase4/browser-review.json',
		`${JSON.stringify(report, null, 2)}\n`,
	)
	process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
	if (errors.length) process.exitCode = 1
} finally {
	await browser.close()
}
