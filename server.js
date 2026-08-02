// production server — serves the built client and, later, the game API.
// Railway runs this via `npm start`; PORT is injected by the platform.
import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = join(__dirname, 'dist')

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())

// health check — Railway pings this to confirm the deploy came up
app.get('/healthz', (_req, res) => res.json({ ok: true }))

// Tile/DEM proxies — the SAME three the dev server runs (vite.config.js),
// for the same reasons: the browser must stay same-origin so the canvases
// Groundwork reads pixels back from are never tainted, and the OpenTopography
// key stays server-side. The key comes from the platform env (Railway
// Variables: OPENTOPO_KEY); without it the map editor's DEM source fails
// with a clear error while everything else — terrarium, imagery — works.
const OPENTOPO_KEY = process.env.OPENTOPO_KEY || process.env.VITE_OPENTOPO_KEY || ''
if (!OPENTOPO_KEY) console.warn('[toc] OPENTOPO_KEY is not set — the MAP EDITOR cannot fetch OpenTopography DEMs.')

// mounted paths strip the prefix: req.url arrives as everything AFTER it
const proxy = (prefix, upstreamUrl) => {
  app.use(prefix, async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end()
    try {
      const upstream = await fetch(upstreamUrl(req.url))
      res.status(upstream.status)
      const type = upstream.headers.get('content-type')
      if (type) res.set('content-type', type)
      // tiles and DEM patches are immutable for our purposes — let the
      // browser and the platform edge keep them
      if (upstream.ok) res.set('cache-control', 'public, max-age=86400')
      res.send(Buffer.from(await upstream.arrayBuffer()))
    } catch (err) {
      res.status(502).json({ error: `upstream fetch failed: ${err?.message ?? err}` })
    }
  })
}
proxy('/api/opentopo', (url) =>
  `https://portal.opentopography.org/API${url}${url.includes('?') ? '&' : '?'}API_Key=${OPENTOPO_KEY}`)
proxy('/api/terrarium', (url) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium${url}`)
proxy('/api/imagery', (url) =>
  `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile${url}`)

app.use(express.static(DIST))

// SPA fallback for client-side routes. Registered as plain middleware rather
// than app.get('*') — express 5's path parser rejects the bare wildcard.
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next()
  res.sendFile(join(DIST, 'index.html'))
})

app.listen(PORT, () => console.log(`TOC serving on :${PORT}`))
