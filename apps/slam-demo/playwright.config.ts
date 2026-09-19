import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
	testDir: './e2e',
	outputDir: './e2e/.results',
	timeout: 30000,
	expect: { timeout: 10000 },
	workers: 1,
	retries: 0,
	reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/.report' }]],
	use: {
		baseURL: 'http://127.0.0.1:4182',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
	webServer: {
		command: 'pnpm build && pnpm preview --host 127.0.0.1 --port 4182 --strictPort',
		url: 'http://127.0.0.1:4182',
		reuseExistingServer: false,
		timeout: 120000,
	},
})
