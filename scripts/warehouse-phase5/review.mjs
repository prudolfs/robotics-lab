import { writeFile } from 'node:fs/promises'
import { chromium } from '../../apps/warehouse-demo/node_modules/@playwright/test/index.mjs'

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
let disconnected = false
let requests = 0
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/api/laya/v1/systemone', async (route) => {
	requests++
	if (disconnected) await route.abort('connectionrefused')
	else await route.continue()
})
try {
	await page.goto('http://127.0.0.1:8084')
	await page.waitForFunction(() => document.querySelector('.primary-button')?.disabled === false)
	await page.getByLabel('Autonomous control').selectOption('laya')
	await page.getByRole('button', { name: 'Start delivery' }).click()
	await page
		.getByTestId('laya-decision')
		.filter({ hasText: /Cargo|cruise|creep|Stop/ })
		.waitFor({ timeout: 15000 })
	await page.waitForTimeout(3000)
	await page.getByRole('button', { name: 'Pause' }).click()
	const manualPauseTime = await page.getByTestId('elapsed').textContent()
	await page.getByRole('button', { name: 'Resume' }).click()
	disconnected = true
	await page
		.getByTestId('run-status')
		.filter({ hasText: 'Controller paused' })
		.waitFor({ timeout: 10000 })
	const originalTime = await page.getByTestId('elapsed').textContent()
	const summary = await page.getByRole('region', { name: 'Run summary' }).innerText()
	const originalRequests = requests
	await page.getByRole('button', { name: 'Replay recorded Laya run' }).click()
	await page.getByLabel('Playback speed').selectOption('8')
	await page.getByRole('button', { name: 'Start playback' }).click()
	await page.getByTestId('run-status').filter({ hasText: 'Playback finished' }).waitFor()
	const replayTime = await page.getByTestId('elapsed').textContent()
	await page.getByRole('region', { name: 'Run summary' }).scrollIntoViewIfNeeded()
	await page.screenshot({ path: 'docs/warehouse-demo/phase5/live-recording.png' })
	const report = {
		browser: browser.version(),
		backend: await page.getByTestId('renderer-status').textContent(),
		manualPauseTime,
		originalTime,
		replayTime,
		originalRequests,
		requestsAfterPlayback: requests,
		summary,
		errors,
	}
	await writeFile(
		'docs/warehouse-demo/phase5/live-review.json',
		`${JSON.stringify(report, null, 2)}\n`,
	)
	process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
	if (originalTime !== replayTime || requests !== originalRequests || errors.length)
		throw new Error('Live replay mismatch')
} finally {
	await browser.close()
}
