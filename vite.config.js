import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { packIo } from './tools/pack-io.mjs'

export default defineConfig(({ mode }) => {
  // The Groundwork editor's DEM source needs an OpenTopography key. It lives in
  // .env.local (gitignored) as VITE_OPENTOPO_KEY and is appended SERVER-SIDE by
  // the proxy below, so it never reaches the browser. Without it the editor
  // still opens; DEM fetches fail with a clear error.
  const env = loadEnv(mode, process.cwd(), '')
  const key = env.VITE_OPENTOPO_KEY ?? ''
  if (!key) console.warn('[toc] VITE_OPENTOPO_KEY is not set — the MAP EDITOR cannot fetch DEMs.')

  return {
    // packIo is apply:'serve' — the pack builder can save a manifest in dev,
    // and a built game has no write path at all
    plugins: [react(), packIo()],
    server: {
      port: 5187,
      strictPort: true,
      // SAVE TO PACK writes ground.gwpack + map.json into src/packs/*/maps/ —
      // both match import.meta.glob patterns (map-files.ts), so an unignored
      // watcher full-reloads the app the instant the editor saves, killing the
      // editor mid-save. Ignored here; pack-io invalidates the discovery
      // module after a write instead, so the next navigation still sees it.
      watch: { ignored: ['**/src/packs/*/maps/**', '**/src/packs/*/scenarios/**'] },
      // The Groundwork editor's tile services, proxied exactly as its standalone
      // app proxies them: the key stays server-side, and the canvases the builder
      // reads pixels back from are same-origin, never tainted. The package's dev
      // defaults call these exact paths.
      proxy: {
        '/api/opentopo': {
          target: 'https://portal.opentopography.org',
          changeOrigin: true,
          rewrite: (path) => {
            const rewritten = path.replace(/^\/api\/opentopo/, '/API')
            return rewritten + (rewritten.includes('?') ? '&' : '?') + 'API_Key=' + key
          },
        },
        '/api/terrarium': {
          target: 'https://s3.amazonaws.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/terrarium/, '/elevation-tiles-prod/terrarium'),
        },
        '/api/imagery': {
          target: 'https://services.arcgisonline.com',
          changeOrigin: true,
          rewrite: (path) =>
            path.replace(/^\/api\/imagery/, '/ArcGIS/rest/services/World_Imagery/MapServer/tile'),
        },
      },
    },
    // a single React instance across the app, Mantine, and R3F (fixes "invalid hook call")
    resolve: { dedupe: ['react', 'react-dom'] },
    optimizeDeps: {
      include: [
        'react', 'react-dom', '@mantine/core', '@mantine/hooks',
        // The builder is excluded (below), so ITS dependencies are not seen by
        // the prebundle scan — but leaflet is CJS and must be prebundled or the
        // builder's named imports of it fail at runtime. Nested-include syntax
        // prebundles a dep on an excluded package's behalf.
        '@dharv44/groundwork-builder > leaflet',
        '@dharv44/groundwork-builder > react-leaflet',
        '@dharv44/groundwork-builder > geotiff',
        '@dharv44/groundwork-builder > zustand',
        // drei is only imported BY the builder, so the scanner never sees it —
        // unprebundled it leaks its own CJS deps (stats.js) as raw imports
        '@dharv44/groundwork-builder > @react-three/drei',
      ],
      // The builder ships `?worker` imports for esbuild pre-bundling to trip on;
      // excluded, Vite serves it as source and handles the workers itself.
      // (Known risk flagged by the Groundwork packaging smoke test.)
      exclude: ['@dharv44/groundwork-builder'],
    },
  }
})
