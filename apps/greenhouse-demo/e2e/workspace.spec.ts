import { expect, test } from '@playwright/test'
import type { HttpModels } from '../src/api/generated/http'
import { openPanel, selectChoice } from './workspace-helpers'

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'

test('keeps the viewport in place, supports command search and shortcuts, and remembers panel sizes', async ({
	page,
}) => {
	const errors: string[] = []
	page.on('pageerror', (error) => errors.push(String(error)))
	await page.goto('/')
	await expect(page.getByTestId('renderer-status')).toHaveText('WebGPU active')
	const canvas = await page.locator('canvas').elementHandle()
	await page.keyboard.press(`${modifier}+p`)
	const dialog = page.getByRole('dialog', { name: 'Greenhouse commands' })
	await expect(dialog).toBeVisible()
	await dialog.getByRole('combobox').fill('Open Train panel')
	await expect(dialog.getByRole('option', { name: /Open Train panel/ })).toContainText('3')
	await page.keyboard.press('Enter')
	await expect(dialog).toBeHidden()
	await expect(page.getByRole('tab', { name: 'Train', exact: true })).toHaveAttribute(
		'aria-selected',
		'true',
	)
	await expect(page.getByRole('region', { name: 'Imitation learning' })).toBeVisible()
	const before = await page.locator('canvas').boundingBox()
	await page.getByLabel('Epochs per round', { exact: false }).fill('121')
	await page.keyboard.press(`${modifier}+2`)
	await expect(page.getByRole('tab', { name: 'Train', exact: true })).toHaveAttribute(
		'aria-selected',
		'true',
	)
	await page.getByRole('tab', { name: 'Watch', exact: true }).focus()
	await page.keyboard.press(`${modifier}+2`)
	await expect(page.getByRole('tab', { name: 'Teach', exact: true })).toHaveAttribute(
		'aria-selected',
		'true',
	)
	await page.getByLabel('Import demonstrations', { exact: false }).scrollIntoViewIfNeeded()
	expect(await page.locator('canvas').boundingBox()).toEqual(before)
	expect(await canvas?.evaluate((element) => element === document.querySelector('canvas'))).toBe(
		true,
	)
	const handle = page.getByRole('separator', { name: 'Resize greenhouse and inspector' })
	const originalWidth = (await page.locator('#greenhouse-inspector').boundingBox())?.width ?? 0
	await handle.focus()
	await page.keyboard.press('ArrowLeft')
	await page.keyboard.press('ArrowLeft')
	const resizedWidth = (await page.locator('#greenhouse-inspector').boundingBox())?.width ?? 0
	expect(resizedWidth).toBeGreaterThan(originalWidth)
	await expect
		.poll(() =>
			page.evaluate(() => {
				const state = JSON.parse(localStorage.getItem('greenhouse-workspace-v1') ?? '{}').state
				return (state?.inspectorSize * (innerWidth - 1)) / 100
			}),
		)
		.toBeCloseTo(resizedWidth, 0)
	await page.reload()
	await expect(page.getByRole('tab', { name: 'Teach', exact: true })).toHaveAttribute(
		'aria-selected',
		'true',
	)
	await expect
		.poll(async () => (await page.locator('#greenhouse-inspector').boundingBox())?.width ?? 0)
		.toBeCloseTo(resizedWidth, 0)
	await page.setViewportSize({ width: 390, height: 844 })
	await openPanel(page, 'Train')
	await page.getByLabel('Saved checkpoint', { exact: true }).scrollIntoViewIfNeeded()
	const metrics = await page.evaluate(() => ({
		width: innerWidth,
		height: innerHeight,
		scrollWidth: document.documentElement.scrollWidth,
		scrollHeight: document.documentElement.scrollHeight,
	}))
	expect(metrics.scrollHeight).toBe(metrics.height)
	expect(metrics.scrollWidth).toBe(metrics.width)
	const viewport = await page.locator('#greenhouse-view').boundingBox()
	expect(viewport?.y).toBe(48)
	expect(viewport?.height).toBeGreaterThan(200)
	expect(errors).toEqual([])
})

test('preserves checkpoint choice across polls and tabs and cancels a stale detail request', async ({
	page,
	request,
}) => {
	const catalog = (await (
		await request.get('/api/v1/greenhouse/training')
	).json()) as HttpModels['training_catalog']
	const choices = catalog.checkpoints.filter((item) => item.compatible)
	test.skip(choices.length < 2, 'Two saved checkpoints are required.')
	const [first, second] = choices
	let delayed = false
	let release = () => {}
	const gate = new Promise<void>((resolve) => {
		release = resolve
	})
	await page.route(`**/training/checkpoints/${first.checkpoint_id}`, async (route) => {
		const response = await route.fetch()
		delayed = true
		await gate
		await route.fulfill({ response })
	})
	await page.goto('/')
	await openPanel(page, 'Train')
	await selectChoice(page, 'Saved checkpoint', first.checkpoint_id)
	await expect.poll(() => delayed).toBe(true)
	await selectChoice(page, 'Saved checkpoint', second.checkpoint_id)
	await expect(
		page.getByRole('button', { name: 'Use selected checkpoint', exact: true }),
	).toBeEnabled()
	release()
	await openPanel(page, 'Missions')
	await expect(page.getByRole('region', { name: 'Greenhouse missions' })).toContainText(
		second.checkpoint_id,
	)
	await page.waitForTimeout(5200)
	await openPanel(page, 'Train')
	await expect(page.getByLabel('Saved checkpoint', { exact: true })).toContainText(
		`${second.algorithm?.toUpperCase() ?? 'BC'}`,
	)
	// The selected value persists across reload; fetched detail belongs to that same ID.
	await page.reload()
	await expect(page.getByLabel('Saved checkpoint', { exact: true })).toHaveAttribute(
		'data-slot',
		'select-trigger',
	)
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					JSON.parse(localStorage.getItem('greenhouse-workspace-v1') ?? '{}').state?.checkpointId,
			),
		)
		.toBe(second.checkpoint_id)
})

test('ignores a late episode response after a validation replay takes ownership', async ({
	page,
	request,
}) => {
	const catalog = (await (
		await request.get('/api/v1/greenhouse/training')
	).json()) as HttpModels['training_catalog']
	const selected = catalog.checkpoints.find((item) => item.compatible)
	const dataset = (await (
		await request.get('/api/v1/greenhouse/dataset')
	).json()) as HttpModels['dataset']
	test.skip(
		!selected || dataset.episodes.length === 0,
		'Saved checkpoint and episode are required.',
	)
	if (!selected) return
	const episode = dataset.episodes[0]
	let delayed = false
	let release = () => {}
	const gate = new Promise<void>((resolve) => {
		release = resolve
	})
	await page.route(`**/episodes/${episode.episode_id}`, async (route) => {
		const response = await route.fetch()
		delayed = true
		await gate
		await route.fulfill({ response })
	})
	await page.goto('/')
	await openPanel(page, 'Teach')
	await page.getByLabel('Search demonstrations', { exact: true }).fill(episode.episode_id)
	await page.getByTestId(`episode-${episode.episode_id}`).getByRole('button').click()
	await expect.poll(() => delayed).toBe(true)
	await openPanel(page, 'Train')
	await selectChoice(page, 'Saved checkpoint', selected.checkpoint_id)
	await page.getByRole('button', { name: 'Review validation seed 10000', exact: true }).click()
	await expect(page.getByRole('region', { name: 'Validation rollout playback' })).toBeVisible()
	release()
	await openPanel(page, 'Teach')
	await expect(page.getByTestId('dataset-message')).toContainText(
		'Earlier playback request discarded.',
	)
	await expect(page.getByRole('region', { name: 'Recorded episode playback' })).toHaveCount(0)
	await expect(page.getByRole('region', { name: 'Validation rollout playback' })).toBeVisible()
	await page.getByRole('button', { name: 'Return to live', exact: true }).click()
	await expect(page.getByRole('button', { name: 'Start collection', exact: true })).toBeEnabled()
})
