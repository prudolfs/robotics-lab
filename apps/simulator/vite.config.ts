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
})
