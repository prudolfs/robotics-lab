import { expect, test } from '@playwright/test'

test('visitor can compare the same shipment and start a different one', async ({ page }) => {
	await page.goto('/')
	await expect(page.getByTestId('renderer-status')).toContainText('WEBGPU ACTIVE')
	await expect(page.getByRole('button', { name: 'Start delivery' })).toBeEnabled()
	const stock = await page.locator('.bay-grid').textContent()
	await page.getByRole('button', { name: 'Start delivery' }).click()
	await expect(page.getByTestId('elapsed')).not.toHaveText('00:00.0')
	await page.getByRole('button', { name: 'Restart same seed' }).click()
	await expect(page.getByTestId('seed')).toHaveText('42')
	await expect(page.locator('.bay-grid')).toHaveText(stock ?? '')
	await expect(page.getByTestId('elapsed')).toHaveText('00:00.0')
	await page.getByLabel('Autonomous control').selectOption('laya')
	await expect(page.getByTestId('seed')).toHaveText('42')
	await expect(page.locator('.bay-grid')).toHaveText(stock ?? '')
	await page.getByLabel('Autonomous control').selectOption('predictable')
	await expect(page.getByTestId('seed')).toHaveText('42')
	await page.getByRole('button', { name: 'Randomize' }).click()
	await expect(page.getByTestId('seed')).not.toHaveText('42')
	await expect(page.getByTestId('elapsed')).toHaveText('00:00.0')
})

test('visitor gets a clear outcome when the local model is unavailable', async ({ page }) => {
	await page.route('**/api/laya/v1/systemone', (route) =>
		route.fulfill({ status: 503, body: 'Service unavailable' }),
	)
	await page.goto('/')
	await expect(page.getByRole('button', { name: 'Start delivery' })).toBeEnabled()
	await page.getByLabel('Autonomous control').selectOption('laya')
	await page.getByRole('button', { name: 'Start delivery' }).click()
	await expect(page.getByTestId('run-status')).toHaveText('Controller paused')
	await expect(page.getByRole('region', { name: 'Run summary' })).toContainText('stalled')
	await expect(page.getByText(/Laya paused after 3 failed requests/).first()).toBeVisible()
})
