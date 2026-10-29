import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { HttpModels } from '../src/api/generated/http'
import type { ServerMessage } from '../src/api/generated/websocket-server'
import { expect, test } from './fixtures'
import { openPanel } from './workspace-helpers'

const output = fileURLToPath(new URL('../../../docs/greenhouse-demo/phase5/', import.meta.url))
type Snapshot = Extract<ServerMessage, { kind: 'snapshot' }>

test('records manual input, stops safely, preserves review provenance and plays exact stored poses', async ({
	page,
	request,
}) => {
	test.setTimeout(40000)
	const snapshots: Snapshot[] = []
	const sent: string[] = []
	const errors: string[] = []
	page.on('pageerror', (error) => errors.push(String(error)))
	page.on('websocket', (socket) => {
		socket.on('framereceived', ({ payload }) => {
			const message = JSON.parse(String(payload)) as ServerMessage
			if (message.kind === 'snapshot') snapshots.push(message)
		})
		socket.on('framesent', ({ payload }) => {
			sent.push((JSON.parse(String(payload)) as { kind: string }).kind)
		})
	})
	await page.goto('/')
	await expect(page.getByTestId('renderer-status')).toHaveText('WebGPU active')
	await page.getByRole('button', { name: 'Teach manually', exact: true }).click()
	await expect(page.getByText('Manual teaching controller.', { exact: false })).toBeVisible()
	await openPanel(page, 'Teach')
	await page.getByRole('button', { name: 'Record demonstration', exact: true }).click()
	await expect(page.getByTestId('recording-status')).toHaveText(
		'Recording every executed control step.',
	)
	const controls = page.getByRole('group', { name: 'Manual teaching controls' })
	await expect(page.getByRole('button', { name: 'Forward', exact: true })).toBeEnabled()
	await controls.scrollIntoViewIfNeeded()
	await controls.focus()
	await page.keyboard.down('q')
	await expect.poll(() => snapshots.at(-1)?.scene.robot.lift_height ?? 0).toBeGreaterThan(0.13)
	await page.keyboard.up('q')
	const height = snapshots.at(-1)?.scene.robot.lift_height ?? 0
	await page.waitForTimeout(350)
	expect(Math.abs((snapshots.at(-1)?.scene.robot.lift_height ?? 0) - height)).toBeLessThan(0.025)
	await page.keyboard.down('w')
	await page.waitForTimeout(250)
	// Moving focus out of the teaching panel releases held controls.
	await page.getByRole('button', { name: 'Stop and save recording', exact: true }).focus()
	await page.keyboard.up('w')
	await page.waitForTimeout(400)
	expect(Math.abs(snapshots.at(-1)?.scene.observation.speed ?? 1)).toBeLessThan(0.035)
	if (process.env.GREENHOUSE_CAPTURE) {
		await mkdir(output, { recursive: true })
		await page.evaluate(() => window.scrollTo(0, 0))
		await page.screenshot({ path: `${output}/manual-teaching.png` })
	}
	await page.getByRole('button', { name: 'Stop and save recording', exact: true }).click()
	await expect(page.getByTestId('recording-status')).toHaveText(
		'Demonstration saved in the library.',
	)
	const id = snapshots.at(-1)?.last_episode_id
	expect(id).toBeTruthy()
	const before = (await (
		await request.get(`/api/v1/greenhouse/episodes/${id}`)
	).json()) as HttpModels['episode']
	expect(before.entry.episode.source).toBe('user')
	expect(before.entry.episode.outcome).toBe('incomplete')
	expect(before.entry.episode.frames.some((frame) => (frame.action.lift ?? 0) > 0)).toBe(true)
	expect(before.entry.episode.frames.some((frame) => (frame.action.throttle ?? 0) > 0)).toBe(true)
	expect(before.entry.episode.frames.at(-1)?.action.throttle).toBe(0)
	await page.getByLabel('Search demonstrations', { exact: true }).fill(id ?? '')
	await page
		.getByTestId(`episode-${id}`)
		.getByRole('button', { name: 'Review seed 42', exact: true })
		.click()
	await expect(page.getByRole('region', { name: 'Recorded episode playback' })).toBeVisible()
	await expect(page.getByRole('button', { name: 'Mark usable', exact: true })).toBeDisabled()
	await page
		.getByLabel('Review note', { exact: true })
		.fill('Automated manual-input check; incomplete, excluded from training.')
	await page.getByRole('button', { name: 'Needs work', exact: true }).click()
	await expect(page.getByTestId('dataset-message')).toContainText('source episode is unchanged')
	const after = (await (
		await request.get(`/api/v1/greenhouse/episodes/${id}`)
	).json()) as HttpModels['episode']
	expect(after.entry.sha256).toBe(before.entry.sha256)
	expect(after.entry.episode).toEqual(before.entry.episode)
	expect(after.entry.review.excluded).toBe(true)
	const liveTick = snapshots.at(-1)?.tick
	const commandCount = sent.length
	await page.getByLabel('Episode position', { exact: true }).focus()
	await page.keyboard.press('End')
	await expect(page.getByTestId('playback-frame')).toContainText(
		`Frame ${before.entry.episode.frames.length} /`,
	)
	await expect
		.poll(() => page.evaluate(() => window.__greenhouseReview?.pose?.lift))
		.toBe(before.entry.episode.final_state.lift_height)
	const pose = await page.evaluate(() => window.__greenhouseReview?.pose)
	expect(pose?.robot[0]).toBeCloseTo(before.entry.episode.final_state.x, 7)
	const expectedCapsule = [
		before.entry.episode.final_state.capsule[0],
		before.entry.episode.final_state.capsule[2],
		-before.entry.episode.final_state.capsule[1],
	]
	for (let axis = 0; axis < 3; axis++)
		expect(pose?.capsule[axis]).toBeCloseTo(expectedCapsule[axis], 12)
	await page.getByLabel('Episode position', { exact: true }).press('Home')
	await page.getByRole('button', { name: 'Play recording', exact: true }).click()
	await expect
		.poll(async () =>
			Number((await page.getByTestId('playback-frame').textContent())?.split(' ')[1]),
		)
		.toBeGreaterThan(2)
	await page.getByRole('button', { name: 'Pause playback', exact: true }).click()
	expect(snapshots.at(-1)?.tick).toBe(liveTick)
	expect(sent.length).toBe(commandCount)
	await expect(page.getByRole('button', { name: 'Resume collection', exact: true })).toBeDisabled()
	if (process.env.GREENHOUSE_CAPTURE) {
		await writeFile(
			`${output}/manual-example-v1.json`,
			`${JSON.stringify({ schema_version: 1, episodes: [after.entry] })}\n`,
		)
		await page.screenshot({ path: `${output}/recorded-state-playback.png` })
		await writeFile(
			`${output}/manual-playback-check.json`,
			`${JSON.stringify({ source: 'Automated browser input through manual UI; not a human-collected demonstration', episode_id: id, sha256: after.entry.sha256, source_episode_unchanged: true, exact_final_pose: pose, playback_sends_no_commands: true, live_tick_frozen: liveTick, errors }, null, 2)}\n`,
		)
	}
	await page.getByRole('button', { name: 'Return to live', exact: true }).click()
	await expect(page.getByRole('button', { name: 'Resume collection', exact: true })).toBeEnabled()
	expect(errors).toEqual([])
})

test('collects expert demonstrations, validates splits and roundtrips the portable export', async ({
	page,
	request,
}) => {
	test.setTimeout(45000)
	await page.goto('/')
	await expect(page.getByTestId('connection-status')).toHaveText('Connected')
	await openPanel(page, 'Teach')
	await page.getByRole('button', { name: 'Collect 20 expert demos', exact: true }).click()
	await expect(page.getByTestId('dataset-message')).toContainText(
		'Expert set ready: training seeds',
		{
			timeout: 30000,
		},
	)
	await expect(page.getByTestId('connection-status')).toHaveText('Connected')
	await page.getByRole('button', { name: 'Validate dataset', exact: true }).click()
	await expect(page.getByTestId('dataset-validation')).toContainText(
		'Ready for the first training run',
		{ timeout: 15000 },
	)
	const dataset = (await (
		await request.get('/api/v1/greenhouse/dataset')
	).json()) as HttpModels['dataset']
	const expert = dataset.episodes.find(
		(item) => item.seed === 0 && item.source === 'scripted_expert',
	)
	if (!expert) throw new Error('Missing expert seed 0')
	await page.getByLabel('Search demonstrations', { exact: true }).fill(expert.episode_id)
	await page.getByRole('button', { name: 'Review seed 0', exact: true }).first().click()
	await expect(page.getByRole('region', { name: 'Recorded episode playback' })).toBeVisible()
	await expect(page.getByRole('button', { name: 'Mark usable', exact: true })).toBeEnabled()
	await page.getByRole('button', { name: 'Exclude episode', exact: true }).click()
	await expect(page.getByTestId('dataset-message')).toContainText('source episode is unchanged')
	await page.getByRole('button', { name: 'Include episode', exact: true }).click()
	await expect(page.getByTestId('dataset-message')).toContainText('source episode is unchanged')
	const downloadPromise = page.waitForEvent('download')
	await page.getByRole('button', { name: 'Export episode', exact: true }).click()
	const download = await downloadPromise
	const file = await download.path()
	if (!file) throw new Error('Missing exported dataset file')
	const buffer = await readFile(file)
	await page
		.getByLabel('Import demonstrations', { exact: false })
		.setInputFiles({ name: 'roundtrip.json', mimeType: 'application/json', buffer })
	await expect(page.getByTestId('dataset-message')).toContainText(
		'0; 1 identical episodes already existed',
	)
	if (process.env.GREENHOUSE_CAPTURE) {
		await mkdir(output, { recursive: true })
		await page.screenshot({ path: `${output}/demonstration-library.png`, fullPage: true })
		await writeFile(`${output}/expert-example-v1.json`, buffer)
	}
})
