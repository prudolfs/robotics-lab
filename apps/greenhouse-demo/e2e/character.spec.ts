import { expect, test } from './fixtures'

test('shows asset loading and explains a failed GLB without breaking session controls', async ({
	page,
}) => {
	await page.route('**/assets/greenhouse/caretaker.glb', async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 1500))
		await route.fulfill({ status: 503, body: 'Unavailable' })
	})
	await page.goto('/')
	await expect(page.getByTestId('renderer-status')).toHaveText('Loading greenhouse assets…')
	await expect(page.getByTestId('renderer-status')).toHaveText('The 3D preview could not start')
	await expect(page.getByText('Reload the page to retry the 3D preview.')).toBeVisible()
	await page.getByRole('button', { name: 'Restart seed', exact: true }).click()
	await expect(page.getByTestId('session-generation')).toHaveText('1')
})

test('switches to robot-eye inspection and respects changes to reduced motion', async ({
	page,
}) => {
	await page.goto('/')
	await expect(page.getByTestId('renderer-status')).toHaveText('WebGPU active')
	await page.getByRole('button', { name: 'Robot eye', exact: true }).click()
	await expect(page.getByRole('button', { name: 'Robot eye', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true',
	)
	await expect(page.getByText('This is not a vision sensor', { exact: false })).toBeVisible()
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await expect.poll(() => page.evaluate(() => window.__greenhouseReview?.pose?.headPitch)).toBe(0)
	expect(await page.evaluate(() => window.__greenhouseReview?.pose?.lids)).toEqual([false, false])
	await page.emulateMedia({ reducedMotion: 'no-preference' })
	await expect
		.poll(() => page.evaluate(() => window.__greenhouseReview?.pose?.headPitch))
		.toBe(-0.18)
	await page.getByRole('button', { name: 'Overview', exact: true }).click()
	await expect(page.getByRole('button', { name: 'Overview', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true',
	)
	await expect(page.getByRole('button', { name: 'Sound off', exact: true })).toHaveAttribute(
		'aria-pressed',
		'false',
	)
	await page.getByRole('button', { name: 'Sound off', exact: true }).click()
	await expect(page.getByRole('button', { name: 'Sound on', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true',
	)
	await page.getByRole('button', { name: 'Sound on', exact: true }).click()
	await expect(page.getByRole('button', { name: 'Sound off', exact: true })).toHaveAttribute(
		'aria-pressed',
		'false',
	)
})

test('keeps workspace controls available while asynchronous renderer initialization waits', async ({
	page,
}) => {
	await page.addInitScript(() => {
		const original = navigator.gpu.requestAdapter.bind(navigator.gpu)
		let calls = 0
		navigator.gpu.requestAdapter = async (...args) => {
			if (++calls > 1) await new Promise((resolve) => setTimeout(resolve, 2500))
			return original(...args)
		}
	})
	await page.goto('/')
	await expect(page.getByTestId('connection-status')).toHaveText('Connected')
	await page.getByRole('tab', { name: 'Train', exact: true }).click()
	await expect(page.getByRole('region', { name: 'Imitation learning' })).toBeVisible()
	await expect(page.getByRole('button', { name: 'Search commands', exact: true })).toBeEnabled()
	await expect(page.getByTestId('renderer-status')).toHaveText('WebGPU active')
})
