import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { HttpModels } from '../src/api/generated/http'
import type { ServerMessage } from '../src/api/generated/websocket-server'
import { openPanel, selectChoice } from './workspace-helpers'

const output = fileURLToPath(new URL('../../../docs/greenhouse-demo/phase7/', import.meta.url))

test('runs a three-capsule learned mission, pauses, verifies docking and inspects its persistent graph', async ({
	page,
	request,
}) => {
	test.setTimeout(85000)
	const catalog = (await (
		await request.get('/api/v1/greenhouse/training')
	).json()) as HttpModels['training_catalog']
	const selected = catalog.jobs.find((item) => item.state === 'completed')?.selected_checkpoint
	test.skip(!selected, 'Run the documented learning experiment to provide a mission checkpoint.')
	if (!selected) return
	const errors: string[] = []
	const frames: Extract<ServerMessage, { kind: 'snapshot' }>[] = []
	page.on('pageerror', (error) => errors.push(String(error)))
	page.on('websocket', (socket) =>
		socket.on('framereceived', ({ payload }) => {
			const value = JSON.parse(String(payload)) as ServerMessage
			if (value.kind === 'snapshot') frames.push(value)
		}),
	)
	await page.goto('/')
	await expect(page.getByTestId('renderer-status')).toHaveText('WebGPU active')
	const panel = page.getByRole('region', { name: 'Greenhouse missions', exact: true })
	await openPanel(page, 'Train')
	await selectChoice(page, 'Saved checkpoint', selected)
	await openPanel(page, 'Missions')
	await expect(panel.getByRole('button', { name: 'Start mission', exact: true })).toBeEnabled()
	await panel.getByRole('button', { name: 'Start mission', exact: true }).click()
	await expect(panel.getByTestId('mission-status')).toContainText('Mission running')
	await expect.poll(() => frames.at(-1)?.mission?.total_ticks ?? 0).toBeGreaterThan(15)
	await panel.getByRole('button', { name: 'Pause mission', exact: true }).click()
	await expect(panel.getByTestId('mission-status')).toContainText('Mission paused')
	const frozen = frames.at(-1)?.tick
	await page.waitForTimeout(250)
	expect(frames.at(-1)?.tick).toBe(frozen)
	await panel.getByRole('button', { name: 'Inspect graph checkpoint', exact: true }).click()
	await expect(panel.getByTestId('graph-checkpoint')).toContainText('SQLite graph checkpoint')
	await panel.getByRole('button', { name: 'Resume mission', exact: true }).click()
	await expect.poll(() => frames.at(-1)?.mission?.delivered ?? 0, { timeout: 50000 }).toBe(3)
	await page.getByRole('button', { name: 'Follow', exact: true }).click()
	await expect(panel.getByTestId('mission-status')).toHaveText(
		'Mission completed · 3/3 delivered · Dock verified',
		{ timeout: 30000 },
	)
	const final = frames.at(-1)?.mission
	expect(final?.collisions).toBe(0)
	expect(final?.recoveries).toBe(0)
	expect(final?.request.checkpoint_id).toBe(selected)
	const collection =
		final?.trace?.filter((item) => item.node === 'execute' && item.skill === 'collect_deliver') ??
		[]
	expect(collection).toHaveLength(3)
	expect(collection.every((item) => item.implementation?.startsWith('learned checkpoint'))).toBe(
		true,
	)
	expect(final?.trace?.some((item) => item.implementation === 'scripted return-to-dock')).toBe(true)
	const generation = frames.at(-1)?.generation
	await panel.getByRole('button', { name: 'Inspect graph checkpoint', exact: true }).click()
	await expect(panel.getByTestId('graph-checkpoint')).toContainText('next nodes: finished')
	await expect(
		panel.getByRole('button', { name: 'Draft supported plan', exact: true }),
	).toBeDisabled()
	await expect(panel.getByText('Language planning is unavailable.', { exact: false })).toBeVisible()
	if (process.env.GREENHOUSE_CAPTURE) {
		await mkdir(output, { recursive: true })
		await page.screenshot({ path: `${output}/mission-complete-desktop.png`, fullPage: true })
		await writeFile(
			`${output}/browser-mission.json`,
			JSON.stringify({ final, page_errors: errors, pause_froze_ticks: true, generation }, null, 2),
		)
	}
	await page.getByRole('button', { name: 'Restart seed', exact: true }).click()
	await expect(page.getByTestId('simulation-tick')).toHaveText('0')
	await expect(panel.getByRole('button', { name: 'Resume mission', exact: true })).toHaveCount(0)
	await expect(
		panel.getByText('This checkpoint belongs to an earlier session or generation.', {
			exact: false,
		}),
	).toBeVisible()
	await expect(panel.getByRole('button', { name: 'Pause mission', exact: true })).toBeDisabled()
	await page.setViewportSize({ width: 390, height: 844 })
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
	if (process.env.GREENHOUSE_CAPTURE)
		await page.screenshot({ path: `${output}/mission-mobile.png`, fullPage: true })
	expect(errors).toEqual([])
})

test('starts a structured dock-only mission without a provider and rejects stale resume after reconnect', async ({
	page,
}) => {
	await page.goto('/')
	await expect(page.getByTestId('renderer-status')).toHaveText('WebGPU active')
	const panel = page.getByRole('region', { name: 'Greenhouse missions', exact: true })
	await openPanel(page, 'Missions')
	await selectChoice(page, 'Mission plan', '0')
	await panel.getByRole('button', { name: 'Start mission', exact: true }).click()
	await expect(panel.getByTestId('mission-status')).toContainText('Mission running')
	await panel.getByRole('button', { name: 'Pause mission', exact: true }).click()
	await expect(panel.getByTestId('mission-status')).toContainText('Mission paused')
	await openPanel(page, 'Watch')
	await page.getByRole('button', { name: 'Reconnect', exact: true }).click()
	await openPanel(page, 'Missions')
	await expect(page.getByRole('button', { name: 'Start collection', exact: true })).toBeEnabled()
	await expect(panel.getByRole('button', { name: /^(Pause|Resume) mission$/ })).toBeDisabled()
	await expect(
		panel.getByText('This checkpoint belongs to an earlier session or generation.', {
			exact: false,
		}),
	).toBeVisible()
})
