import { mkdir } from 'node:fs/promises'
import { chromium } from '../apps/slam-demo/node_modules/@playwright/test/index.mjs'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
	const page = await browser.newPage({
		viewport: { width: 1440, height: 900 },
		deviceScaleFactor: 1,
	})
	const errors = []
	page.on('pageerror', (error) => errors.push(error.message))
	await page.goto(process.env.SLAM_URL ?? 'http://127.0.0.1:8082')
	await page.locator('canvas').waitFor()
	await page.waitForTimeout(1200)
	await mkdir('docs/slam-demo/phase1', { recursive: true })
	await page.screenshot({ path: 'docs/slam-demo/phase1/desktop.png' })
	await page.getByRole('button', { name: 'Run inspection', exact: true }).click()
	await page.waitForTimeout(7000)
	await page.getByRole('button', { name: 'Pause', exact: true }).click()
	await page.screenshot({ path: 'docs/slam-demo/phase1/running.png' })
	await page.getByRole('button', { name: 'Reset simulation' }).click()
	await page.setViewportSize({ width: 390, height: 844 })
	await page.waitForTimeout(500)
	await page.screenshot({ path: 'docs/slam-demo/phase1/mobile.png', fullPage: true })
	if (errors.length) throw Error(errors.join('\n'))
	process.stdout.write('Saved desktop, running and mobile Phase 1 screenshots.\n')
} finally {
	await browser.close()
}
