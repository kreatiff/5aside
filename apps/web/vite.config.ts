import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins: [react() as any],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5170',
        changeOrigin: true
      }
    }
  }
})
