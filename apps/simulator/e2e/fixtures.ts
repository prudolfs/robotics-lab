import type { Page } from '@playwright/test'

/**
 * Reusable helpers for the E2E suite.
 *
 * Tests read like user stories: they interact only through the public UI
 * (keyboard, mouse, controls) and never touch Zustand or simulation state
 * directly. See docs/e2e.md.
 */

/** Launch the simulator and wait for the core UI to be ready. */
export async function launchSimulator(page: Page, base: string = '/') {
	await page.goto(base)
	await page.getByTestId('simulator-canvas').waitFor({ state: 'visible' })
	await page.getByTestId('simulator-hud').waitFor({ state: 'visible' })
	await page.getByTestId('robot-marker').waitFor({ state: 'attached' })
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
