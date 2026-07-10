import { expect, type Page } from '@playwright/test'

/**
 * Reusable DOM / HUD helpers for the E2E suite.
 *
 * Tests read like user stories: they interact only through the public UI
 * (keyboard, mouse, controls) and never touch Zustand or simulation state
 * directly. See docs/e2e.md.
 *
 * Canvas / world-space interactions live in ./simulator.ts and express
 * themselves in *world* coordinates (metres), never canvas pixels — see
 * docs/e2e-world-click.md. This module intentionally keeps only the helpers
 * that read HUD text or wait on the render loop, none of which touch pixel
 * coordinates.
 */

/** Launch the simulator and wait for the core UI to be ready. */
export async function launchSimulator(page: Page, base: string = '/') {
	await page.goto(base)
	await page.getByTestId('simulator-canvas').waitFor({ state: 'visible' })
	await page.getByTestId('simulator-hud').waitFor({ state: 'visible' })
	await page.getByTestId('robot-marker').waitFor({ state: 'attached' })
	await waitForIdle(page)
}

/**
 * Switch the right panel to a given tab so its controls become visible /
 * clickable (Phase 2 of docs/hud.md moved the scattered HUDs into tabbed
 * panes; only the active tab's pane is visible). Idempotent. The default
 * active tab is `sensors`.
 */
export async function activateTab(page: Page, tab: 'sensors' | 'map' | 'nav' | 'teleop' | 'utils') {
	const btn = page.getByTestId(`panel-tab-${tab}`)
	await btn.click()
	await expect(btn).toHaveAttribute('aria-selected', 'true')
	// Inactive panes carry a `hidden` attribute; the active one does not.
	await expect(page.getByTestId(`panel-content-${tab}`)).toBeVisible()
}

/** Read the simulation clock (seconds) from the HUD readout.
 *
 *  The readout format changed across phases (Phase 3 moved it to the footer
 *  status bar as `SIM_TIME: HH:MM:SS.cc`), so this helper accepts both the old
 *  `Sim time: 1.42s` form and the new clock form. */
export async function getSimTime(page: Page): Promise<number> {
	const text = await page.getByTestId('sim-time').textContent()
	// New footer form: `SIM_TIME: 00:00:12.34`.
	const clock = text?.match(/SIM_TIME:\s*(\d+):(\d+):(\d+)\.(\d+)/)
	if (clock) {
		const hh = Number(clock[1])
		const mm = Number(clock[2])
		const ss = Number(clock[3])
		const cc = Number(clock[4])
		return hh * 3600 + mm * 60 + ss + cc / 100
	}
	// Legacy form: `Sim time: 1.42s`.
	const match = text?.match(/Sim time:\s*([0-9.]+)/)
	expect(match, `sim time readout not found: ${text}`).not.toBeNull()
	return Number.parseFloat(match?.[1])
}

/** Read the robot pose from the hidden debug readout: {x, y, heading (radians)}. */
export async function getRobotPose(page: Page): Promise<{ x: number; y: number; heading: number }> {
	const text = await page.getByTestId('robot-pose').textContent()
	const match = text?.match(/x:\s*(-?[0-9.]+)\s*y:\s*(-?[0-9.]+)\s*heading:\s*(-?[0-9.]+)°/)
	expect(match, `robot pose readout not found: ${text}`).not.toBeNull()
	return {
		x: Number.parseFloat(match?.[1]),
		y: Number.parseFloat(match?.[2]),
		heading: (Number.parseFloat(match?.[3]) * Math.PI) / 180,
	}
}

/** Reset the world and wait for the robot to settle. */
export async function resetWorld(page: Page) {
	await page.getByTestId('robot-debug').getByRole('button', { name: /reset/i }).click()
	await waitForIdle(page)
}

/**
 * Wait for the simulation to be idle / stable.
 *
 * We avoid timing assumptions: we wait until the simulation clock is updating
 * (i.e. the loop is running and the app is responsive).
 */
export async function waitForIdle(page: Page, opts: { timeoutMs?: number } = {}) {
	const timeout = opts.timeoutMs ?? 10_000
	// The hero signal of idleness: the FPS counter reports a value > 0,
	// meaning an animation loop is alive and the app rendered at least once.
	await page
		.getByTestId('fps-counter')
		.filter({ hasText: /FPS: [1-9]/ })
		.waitFor({ state: 'visible', timeout })
}
