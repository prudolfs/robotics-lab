import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '../../apps/greenhouse-demo/node_modules/@playwright/test/index.mjs'

const output = new URL('../../docs/greenhouse-demo/phase5/', import.meta.url)
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 })
const endpoint = process.env.GREENHOUSE_REVIEW_URL ?? 'http://127.0.0.1:8086'
const errors = []
const frames = []
page.on('pageerror', (error) => errors.push(String(error)))
page.on('console', (message) => {
	if (message.type() === 'error') errors.push(message.text())
})
page.on('websocket', (socket) =>
	socket.on('framereceived', ({ payload }) => {
		const message = JSON.parse(String(payload))
		if (message.kind === 'snapshot') frames.push(message)
	}),
)
const save = (name, fullPage = false) =>
	page.screenshot({ path: new URL(`${name}.png`, output).pathname, fullPage })
try {
	await page.goto(endpoint)
	await page.getByTestId('renderer-status').filter({ hasText: 'WebGPU active' }).waitFor()
	const catalog = await (await page.request.get(`${endpoint}/api/v1/greenhouse/training`)).json()
	const job = catalog.jobs.find((item) => item.state === 'completed')
	assert.ok(
		job?.selected_checkpoint,
		'Train a policy with the documented helper or UI before reviewing',
	)
	await page.getByLabel('Saved checkpoint', { exact: true }).selectOption(job.selected_checkpoint)
	await page.getByTestId('policy-score').waitFor()
	await save('training-dashboard', true)
	await page.getByRole('button', { name: 'Review validation seed 10000', exact: true }).click()
	await page.getByLabel('Validation position', { exact: true }).press('End')
	await page.waitForTimeout(150)
	await save('validation-playback')
	await page.getByRole('button', { name: 'Return to live', exact: true }).click()
	await page.getByRole('button', { name: 'Use selected checkpoint', exact: true }).click()
	await page.getByText('Learned policy controller.', { exact: false }).waitFor()
	const activation = frames.length
	await page.getByRole('button', { name: 'Start collection', exact: true }).click()
	await page.waitForFunction(
		() => window.__greenhouseReview?.pose?.holding && window.__greenhouseReview.pose.lift > 0.2,
		null,
		{ timeout: 20000 },
	)
	await page.getByRole('button', { name: 'Follow', exact: true }).click()
	await page.waitForTimeout(250)
	await save('live-learned-carrying')
	await page
		.getByTestId('delivery-count')
		.filter({ hasText: '1 / 1 delivered' })
		.waitFor({ timeout: 30000 })
	await save('live-learned-delivery')
	const final = frames.at(-1)
	assert.equal(final.scene.controller, 'learned_policy')
	assert.equal(final.checkpoint_id, job.selected_checkpoint)
	assert.ok(frames.slice(activation).every((frame) => frame.scene.controller === 'learned_policy'))
	await page.setViewportSize({ width: 390, height: 844 })
	await page.waitForTimeout(200)
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
	await save('mobile-training', true)
	assert.deepEqual(errors, [])
	const report = {
		endpoint,
		browser: browser.version(),
		job_id: job.job_id,
		checkpoint_id: job.selected_checkpoint,
		source: 'Live PyTorch checkpoint with no reference-controller substitution',
		final,
		page_errors: errors,
		mobile_no_horizontal_overflow: true,
	}
	await writeFile(new URL('browser-review.json', output), `${JSON.stringify(report, null, 2)}\n`)
	process.stdout.write(
		`${JSON.stringify({ checkpoint_id: job.selected_checkpoint, delivered: final.scene.delivered, collisions: final.scene.collisions, invalid: final.scene.invalid_actions, errors })}\n`,
	)
} finally {
	await browser.close()
}
