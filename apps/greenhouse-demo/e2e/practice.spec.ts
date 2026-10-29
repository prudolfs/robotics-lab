import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { HttpModels } from '../src/api/generated/http'
import { openPanel, selectChoice } from './workspace-helpers'

const output = fileURLToPath(new URL('../../../docs/greenhouse-demo/phase6/', import.meta.url))

test('compares BC and PPO on one seed with exact recorded states and no live actions', async ({
	page,
	request,
}) => {
	test.setTimeout(40000)
	const catalog = (await (
		await request.get('/api/v1/greenhouse/training')
	).json()) as HttpModels['training_catalog']
	const parent = catalog.checkpoints.find((item) => item.algorithm === 'bc' && item.round === 3)
	const ppo = catalog.checkpoints.find(
		(item) => item.algorithm === 'ppo' && (item.practice_steps ?? 0) > 0,
	)
	test.skip(!parent || !ppo, 'Run the documented Phase 6 experiment to provide BC/PPO checkpoints.')
	if (!parent || !ppo) return
	const errors: string[] = []
	const outgoing: string[] = []
	page.on('pageerror', (error) => errors.push(String(error)))
	page.on('websocket', (socket) =>
		socket.on('framesent', (frame) => outgoing.push(String(frame.payload))),
	)
	await page.goto('/')
	await expect(page.getByTestId('renderer-status')).toHaveText('WebGPU active')
	await expect(page.getByRole('button', { name: 'Start collection', exact: true })).toBeEnabled()
	await openPanel(page, 'Compare')
	await selectChoice(page, 'Comparison policy A', parent.checkpoint_id)
	await selectChoice(page, 'Comparison policy B', ppo.checkpoint_id)
	await page.getByLabel('Comparison seed (10000–10029)').fill('10006')
	const reply = page.waitForResponse(
		(response) =>
			response.url().endsWith('/training/compare') && response.request().method() === 'POST',
	)
	const startCommands = outgoing.length
	await page.getByRole('button', { name: 'Compare policies', exact: true }).click()
	const result = (await (await reply).json()) as HttpModels['comparison_detail']
	expect(result.entries).toHaveLength(3)
	expect(result.entries[0].rollout.initial).toEqual(result.entries[1].rollout.initial)
	expect(result.entries[0].rollout.initial).toEqual(result.entries[2].rollout.initial)
	await expect(page.getByRole('region', { name: 'Comparison playback', exact: true })).toBeVisible()
	await expect(page.getByTestId('session-seed')).toHaveText('10006')
	await expect(page.getByRole('button', { name: 'Resume collection', exact: true })).toBeDisabled()
	await page.getByRole('button', { name: 'Play comparison rollout', exact: true }).click()
	await expect
		.poll(async () => Number(await page.getByTestId('simulation-tick').textContent()))
		.toBeGreaterThan(3)
	await page.getByRole('button', { name: 'Pause comparison playback', exact: true }).click()
	await page.getByLabel('Comparison position', { exact: true }).focus()
	await page.getByLabel('Comparison position', { exact: true }).press('End')
	await expect(page.getByTestId('simulation-tick')).toHaveText(
		String(result.entries[0].rollout.ticks),
	)
	await expect(page.getByTestId('delivery-count')).toHaveText(
		result.entries[0].rollout.success ? '1 / 1 delivered' : '0 / 1 delivered',
	)
	await expect(
		page.getByRole('cell', { name: 'pickup not completed', exact: true }).first(),
	).toBeVisible()
	const reference = result.entries[2].rollout
	await page.getByRole('button', { name: 'Watch 3', exact: true }).click()
	await expect(page.getByTestId('simulation-tick')).toHaveText('0')
	await page.getByLabel('Comparison position', { exact: true }).focus()
	await page.getByLabel('Comparison position', { exact: true }).press('End')
	await expect(page.getByTestId('simulation-tick')).toHaveText(String(reference.ticks))
	await expect(page.getByTestId('delivery-count')).toHaveText('1 / 1 delivered')
	expect(outgoing.slice(startCommands).every((raw) => JSON.parse(raw).kind === 'ping')).toBe(true)
	if (process.env.GREENHOUSE_CAPTURE) {
		await mkdir(output, { recursive: true })
		await page.screenshot({ path: `${output}/comparison-desktop.png`, fullPage: true })
		await writeFile(
			`${output}/browser-comparison.json`,
			JSON.stringify(
				{
					seed: result.seed,
					policies: result.entries.map(({ label, checkpoint_id, rollout }) => ({
						label,
						checkpoint_id,
						...rollout,
						initial: undefined,
						frames: undefined,
						final: undefined,
					})),
					page_errors: errors,
					no_live_actions: true,
				},
				null,
				2,
			),
		)
	}
	await page.getByRole('button', { name: 'Return to live', exact: true }).click()
	await expect(page.getByTestId('session-seed')).toHaveText('42')
	await expect(page.getByTestId('simulation-tick')).toHaveText('0')
	await page.setViewportSize({ width: 390, height: 844 })
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true,
	)
	if (process.env.GREENHOUSE_CAPTURE)
		await page.screenshot({ path: `${output}/comparison-mobile.png`, fullPage: true })
	expect(errors).toEqual([])
})
