import { defineConfig } from '@playwright/test'

/**
 * Playwright config used *only* by `scripts/build-readme-header.sh` to capture
 * the README header GIF. It mirrors the app's main `../playwright.config.ts`
 * `webServer` (Vite preview on :8080) so the harness boots the same build the
 * real E2E suite uses, but its `testDir` is this `screenshots/` folder so the
 * capture spec is kept out of the regular `pnpm -C apps/simulator test:e2e`
 * run (the main config points at `../e2e`).
 *
 * Invoke through the wrapper never `playwright test` directly.
 */
export default defineConfig({
	testDir: '.',
	outputDir: './.results',
	timeout: 120_000,
	expect: { timeout: 15_000 },
	retries: 0,
	workers: 1,
	reporter: [['list']],
	use: {
		baseURL: 'http://localhost:8080',
		headless: true,
		viewport: { width: 1280, height: 720 },
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
		launchOptions: {
			args: ['--js-flags=--expose-gc'],
		},
	},
	projects: [{ name: 'chromium', use: {} }],
	webServer: {
		command: 'pnpm build && pnpm preview --port 8080 --strictPort',
		url: 'http://localhost:8080',
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
})
