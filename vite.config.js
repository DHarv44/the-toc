import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5187, strictPort: true },
  // a single React instance across the app, Mantine, and R3F (fixes "invalid hook call")
  resolve: { dedupe: ['react', 'react-dom'] },
  optimizeDeps: { include: ['react', 'react-dom', '@mantine/core', '@mantine/hooks'] },
})
