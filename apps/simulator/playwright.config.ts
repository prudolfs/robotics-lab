import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for the simulator app.
 *
 * Strategy: see docs/e2e.md.
 * - Small, deterministic suite.
 * - Tests interact only through public UI.
 * - Long-running stability tests live in separate projects and are opt-in.
 *
 * The dev server is reused in CI via `webServer`; locally `pnpm test:e2e`
 * will boot the Vite preview build automatically.
 */
export default defineConfig({
	testDir: './e2e',
	outputDir: './e2e/.results',
	timeout: 60_000,
	expect: { timeout: 10_000 },
	retries: 0,
	workers: 1,
	reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/.report' }]],
	use: {
		baseURL: 'http://localhost:8080',
		headless: true,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
		// Expose `window.gc()` so the Phase 8 memory-leak test can take
		// GC-accurate heap samples between rounds (instead of reading a stale
		// `performance.memory.usedJSHeapSize` that only refreshes on a major GC
		// that headless Chromium otherwise rarely schedules). Picking it up is
		// optional for the rest of the suite — they never call `window.gc`.
		launchOptions: {
			args: ['--js-flags=--expose-gc'],
		},
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
	webServer: {
		command: 'pnpm build && pnpm preview --port 8080 --strictPort',
		url: 'http://localhost:8080',
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
})
