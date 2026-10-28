import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'

const proxy = {
	'/api/v1/greenhouse': {
		target: process.env.GREENHOUSE_SERVER_ORIGIN ?? 'http://127.0.0.1:8001',
		ws: true,
		// Preserve the browser Origin so the local backend can validate it.
	},
}

export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
	server: { proxy },
	preview: { proxy },
})
