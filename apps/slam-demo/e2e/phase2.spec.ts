import { expect, test } from '@playwright/test'

test('authored assets, cameras, quality and animated wheels work through public controls', async ({
	page,
}) => {
	await page.goto('/')
	const run = page.getByRole('button', { name: 'Run inspection', exact: true })
	await expect(run).toBeEnabled()
	for (const name of ['Robot eye', 'Workbench', 'Follow robot', 'Overview']) {
		await page.getByRole('button', { name, exact: true }).click()
		await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute(
			'aria-pressed',
			'true',
		)
	}
	await page.getByLabel('Graphics quality').selectOption('low')
	await run.click()
	await expect
		.poll(() => page.evaluate(() => window.__slamRenderMetrics?.wheelAngles.left ?? 0))
		.toBeGreaterThan(1)
	await page.getByRole('button', { name: 'Pause', exact: true }).click()
	await page.waitForTimeout(300)
	const angle = await page.evaluate(() => window.__slamRenderMetrics?.wheelAngles.left)
	await page.waitForTimeout(300)
	expect(await page.evaluate(() => window.__slamRenderMetrics?.wheelAngles.left)).toBe(angle)
	await page.getByRole('button', { name: 'Reset simulation' }).click()
	await expect.poll(() => page.evaluate(() => window.__slamRenderMetrics?.wheelAngles.left)).toBe(0)
	await expect(page.getByText('NOT CAPTURING', { exact: true })).toBeVisible()
})

test('asset loading blocks driving and a failed asset provides recovery guidance', async ({
	page,
}) => {
	let release!: () => void
	const blocked = new Promise<void>((resolve) => {
		release = resolve
	})
	await page.route('**/assets/slam/lab.glb', async (route) => {
		await blocked
		await route.abort()
	})
	await page.goto('/')
	await expect(page.getByText('Preparing the inspection lab')).toBeVisible()
	await expect(page.getByRole('button', { name: 'Run inspection', exact: true })).toBeDisabled()
	release()
	await expect(page.getByText('The lab could not load.')).toBeVisible()
	await expect(page.getByText(/reload to retry/)).toBeVisible()
	await expect(page.getByRole('button', { name: 'Run inspection', exact: true })).toBeDisabled()
})
