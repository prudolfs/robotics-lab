// Capture frames for the README header GIF.
//
// This is a Playwright *capture* spec, not a behavioural test. It boots the
// simulator in a real browser, walks it through a short scripted scenario and
// saves a handful of PNG frames. The root `scripts/build-readme-header.sh`
// wrapper then assembles those frames into the animated GIF referenced by the
// repository READMEs.
//
// Why a spec and not a plain Node script? Playwright's `webServer` auto-boots
// the Vite preview build, and the app's existing world-space E2E driver
// (`apps/simulator/e2e/simulator.ts`) already handles canvas-projected
// clicking through the renderer bridge. Reusing that harness keeps the
// capture environment identical to what the E2E suite runs in.
//
// Run via the wrapper, not `playwright test` directly:
//
//   scripts/build-readme-header.sh
//
// Env knobs (set by the wrapper, overridable):
//   E2E_FRAMES_DIR  Where to write PNG frames (required).
//   E2E_FRAME_COUNT  Number of frames to capture (default: 6).
//   E2E_FRAME_MS    Wall-clock ms between frames (default: 1200).

import { expect, test } from '@playwright/test'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { launchSimulatorForWorld } from '../e2e/simulator'

test('capture README header frames', async ({ page }) => {
	const framesDir = process.env.E2E_FRAMES_DIR
	if (!framesDir) throw new Error('E2E_FRAMES_DIR must point at an output directory')
	await mkdir(framesDir, { recursive: true })

	const frameCount = Number(process.env.E2E_FRAME_COUNT ?? 6)
	const frameMs = Number(process.env.E2E_FRAME_MS ?? 1200)

	const sim = await launchSimulatorForWorld(page)

	const capture = async (i: number) => {
		const buf = await page.screenshot({ type: 'png' })
		// Zero-padded so ffmpeg's sequence input picks them up in order.
		await writeFile(join(framesDir, `frame-${String(i).padStart(4, '0')}.png`), buf)
	}

	// Frame 0: idle world, robot centred.
	await capture(0)

	// Queue two navigation goals so the robot keeps moving across the whole
	// capture window — the running A* / lidar / occupancy grid is the most
	// representative "product" moment of the app.
	await sim.placeGoal({ x: 2.5, y: -1.5 })

	for (let i = 1; i < frameCount; i++) {
		await page.waitForTimeout(frameMs)
		// Halfway through, queue a second goal so the tail keeps moving.
		if (i === Math.floor(frameCount / 2)) {
			await sim.queueGoal({ x: -2.5, y: 1.5 }).catch(() => {
				/* HUD nudge fallback may reject; ignore for capture */
			})
		}
		await capture(i)
	}

	const written = await readdir(framesDir)
	expect(written.length, `no frames written to ${framesDir}`).toBeGreaterThanOrEqual(frameCount)
})
