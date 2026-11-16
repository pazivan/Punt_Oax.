import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.PUNTOAX_API_PROXY || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
