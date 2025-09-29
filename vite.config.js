import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Clean config for payment screen app
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Allow external access for mobile testing
    port: 5173
  }
})
