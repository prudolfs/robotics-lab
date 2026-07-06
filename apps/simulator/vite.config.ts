import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'

export default defineConfig({
	server: {
		port: 8080,
	},
	resolve: {
		tsconfigPaths: true,
	},
	plugins: [tailwindcss(), viteReact()],
	// Vitest defaults to `**/*.spec.ts` includes; keep Playwright specs out of
	// the Node unit suite. They run under `pnpm test:e2e` instead.
	test: {
		include: ['src/**/*.test.ts'],
		exclude: ['e2e/**', 'node_modules/**'],
	},
})
