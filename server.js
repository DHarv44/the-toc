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

// API routes mount here, ahead of the SPA fallback:
// app.use('/api', apiRouter)

app.use(express.static(DIST))

// SPA fallback for client-side routes. Registered as plain middleware rather
// than app.get('*') — express 5's path parser rejects the bare wildcard.
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next()
  res.sendFile(join(DIST, 'index.html'))
})

app.listen(PORT, () => console.log(`TOC serving on :${PORT}`))
