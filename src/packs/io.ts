// PACK I/O — the authoring seam. A pack is a FILE (src/packs/<id>/pack.json),
// so "save" has to mean the file changes; the dev-only Vite middleware in
// tools/pack-io.mjs does the writing and the production bundle has no write
// path at all.
//
// Creating a pack is the same call as saving one. There is no separate create
// endpoint because there is no separate thing: a pack exists when its manifest
// is on disk, and the discovery glob in packs/index.ts picks it up on the next
// load. Drop a folder in and the army exists — the same rule scenarios and
// maps already follow.

/** The manifest as authored, straight off disk — NOT a built Pack (no
 *  inheritance resolved, no catalogs merged). The builder edits this. */
export type PackManifest = Record<string, unknown>

export async function loadPackManifest(id: string): Promise<PackManifest> {
  const res = await fetch(`/__pack?id=${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error(await errorOf(res))
  return await res.json() as PackManifest
}

/** Write a manifest, creating the pack's folder if this is its first save.
 *  The app must RELOAD to see a new pack: discovery is a build-time glob, so
 *  a manifest that did not exist when the page loaded is not in it yet. */
export async function savePackManifest(id: string, man: PackManifest): Promise<void> {
  const res = await fetch(`/__pack?id=${encodeURIComponent(id)}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(man),
  })
  if (!res.ok) throw new Error(await errorOf(res))
}

const errorOf = async (res: Response): Promise<string> => {
  const body = await res.json().catch(() => ({})) as { error?: string }
  return body.error ?? `HTTP ${res.status}`
}

/** A pack id is a folder name: the middleware rejects anything else, so the
 *  UI slugifies before it asks. */
export const slugifyPackId = (s: string): string =>
  s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

/** The SKELETON a new pack starts from. Deliberately thin: an id, what it is
 *  called, and — if the author wants one — a parent to inherit functional
 *  content from. Everything else is authored in the builder, and a field that
 *  is absent is meaningfully absent rather than a guess we wrote in. */
export function newPackManifest(opts: {
  id: string; name: string; abbr: string; inherits?: string
}): PackManifest {
  return {
    id: opts.id,
    name: opts.name,
    abbr: opts.abbr,
    ...(opts.inherits ? { inherits: opts.inherits } : {}),
    organic: {},
    attached: {},
  }
}
