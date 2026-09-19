import { expect, test } from '@playwright/test'
import { encodeRecording } from '../src/sensor/recording'

test('image-derived VO tracks, displays synchronized overlays, and resets its origin', async ({
	page,
}) => {
	const errors: string[] = []
	page.on('pageerror', (e) => errors.push(e.message))
	await page.goto('/')
	await expect(page.getByTestId('vo-status')).toHaveText('initializing')
	await page.getByRole('button', { name: 'Run inspection', exact: true }).click()
	await expect(page.getByTestId('vo-status')).toHaveText('tracking')
	await expect(page.getByLabel('Visual odometry feature overlay')).toBeVisible()
	expect(await page.locator('.vo-overlay circle').count()).toBeGreaterThan(8)
	await page.getByRole('button', { name: 'Pause', exact: true }).click()
	await page.waitForTimeout(150)
	const error = Number.parseFloat(await page.getByTestId('vo-error').innerText())
	expect(error).toBeLessThan(0.25)
	await page.getByRole('button', { name: 'Visual odometry', exact: true }).click()
	await expect(page.getByRole('button', { name: 'Visual odometry', exact: true })).toHaveAttribute(
		'aria-pressed',
		'false',
	)
	await page.getByRole('button', { name: 'Reset simulation' }).click()
	await expect(page.getByTestId('vo-status')).toHaveText('initializing')
	await expect(page.getByTestId('vo-error')).toHaveText('0.000 m')
	await expect(page.getByText('NO MAP / LOOP CLOSURE', { exact: true })).toBeVisible()
	expect(errors).toEqual([])
})
test('blank recorded pixels cause honest tracking loss; synthetic IDs never become visual odometry', async ({
	page,
}) => {
	await page.goto('/')
	await expect(page.getByTestId('sensor-frame')).toHaveText('Pair 0 · 0.000 s')
	const calibration = {
		width: 640,
		height: 480,
		fx: 480,
		fy: 480,
		cx: 320,
		cy: 240,
		baseline: 0.12,
		captureHz: 10,
	}
	const frames = Array.from({ length: 6 }, (_, frameId) => ({
		generation: 0,
		frameId,
		timestamp: frameId / 10,
		kind: 'rendered' as const,
		calibration,
		left: new ArrayBuffer(640 * 480 * 4),
		right: new ArrayBuffer(640 * 480 * 4),
	}))
	await page.getByLabel('Replay stereo recording').setInputFiles({
		name: 'blank.slamframes',
		mimeType: 'application/octet-stream',
		buffer: Buffer.from(encodeRecording(frames)),
	})
	await expect(page.getByTestId('sensor-status')).toHaveText(
		'Replay complete · lockstep, no rendering',
	)
	await expect(page.getByTestId('vo-status')).toHaveText('lost')
	await expect(page.getByTestId('vo-error')).toHaveText('— m')
	await page.getByLabel('Replay stereo recording').setInputFiles({
		name: 'oracle.slamframes',
		mimeType: 'application/octet-stream',
		buffer: Buffer.from(
			encodeRecording(frames.map((f) => ({ ...f, kind: 'synthetic' as const, observations: [] }))),
		),
	})
	await expect(page.getByTestId('vo-status')).toHaveText('Oracle input — VO disabled')
	await page.getByRole('button', { name: 'Return to live sensor' }).click()
	await page.getByLabel('Sensor input mode').selectOption('synthetic')
	await expect(page.getByTestId('vo-status')).toHaveText('Oracle input — VO disabled')
	await page.getByRole('button', { name: 'Run inspection', exact: true }).click()
	await page.waitForTimeout(500)
	await expect(page.getByTestId('vo-status')).toHaveText('Oracle input — VO disabled')
})
