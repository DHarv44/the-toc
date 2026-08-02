// MAP EDITOR — Groundwork's authoring tool, mounted inside TOC.
//
// The editor is @dharv44/groundwork-builder, consumed as a package: pick a box
// of real Earth, tune it, and the export is the battlefield. TOC owns only the
// shell around it (this file) and, in P1, the SAVE TO PACK seam that writes the
// pack bytes into src/packs/<id>/maps/. Groundwork never learns what a TOC
// pack is; TOC never reimplements terrain authoring. (GROUNDWORK.md, P0.)
//
// Host obligations, per the builder's config contract:
//  - configureBuilder BEFORE mount, once — storage namespace + asset base.
//  - Endpoints: in dev the builder's defaults call /api/opentopo, /api/terrarium
//    and /api/imagery, which TOC's vite config now proxies exactly as the
//    standalone app does (key appended server-side, canvases never tainted).
//  - The Köppen raster ships inside the package; we hand its served URL back
//    as the asset base rather than copying the file anywhere.
import { useState } from 'react'
import { Box, Button, Group, Select, Text, TextInput } from '@mantine/core'
import { Builder, configureBuilder, packBytesFrom, useStore } from '@dharv44/groundwork-builder'
import { packFromBytes } from '@dharv44/groundwork-core'
import '@dharv44/groundwork-builder/styles.css'
import koppenUrl from '@dharv44/groundwork-builder/assets/koppen_0p1.png'
import { installedPacks } from '../packs'
import { packMaps } from '../packs/map-files'

const MONO = 'Consolas, monospace'
const KOPPEN_FILE = 'koppen_0p1.png'

// Once, at module load — before any <Builder /> can possibly mount. The asset
// base is wherever Vite serves the package's own Köppen raster from, so the
// builder finds its file without TOC shipping a copy.
configureBuilder({
  storagePrefix: 'toc.terrain',
  assetBase: koppenUrl.slice(0, koppenUrl.lastIndexOf(KOPPEN_FILE)),
  devHooks: false, // TOC owns window.__game; the editor gets no globals here
})

// filename/id from the display name — fixed at save, like every pack id
const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

// Which map was open last time. The builder already restores its own last BOX
// (bounds + settings, under toc.terrain) — this restores TOC's half: which
// pack it belongs to and what it is called, so reopening the editor puts you
// back on the map you were working, not on a blank NEW MAP.
const LAST_KEY = 'toc.map-editor.last'
const readLast = (): { packId: string; mapId: string } | null => {
  try { return JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null') } catch { return null }
}
const writeLast = (packId: string, mapId: string) =>
  localStorage.setItem(LAST_KEY, JSON.stringify({ packId, mapId }))

export default function MapEditor({ onExit }: { onExit: () => void }) {
  const last = readLast()
  const lastEntry = last ? packMaps(last.packId).find(m => m.mapId === last.mapId) : undefined
  const [packId, setPackId] = useState(() => lastEntry?.packId ?? installedPacks()[0]?.id ?? '')
  const [name, setName] = useState(() => lastEntry?.name.toUpperCase() ?? 'NEW MAP')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  // the builder's state, live — SAVE lights up once a terrain is actually built
  const built = useStore(s => !!s.heightField)

  // Load an existing pack map back into the editor. The builder has no import
  // path — it authors from BOUNDS — but the saved ground carries its bounds in
  // its manifest, so loading is: read them out, point the builder there, let
  // it rebuild (the DEM is in its IndexedDB cache if this box was built here).
  // Same box, fresh derivation; you continue where the map left off.
  const load = async (packRef: string, mapRef: string) => {
    const entry = packMaps(packRef).find(m => m.mapId === mapRef)
    if (!entry) return
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(entry.groundUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const files = await packFromBytes(await res.arrayBuffer())
      const s = useStore.getState()
      s.setBounds(files.manifest.bounds)
      setPackId(entry.packId)
      setName(entry.name.toUpperCase())
      writeLast(entry.packId, entry.mapId)
      setMsg(`LOADED ${entry.packId}/${entry.mapId} — rebuilding its box`)
      void s.generate()
    } catch (e) {
      setMsg(`FAILED: ${String((e as Error).message ?? e)}`)
    } finally { setBusy(false) }
  }

  // The documented host seam: the builder's own state, packed to bytes, and
  // POSTed to the dev write route — no download in the loop. What is saved is
  // exactly what Export would download.
  const save = async () => {
    const s = useStore.getState()
    if (!s.heightField) return
    const mapId = slugify(name)
    if (!mapId || !packId) { setMsg('FAILED: pick a pack and name the map'); return }
    setBusy(true); setMsg(null)
    try {
      const bytes = await packBytesFrom({
        heightField: s.heightField,
        osm: s.roads,
        waterMask: s.waterMask,
        baseName: mapId,
        createdAt: new Date().toISOString(),
      })
      const q = `pack=${packId}&map=${mapId}`
      const put = await fetch(`/__gwmap?${q}&file=ground`, {
        method: 'PUT', headers: { 'content-type': 'application/zip' },
        body: bytes.buffer as ArrayBuffer,
      })
      const body = await put.json() as { error?: string; bytes?: number }
      if (!put.ok) throw new Error(body.error ?? `HTTP ${put.status}`)
      // the sidecar is the SCENARIO layer — bases/MSR land here in P3; for now
      // it names the map and records where the ground came from
      const meta = await fetch(`/__gwmap?${q}&file=meta`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || mapId }),
      })
      if (!meta.ok) throw new Error((await meta.json() as { error?: string }).error ?? `HTTP ${meta.status}`)
      writeLast(packId, mapId)
      setMsg(`SAVED ${packId}/maps/${mapId} · ${((body.bytes ?? 0) / 1e6).toFixed(1)} MB`)
    } catch (e) {
      setMsg(`FAILED: ${String((e as Error).message ?? e)}`)
    } finally { setBusy(false) }
  }

  return (
    <Box pos="fixed" inset={0} bg="#05080b"
      style={{ zIndex: 100, display: 'flex', flexDirection: 'column', fontFamily: MONO }}>
      <Group gap="md" align="center" px="lg" py={10}
        style={{ borderBottom: '2px solid #2a3a48', flex: '0 0 auto' }}>
        <Box style={{ flex: 1 }}>
          <Text fz={22} fw={700} c="#dceeff" lh={1.1} style={{ letterSpacing: 3 }}>
            MAP EDITOR
          </Text>
          <Text fz={10} c="dark.3" style={{ letterSpacing: 1.5 }}>
            GROUNDWORK · PICK A BOX OF EARTH, TUNE IT, SAVE IT TO A PACK
          </Text>
        </Box>
        {msg && (
          <Text fz={10} c={msg.startsWith('FAILED') ? '#e8524a' : '#7ec8ff'}>{msg}</Text>
        )}
        <Select size="xs" w={150} value={packId} onChange={v => v && setPackId(v)}
          data={installedPacks().map(p => ({ value: p.id, label: p.abbr ?? p.id }))} />
        {packMaps().length > 0 && (
          <Select size="xs" w={190} placeholder="OPEN FROM PACK…" value={null}
            onChange={v => { if (v) { const [p, m] = v.split('/'); void load(p!, m!) } }}
            data={packMaps().map(m => ({
              value: `${m.packId}/${m.mapId}`, label: `${m.packId} · ${m.name}`,
            }))} />
        )}
        <TextInput size="xs" w={180} value={name} placeholder="MAP NAME"
          onChange={e => setName(e.currentTarget.value.toUpperCase())} />
        <Button size="sm" onClick={() => void save()} loading={busy} disabled={!built}>
          SAVE TO PACK
        </Button>
        <Button size="sm" variant="default" onClick={onExit}>◀ MAIN MENU</Button>
      </Group>

      {/* the builder owns everything below the bar; its styles are scoped to
          .gw on its own root and cannot reach TOC's chrome */}
      <Box style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <Builder />
      </Box>
    </Box>
  )
}
