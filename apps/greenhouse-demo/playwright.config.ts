import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

export default defineConfig({
	testDir: './e2e',
	fullyParallel: false,
	workers: 1,
	timeout: 20000,
	expect: { timeout: 10000 },
	use: {
		baseURL: process.env.GREENHOUSE_E2E_URL ?? 'http://127.0.0.1:8086',
		channel: 'chrome',
		headless: true,
		viewport: { width: 1360, height: 900 },
		trace: 'retain-on-failure',
	},
	webServer: process.env.GREENHOUSE_E2E_URL
		? undefined
		: {
				command: 'pnpm dev:greenhouse',
				cwd: fileURLToPath(new URL('../../', import.meta.url)),
				url: 'http://127.0.0.1:8086',
				reuseExistingServer: !process.env.CI,
				timeout: 30000,
				gracefulShutdown: { signal: 'SIGTERM', timeout: 8000 },
			},
})
