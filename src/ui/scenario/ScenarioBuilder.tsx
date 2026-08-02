// SCENARIO BUILDER — Eden on the BFT (SCENARIO-BUILDER.md, E1).
//
// A menu-level TOOL like the map editor: pick the pack that OWNS the scenario,
// pick a map (any installed pack's — cross-pack refs are the point), then work
// the sheet: palette arms an entity, click places (snapped through nearestLand
// with the unit's own mobility), select/inspect/drag/delete/undo. SAVE writes
// scenario.json through the dev route; discovery picks it up like maps.
// TOC owns nothing terrain here — the ground is read-only, the war is the file.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, Group, Select, Text, TextInput } from '@mantine/core'
import { installedPacks, PACKS } from '../../packs'
import { packMaps } from '../../packs/map-files'
import { packScenarios } from '../../packs/scenario-files'
import { loadGround, type Ground } from '../../world/pack/loadGround'
import { mapFromPack } from '../../world/pack/mapFromPack'
import type { WorldMap } from '../../world/WorldMap'
import { nearestLand } from '../../world/place'
import { UNIT_TYPES } from '../../domains/forces/catalog'
import { MODES, MODE_ORDER, type ModeId } from '../../engine/modes'
import type { ScenarioSide } from '../../scenario/types'
import {
  type EditorState, type Entity, emptyEditor, freshId,
  place, update, moveLive, beginDrag, remove, select, selected, undo, redo,
} from '../../scenario/edit'
import { entitiesFromSpec, specFromEntities, saveScenario } from '../../scenario/io'
import { planAccessTrack } from '../../world/access'
import { MapButton, MapControlStack } from '../MapControls'
import SheetCanvas, { type SheetHandle } from './SheetCanvas'
import Palette, { type Armed } from './Palette'
import Inspector from './Inspector'

const MONO = 'Consolas, monospace'
const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

// default lineup is data-driven: the first installed pack of each side
const defaultSides = () => ({
  friend: installedPacks().find(p => p.side === 'friend')?.id ?? installedPacks()[0]?.id ?? '',
  hostile: installedPacks().find(p => p.side === 'hostile')?.id ?? installedPacks()[0]?.id ?? '',
})

export default function ScenarioBuilder({ onExit }: { onExit: () => void }) {
  const [ownerPack, setOwnerPack] = useState(() => installedPacks()[0]?.id ?? '')
  const [name, setName] = useState('NEW SCENARIO')
  const [mapRef, setMapRef] = useState<string | null>(null) // 'packId/mapId'
  const [mode, setMode] = useState<ModeId>('attack-defend')
  const [sidePacks] = useState(defaultSides)
  const [side, setSide] = useState<ScenarioSide>('friend')
  const [armed, setArmed] = useState<Armed>(null)
  const [ed, setEd] = useState<EditorState>(emptyEditor)
  const [world, setWorld] = useState<{ map: WorldMap; ground: Ground } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  // the shared map-control toggles (MapControls) — same look as the game's BFT
  const [night, setNight] = useState(false)
  const [sat, setSat] = useState(false)
  const sheetRef = useRef<SheetHandle>(null)

  // FOB access tracks: the exact dirt road the game lays at H-hour, planned by
  // the SAME function (world/access). Keyed on cell-quantized FOB positions so
  // a drag recomputes on cell crossings, not every pointer event.
  const fobKey = ed.entities
    .filter(e => e.ent === 'structure' && e.kind === 'FOB')
    .map(e => `${e.id}:${Math.round(e.x / 50)}:${Math.round(e.y / 50)}`)
    .join('|')
  const tracks = useMemo(() => {
    if (!world) return []
    return ed.entities
      .filter(e => e.ent === 'structure' && e.kind === 'FOB')
      .map(e => ({ id: e.id, pts: planAccessTrack(world.map, e.x, e.y) }))
      .filter((t): t is { id: number; pts: { x: number; y: number }[] } => t.pts != null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, fobKey])

  // load the picked map's ground — the sheet and the snapping surface
  useEffect(() => {
    if (!mapRef) { setWorld(null); return }
    const [p, m] = mapRef.split('/') as [string, string]
    const entry = packMaps(p).find(e => e.mapId === m)
    if (!entry) return
    let live = true
    setBusy(true)
    void (async () => {
      try {
        const ground = await loadGround(entry.groundUrl)
        if (!live) return
        setWorld({ map: mapFromPack(ground, entry.sidecar), ground })
        setMsg(null)
      } catch (e) {
        if (live) setMsg(`MAP LOAD FAILED: ${String((e as Error).message ?? e)}`)
      } finally { if (live) setBusy(false) }
    })()
    return () => { live = false }
  }, [mapRef])

  // keyboard: delete + undo/redo (the entity workspace's spine)
  useEffect(() => {
    const key = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        setEd(s => (s.sel != null ? remove(s, s.sel) : s))
      } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z' && !ev.shiftKey) {
        ev.preventDefault(); setEd(undo)
      } else if ((ev.ctrlKey || ev.metaKey) && (ev.key.toLowerCase() === 'y' || (ev.key.toLowerCase() === 'z' && ev.shiftKey))) {
        ev.preventDefault(); setEd(redo)
      } else if (ev.key === 'Escape') {
        setArmed(null)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  const snap = (wx: number, wy: number, mob?: 'foot' | 'wheeled' | 'tracked') =>
    world ? nearestLand(world.map, wx, wy, mob) : { x: wx, y: wy }

  const onPlace = (wx: number, wy: number) => {
    if (!armed || !world) return
    if (armed.ent === 'structure') {
      const p = snap(wx, wy)
      setEd(s => place(s, { id: freshId(), ent: 'structure', side, kind: armed.kind, x: p.x, y: p.y }))
    } else {
      const p = snap(wx, wy, UNIT_TYPES[armed.type]?.mob)
      setEd(s => place(s, { id: freshId(), ent: 'unit', side, type: armed.type, x: p.x, y: p.y }))
    }
  }

  const open = (packId: string, scenarioId: string) => {
    const entry = packScenarios(packId).find(s => s.scenarioId === scenarioId)
    if (!entry) return
    setOwnerPack(entry.packId)
    setName(entry.name.toUpperCase())
    setMode(entry.spec.mode ?? 'attack-defend')
    setMapRef(entry.spec.map)
    // entities need the ground for norm→world; defer until the map loads
    const [p, m] = entry.spec.map.split('/') as [string, string]
    const mapEntry = packMaps(p).find(e => e.mapId === m)
    if (!mapEntry) { setMsg(`SCENARIO'S MAP ${entry.spec.map} IS NOT INSTALLED`); return }
    void loadGround(mapEntry.groundUrl).then(g => {
      setEd({ ...emptyEditor(), entities: entitiesFromSpec(entry.spec, g) })
    })
  }

  const save = async () => {
    if (!world || !mapRef) { setMsg('PICK A MAP FIRST'); return }
    const id = slugify(name)
    if (!id || !ownerPack) { setMsg('NAME THE SCENARIO AND PICK ITS PACK'); return }
    setBusy(true); setMsg(null)
    try {
      const spec = specFromEntities(
        { name: name.trim() || id, map: mapRef, mode, sides: sidePacks },
        ed.entities, world.ground,
      )
      await saveScenario(ownerPack, id, spec)
      setMsg(`SAVED ${ownerPack}/scenarios/${id} · ${ed.entities.length} ENTITIES`)
    } catch (e) {
      setMsg(`FAILED: ${String((e as Error).message ?? e)}`)
    } finally { setBusy(false) }
  }

  const scenarioOptions = useMemo(() => packScenarios().map(s => ({
    value: `${s.packId}/${s.scenarioId}`, label: `${s.packId} · ${s.name}`,
  })), [])

  return (
    <Box pos="fixed" inset={0} bg="#05080b"
      style={{ zIndex: 100, display: 'flex', flexDirection: 'column', fontFamily: MONO }}>
      <Group gap="sm" align="center" px="lg" py={10}
        style={{ borderBottom: '2px solid #2a3a48', flex: '0 0 auto' }}>
        <Box style={{ flex: 1 }}>
          <Text fz={22} fw={700} c="#dceeff" lh={1.1} style={{ letterSpacing: 3 }}>
            SCENARIO BUILDER
          </Text>
          <Text fz={10} c="dark.3" style={{ letterSpacing: 1.5 }}>
            EDEN ON THE BFT · PLACE THE WAR, THE GROUND IS READ-ONLY
          </Text>
        </Box>
        {msg && <Text fz={10} c={msg.startsWith('FAILED') ? '#e8524a' : '#7ec8ff'}>{msg}</Text>}
        {scenarioOptions.length > 0 && (
          <Select size="xs" w={190} placeholder="OPEN…" value={null}
            onChange={v => { if (v) { const [p, s] = v.split('/'); open(p!, s!) } }}
            data={scenarioOptions} />
        )}
        <Select size="xs" w={110} value={ownerPack} onChange={v => v && setOwnerPack(v)}
          data={installedPacks().map(p => ({ value: p.id, label: p.abbr ?? p.id }))} />
        <Select size="xs" w={180} placeholder="MAP…" value={mapRef}
          onChange={v => setMapRef(v)}
          data={packMaps().map(m => ({
            value: `${m.packId}/${m.mapId}`, label: `${m.packId} · ${m.name}`,
          }))} />
        <Select size="xs" w={150} value={mode} onChange={v => v && setMode(v as ModeId)}
          data={MODE_ORDER.map(id => ({ value: id, label: MODES[id].label }))} />
        <TextInput size="xs" w={170} value={name} placeholder="SCENARIO NAME"
          onChange={e => setName(e.currentTarget.value.toUpperCase())} />
        <Button size="sm" onClick={() => void save()} loading={busy} disabled={!world}>
          SAVE TO PACK
        </Button>
        <Button size="sm" variant="default" onClick={onExit}>◀ MAIN MENU</Button>
      </Group>

      <Box style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <Palette side={side} sidePacks={sidePacks} armed={armed}
          onSide={setSide} onArm={setArmed} />
        <Box style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          {world ? (
            <>
              <SheetCanvas ref={sheetRef}
                map={world.map} ground={world.ground}
                entities={ed.entities} tracks={tracks}
                sel={ed.sel} placing={armed != null}
                night={night} sat={sat}
                onPick={id => setEd(s => select(s, id))}
                onPlace={onPlace}
                onDragStart={() => setEd(beginDrag)}
                onDragTo={(id, wx, wy) => setEd(s => moveLive(s, id, wx, wy))}
              />
              <MapControlStack>
                <MapButton active={night} title={night ? 'Switch to day' : 'Switch to night'}
                  onClick={() => setNight(v => !v)}>{night ? '☾' : '☀'}</MapButton>
                <MapButton small active={sat}
                  title={world.map.sat
                    ? 'Satellite underlay — orthoimagery of this ground'
                    : "Satellite underlay — this world's own ground, rendered top-down"}
                  onClick={() => setSat(v => !v)}>SAT</MapButton>
                <MapButton title="Fit map to screen"
                  onClick={() => sheetRef.current?.fit()}>⛶</MapButton>
              </MapControlStack>
            </>
          ) : (
            <Box style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text fz={11} c="dark.3" style={{ letterSpacing: 2 }}>
                {busy ? 'LOADING GROUND…' : 'PICK A MAP — EVERY INSTALLED PACK\'S MAPS ARE LISTED'}
              </Text>
            </Box>
          )}
        </Box>
        <Inspector e={selected(ed)}
          onPatch={patch => setEd(s => (s.sel != null ? update(s, s.sel, patch) : s))}
          onDelete={() => setEd(s => (s.sel != null ? remove(s, s.sel) : s))} />
      </Box>
    </Box>
  )
}
