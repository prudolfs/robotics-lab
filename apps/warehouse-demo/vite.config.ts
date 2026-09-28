import react from '@vitejs/plugin-react-swc'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, '.', '')
	const proxy = {
		'/api/laya': {
			target: env.LAYA_ORIGIN || 'http://127.0.0.1:8000',
			changeOrigin: true,
			rewrite: (path: string) => path.replace(/^\/api\/laya/, ''),
		},
	}
	return {
		plugins: [react()],
		server: { host: '127.0.0.1', port: 8084, strictPort: true, proxy },
		preview: { proxy },
	}
})
