/**
 * Vite configuration for React development/build workflows.
 * Runs dev server on port 5173 and binds to all interfaces for Docker-host access.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Required when running in Docker so the host machine can reach the dev server.
    host: true
  }
})
