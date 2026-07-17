import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { setupConsoleGuard, teardownConsoleGuard } from './console-guard'
import { activateTab, launchSimulator } from './fixtures'

/**
 * Milestone 13 — Playback widget (record & replay).
 *
 * The widget lives in the right panel's Playback tab. It records the live
 * simulation into a timeline, saves/loads runs as JSON, and replays a loaded
 * run by overriding the observed robot pose with the replayed frame's pose
 * (the lidar rays are recomputed against the live world so they follow the
 * motion). The widget can also be dragged out of the panel onto a viewport
 * edge like every other widget — covered by the existing drag specs.
 */

test.beforeEach(async ({ page }) => setupConsoleGuard(page))
test.afterEach(async () => teardownConsoleGuard())

async function openPlayback(page: import('@playwright/test').Page) {
	await launchSimulator(page)
	await activateTab(page, 'playback')
	await expect(page.getByTestId('playback-timeline')).toBeVisible()
}

/** Drive the robot with a held key for `holdMs`, release, and then wait until
 *  the recorded timeline holds at least one frame (the frame-count readout is
 *  `i / N` with `N > 0`).
 *
 *  The suite's own principle is "no timing assumptions — wait on observable
 *  state" (docs/e2e.md): the simulation loop captures a frame every
 *  `RECORD_EVERY_N_STEPS` fixed steps, so the exact wall-clock at which the
 *  first frame lands is load-dependent. Polling the readout (instead of
 *  trusting a fixed timeout) keeps the recording step deterministic whether
 *  the run is cold or shares the runner with 20 other specs. */
async function recordAFewFrames(
	page: import('@playwright/test').Page,
	key: 'w' | 'd',
	holdMs = 900,
	timeoutMs = 10_000,
) {
	await page.keyboard.down(key)
	await page.waitForTimeout(holdMs)
	await page.keyboard.up(key)
	// Cadence-committed: stop driving as soon as the timeline reflects
	// ≥1 captured frame, rather than waiting a fixed settle after release. This
	// is the observable-state signal for "the recorder captured something".
	await expect
		.poll(
			async () => {
				const count = await page.getByTestId('playback-frame-count').textContent()
				const m = count?.match(/^(\d+) \/ (\d+)$/)
				return m ? Number(m[2]) : 0
			},
			{ timeout: timeoutMs },
		)
		.toBeGreaterThan(0)
}

test.describe('Milestone 13 — Playback', () => {
	test('the widget renders in the Playback tab with all controls', async ({ page }) => {
		await openPlayback(page)
		await expect(page.getByTestId('record-start')).toBeVisible()
		await expect(page.getByTestId('run-save')).toBeDisabled()
		await expect(page.getByTestId('run-load')).toBeVisible()
		await expect(page.getByTestId('replay-play')).toBeDisabled()
		// Empty timeline → frame count is "— / —".
		await expect(page.getByTestId('playback-frame-count')).toContainText('— / —')
		await expect(page.getByTestId('playback-speed')).toHaveValue('1')
	})

	test('recording captures frames while driving, then enables Save and Play', async ({ page }) => {
		await openPlayback(page)

		// Start recording and drive the robot forward for a moment.
		await page.getByTestId('record-start').click()
		await expect(page.getByTestId('record-stop')).toBeVisible()
		await expect(page.getByTestId('playback-status')).toHaveText('recording')

		// Hold W to drive forward; the loop captures frames at the cadence.
		await recordAFewFrames(page, 'w')

		// Stop recording.
		await page.getByTestId('record-stop').click()
		await expect(page.getByTestId('record-start')).toBeVisible()
		await expect(page.getByTestId('playback-status')).toHaveText('idle')

		// The timeline now has frames: the frame count is "i / N" with N>0 and the
		// scrubber / Save / Play are enabled.
		await expect(page.getByTestId('playback-frame-count')).toContainText(/^\d+ \/ \d+$/)
		await expect(page.getByTestId('run-save')).toBeEnabled()
		await expect(page.getByTestId('replay-play')).toBeEnabled()
		// Scrubber max scales with the frame count.
		const scrubber = page.getByTestId('playback-scrubber')
		await expect(scrubber).toBeEnabled()
		const max = await scrubber.getAttribute('max')
		expect(Number(max)).toBeGreaterThan(0)
	})

	test('Save run downloads a JSON file and Load run replays it', async ({ page }) => {
		await openPlayback(page)

		// Record a short run while driving.
		await page.getByTestId('record-start').click()
		await recordAFewFrames(page, 'w')
		await page.getByTestId('record-stop').click()

		// Capture the download triggered by Save run.
		const download = page.waitForEvent('download')
		await page.getByTestId('run-save').click()
		const d = await download
		const suggested = d.suggestedFilename()
		expect(suggested.endsWith('.json')).toBe(true)
		// Save the download to a temp path and read it back as a Buffer.
		const tmp = `e2e/.results/${suggested}`
		await d.saveAs(tmp)
		const json: Buffer = readFileSync(tmp)

		// Clear the recording (so the timeline is empty again), then load the
		// saved run back via the hidden file input.
		await page.getByTestId('record-clear').click()
		await expect(page.getByTestId('playback-frame-count')).toContainText('— / —')

		await page.getByTestId('run-load-input').setInputFiles({
			name: suggested,
			mimeType: 'application/json',
			buffer: json,
		})
		// After load the timeline is populated again and the map label unchanged.
		await expect(page.getByTestId('playback-frame-count')).toContainText(/^\d+ \/ \d+$/)

		// Play the loaded run: the playhead advances and (eventually) reaches the
		// end where playback stops on its own.
		await page.getByTestId('replay-play').click()
		await expect(page.getByTestId('playback-status')).toHaveText('playing')
		// Wait until the player finishes on its own (status leaves "playing").
		await expect(page.getByTestId('playback-status')).not.toHaveText('playing', { timeout: 10_000 })
		// The last frame is shown (index == last).
		const scrubber = page.getByTestId('playback-scrubber')
		const lastMax = await scrubber.getAttribute('max')
		await expect(scrubber).toHaveValue(lastMax ?? '0')
	})

	test('scrubbing the timeline seeks and pauses, Exit returns to live control', async ({ page }) => {
		await openPlayback(page)

		// Record a short run.
		await page.getByTestId('record-start').click()
		await recordAFewFrames(page, 'd')
		await page.getByTestId('record-stop').click()

		// Scrub partway: status becomes paused. Seek to the second frame (index 1)
		// which always exists once there are at least two frames.
		const scrubber = page.getByTestId('playback-scrubber')
		const max = Number(await scrubber.getAttribute('max'))
		expect(max).toBeGreaterThanOrEqual(1)
		await scrubber.fill(String(Math.min(1, max)))
		await expect(page.getByTestId('playback-status')).toHaveText(/paused|idle/)

		// Exit replay returns the player to before the first frame (empty timeline
		// disabled controls again only after Clear; Exit just halts the playhead).
		await page.getByTestId('replay-stop').click()
		await expect(scrubber).toHaveValue('0')
	})

	test('Clear empties the recording and resets the timeline', async ({ page }) => {
		await openPlayback(page)
		await page.getByTestId('record-start').click()
		await recordAFewFrames(page, 'w', 300)
		await page.getByTestId('record-stop').click()
		await expect(page.getByTestId('playback-frame-count')).toContainText(/^\d+ \/ \d+$/)

		await page.getByTestId('record-clear').click()
		await expect(page.getByTestId('playback-frame-count')).toContainText('— / —')
		await expect(page.getByTestId('run-save')).toBeDisabled()
		await expect(page.getByTestId('replay-play')).toBeDisabled()
	})
})
