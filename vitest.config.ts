import { defineConfig } from 'vitest/config'

// Workspace-wide test configuration. Packages and apps inherit these defaults
// unless they provide their own vitest.config.
export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
	},
})
