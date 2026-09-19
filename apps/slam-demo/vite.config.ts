import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vitest/config'
export default defineConfig({
	plugins: [react()],
	server: { host: '127.0.0.1', port: 8082, strictPort: true },
	test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
