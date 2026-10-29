import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '../../apps/greenhouse-demo/node_modules/@playwright/test/index.mjs'

const output = new URL('../../docs/greenhouse-demo/phase4/', import.meta.url)
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 })
const endpoint = process.env.GREENHOUSE_REVIEW_URL ?? 'http://127.0.0.1:8086'
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))
page.on('console', (message) => {
	if (message.type() === 'error') errors.push(message.text())
})
const prefix = '/api/v1/greenhouse'
try {
	await page.goto(endpoint)
	await page.getByTestId('renderer-status').filter({ hasText: 'WebGPU active' }).waitFor()
	const collection = page.waitForResponse((response) => response.url().endsWith('/dataset/expert'))
	await page.getByRole('button', { name: 'Collect 20 expert demos', exact: true }).click()
	const healthAt = Date.now()
	const health = await page.request.get(`${endpoint}${prefix}/health`)
	assert.equal(health.status(), 200)
	const healthDuringCollectionMs = Date.now() - healthAt
	assert.equal((await collection).status(), 200)
	await page.getByTestId('dataset-message').filter({ hasText: 'Expert set ready' }).waitFor()
	await page
		.getByLabel('Import demonstrations', { exact: false })
		.setInputFiles(new URL('manual-example-v1.json', output).pathname)
	await page.getByTestId('dataset-message').filter({ hasText: 'identical episodes' }).waitFor()
	await page.getByRole('button', { name: 'Validate dataset', exact: true }).click()
	await page
		.getByTestId('dataset-validation')
		.filter({ hasText: 'Ready for the first training run' })
		.waitFor()
	const dataset = await (await page.request.get(`${endpoint}${prefix}/dataset`)).json()
	const validation = await (await page.request.post(`${endpoint}${prefix}/dataset/validate`)).json()
	assert.ok(validation.ready_for_training)
	assert.ok(validation.eligible_train_ids.length >= 20)
	assert.ok(
		dataset.episodes
			.filter((episode) => validation.eligible_train_ids.includes(episode.episode_id))
			.every((episode) => episode.split === 'train' && episode.outcome === 'success'),
	)
	const expert = dataset.episodes.find(
		(episode) => episode.seed === 0 && episode.source === 'scripted_expert',
	)
	assert.ok(expert)
	await page.getByTestId(`episode-${expert.episode_id}`).getByRole('button').click()
	await page.getByRole('region', { name: 'Recorded episode playback' }).waitFor()
	await page.getByLabel('Episode position', { exact: true }).press('End')
	await page.waitForFunction(
		(count) =>
			document
				.querySelector('[data-testid="playback-frame"]')
				.textContent.includes(`Frame ${count} /`),
		expert.steps,
	)
	assert.equal(await page.getByTestId('session-seed').textContent(), '0')
	await page.evaluate(() => window.scrollTo(0, 0))
	await page.screenshot({ path: new URL('expert-playback.png', output).pathname })
	await page.getByRole('region', { name: 'Demonstration library' }).scrollIntoViewIfNeeded()
	await page.screenshot({ path: new URL('dataset-ready.png', output).pathname, fullPage: true })
	await page.getByRole('button', { name: 'Return to live', exact: true }).click()
	await page.getByRole('button', { name: 'Teach manually', exact: true }).click()
	await page.getByRole('group', { name: 'Manual teaching controls' }).waitFor()
	await page.evaluate(() => window.scrollTo(0, 0))
	await page.screenshot({ path: new URL('ready-to-teach.png', output).pathname })
	await page.setViewportSize({ width: 390, height: 844 })
	await page.waitForTimeout(250)
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
	await page.screenshot({ path: new URL('mobile-teaching.png', output).pathname, fullPage: true })
	assert.deepEqual(errors, [])
	const report = {
		endpoint,
		browser: browser.version(),
		healthDuringCollectionMs,
		dataset,
		validation,
		manual_example_provenance:
			'Automated manual keyboard-input fixture from the browser regression suite; not a human-collected demonstration. Excluded from training.',
		errors,
	}
	await writeFile(new URL('dataset-review.json', output), `${JSON.stringify(report, null, 2)}\n`)
	process.stdout.write(
		`${JSON.stringify({ episodes: dataset.episodes.length, eligible: validation.eligible_train_ids.length, steps: dataset.total_steps, healthDuringCollectionMs, errors })}\n`,
	)
} finally {
	await browser.close()
}
