import { expect, test } from '@playwright/test'

test('closure settings reset the archive and synthetic input cannot supply a loop', async ({
	page,
}) => {
	await page.goto('/')
	await expect(page.getByTestId('loop-database')).toHaveText('1')
	await page.getByLabel('Loop closure', { exact: true }).selectOption('disabled')
	await expect(page.getByTestId('loop-status')).toContainText('Disabled')
	await expect(page.getByTestId('map-revision')).toHaveText('1 / 0')
	await page.getByLabel('Loop closure', { exact: true }).selectOption('enabled')
	await expect(page.getByTestId('loop-status')).toContainText('Searching')
	await page.getByLabel('Sensor input mode').selectOption('synthetic')
	await expect(page.getByTestId('loop-database')).toHaveText('0')
	await expect(page.getByTestId('loop-corrections')).toHaveText('0')
})
test('a real rendered revisit publishes a verified correction, paths and residuals', async ({
	page,
}) => {
	test.setTimeout(240000)
	const errors: string[] = []
	page.on('pageerror', (e) => errors.push(e.message))
	await page.goto('/')
	// Fixed paired exposures keep every observation in this end-to-end verification.
	await page.getByLabel('Sensor timing').selectOption('lockstep')
	await expect(page.getByTestId('vo-status')).toHaveText('initializing')
	await page.getByRole('button', { name: 'Run inspection', exact: true }).click()
	await expect
		.poll(async () => Number(await page.getByTestId('loop-corrections').innerText()), {
			timeout: 220000,
			intervals: [1000],
		})
		.toBeGreaterThan(0)
	await expect(
		page.getByLabel('Loop closure events').locator('[data-kind="verified"]'),
	).not.toHaveCount(0)
	await expect(
		page.getByLabel('Loop closure events').locator('[data-kind="applied"]'),
	).not.toHaveCount(0)
	const inspector = page.getByRole('region', { name: 'Loop closure results' })
	await inspector.scrollIntoViewIfNeeded()
	await expect(inspector.locator('svg polyline')).toHaveCount(2)
	await expect(inspector).toContainText('Weighted graph cost')
	await page.getByRole('button', { name: 'Reset simulation' }).click()
	await expect(page.getByTestId('loop-corrections')).toHaveText('0')
	await expect(page.getByTestId('loop-database')).toHaveText('1')
	expect(errors).toEqual([])
})
