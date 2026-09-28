import { expect, test } from '@playwright/test'

test('Full Laya service failure pauses clearly and switching mode resets the same seed', async ({
	page,
}) => {
	let requests = 0
	await page.route('**/api/laya/v1/systemone', async (route) => {
		requests++
		await route.fulfill({ status: 503, body: 'Unavailable' })
	})
	await page.goto('/')
	await expect(page.getByRole('button', { name: 'Start delivery' })).toBeEnabled()
	await page.getByLabel('Autonomous control').selectOption('laya')
	await expect(page.getByLabel('Playback speed')).toBeDisabled()
	await page.getByRole('button', { name: 'Start delivery' }).click()
	await expect(page.getByTestId('run-status')).toHaveText('Controller paused')
	await expect(page.getByText(/Laya paused after 3 failed requests/).first()).toBeVisible()
	expect(requests).toBe(3)
	await page.getByLabel('Autonomous control').selectOption('predictable')
	await expect(page.getByTestId('seed')).toHaveText('42')
	await expect(page.getByTestId('elapsed')).toHaveText('00:00.0')
	await page.getByRole('button', { name: 'Start delivery' }).click()
	await expect(page.getByTestId('run-status')).toHaveText('Forklift active')
	expect(requests).toBe(3)
})

test('restart aborts a pending model request and does not apply its old task', async ({ page }) => {
	let requested = false
	await page.route('**/api/laya/v1/systemone', async (route) => {
		requested = true
		await new Promise((resolve) => setTimeout(resolve, 1000))
		const request = route.request().postDataJSON()
		const answers = Object.fromEntries(
			Object.entries(request.questions).map(([key, raw]) => {
				const criteria = (raw as { criteria: Record<string, string> }).criteria
				const choice = Object.keys(criteria)[0]
				return [
					key,
					{
						choice,
						probabilities: Object.fromEntries(
							Object.keys(criteria).map((option) => [option, option === choice ? 1 : 0]),
						),
					},
				]
			}),
		)
		await route.fulfill({ json: { answers } }).catch(() => {})
	})
	await page.goto('/')
	await expect(page.getByRole('button', { name: 'Start delivery' })).toBeEnabled()
	await page.getByLabel('Autonomous control').selectOption('laya')
	await page.getByRole('button', { name: 'Start delivery' }).click()
	await expect.poll(() => requested).toBe(true)
	await page.getByRole('button', { name: 'Restart same seed' }).click()
	await page.waitForTimeout(1200)
	await expect(page.getByTestId('stage')).toHaveText('Selecting cargo and bay')
	await expect(page.getByTestId('elapsed')).toHaveText('00:00.0')
	await expect(page.getByTestId('laya-connection')).toHaveText('idle')
})
