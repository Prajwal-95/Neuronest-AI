import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks: {
          'three-vendor': ['three', '@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
  server: {
    port: 5173,
    // Without this Vite binds IPv6-only ([::1]) and http://127.0.0.1:5173 is
    // refused, which breaks the proxy target and any 127.0.0.1 link the user
    // types. `host: true` listens on both stacks.
    host: true,
    strictPort: true,
    proxy: {
      '/auth': 'http://127.0.0.1:8000',
      '/users': 'http://127.0.0.1:8000',
      '/games': 'http://127.0.0.1:8000',
      '/patients': 'http://127.0.0.1:8000',
      '/recommendations': 'http://127.0.0.1:8000',
      '/reminders': 'http://127.0.0.1:8000',
      '/sync': 'http://127.0.0.1:8000',
      '/caregiver': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
    },
  },
})
