import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// When running inside Docker, the gateway is reachable via its service name.
// VITE_BACKEND_URL can be overridden (e.g. for local dev outside Docker).
const backendUrl = process.env.VITE_BACKEND_URL || 'http://gateway:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: backendUrl,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
      '/ai/ws': {
        target: backendUrl,
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
