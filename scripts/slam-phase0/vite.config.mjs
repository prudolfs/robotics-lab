import { defineConfig } from '../../apps/simulator/node_modules/vite/dist/node/index.js'
import { resolve } from 'node:path'
export default defineConfig({
	root: resolve('scripts/slam-phase0'),
	publicDir: resolve('.temp/slam-phase0'),
	resolve: {
		alias: {
			'three/webgpu': resolve('apps/simulator/node_modules/three/build/three.webgpu.js'),
			'three/tsl': resolve('apps/simulator/node_modules/three/build/three.tsl.js'),
			'three/addons': resolve('apps/simulator/node_modules/three/examples/jsm'),
			three: resolve('apps/simulator/node_modules/three/build/three.module.js'),
			'react-dom/client': resolve('apps/simulator/node_modules/react-dom/client.js'),
			react: resolve('apps/simulator/node_modules/react'),
			'@react-three/fiber': resolve('apps/simulator/node_modules/@react-three/fiber'),
		},
	},
	server: { host: '127.0.0.1', port: 5180, strictPort: true, fs: { allow: [resolve('.')] } },
	build: { outDir: resolve('.temp/slam-phase0/build'), emptyOutDir: true },
})
