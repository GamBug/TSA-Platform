import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// The demo server serves the build at /student/. In development, API calls go to a running local demo.
const demoOrigin = process.env.TSA_DEMO_ORIGIN ?? 'http://127.0.0.1:4180'

export default defineConfig({
  base: '/student/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@legacy': path.resolve(import.meta.dirname, '../practice-prototype/public/app'),
    },
  },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, assetsInlineLimit: 0 },
  server: {
    host: '127.0.0.1',
    port: 5180,
    strictPort: true,
    proxy: { '/api': demoOrigin, '/media': demoOrigin },
  },
})
