// SCENARIO BUILDER — Eden on the BFT (SCENARIO-BUILDER.md, E1).
//
// A menu-level TOOL like the map editor: pick the pack that OWNS the scenario,
// pick a map (any installed pack's — cross-pack refs are the point), then work
// the sheet: palette arms an entity, click places (snapped through nearestLand
// with the unit's own mobility), select/inspect/drag/delete/undo. SAVE writes
// scenario.json through the dev route; discovery picks it up like maps.
// TOC owns nothing terrain here — the ground is read-only, the war is the file.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, Group, SegmentedControl, Select, Text, TextInput } from '@mantine/core'
import { installedPacks } from '../../packs'
import { packMaps } from '../../packs/map-files'
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
import {
  entitiesFromSpec, specFromEntities, saveScenario, saveCampaignContent,
} from '../../scenario/io'
import { contentCatalog, referencedPlaces, type ContentRef } from '../../scenario/content'
import { installedCampaigns } from '../../packs/campaigns'
import type { ScenarioSpec } from '../../scenario/types'
import { planAccessTrack } from '../../world/access'
import { MapButton, MapControlStack } from '../MapControls'
import SheetCanvas, { type SheetHandle } from './SheetCanvas'
import Palette, { type Armed } from './Palette'
import Inspector from './Inspector'
import ScriptPanel, { emptyScript, type ScriptState } from './ScriptPanel'

const MONO = 'Consolas, monospace'
const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

// where SAVE writes — one content type, several homes (settled vocabulary):
// 'scenario:<pack>' | 'situation:<pack>/<campaign>' | 'mission:<pack>/<campaign>'
type Dest =
  | { kind: 'scenario'; packId: string }
  | { kind: 'situation' | 'mission'; packId: string; campaignId: string }
const parseDest = (v: string): Dest => {
  const [kind, rest] = v.split(':') as [string, string]
  if (kind === 'scenario') return { kind, packId: rest }
  const [packId, campaignId] = rest.split('/') as [string, string]
  return { kind: kind as 'situation' | 'mission', packId, campaignId }
}

// default lineup is data-driven: the first installed pack of each side
const defaultSides = () => ({
  friend: installedPacks().find(p => p.side === 'friend')?.id ?? installedPacks()[0]?.id ?? '',
  hostile: installedPacks().find(p => p.side === 'hostile')?.id ?? installedPacks()[0]?.id ?? '',
})

export default function ScenarioBuilder({ onExit }: { onExit: () => void }) {
  const [dest, setDest] = useState(() => `scenario:${installedPacks()[0]?.id ?? ''}`)
  const [name, setName] = useState('NEW SCENARIO')
  const [mapRef, setMapRef] = useState<string | null>(null) // 'packId/mapId'
  const [mode, setMode] = useState<ModeId>('attack-defend')
  const [sidePacks] = useState(defaultSides)
  const [side, setSide] = useState<ScenarioSide>('friend')
  const [armed, setArmed] = useState<Armed>(null)
  const [ed, setEd] = useState<EditorState>(emptyEditor)
  const [script, setScript] = useState<ScriptState>(emptyScript)
  const [rail, setRail] = useState<'inspect' | 'script'>('inspect')
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

  // what a script place param can name: authored places first, then the map's
  // real gazetteer (OSM towns/features), then the builtin anchors
  const placeNames = useMemo(() => {
    const authored = ed.entities.filter(e => e.ent === 'place').map(e => e.name)
    const gaz = world
      ? [...world.map.towns.map(t => t.name), ...world.map.features.map(f => f.name)]
      : []
    return [...new Set([...authored, ...gaz, 'player-hq', 'enemy-base'])]
  }, [ed.entities, world])

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
    } else if (armed.ent === 'unit') {
      const p = snap(wx, wy, UNIT_TYPES[armed.type]?.mob)
      setEd(s => place(s, { id: freshId(), ent: 'unit', side, type: armed.type, x: p.x, y: p.y }))
    } else {
      // control measures go exactly where clicked — a place may sit on water
      const zone = armed.zone
      setEd(s => {
        const n = s.entities.filter(e => e.ent === 'place').length + 1
        return place(s, {
          id: freshId(), ent: 'place', x: wx, y: wy,
          name: zone ? `ZONE ${n}` : `PT ${n}`, ...(zone ? { r: 400 } : {}),
        })
      })
    }
  }

  const catalog = useMemo(() => contentCatalog(), [])
  const campaigns = useMemo(() => installedCampaigns(), [])
  const catalogData = useMemo(() => {
    const groups = new Map<string, { value: string; label: string }[]>()
    for (const c of catalog) {
      groups.set(c.group, [...(groups.get(c.group) ?? []), { value: c.key, label: c.label }])
    }
    return [...groups].map(([group, items]) => ({ group, items }))
  }, [catalog])

  const setScriptFrom = (spec: ScenarioSpec) => setScript({
    brief: spec.brief,
    objectives: spec.objectives ?? [],
    triggers: spec.triggers ?? [],
    tutorial: spec.tutorial,
  })

  // OPEN — edit in place: the workspace becomes this content, the destination
  // its home, so SAVE round-trips to the same file
  const openRef = (ref: ContentRef) => {
    setName(ref.spec.name.toUpperCase())
    setScriptFrom(ref.spec)
    if (ref.source.kind === 'scenario') {
      setMode(ref.spec.mode ?? 'attack-defend')
      setDest(`scenario:${ref.source.packId}`)
    } else {
      setDest(`${ref.source.kind}:${ref.source.packId}/${ref.source.campaignId}`)
    }
    if (!ref.mapRef) {
      setEd(emptyEditor())
      setMapRef(null)
      setMsg('THIS CAMPAIGN HAS NO BOUND GROUND — PICK A MAP; SAVING BINDS IT')
      return
    }
    setMapRef(ref.mapRef)
    const [p, m] = ref.mapRef.split('/') as [string, string]
    const mapEntry = packMaps(p).find(e => e.mapId === m)
    if (!mapEntry) { setMsg(`CONTENT'S MAP ${ref.mapRef} IS NOT INSTALLED`); return }
    void loadGround(mapEntry.groundUrl).then(g => {
      setEd({ ...emptyEditor(), entities: entitiesFromSpec(ref.spec, g) })
      setMsg(null)
    })
  }

  // PORT — pull a COPY into the current workspace on the CURRENT ground (the
  // float: the training mission ships once, lands in every campaign).
  // Coordinates are pack-norm, so cross-map content arrives in the same
  // RELATIVE positions — coherently placed, adjust rather than rebuild; script
  // names the target gazetteer can't resolve are staged for re-anchoring.
  const portRef = (ref: ContentRef) => {
    if (!world) { setMsg('PICK A MAP FIRST — PORT LANDS ON THE LOADED GROUND'); return }
    setName(ref.spec.name.toUpperCase())
    setScriptFrom(ref.spec)
    const ents = entitiesFromSpec(ref.spec, world.ground)
    const known = new Set([
      ...ents.filter(e => e.ent === 'place').map(e => e.name),
      ...world.map.towns.map(t => t.name),
      ...world.map.features.map(f => f.name),
    ])
    const missing = referencedPlaces(ref.spec).filter(n => !known.has(n))
    const c = world.map.WORLD / 2
    const staged: Entity[] = missing.map((nm, i) => ({
      id: freshId(), ent: 'place', name: nm,
      x: c, y: c + (i - (missing.length - 1) / 2) * 400,
    }))
    setEd({ ...emptyEditor(), entities: [...ents, ...staged] })
    setMsg(ref.mapRef === mapRef
      ? `PORTED ${ref.spec.name} — SAME GROUND, VERBATIM`
      : `PORTED ${ref.spec.name} — RELATIVE POSITIONS ON NEW GROUND`
        + (missing.length ? ` · ${missing.length} PLACES NEED ANCHORING` : ''))
  }

  const d = parseDest(dest)
  const destCampaign = d.kind === 'scenario' ? null
    : campaigns.find(c => c.packId === d.packId && c.campaign.manifest.id === d.campaignId) ?? null
  const boundMapRef = destCampaign?.map
    ? `${destCampaign.map.packId}/${destCampaign.map.mapId}` : null
  // a bound campaign owns its ground — the map follows the destination
  useEffect(() => {
    if (boundMapRef && mapRef !== boundMapRef) setMapRef(boundMapRef)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundMapRef])

  // mainline missions arrive into a RUNNING world — placements have no moment
  // to apply (H-hour rule; the SITUATION is the placement home). Warn, never block.
  const placedCount = ed.entities.filter(e => e.ent !== 'place').length
  const missionPlacementWarning = d.kind === 'mission' && placedCount > 0

  const destOptions = useMemo(() => [
    ...installedPacks().map(p => ({
      value: `scenario:${p.id}`, label: `SCENARIO · ${p.abbr ?? p.id}`,
    })),
    ...campaigns.flatMap(c => [
      { value: `situation:${c.packId}/${c.campaign.manifest.id}`,
        label: `SITUATION · ${c.campaign.manifest.name}` },
      { value: `mission:${c.packId}/${c.campaign.manifest.id}`,
        label: `MISSION · ${c.campaign.manifest.name}` },
    ]),
  ], [campaigns])

  const save = async () => {
    if (!world || !mapRef) { setMsg('PICK A MAP FIRST'); return }
    const id = slugify(name)
    if (!id) { setMsg('NAME IT FIRST'); return }
    setBusy(true); setMsg(null)
    try {
      const scriptMeta = {
        ...(script.brief ? { brief: script.brief } : {}),
        ...(script.objectives.length ? { objectives: script.objectives } : {}),
        ...(script.triggers.length ? { triggers: script.triggers } : {}),
        ...(script.tutorial ? { tutorial: script.tutorial } : {}),
      }
      if (d.kind === 'scenario') {
        const spec = specFromEntities(
          { name: name.trim() || id, map: mapRef, mode, sides: sidePacks, ...scriptMeta },
          ed.entities, world.ground,
        )
        await saveScenario(d.packId, id, spec)
        setMsg(`SAVED ${d.packId}/scenarios/${id} · ${ed.entities.length} ENTITIES`)
      } else {
        // campaign content: the campaign owns the map and the rules — the
        // file carries neither; a first save onto an unbound campaign binds
        // the loaded ground into the manifest
        const spec = specFromEntities(
          { ...(d.kind === 'mission' ? { id } : {}), name: name.trim() || id,
            sides: sidePacks, ...scriptMeta },
          ed.entities, world.ground,
        )
        await saveCampaignContent(d.packId, d.campaignId, d.kind, spec, {
          missionId: id,
          ...(boundMapRef ? {} : { bindMap: mapRef }),
        })
        const where = d.kind === 'situation' ? 'situation' : `missions/${id}`
        setMsg(`SAVED ${d.packId}/campaigns/${d.campaignId}/${where}`
          + (boundMapRef ? '' : ` · GROUND BOUND TO ${mapRef}`))
      }
    } catch (e) {
      setMsg(`FAILED: ${String((e as Error).message ?? e)}`)
    } finally { setBusy(false) }
  }

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
        {missionPlacementWarning && (
          <Text fz={9} c="#e0b34e" maw={260}>
            ⚠ {placedCount} PLACED — MISSIONS ARRIVE INTO A RUNNING WORLD;
            PLACEMENTS ONLY APPLY IN A SITUATION OR SCENARIO
          </Text>
        )}
        {msg && <Text fz={10} c={msg.startsWith('FAILED') ? '#e8524a' : '#7ec8ff'}>{msg}</Text>}
        {catalog.length > 0 && (
          <Select size="xs" w={200} placeholder="OPEN…" value={null} searchable
            onChange={v => { const r = catalog.find(x => x.key === v); if (r) openRef(r) }}
            data={catalogData} />
        )}
        {catalog.length > 0 && (
          <Select size="xs" w={150} placeholder="PORT…" value={null} searchable
            disabled={!world}
            onChange={v => { const r = catalog.find(x => x.key === v); if (r) portRef(r) }}
            data={catalogData} />
        )}
        <Select size="xs" w={210} value={dest} onChange={v => v && setDest(v)}
          data={destOptions} />
        <Select size="xs" w={180} placeholder="MAP…" value={mapRef}
          disabled={!!boundMapRef}
          onChange={v => setMapRef(v)}
          data={packMaps().map(m => ({
            value: `${m.packId}/${m.mapId}`, label: `${m.packId} · ${m.name}`,
          }))} />
        {d.kind === 'scenario' && (
          <Select size="xs" w={150} value={mode} onChange={v => v && setMode(v as ModeId)}
            data={MODE_ORDER.map(id => ({ value: id, label: MODES[id].label }))} />
        )}
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
        <Box w={rail === 'script' ? 340 : 230}
          style={{ borderLeft: '1px solid #22303d', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <Box p={6} pb={0}>
            <SegmentedControl fullWidth size="xs" value={rail}
              onChange={v => setRail(v as 'inspect' | 'script')}
              data={[
                { value: 'inspect', label: 'INSPECTOR' },
                { value: 'script', label: 'SCRIPT' },
              ]} />
          </Box>
          {rail === 'inspect' ? (
            <Inspector e={selected(ed)}
              onPatch={patch => setEd(s => (s.sel != null ? update(s, s.sel, patch) : s))}
              onDelete={() => setEd(s => (s.sel != null ? remove(s, s.sel) : s))} />
          ) : (
            <ScriptPanel script={script} placeNames={placeNames}
              onChange={patch => setScript(s => ({ ...s, ...patch }))} />
          )}
        </Box>
      </Box>
    </Box>
  )
}
