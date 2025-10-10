import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Clean config for payment screen app
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Allow external access for mobile testing
    port: 5173
  },
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        // Remove console.log, console.info, console.debug in production
        // Keep console.error and console.warn for critical issues
        drop_console: ['log', 'info', 'debug'],
        drop_debugger: true
      }
    }
  }
})
