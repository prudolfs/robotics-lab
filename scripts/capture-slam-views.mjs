#!/usr/bin/env node
// With pnpm dev:slam running: node scripts/capture-slam-views.mjs
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '../apps/slam-demo/node_modules/@playwright/test/index.mjs'

const output = resolve('apps/slam-demo/screenshots')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
	const page = await browser.newPage({
		viewport: { width: 1080, height: 1080 },
		deviceScaleFactor: 1,
	})
	const errors = []
	page.on('pageerror', (error) => errors.push(error.message))
	await page.goto(process.env.SLAM_URL ?? 'http://127.0.0.1:8082')
	await expect(page.getByRole('button', { name: 'Run inspection', exact: true })).toBeEnabled()
	await page.getByLabel('Sensor timing').selectOption('lockstep')
	await page.getByRole('button', { name: 'Run inspection', exact: true }).click()
	await expect
		.poll(
			async () =>
				Number(
					(await page.getByTestId('sensor-frame').textContent()).match(/Pair\s+(\d+)/)?.[1] ?? 0,
				),
			{ timeout: 30000 },
		)
		.toBeGreaterThan(30)
	await page.getByRole('button', { name: 'Pause', exact: true }).click()
	await page.evaluate(() => document.fonts.ready)
	await mkdir(output, { recursive: true })
	for (const [name, filename] of [
		['Overview', 'overview'],
		['Follow robot', 'follow-robot'],
		['Robot eye', 'robot-eye'],
		['Workbench', 'workbench'],
	]) {
		const button = page.getByRole('button', { name, exact: true })
		await button.click()
		await expect(button).toHaveAttribute('aria-pressed', 'true')
		await page.waitForTimeout(1500)
		await page.screenshot({ path: resolve(output, `${filename}.png`) })
		process.stdout.write(`Saved ${filename}.png (1080×1080)\n`)
	}
	if (errors.length) throw Error(errors.join('\n'))
} finally {
	await browser.close()
}
