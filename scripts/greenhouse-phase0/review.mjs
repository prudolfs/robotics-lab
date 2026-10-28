import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from '../../apps/slam-demo/node_modules/@playwright/test/index.mjs'

const output = new URL('../../docs/greenhouse-demo/phase0/', import.meta.url)
const recording = JSON.parse(await readFile(new URL('python-snapshots.json', output), 'utf8'))
assert.ok(recording.frames.every((frame) => frame.capsule.position[2] >= 0.045))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors = []
const warnings = []
const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 })
page.on('pageerror', (error) => errors.push(String(error)))
page.on('console', (message) => {
	if (message.type() === 'error') errors.push(message.text())
	if (message.type() === 'warning') warnings.push(message.text())
})
const endpoint = process.env.GREENHOUSE_PROBE_URL ?? 'http://127.0.0.1:8085'
try {
	await page.goto(endpoint)
	await page.getByTestId('backend').filter({ hasText: 'WebGPU active' }).waitFor()
	await page.waitForFunction(() => window.__greenhouseProbe?.robot?.length === 4)
	const initial = await page.evaluate(() => window.__greenhouseProbe)
	const gpu = await page.evaluate(async () => {
		const adapter = await navigator.gpu.requestAdapter()
		return {
			available: !!adapter,
			info: adapter
				? {
						vendor: adapter.info.vendor,
						architecture: adapter.info.architecture,
						device: adapter.info.device,
						description: adapter.info.description,
					}
				: null,
		}
	})
	const expected = recording.frames[0].robot
	assert.ok(Math.abs(initial.robot[0] - expected.x) < 1e-6)
	assert.ok(Math.abs(initial.robot[2] + expected.y) < 1e-6)
	assert.ok(Math.abs(initial.robot[3] - expected.heading) < 1e-6)
	const buttonStyle = await page
		.getByRole('button', { name: 'Play recording' })
		.evaluate((element) => {
			const styles = getComputedStyle(element)
			return {
				slot: element.dataset.slot,
				background: styles.backgroundColor,
				padding: styles.paddingLeft,
				radius: styles.borderRadius,
			}
		})
	assert.equal(buttonStyle.slot, 'button')
	assert.notEqual(buttonStyle.background, 'rgba(0, 0, 0, 0)')
	assert.ok(Number.parseFloat(buttonStyle.padding) > 0)
	await page.screenshot({ path: new URL('webgpu-overview.png', output).pathname })
	const before = await page.locator('canvas').screenshot()
	await page.mouse.move(800, 370)
	await page.mouse.down()
	await page.mouse.move(900, 420, { steps: 8 })
	await page.mouse.up()
	await page.waitForTimeout(300)
	const after = await page.locator('canvas').screenshot()
	const orbitControls =
		createHash('sha256').update(before).digest('hex') !==
		createHash('sha256').update(after).digest('hex')
	assert.ok(orbitControls)
	await page.getByRole('button', { name: 'Play recording' }).focus()
	await page.keyboard.press('Space')
	await page.getByRole('button', { name: 'Pause playback' }).waitFor()
	await page.waitForFunction(() => window.__greenhouseProbe?.frame > 3)
	const moving = await page.evaluate(() => window.__greenhouseProbe)
	assert.notEqual(moving.robot[0], initial.robot[0])
	await page.getByRole('button', { name: 'Reset recording' }).click()
	await page.waitForFunction(
		() => window.__greenhouseProbe?.generation === 1 && window.__greenhouseProbe.frame === 0,
	)
	const reset = await page.evaluate(() => window.__greenhouseProbe)
	assert.deepEqual(reset.robot, initial.robot)
	await page.getByRole('button', { name: 'Show delivery' }).click()
	await page.waitForFunction(() => window.__greenhouseProbe?.generation === 2)
	const delivered = await page.evaluate(() => window.__greenhouseProbe)
	const final = recording.final.capsule.position
	assert.ok(Math.abs(delivered.capsule[0] - final[0]) < 1e-6)
	assert.ok(Math.abs(delivered.capsule[1] - final[2]) < 1e-6)
	assert.ok(Math.abs(delivered.capsule[2] + final[1]) < 1e-6)
	await page.screenshot({ path: new URL('webgpu-delivery.png', output).pathname })
	await page.getByRole('button', { name: 'Toggle canvas' }).click()
	assert.equal(await page.locator('canvas').count(), 0)
	await page.getByRole('button', { name: 'Toggle canvas' }).click()
	await page.waitForFunction(
		() => !!document.querySelector('canvas') && window.__greenhouseProbe?.generation === 2,
	)
	await page.waitForTimeout(500)
	assert.equal(await page.locator('canvas').count(), 1)
	const frameIntervals = await page.evaluate(
		() =>
			new Promise((resolve) => {
				const times = []
				let previous = performance.now()
				function sample(now) {
					times.push(now - previous)
					previous = now
					if (times.length < 120) requestAnimationFrame(sample)
					else resolve(times.slice(1).sort((a, b) => a - b))
				}
				requestAnimationFrame(sample)
			}),
	)
	await page.setViewportSize({ width: 390, height: 844 })
	const mobile = await page.evaluate(() => ({
		width: innerWidth,
		scrollWidth: document.documentElement.scrollWidth,
	}))
	assert.ok(mobile.scrollWidth <= mobile.width)
	await page.screenshot({ path: new URL('webgpu-mobile.png', output).pathname })
	const unsupported = await browser.newPage()
	await unsupported.addInitScript(() =>
		Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }),
	)
	await unsupported.goto(endpoint)
	await unsupported.getByTestId('backend').filter({ hasText: 'WebGPU is unavailable' }).waitFor()
	assert.equal(await unsupported.locator('canvas').count(), 0)
	assert.ok(await unsupported.getByRole('button', { name: 'Play recording' }).isDisabled())
	const report = {
		browser: await browser.version(),
		gpu,
		url: endpoint,
		source: 'Static playback of Python MuJoCo/PyTorch snapshots, not a live API session',
		no_webgpu_override_flags: true,
		backend: 'webgpu',
		checks: {
			python_coordinate_transform: true,
			playback_advances: true,
			reset_discards_old_timeline: true,
			final_capsule_matches_python: true,
			orbit_controls: orbitControls,
			tailwind_shadcn_button: buttonStyle,
			base_ui_keyboard_activation: true,
			canvas_unmount_remount: true,
			unsupported_webgpu_blocks_canvas: true,
			mobile_no_horizontal_overflow: true,
		},
		frame_intervals_ms: {
			median: frameIntervals[Math.floor(frameIntervals.length * 0.5)],
			p95: frameIntervals[Math.floor(frameIntervals.length * 0.95)],
		},
		initial,
		delivered,
		errors,
		warnings,
	}
	await writeFile(new URL('browser-probe.json', output), `${JSON.stringify(report, null, 2)}\n`)
	assert.deepEqual(errors, [])
	process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} finally {
	await browser.close()
}
