import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [react()],
	publicDir: '../slam-demo/public',
	server: { host: '127.0.0.1', port: 8084, strictPort: true },
	build: { rollupOptions: { input: 'probe.html' } },
})
