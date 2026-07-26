// PACK I/O — a DEV-ONLY Vite middleware that lets the pack builder write a
// pack manifest back to disk.
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
import { readFile, writeFile } from 'fs/promises'
import { resolve, sep } from 'path'

const ROOT = resolve(process.cwd(), 'src', 'packs')
const SLUG = /^[a-z0-9][a-z0-9-]*$/

function manifestPath(id) {
  if (!SLUG.test(id)) return null
  const p = resolve(ROOT, id, 'pack.json')
  // belt and braces: a slug cannot escape, but verify the resolved path anyway
  return p.startsWith(ROOT + sep) ? p : null
}

const readBody = (req) => new Promise((res, rej) => {
  let s = ''
  req.on('data', c => { s += c; if (s.length > 8e6) rej(new Error('body too large')) })
  req.on('end', () => res(s))
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
    },
  }
}
