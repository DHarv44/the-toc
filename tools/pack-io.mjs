// PACK I/O — a DEV-ONLY Vite middleware that lets the pack builder write a
// pack manifest back to disk, and the map editor save a Groundwork export
// into a pack's maps/ folder.
//
// Packs are files (src/packs/<id>/pack.json), and the builder is an authoring
// tool, so "save" has to mean the file changes. There is no server in a built
// game and this plugin is `apply: 'serve'`, so nothing here can ever ship —
// the production bundle has no write path at all.
//
// Guards, because this writes source files:
//   - pack id must be a plain slug, so it cannot contain a path
//   - the resolved path must still sit inside src/packs/<id>/
//   - the body must parse as JSON before anything is written
// Everything it touches is under version control; git is the undo.
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { resolve, sep } from 'path'

const ROOT = resolve(process.cwd(), 'src', 'packs')
const SLUG = /^[a-z0-9][a-z0-9-]*$/
// a .gwpack is millions of quantized samples; Colorado at 30 m came out ~35 MB
const MAX_GWPACK = 400e6

function manifestPath(id) {
  if (!SLUG.test(id)) return null
  const p = resolve(ROOT, id, 'pack.json')
  // belt and braces: a slug cannot escape, but verify the resolved path anyway
  return p.startsWith(ROOT + sep) ? p : null
}

// A map's folder inside a pack: src/packs/<pack>/maps/<map>/. Both ids are
// slug-guarded, and the resolved path re-checked, because this writes source.
function mapDir(pack, map) {
  if (!SLUG.test(pack) || !SLUG.test(map)) return null
  const p = resolve(ROOT, pack, 'maps', map)
  return p.startsWith(ROOT + sep) ? p : null
}

// A scenario's home: src/packs/<pack>/scenarios/. Same guards.
function scenariosDir(pack, id) {
  if (!SLUG.test(pack) || !SLUG.test(id)) return null
  const p = resolve(ROOT, pack, 'scenarios')
  return p.startsWith(ROOT + sep) ? p : null
}

const readBody = (req) => new Promise((res, rej) => {
  let s = ''
  req.on('data', c => { s += c; if (s.length > 8e6) rej(new Error('body too large')) })
  req.on('end', () => res(s))
  req.on('error', rej)
})

const readBinaryBody = (req, cap) => new Promise((res, rej) => {
  const chunks = []
  let n = 0
  req.on('data', c => {
    n += c.length
    if (n > cap) rej(new Error(`body too large (${n} > ${cap})`))
    else chunks.push(c)
  })
  req.on('end', () => res(Buffer.concat(chunks)))
  req.on('error', rej)
})

export function packIo() {
  return {
    name: 'toc-pack-io',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__pack', async (req, res) => {
        const send = (code, obj) => {
          res.statusCode = code
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(obj))
        }
        try {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const id = url.searchParams.get('id') ?? ''
          const file = manifestPath(id)
          if (!file) return send(400, { error: `bad pack id '${id}'` })

          if (req.method === 'GET') {
            return send(200, JSON.parse(await readFile(file, 'utf8')))
          }
          if (req.method === 'PUT') {
            const raw = await readBody(req)
            let parsed
            try { parsed = JSON.parse(raw) } catch (e) {
              return send(400, { error: `not valid JSON: ${e.message}` })
            }
            // re-serialize from the parse, so nothing malformed reaches the file
            await writeFile(file, JSON.stringify(parsed, null, 2) + '\n', 'utf8')
            return send(200, { ok: true, file })
          }
          return send(405, { error: 'GET or PUT' })
        } catch (e) {
          return send(500, { error: String(e?.message ?? e) })
        }
      })

      // The MAP EDITOR's save seam: PUT the Groundwork export into a pack.
      //   /__gwmap?pack=1cd&map=front-range&file=ground   raw .gwpack bytes
      //   /__gwmap?pack=1cd&map=front-range&file=meta     the map.json sidecar
      // The ground is written verbatim (its own zip structure IS its
      // validation — the reader rejects a non-pack); the sidecar is parsed and
      // re-serialized like every JSON this middleware touches.
      server.middlewares.use('/__gwmap', async (req, res) => {
        const send = (code, obj) => {
          res.statusCode = code
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(obj))
        }
        try {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const dir = mapDir(url.searchParams.get('pack') ?? '', url.searchParams.get('map') ?? '')
          const kind = url.searchParams.get('file') ?? ''
          if (!dir) return send(400, { error: 'bad pack/map id' })
          if (req.method !== 'PUT') return send(405, { error: 'PUT' })

          // The maps folders are excluded from Vite's watcher (a save must not
          // reload the app out from under the editor), so discovery is
          // invalidated by hand: the glob in map-files.ts re-runs on the next
          // page load and picks the new map up.
          const invalidateDiscovery = () => {
            // The watcher ignores the maps folders (a save must not reload the
            // app), which also means Vite's transform cache never hears about
            // the write. Invalidate by hand: the discovery module AND every
            // cached module under this map's folder — the sidecar map.json is
            // an eager import, and serving its stale cache is how an authored
            // base silently fails to arrive.
            // (Module-graph paths use forward slashes on every OS.)
            const files = [resolve(process.cwd(), 'src', 'packs', 'map-files.ts'), dir]
              .map(p => p.replace(/\\/g, '/'))
            for (const [file, mods] of server.moduleGraph.fileToModulesMap) {
              if (file === files[0] || file.startsWith(files[1] + '/')) {
                for (const m of mods) server.moduleGraph.invalidateModule(m)
              }
            }
          }

          if (kind === 'ground') {
            const buf = await readBinaryBody(req, MAX_GWPACK)
            // 'PK' — a zip, which is what a .gwpack is. Anything else is a
            // client bug and must not land in the pack folder.
            if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
              return send(400, { error: 'not a .gwpack (zip magic missing)' })
            }
            await mkdir(dir, { recursive: true })
            const file = resolve(dir, 'ground.gwpack')
            await writeFile(file, buf)
            invalidateDiscovery()
            return send(200, { ok: true, file, bytes: buf.length })
          }
          if (kind === 'meta') {
            const raw = await readBody(req)
            let parsed
            try { parsed = JSON.parse(raw) } catch (e) {
              return send(400, { error: `not valid JSON: ${e.message}` })
            }
            await mkdir(dir, { recursive: true })
            const file = resolve(dir, 'map.json')
            await writeFile(file, JSON.stringify(parsed, null, 2) + '\n', 'utf8')
            invalidateDiscovery()
            return send(200, { ok: true, file })
          }
          return send(400, { error: "file must be 'ground' or 'meta'" })
        } catch (e) {
          return send(500, { error: String(e?.message ?? e) })
        }
      })

      // The SCENARIO BUILDER's save seam (SCENARIO-MODEL.md): the client PUTs
      // the WHOLE ScenarioSpec; the server picks the disk form — one file
      // until the scenario has missions, then a folder with each mission as
      // its own NN-id.json (the number prefix is the mainline order). The
      // other form's leftovers are removed so exactly one form ever exists.
      //   PUT /__gwscenario?pack=1cd&id=iron-triangle
      // Parsed and re-serialized like every JSON this middleware touches; the
      // scenarios folders are watcher-ignored (a save must not reload the app
      // under the builder), so discovery and the folder's cached modules are
      // invalidated by hand.
      server.middlewares.use('/__gwscenario', async (req, res) => {
        const send = (code, obj) => {
          res.statusCode = code
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(obj))
        }
        try {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const id = url.searchParams.get('id') ?? ''
          const home = scenariosDir(url.searchParams.get('pack') ?? '', id)
          if (!home) return send(400, { error: 'bad pack/scenario id' })
          if (req.method !== 'PUT') return send(405, { error: 'PUT' })
          const raw = await readBody(req)
          let spec
          try { spec = JSON.parse(raw) } catch (e) {
            return send(400, { error: `not valid JSON: ${e.message}` })
          }

          const flatFile = resolve(home, `${id}.json`)
          const folder = resolve(home, id)
          const missions = Array.isArray(spec.missions) ? spec.missions : []
          let file
          if (missions.length) {
            for (const m of missions) {
              if (!m?.id || !SLUG.test(m.id)) return send(400, { error: `bad mission id '${m?.id}'` })
            }
            // folder form: scenario.json (sans missions) + missions as files
            await rm(folder, { recursive: true, force: true })
            await rm(flatFile, { force: true })
            await mkdir(resolve(folder, 'missions'), { recursive: true })
            const { missions: _m, ...base } = spec
            file = resolve(folder, 'scenario.json')
            await writeFile(file, JSON.stringify(base, null, 2) + '\n', 'utf8')
            for (let i = 0; i < missions.length; i++) {
              const mf = resolve(folder, 'missions',
                `${String(i + 1).padStart(2, '0')}-${missions[i].id}.json`)
              await writeFile(mf, JSON.stringify(missions[i], null, 2) + '\n', 'utf8')
            }
          } else {
            // flat form: one file is the whole war
            await rm(folder, { recursive: true, force: true })
            await mkdir(home, { recursive: true })
            file = flatFile
            await writeFile(file, JSON.stringify(spec, null, 2) + '\n', 'utf8')
          }

          const files = [resolve(process.cwd(), 'src', 'packs', 'scenario-files.ts'), home]
            .map(p => p.replace(/\\/g, '/'))
          for (const [f, mods] of server.moduleGraph.fileToModulesMap) {
            if (f === files[0] || f.startsWith(files[1] + '/')) {
              for (const m of mods) server.moduleGraph.invalidateModule(m)
            }
          }
          return send(200, { ok: true, file })
        } catch (e) {
          return send(500, { error: String(e?.message ?? e) })
        }
      })
    },
  }
}
