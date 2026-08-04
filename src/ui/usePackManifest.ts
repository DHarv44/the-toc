// EDITING A PACK — the builder's write path.
//
// The one rule that shapes this: the builder edits the MANIFEST AS AUTHORED,
// never the built Pack. A built Pack has inheritance already resolved, so
// saving one back would bake the parent's rifles, ranks and billets into a
// thin variant that had deliberately declared none of them — turning a
// two-line pack into a copy of its parent the first time anybody renamed it.
// So the manifest is re-read from DISK, edits are applied field by field, and
// everything the builder does not touch passes through untouched.
import { useCallback, useEffect, useState } from 'react'
import { canAuthor, loadPackManifest, savePackManifest, type PackManifest } from '../packs/io'
import type { Pack } from '../packs/types'

export interface ManifestEditor {
  /** the manifest as it sits on disk — null while loading, or on failure */
  manifest: PackManifest | null
  /** the value that WOULD be saved: a pending edit, else what is on disk */
  value: (key: string) => unknown
  /** true when this field is the PACK'S OWN — absent means it is inherited
   *  (or simply unset), which is a real difference the author needs to see */
  owns: (key: string) => boolean
  set: (key: string, v: unknown) => void
  /** drop a pending edit and fall back to disk */
  revert: (key: string) => void
  dirty: boolean
  busy: boolean
  msg: string | null
  /** `extra` is applied ON TOP of the pending edits, for a caller that
   *  computes its patch at save time — `set` then `save` would not see it,
   *  because React state does not land inside the same tick. */
  save: (extra?: Record<string, unknown>) => Promise<void>
}

/** An `undefined` edit DELETES the field, which is how a pack gives a value
 *  back to its parent. An empty string is treated the same way: a blank text
 *  box means "this pack does not say", not "this pack says nothing". */
const isBlank = (v: unknown): boolean => v === undefined || v === ''

/** HOW A CATALOG TABLE IS AUTHORED — the three forms packs/index.ts resolves,
 *  and an editor has to know which it is looking at or it will happily
 *  overwrite one with another:
 *    own       the pack's own table, keyed by id — editable field by field
 *    subset    an ARRAY of ids picked out of the `extends` library — the pack
 *              chooses WHICH entries it fields, and cannot edit them, because
 *              they belong to the library and are shared BY REFERENCE with
 *              every other pack drawing on it
 *    inherited absent: the library's table, or the canonical pack's */
export type CatalogForm = 'own' | 'subset' | 'inherited'

export function catalogForm(manifest: PackManifest | null, table: string): CatalogForm {
  const cat = manifest?.catalogs as Record<string, unknown> | undefined
  const v = cat?.[table]
  if (Array.isArray(v)) return 'subset'
  if (v && typeof v === 'object') return 'own'
  return 'inherited'
}

/** the `extends` library this pack subsets, if it names one */
export const catalogLibrary = (manifest: PackManifest | null): string | undefined =>
  (manifest?.catalogs as Record<string, unknown> | undefined)?.extends as string | undefined

/** A BUILT PACK, viewed as a manifest. When authoring is off there is no file
 *  to read — but the army itself is right there in the bundle, so the tabs can
 *  still SHOW it. What they show is the RESOLVED pack (inheritance already
 *  applied), which is not the same thing as what its pack.json says; the UI
 *  labels it read-only so nobody mistakes one for the other. */
const asManifest = (p: Pack): PackManifest => ({
  id: p.id, name: p.name, abbr: p.abbr, nick: p.nick, motto: p.motto,
  inherits: p.inherits, patch: p.patch, cats: p.cats, startForce: p.startForce,
  catalogs: p.catalogs as unknown as Record<string, unknown>,
  bnKinds: p.bnKinds, rosters: p.rosters, billets: p.billets,
  ranks: p.ranks, awards: p.awards, callsigns: p.callsigns,
  staff: p.staff, net: p.net, reports: p.reports,
  formation: p.formation, mottos: p.mottos, nicks: p.nicks, assets: p.assets,
})

export function usePackManifest(pack: Pack | undefined): ManifestEditor {
  const packId = pack?.id ?? ''
  const [manifest, setManifest] = useState<PackManifest | null>(null)
  const [edits, setEdits] = useState<Record<string, unknown>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setManifest(null); setEdits({}); setMsg(null)
    // a built game has no write path at all, so do not even ask — the request
    // would fall through to the SPA and come back as index.html. Show the
    // army from the bundle instead of showing nothing.
    if (!canAuthor) {
      if (pack) setManifest(asManifest(pack))
      return () => { live = false }
    }
    loadPackManifest(packId)
      .then(m => { if (live) setManifest(m) })
      .catch(e => { if (live) setMsg(`FAILED to read pack.json: ${String((e as Error).message ?? e)}`) })
    return () => { live = false }
  }, [packId])

  const value = useCallback((key: string): unknown =>
    key in edits ? edits[key] : manifest?.[key], [edits, manifest])

  const owns = useCallback((key: string): boolean => !isBlank(value(key)), [value])

  const set = useCallback((key: string, v: unknown) => {
    setEdits(s => ({ ...s, [key]: v }))
    setMsg(null)
  }, [])

  const revert = useCallback((key: string) => {
    setEdits(s => { const { [key]: _drop, ...rest } = s; return rest })
  }, [])

  // a pending edit that matches disk is not a change — comparing serialized
  // keeps arrays and objects honest without a deep-equal dependency
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
  const dirty = Object.keys(edits).some(k => !same(edits[k], manifest?.[k]))

  const save = useCallback(async (extra?: Record<string, unknown>) => {
    if (!manifest) return
    setBusy(true); setMsg(null)
    try {
      const out: PackManifest = { ...manifest }
      for (const [k, v] of Object.entries({ ...edits, ...extra })) {
        if (isBlank(v)) delete out[k]      // back to inherited / unset
        else out[k] = v
      }
      await savePackManifest(packId, out)
      setManifest(out)
      setEdits({})
      setMsg('SAVED to pack.json')
    } catch (e) {
      setMsg(`FAILED: ${String((e as Error).message ?? e)}`)
    } finally { setBusy(false) }
  }, [manifest, edits, packId])

  return { manifest, value, owns, set, revert, dirty, busy, msg, save }
}
