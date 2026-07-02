import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react-swc'

export default defineConfig({
  server: {
    port: 80,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    viteReact(),
  ],
})