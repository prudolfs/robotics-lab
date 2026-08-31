import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	server: {
		port: 8081,
	},
	resolve: {
		tsconfigPaths: true,
	},
	plugins: [tailwindcss(), viteReact()],
	test: {
		globals: true,
		include: ['src/**/*.test.ts'],
	},
})
