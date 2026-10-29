import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { ServerMessage } from '../src/api/generated/websocket-server'
import { expect, test } from './fixtures'

type Snapshot = Extract<ServerMessage, { kind: 'snapshot' }>
const output = fileURLToPath(new URL('../../../docs/greenhouse-demo/phase5/', import.meta.url))

test('runs a live collection with pause, lift, follow view and valid delivery', async ({
	page,
}) => {
	test.setTimeout(40000)
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
	await expect(page.getByTestId('connection-status')).toHaveText('Connected')
	await expect(page.getByTestId('renderer-status')).toHaveText('WebGPU active')
	await page.getByRole('button', { name: 'Start collection', exact: true }).click()
	await expect(page.getByTestId('run-status')).toHaveText('Collecting')
	await expect.poll(() => frames.at(-1)?.tick ?? 0).toBeGreaterThan(5)
	await page.getByRole('button', { name: 'Pause collection', exact: true }).click()
	await expect(page.getByTestId('run-status')).toHaveText('Paused')
	const pausedTick = await page.getByTestId('simulation-tick').textContent()
	await page.waitForTimeout(250)
	await expect(page.getByTestId('simulation-tick')).toHaveText(pausedTick ?? '')
	await page.getByRole('button', { name: 'Resume collection', exact: true }).click()
	await expect
		.poll(
			() =>
				frames.some((frame) => frame.scene.robot.holding && frame.scene.robot.lift_height > 0.2),
			{ timeout: 15000 },
		)
		.toBe(true)
	await page.getByRole('button', { name: 'Follow', exact: true }).click()
	await expect(page.getByRole('button', { name: 'Follow', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true',
	)
	if (process.env.GREENHOUSE_CAPTURE) {
		await mkdir(output, { recursive: true })
		await page.waitForTimeout(300)
		await page.screenshot({ path: `${output}/carrying-follow.png` })
	}
	await expect(page.getByTestId('delivery-count')).toHaveText('1 / 1 delivered', { timeout: 20000 })
	await expect(page.getByTestId('run-status')).toHaveText('Delivery complete')
	await expect(page.getByTestId('collisions')).toHaveText('0')
	await expect(page.getByTestId('invalid-actions')).toHaveText('0')
	await expect(
		page.getByRole('button', { name: 'Collection complete', exact: true }),
	).toBeDisabled()
	const final = frames.at(-1)
	expect(final?.scene.delivered).toBe(true)
	expect(final?.scene.robot.holding).toBe(false)
	if (!final) throw new Error('Missing final server snapshot')
	const capsule = final.scene.capsule.position
	const tray = final.scene.tray.position
	expect(Math.hypot(capsule.x - tray.x, capsule.y - tray.y)).toBeLessThan(0.2)
	expect(frames.some((frame) => Math.abs(frame.scene.robot.left_wheel_angle) > 0.1)).toBe(true)
	expect(errors).toEqual([])
	await page.getByRole('button', { name: 'Overview', exact: true }).click()
	if (process.env.GREENHOUSE_CAPTURE) {
		await page.waitForTimeout(150)
		await page.screenshot({ path: `${output}/delivery-complete.png` })
		await writeFile(
			`${output}/browser-collection.json`,
			`${JSON.stringify(
				{
					url: page.url(),
					source: 'Live Python MuJoCo session; scripted reference controller',
					snapshots: frames.length,
					initial: frames[0],
					final,
					pause_freezes_tick: true,
					follow_camera_selected: true,
					page_errors: errors,
				},
				null,
				2,
			)}\n`,
		)
	}
})

test('resets an active run without old-state leakage and generates a different scenario', async ({
	page,
}) => {
	const frames: Snapshot[] = []
	page.on('websocket', (socket) =>
		socket.on('framereceived', ({ payload }) => {
			const message = JSON.parse(String(payload)) as ServerMessage
			if (message.kind === 'snapshot') frames.push(message)
		}),
	)
	await page.goto('/')
	await expect(page.getByTestId('connection-status')).toHaveText('Connected')
	const initial = frames.at(-1)?.scene
	await page.getByRole('button', { name: 'Start collection', exact: true }).click()
	await expect.poll(() => frames.at(-1)?.tick ?? 0).toBeGreaterThan(5)
	await page.getByRole('button', { name: 'Restart seed', exact: true }).click()
	await expect(page.getByTestId('session-generation')).toHaveText('1')
	await expect(page.getByTestId('run-status')).toHaveText('Ready to collect')
	await expect(page.getByTestId('simulation-tick')).toHaveText('0')
	expect(frames.at(-1)?.scene).toEqual(initial)
	await page.waitForTimeout(250)
	await expect(page.getByTestId('simulation-tick')).toHaveText('0')
	const seed = await page.getByTestId('session-seed').textContent()
	await page.getByRole('button', { name: 'New seed', exact: true }).click()
	await expect(page.getByTestId('session-generation')).toHaveText('2')
	await expect(page.getByTestId('session-seed')).not.toHaveText(seed ?? '')
	expect(frames.at(-1)?.scene.capsule).not.toEqual(initial?.capsule)
	await expect(page.getByTestId('run-status')).toHaveText('Ready to collect')
})
