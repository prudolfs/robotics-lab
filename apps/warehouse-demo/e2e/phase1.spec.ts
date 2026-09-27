import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

test('start, pause, restart, randomize and complete the sample transfer', async ({ page }) => {
	const errors: string[] = []
	page.on('pageerror', (error) => errors.push(error.message))
	await page.goto('/')
	await expect(page.getByTestId('renderer-status')).toContainText('WEBGPU ACTIVE')
	await mkdir('screenshots', { recursive: true })
	await page.screenshot({ path: 'screenshots/phase1-overview.png' })
	await expect(page.getByTestId('seed')).toHaveText('42')
	await expect(page.getByTestId('run-status')).toHaveText('Ready to unload')
	await page.getByRole('button', { name: 'Follow forklift' }).click()
	await expect(page.getByRole('button', { name: 'Follow forklift' })).toHaveAttribute(
		'aria-pressed',
		'true',
	)
	await page.getByRole('button', { name: 'Overview' }).click()
	await expect(page.getByRole('button', { name: 'Overview' })).toHaveAttribute(
		'aria-pressed',
		'true',
	)
	await page.getByRole('button', { name: 'Start transfer' }).click()
	await expect(page.getByTestId('run-status')).toHaveText('Forklift active')
	await expect(page.getByTestId('elapsed')).not.toHaveText('00:00.0')
	await page.getByRole('button', { name: 'Pause' }).click()
	await expect(page.getByTestId('run-status')).toHaveText('Paused')
	const pausedTime = await page.getByTestId('elapsed').textContent()
	await page.waitForTimeout(350)
	await expect(page.getByTestId('elapsed')).toHaveText(pausedTime ?? '')
	await page.getByRole('button', { name: 'Restart same seed' }).click()
	await expect(page.getByTestId('seed')).toHaveText('42')
	await expect(page.getByTestId('elapsed')).toHaveText('00:00.0')
	await page.getByRole('button', { name: 'Randomize' }).click()
	await expect(page.getByTestId('elapsed')).toHaveText('00:00.0')
	await page.getByRole('button', { name: 'Restart same seed' }).click()
	await expect(page.getByTestId('elapsed')).toHaveText('00:00.0')
	await page.getByLabel('Playback speed').selectOption('4')
	await page.getByRole('button', { name: 'Start transfer' }).click()
	await expect(page.getByTestId('run-status')).toHaveText('Sample transfer complete', {
		timeout: 35_000,
	})
	await expect(page.getByText('1 stored ·')).toBeVisible()
	expect(errors).toEqual([])
	await page.screenshot({ path: 'screenshots/phase1-complete.png' })
})

test('unavailable WebGPU is explained and start is disabled', async ({ page }) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true })
	})
	await page.goto('/')
	await expect(page.getByText('WebGPU is unavailable')).toBeVisible()
	await expect(page.getByRole('button', { name: 'Start transfer' })).toBeDisabled()
})
