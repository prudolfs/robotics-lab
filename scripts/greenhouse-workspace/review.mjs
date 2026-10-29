import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '../../apps/greenhouse-demo/node_modules/@playwright/test/index.mjs'

const output = new URL('../../docs/greenhouse-demo/updates/workspace/', import.meta.url)
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
	const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
	const errors = []
	page.on('pageerror', (error) => errors.push(String(error)))
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text())
	})
	await page.goto(process.env.GREENHOUSE_REVIEW_URL ?? 'http://127.0.0.1:8086/')
	await page.getByTestId('renderer-status').filter({ hasText: 'WebGPU active' }).waitFor()
	await page
		.getByTestId('connection-status')
		.filter({ hasText: 'Connected' })
		.waitFor({ state: 'attached' })
	await page.screenshot({ path: new URL('watch.png', output).pathname })
	await page.getByRole('tab', { name: 'Train', exact: true }).click()
	await page
		.getByLabel('Saved checkpoint', { exact: true })
		.filter({ hasText: /BC|PPO/ })
		.waitFor()
	// Let the selected detail and responsive chart settle before taking the reference image.
	await page.waitForTimeout(500)
	await page.screenshot({ path: new URL('train.png', output).pathname })
	await page.getByRole('button', { name: 'Search commands', exact: true }).click()
	await page.getByRole('dialog', { name: 'Greenhouse commands' }).waitFor()
	await page.screenshot({ path: new URL('commands.png', output).pathname })
	await page.keyboard.press('Escape')
	await page.setViewportSize({ width: 390, height: 844 })
	await page.waitForTimeout(400)
	await page.screenshot({ path: new URL('mobile.png', output).pathname })
	const mobile = await page.evaluate(() => ({
		height: innerHeight,
		width: innerWidth,
		scrollHeight: document.documentElement.scrollHeight,
		scrollWidth: document.documentElement.scrollWidth,
	}))
	const result = { errors, mobile }
	await writeFile(new URL('review.json', output), `${JSON.stringify(result, null, 2)}\n`)
	process.stdout.write(`${JSON.stringify(result)}\n`)
	if (errors.length) process.exitCode = 1
} finally {
	await browser.close()
}
