import { expect, test } from '@playwright/test'

test('recorded playback stays offline and comparison retains the source result', async ({
	page,
}) => {
	let calls = 0
	await page.route('**/api/laya/v1/systemone', async (route) => {
		calls++
		if (calls > 8) {
			await route.fulfill({ status: 503, body: 'Disconnected during delivery' })
			return
		}
		const request = route.request().postDataJSON()
		const choices: Record<string, string> = {
			travel: 'far',
			gear: 'reverse',
			steering: 'straight',
			fork: 'level',
			action: 'none',
		}
		const answers = Object.fromEntries(
			Object.entries(request.questions).map(([key, raw]) => {
				const criteria = (raw as { criteria: Record<string, string> }).criteria
				const choice = choices[key] ?? Object.keys(criteria)[0]
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
		await route.fulfill({ json: { answers } })
	})
	await page.goto('/')
	await expect(page.getByRole('button', { name: 'Start delivery' })).toBeEnabled()
	await page.getByLabel('Autonomous control').selectOption('laya')
	await page.getByRole('button', { name: 'Start delivery' }).click()
	await expect(page.getByTestId('run-status')).toHaveText('Controller paused', { timeout: 15000 })
	const time = await page.getByTestId('elapsed').textContent()
	const count = calls
	await expect(page.getByTestId('pause-count')).toHaveText('1')
	await page.getByRole('button', { name: 'Replay recorded Laya run' }).click()
	await expect(page.locator('.playback-notice')).toContainText(
		'Recorded playback · no model requests',
	)
	await page.getByLabel('Playback speed').selectOption('8')
	await page.getByRole('button', { name: 'Start playback' }).click()
	await expect(page.getByTestId('run-status')).toHaveText('Playback finished')
	await expect(page.getByTestId('elapsed')).toHaveText(time ?? '')
	expect(calls).toBe(count)
	await page.screenshot({ path: '../../docs/warehouse-demo/phase5/playback.png' })
	await page.getByRole('button', { name: 'Compare with Predictable' }).click()
	await expect(page.getByLabel('Autonomous control')).toHaveValue('predictable')
	await expect(page.getByTestId('seed')).toHaveText('42')
	await expect(page.getByTestId('comparison-result')).toContainText('Full Laya · stalled')
	await expect(page.getByTestId('elapsed')).toHaveText('00:00.0')
	await page.screenshot({ path: '../../docs/warehouse-demo/phase5/comparison.png' })
})

test('repeated lifecycle controls retain one canvas and bounded GPU resources', async ({
	page,
}) => {
	const errors: string[] = []
	page.on('pageerror', (error) => errors.push(error.message))
	await page.goto('/')
	await expect(page.getByRole('button', { name: 'Start delivery' })).toBeEnabled()
	await page.waitForTimeout(1000)
	const baseline = await page.evaluate(() => window.__warehouseRenderMetrics)
	const samples: { geometries: number; textures: number }[] = []
	for (let index = 0; index < 16; index++) {
		await page.getByRole('button', { name: 'Randomize' }).click()
		await page.getByLabel('Autonomous control').selectOption('laya')
		await page.getByLabel('Autonomous control').selectOption('predictable')
		await page.getByRole('button', { name: 'Start delivery' }).click()
		await page.getByRole('button', { name: 'Pause', exact: false }).click()
		await page.getByRole('button', { name: 'Restart same seed' }).click()
		await page.getByRole('button', { name: index % 2 ? 'Overview' : 'Follow forklift' }).click()
		await page.waitForTimeout(150)
		const metrics = await page.evaluate(() => window.__warehouseRenderMetrics)
		if (metrics) samples.push({ geometries: metrics.geometries, textures: metrics.textures })
	}
	await expect(page.locator('canvas')).toHaveCount(1)
	expect(errors).toEqual([])
	expect(samples.at(-1)?.geometries ?? Infinity).toBeLessThanOrEqual(
		(baseline?.geometries ?? 0) + 12,
	)
	expect(samples.at(-1)?.textures ?? Infinity).toBeLessThanOrEqual((baseline?.textures ?? 0) + 8)
	const { writeFile } = await import('node:fs/promises')
	await writeFile(
		'../../docs/warehouse-demo/phase5/resources.json',
		JSON.stringify({ baseline, samples, errors }, null, 2),
	)
})

test('mobile controls and reduced-motion preferences remain readable and keyboard accessible', async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 })
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await page.goto('/')
	await expect(page.getByRole('button', { name: 'Start delivery' })).toBeEnabled()
	await expect(page.getByRole('button', { name: 'Follow forklift' })).toBeDisabled()
	await expect(page.getByRole('button', { name: 'Overview' })).toHaveAttribute(
		'aria-pressed',
		'true',
	)
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true,
	)
	const start = page.getByRole('button', { name: 'Start delivery' })
	await start.focus()
	await expect(start).toBeFocused()
	expect(await start.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid')
	await page.keyboard.press('Enter')
	await expect(page.getByTestId('run-status')).toHaveText('Forklift active')
	await page.getByRole('button', { name: 'Pause', exact: false }).click()
	await page.screenshot({ path: '../../docs/warehouse-demo/phase5/mobile.png' })
	await page.getByRole('region', { name: 'Run summary' }).scrollIntoViewIfNeeded()
	await page.screenshot({ path: '../../docs/warehouse-demo/phase5/mobile-summary.png' })
})
