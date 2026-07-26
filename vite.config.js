import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { packIo } from './tools/pack-io.mjs'

export default defineConfig({
  // packIo is apply:'serve' — the pack builder can save a manifest in dev,
  // and a built game has no write path at all
  plugins: [react(), packIo()],
  server: { port: 5187, strictPort: true },
  // a single React instance across the app, Mantine, and R3F (fixes "invalid hook call")
  resolve: { dedupe: ['react', 'react-dom'] },
  optimizeDeps: { include: ['react', 'react-dom', '@mantine/core', '@mantine/hooks'] },
})
