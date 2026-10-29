import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { HttpModels } from '../src/api/generated/http'
import type { ServerMessage } from '../src/api/generated/websocket-server'

const output = fileURLToPath(new URL('../../../docs/greenhouse-demo/phase5/', import.meta.url))
type Snapshot = Extract<ServerMessage, { kind: 'snapshot' }>

test('runs the saved learned checkpoint live with pause/resume and no reference substitution', async ({
	page,
	request,
}) => {
	test.setTimeout(50000)
	const catalog = (await (
		await request.get('/api/v1/greenhouse/training')
	).json()) as HttpModels['training_catalog']
	const selected = catalog.jobs.find((job) => job.state === 'completed')?.selected_checkpoint
	test.skip(
		!selected,
		'Run the documented Phase 5 training job first to provide an evaluated checkpoint.',
	)
	if (!selected) return
	const frames: Snapshot[] = []
	const errors: string[] = []
	page.on('pageerror', (error) => errors.push(String(error)))
	page.on('websocket', (socket) =>
		socket.on('framereceived', ({ payload }) => {
			const message = JSON.parse(String(payload)) as ServerMessage
			if (message.kind === 'snapshot') frames.push(message)
		}),
	)
	await page.goto('/')
	await expect(page.getByTestId('renderer-status')).toHaveText('WebGPU active')
	await page.getByLabel('Saved checkpoint', { exact: true }).selectOption(selected)
	await page.getByRole('button', { name: 'Use selected checkpoint', exact: true }).click()
	await expect(page.getByText('Learned policy controller.', { exact: false })).toBeVisible()
	await expect.poll(() => frames.at(-1)?.checkpoint_id).toBe(selected)
	await expect(
		page.getByRole('button', { name: 'Record demonstration', exact: true }),
	).toBeDisabled()
	const activation = frames.length
	await page.getByRole('button', { name: 'Start collection', exact: true }).click()
	await expect.poll(() => frames.at(-1)?.tick ?? 0).toBeGreaterThan(10)
	await page.getByRole('button', { name: 'Pause collection', exact: true }).click()
	await expect(page.getByTestId('run-status')).toHaveText('Paused')
	const frozen = frames.at(-1)?.tick
	await page.waitForTimeout(200)
	expect(frames.at(-1)?.tick).toBe(frozen)
	await page.getByRole('button', { name: 'Resume collection', exact: true }).click()
	await expect
		.poll(
			() =>
				frames.some((frame) => frame.scene.robot.holding && frame.scene.robot.lift_height > 0.2),
			{ timeout: 20000 },
		)
		.toBe(true)
	await page.getByRole('button', { name: 'Follow', exact: true }).click()
	if (process.env.GREENHOUSE_CAPTURE) {
		await mkdir(output, { recursive: true })
		await page.screenshot({ path: `${output}/learned-carrying.png` })
	}
	await expect(page.getByTestId('delivery-count')).toHaveText('1 / 1 delivered', { timeout: 30000 })
	const final = frames.at(-1)
	expect(final?.scene.controller).toBe('learned_policy')
	expect(final?.checkpoint_id).toBe(selected)
	expect(final?.scene.collisions).toBe(0)
	expect(
		frames
			.slice(activation)
			.every(
				(frame) => frame.scene.controller === 'learned_policy' && frame.checkpoint_id === selected,
			),
	).toBe(true)
	expect(errors).toEqual([])
	if (process.env.GREENHOUSE_CAPTURE) {
		await page.screenshot({ path: `${output}/learned-delivery.png` })
		await writeFile(
			`${output}/live-learned.json`,
			`${JSON.stringify({ checkpoint_id: selected, source: 'Live learned policy; no scripted recovery', pause_freezes_tick: true, controller_stays_learned: true, final, errors }, null, 2)}\n`,
		)
	}
})

test('reviews a held-out rollout and keeps API and live simulation responsive during training cancellation', async ({
	page,
	request,
}) => {
	test.setTimeout(30000)
	const catalog = (await (
		await request.get('/api/v1/greenhouse/training')
	).json()) as HttpModels['training_catalog']
	const selected = catalog.jobs.find((job) => job.state === 'completed')?.selected_checkpoint
	test.skip(!selected, 'An evaluated Phase 5 checkpoint is required for validation playback.')
	if (!selected) return
	const detail = (await (
		await request.get(`/api/v1/greenhouse/training/checkpoints/${selected}`)
	).json()) as HttpModels['policy_detail']
	const sample = detail.evaluation.episodes.find((episode) => episode.seed === 10000)
	if (!sample?.frames?.length || !sample.final) throw new Error('Missing saved validation rollout')
	await page.goto('/')
	await expect(page.getByTestId('renderer-status')).toHaveText('WebGPU active')
	await page.getByLabel('Saved checkpoint', { exact: true }).selectOption(selected)
	await page.getByRole('button', { name: 'Review validation seed 10000', exact: true }).click()
	await expect(page.getByRole('region', { name: 'Validation rollout playback' })).toBeVisible()
	await page.getByLabel('Validation position', { exact: true }).press('End')
	await expect(page.getByTestId('validation-frame')).toHaveText(
		`Frame ${sample.frames.length} / ${sample.frames.length}`,
	)
	await expect
		.poll(() => page.evaluate(() => window.__greenhouseReview?.pose?.robot[0]))
		.toBe(sample.final.x)
	await page.getByRole('button', { name: 'Return to live', exact: true }).click()
	await page.getByLabel('Epochs per round', { exact: false }).fill('300')
	await page.getByRole('button', { name: 'Train policy', exact: true }).click()
	await expect(page.getByRole('button', { name: 'Cancel training', exact: true })).toBeEnabled()
	await page.getByRole('button', { name: 'Start collection', exact: true }).click()
	await expect
		.poll(async () => Number(await page.getByTestId('simulation-tick').textContent()))
		.toBeGreaterThan(5)
	let fittingEpoch = 0
	await expect
		.poll(
			async () => {
				const current = (await (
					await request.get('/api/v1/greenhouse/training')
				).json()) as HttpModels['training_catalog']
				const worker = current.jobs.find((item) => item.job_id === current.active_job)
				fittingEpoch = worker?.epoch ?? 0
				return worker?.phase === 'fitting' && fittingEpoch > 0
			},
			{ timeout: 10000 },
		)
		.toBe(true)
	const began = Date.now()
	expect((await request.get('/api/v1/greenhouse/health')).status()).toBe(200)
	const healthMs = Date.now() - began
	expect(healthMs).toBeLessThan(500)
	await page.getByRole('button', { name: 'Cancel training', exact: true }).click()
	await expect(page.getByTestId('training-status')).toContainText('cancelled', { timeout: 10000 })
	await expect(page.getByTestId('connection-status')).toHaveText('Connected')
	await page.getByRole('button', { name: 'Pause collection', exact: true }).click()
	if (process.env.GREENHOUSE_CAPTURE) {
		await mkdir(output, { recursive: true })
		await page.screenshot({ path: `${output}/training-cancelled.png`, fullPage: true })
		await writeFile(
			`${output}/training-responsiveness.json`,
			`${JSON.stringify({ health_response_ms: healthMs, fitting_epoch_observed: fittingEpoch, live_tick_advanced: true, cancellation_observed: true, validation_seed: 10000, stored_final_x: sample.final.x }, null, 2)}\n`,
		)
	}
})
