import { expect, test } from '@playwright/test'

test('calibrated frame zero is independent of presentation, and seeded noise changes actual pixels', async ({
	page,
}) => {
	const errors: string[] = []
	page.on('pageerror', (e) => errors.push(e.message))
	await page.goto('/')
	await expect(page.getByTestId('sensor-frame')).toHaveText('Pair 0 · 0.000 s')
	const image = page.getByLabel('Processed left image'),
		checksum = await image.getAttribute('data-checksum')
	expect(checksum).toMatch(/^[0-9a-f]{8}$/)
	const pixelHash = () =>
		image.evaluate((node) => {
			const canvas = node as HTMLCanvasElement
			const pixels = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data
			let sum = 0
			for (const value of pixels ?? []) sum = (sum * 31 + value) >>> 0
			return sum
		})
	const original = await pixelHash()
	await page.getByRole('button', { name: 'Robot eye', exact: true }).click()
	await page.getByLabel('Graphics quality').selectOption('low')
	await page.getByRole('button', { name: 'Planned loop', exact: true }).click()
	await page.getByRole('button', { name: 'Reset simulation' }).click()
	await expect(page.getByTestId('sensor-generation')).toHaveText('Run 1')
	await expect(image).toHaveAttribute('data-checksum', checksum ?? '')
	expect(await pixelHash()).toBe(original)
	await page.getByLabel('Pixel noise amplitude').focus()
	await page.keyboard.press('End')
	await expect(image).not.toHaveAttribute('data-checksum', checksum ?? '')
	const noisy = await image.getAttribute('data-checksum')
	expect(await pixelHash()).not.toBe(original)
	await page.getByRole('button', { name: 'Reset simulation' }).click()
	await expect(image).toHaveAttribute('data-checksum', noisy ?? '')
	await page.getByRole('button', { name: 'Right image', exact: true }).click()
	await expect(page.getByLabel('Processed right image')).toBeVisible()
	await expect(page.getByTestId('vo-status')).toBeVisible()
	expect(errors).toEqual([])
})

test('captures ordered timestamps, clears pending work on reset, and replays a downloaded pair window', async ({
	page,
}, testInfo) => {
	await page.goto('/')
	await expect(page.getByTestId('sensor-frame')).toHaveText('Pair 0 · 0.000 s')
	await page.getByRole('button', { name: 'Run inspection', exact: true }).click()
	await expect
		.poll(async () =>
			Number((await page.getByTestId('sensor-frame').innerText()).match(/Pair (\d+)/)?.[1]),
		)
		.toBeGreaterThan(6)
	await page.getByRole('button', { name: 'Pause', exact: true }).click()
	await page.waitForTimeout(200)
	const label = await page.getByTestId('sensor-frame').innerText(),
		checksum = await page.getByLabel('Processed left image').getAttribute('data-checksum')
	const [id, time] =
		label
			.match(/Pair (\d+) · ([\d.]+)/)
			?.slice(1)
			.map(Number) ?? []
	expect(time).toBeCloseTo(id / 10, 6)
	const wait = page.waitForEvent('download')
	await page.getByRole('button', { name: 'Save last 6 pairs' }).click()
	const download = await wait,
		path = testInfo.outputPath('pixels.slamframes')
	await download.saveAs(path)
	await page.getByLabel('Replay stereo recording').setInputFiles(path)
	await expect(page.getByTestId('sensor-status')).toHaveText(
		'Replay complete · lockstep, no rendering',
	)
	await expect(page.getByTestId('sensor-frame')).toHaveText(label)
	await expect(page.getByLabel('Processed left image')).toHaveAttribute(
		'data-checksum',
		checksum ?? '',
	)
	await expect(page.getByTestId('elapsed-time')).toHaveText('00:00.0')
	await expect(page.getByRole('button', { name: 'Run inspection', exact: true })).toBeDisabled()
	await page.getByRole('button', { name: 'Return to live sensor' }).click()
	await expect(page.getByTestId('sensor-frame')).toHaveText('Pair 0 · 0.000 s')
	await page.getByRole('button', { name: 'Run inspection', exact: true }).click()
	await page.getByRole('button', { name: 'Reset simulation' }).click()
	await page.getByRole('button', { name: 'Reset simulation' }).click()
	await expect(page.getByTestId('sensor-generation')).toHaveText('Run 4')
	await expect(page.getByTestId('sensor-frame')).toHaveText('Pair 0 · 0.000 s')
	await page.waitForTimeout(200)
	await expect(page.getByTestId('sensor-frame')).toHaveText('Pair 0 · 0.000 s')
})

test('synthetic lockstep is explicitly an oracle and dropout is visible', async ({ page }) => {
	await page.goto('/')
	await expect(page.getByTestId('sensor-frame')).toHaveText('Pair 0 · 0.000 s')
	await page.getByLabel('Sensor input mode').selectOption('synthetic')
	await page.getByLabel('Sensor timing').selectOption('lockstep')
	await page.getByLabel('Sensor dropout').focus()
	await page.keyboard.press('End')
	await page.getByRole('button', { name: 'Run inspection', exact: true }).click()
	await expect(page.getByText('SYNTHETIC · ORACLE', { exact: true })).toBeVisible()
	await expect(page.getByTestId('sensor-drops')).not.toHaveText('0 / 0')
	await expect(page.getByTestId('sensor-frame')).toContainText('Pair ')
	await expect(page.getByTestId('sensor-queue')).not.toHaveText('2 / 2')
	await page.getByRole('button', { name: 'Pause', exact: true }).click()
})
