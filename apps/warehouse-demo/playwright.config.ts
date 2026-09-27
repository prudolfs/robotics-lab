import { defineConfig } from '@playwright/test'

export default defineConfig({
	testDir: './e2e',
	timeout: 120_000,
	use: {
		baseURL: 'http://127.0.0.1:8084',
		browserName: 'chromium',
		channel: 'chrome',
		launchOptions: { args: ['--enable-unsafe-webgpu'] },
		viewport: { width: 1440, height: 900 },
		screenshot: 'only-on-failure',
	},
})
