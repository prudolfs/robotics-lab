import { expect, test } from '@playwright/test'

test('local map grows, supports tracking, exposes observations and resets with its generation', async ({
	page,
}) => {
	const errors: string[] = []
	page.on('pageerror', (e) => errors.push(e.message))
	await page.goto('/')
	await expect(page.getByTestId('vo-status')).toHaveText('initializing')
	await expect(page.getByTestId('map-keyframes')).toHaveText('1')
	await page.getByRole('button', { name: 'Run inspection', exact: true }).click()
	await expect
		.poll(async () => Number(await page.getByTestId('map-keyframes').innerText()))
		.toBeGreaterThan(1)
	await expect
		.poll(async () => Number(await page.getByTestId('map-matches').innerText()))
		.toBeGreaterThan(8)
	await page.getByRole('button', { name: 'Pause', exact: true }).click()
	await page.waitForTimeout(400)
	const selection = page.getByLabel('Inspect map element')
	await selection.selectOption('keyframe:0')
	await expect(page.getByTestId('map-selection')).toContainText('Keyframe K0')
	await expect(page.getByTestId('map-selection')).toContainText('linked observations')
	const point = await selection
		.locator('optgroup[label="Landmarks"] option')
		.first()
		.getAttribute('value')
	if (!point) throw Error('No mapped point available')
	await selection.selectOption(point)
	await expect(page.getByTestId('map-selection')).toContainText('Landmark L')
	await expect(page.getByTestId('map-selection').locator('tbody tr')).not.toHaveCount(0)
	await page.getByRole('button', { name: 'Sparse points', exact: true }).click()
	await expect(page.getByRole('button', { name: 'Sparse points', exact: true })).toHaveAttribute(
		'aria-pressed',
		'false',
	)
	await page.getByRole('button', { name: 'Keyframes', exact: true }).click()
	await expect(page.getByRole('button', { name: 'Keyframes', exact: true })).toHaveAttribute(
		'aria-pressed',
		'false',
	)
	await page.getByRole('button', { name: 'Reset simulation' }).click()
	await expect(page.getByTestId('map-keyframes')).toHaveText('1')
	await expect(page.getByTestId('map-revision')).toHaveText('1 / 0')
	await expect(selection).toHaveValue('')
	await page.getByLabel('Sensor input mode').selectOption('synthetic')
	await expect(page.getByTestId('map-keyframes')).toHaveText('0')
	await expect(page.getByTestId('map-points')).toHaveText('0')
	expect(errors).toEqual([])
})
