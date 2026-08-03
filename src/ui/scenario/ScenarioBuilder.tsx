// SCENARIO BUILDER — a two-screen document tool (SCENARIO-MODEL.md).
//
// Screen 1, the LIBRARY: every scenario on a shelf + NEW SCENARIO. Screen 2,
// the EDITOR: one scenario on the bench — and it can only be reached with a
// document AND ground, so no half-states exist. The sheet edits the
// SITUATION (H-hour entities/places), the SCRIPT tab edits the MISSIONS, the
// TYPE says what the scenario IS (A&D/KotH/Base Defense → SKIRMISH menu;
// CAMPAIGN → the campaigns menu, rules from its missions). PORT copies
// another scenario's content (or one mission) onto the bench.
// TOC owns nothing terrain here — the ground is read-only, the war is the file.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, Group, SegmentedControl, Select, Text, TextInput } from '@mantine/core'
import { installedPacks, PACKS } from '../../packs'
import { defaultPlayerFormation, playableFormations, slotBudget } from '../../packs/orgquery'
import { packMaps } from '../../packs/map-files'
import { packScenarios, type PackScenarioEntry } from '../../packs/scenario-files'
import { loadGround, type Ground } from '../../world/pack/loadGround'
import { mapFromPack } from '../../world/pack/mapFromPack'
import type { WorldMap } from '../../world/WorldMap'
import { nearestLand } from '../../world/place'
import { UNIT_TYPES } from '../../domains/forces/catalog'
import { MODES, MODE_ORDER, type ModeId } from '../../engine/modes'
import type { MissionScript, ScenarioSide, ScenarioSpec } from '../../scenario/types'
import {
  type EditorState, type Entity, emptyEditor, freshId,
  place, update, moveLive, beginDrag, remove, select, selected, undo, redo,
} from '../../scenario/edit'
import {
  entitiesFromSituation, situationFromEntities, saveScenario,
} from '../../scenario/io'
import { referencedPlaces } from '../../scenario/content'
import { planAccessTrack } from '../../world/access'
import { MapButton, MapControlStack } from '../MapControls'
import SheetCanvas, { type SheetHandle } from './SheetCanvas'
import Palette, { type Armed } from './Palette'
import Inspector from './Inspector'
import ScriptPanel from './ScriptPanel'
import ScenarioLibrary, { type NewScenarioCfg } from './ScenarioLibrary'

const MONO = 'Consolas, monospace'
const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

// campaign dressing that rides the file untouched by the sheet/script UI
type Extras = Pick<ScenarioSpec,
  'operation' | 'hqLabel' | 'airfieldLabel' | 'divHq' | 'anchors' | 'preAllocations' | 'fog'>
const pickExtras = (s: ScenarioSpec): Extras => ({
  ...(s.operation != null ? { operation: s.operation } : {}),
  ...(s.hqLabel != null ? { hqLabel: s.hqLabel } : {}),
  ...(s.airfieldLabel != null ? { airfieldLabel: s.airfieldLabel } : {}),
  ...(s.divHq != null ? { divHq: s.divHq } : {}),
  ...(s.anchors != null ? { anchors: s.anchors } : {}),
  ...(s.preAllocations != null ? { preAllocations: s.preAllocations } : {}),
  ...(s.fog != null ? { fog: s.fog } : {}),
})

// default lineup is data-driven: the first installed pack of each side
const defaultSides = () => ({
  friend: installedPacks().find(p => p.side === 'friend')?.id ?? installedPacks()[0]?.id ?? '',
  hostile: installedPacks().find(p => p.side === 'hostile')?.id ?? installedPacks()[0]?.id ?? '',
})

const newMission = (n: number): MissionScript =>
  ({ id: `mission-${n}`, name: `MISSION ${n}` })

export default function ScenarioBuilder({ onExit }: { onExit: () => void }) {
  const [screen, setScreen] = useState<'library' | 'editor'>('library')
  const [ownerPack, setOwnerPack] = useState(() => installedPacks()[0]?.id ?? '')
  const [name, setName] = useState('NEW SCENARIO')
  const [mapRef, setMapRef] = useState<string | null>(null) // 'packId/mapId'
  const [type, setType] = useState<ModeId>('attack-defend')
  const [sidePacks] = useState(defaultSides)
  const [side, setSide] = useState<ScenarioSide>('friend')
  // THE CHAIR the scenario is written for, and the formation the palette is
  // currently placing as (they start the same: you author your own command
  // first, then your neighbours)
  const [player, setPlayer] = useState(() => defaultPlayerFormation(PACKS[defaultSides().friend]!))
  const [formation, setFormation] = useState(player)
  const [armed, setArmed] = useState<Armed>(null)
  const [ed, setEd] = useState<EditorState>(emptyEditor)
  const [missions, setMissions] = useState<MissionScript[]>([])
  const [curM, setCurM] = useState(0)
  const [extras, setExtras] = useState<Extras>({})
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
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

  // TASK ORG on the sheet: what the formation being placed already has, and
  // where the author has over-committed a formation beyond its real strength
  const friendPack = PACKS[sidePacks.friend]
  const placedByType = useMemo(() => {
    const out: Record<string, number> = {}
    for (const e of ed.entities) {
      if (e.ent !== 'unit' || e.side !== 'friend') continue
      if ((e.formation ?? player) !== formation) continue
      out[e.type] = (out[e.type] ?? 0) + 1
    }
    return out
  }, [ed.entities, formation, player])

  const overStrength = useMemo(() => {
    if (!friendPack) return []
    const counts = new Map<string, number>()
    for (const e of ed.entities) {
      if (e.ent !== 'unit' || e.side !== 'friend') continue
      const key = `${e.formation ?? player}|${e.type}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const bad: string[] = []
    for (const [key, n] of counts) {
      const [fm, type] = key.split('|') as [string, string]
      const budget = slotBudget(friendPack, fm, type as never)
      if (n > budget) bad.push(`${fm} ${type} ${n}/${budget}`)
    }
    return bad
  }, [ed.entities, friendPack, player])

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
    // friendly entities are stamped with the formation the palette is placing
    // as; the player's own chair is the default and stays unwritten
    const owner = side === 'friend' && formation !== player ? { formation } : {}
    if (armed.ent === 'structure') {
      const p = snap(wx, wy)
      setEd(s => place(s, { id: freshId(), ent: 'structure', side, kind: armed.kind, ...owner, x: p.x, y: p.y }))
    } else if (armed.ent === 'unit') {
      const p = snap(wx, wy, UNIT_TYPES[armed.type]?.mob)
      setEd(s => place(s, { id: freshId(), ent: 'unit', side, type: armed.type, ...owner, x: p.x, y: p.y }))
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

  const allScenarios = useMemo(() => packScenarios(), [])

  // place names a ported script references that this workspace can't resolve
  // become STAGED places mid-sheet — the re-anchor pass
  const stagePlaces = (ms: MissionScript[], existing: Entity[]): Entity[] => {
    if (!world) return []
    const known = new Set([
      ...existing.filter(e => e.ent === 'place').map(e => e.name),
      ...world.map.towns.map(t => t.name),
      ...world.map.features.map(f => f.name),
    ])
    const missing = referencedPlaces(ms).filter(n => !known.has(n))
    const c = world.map.WORLD / 2
    return missing.map((nm, i) => ({
      id: freshId(), ent: 'place', name: nm,
      x: c, y: c + (i - (missing.length - 1) / 2) * 400,
    }))
  }

  // LIBRARY → EDITOR: open an existing scenario (map is its own ground, or
  // the one just chosen for a groundless campaign — saving binds it)
  const openScenario = (e: PackScenarioEntry, map: string) => {
    setLoadedKey(`${e.packId}/${e.scenarioId}`)
    setOwnerPack(e.packId)
    setName(e.spec.name.toUpperCase())
    setType(e.spec.type)
    setMissions(e.spec.missions ?? [])
    setCurM(0)
    setExtras(pickExtras(e.spec))
    const chair = e.spec.player || defaultPlayerFormation(PACKS[e.spec.sides?.friend ?? sidePacks.friend]!)
    setPlayer(chair)
    setFormation(chair)
    setMapRef(map)
    setRail(e.spec.missions?.length ? 'script' : 'inspect')
    setMsg(null)
    const [p, m] = map.split('/') as [string, string]
    const mapEntry = packMaps(p).find(x => x.mapId === m)
    if (!mapEntry) { setMsg(`MAP ${map} IS NOT INSTALLED`); return }
    void loadGround(mapEntry.groundUrl).then(g => {
      setEd({ ...emptyEditor(), entities: entitiesFromSituation(e.spec.situation, g) })
    })
    setScreen('editor')
  }

  // LIBRARY → EDITOR: a fresh document — everything the editor needs was
  // asked up front, so it never opens half-made
  const createScenario = (cfg: NewScenarioCfg) => {
    setLoadedKey(null)
    setOwnerPack(cfg.packId)
    setName(cfg.name.toUpperCase())
    setType(cfg.type)
    setMissions(cfg.type === 'campaign' ? [newMission(1)] : [])
    setCurM(0)
    setExtras({})
    const chair = defaultPlayerFormation(PACKS[cfg.packId] ?? PACKS[sidePacks.friend]!)
    setPlayer(chair)
    setFormation(chair)
    setEd(emptyEditor())
    setMapRef(cfg.mapRef)
    setRail('inspect')
    setMsg(null)
    setScreen('editor')
  }

  // PORT — copy another scenario (or one of its missions) onto the bench.
  // Coordinates are pack-norm, so cross-map content lands in the same
  // RELATIVE positions; unresolved script names stage for re-anchoring.
  const port = (key: string) => {
    if (!world) return
    const [kind, pk, sid, idx] = key.split(':') as [string, string, string, string?]
    const e = allScenarios.find(x => x.packId === pk && x.scenarioId === sid)
    if (!e) return
    if (kind === 's') {
      const ms = e.spec.missions ?? []
      const ents = entitiesFromSituation(e.spec.situation, world.ground)
      setMissions(ms)
      setCurM(0)
      const staged = stagePlaces(ms, ents)
      setEd({ ...emptyEditor(), entities: [...ents, ...staged] })
      setMsg(`PORTED ${e.spec.name}${staged.length ? ` · ${staged.length} PLACES NEED ANCHORING` : ''}`)
    } else {
      const src = e.spec.missions?.[Number(idx)]
      if (!src) return
      const ids = new Set(missions.map(m => m.id))
      const m = ids.has(src.id) ? { ...src, id: `${src.id}-2` } : src
      const staged = stagePlaces([m], ed.entities)
      setMissions(ms => [...ms, m])
      setCurM(missions.length)
      if (staged.length) setEd(s => ({ ...s, entities: [...s.entities, ...staged] }))
      setRail('script')
      setMsg(`PORTED MISSION ${m.name}${staged.length ? ` · ${staged.length} PLACES NEED ANCHORING` : ''}`)
    }
  }

  const portData = useMemo(() => allScenarios
    .map(e => ({
      group: `${e.name} · ${e.packId.toUpperCase()}`,
      items: [
        { value: `s:${e.packId}:${e.scenarioId}`, label: '⬇ ENTIRE SCENARIO' },
        ...(e.spec.missions ?? []).map((m, i) => ({
          value: `m:${e.packId}:${e.scenarioId}:${i}`,
          label: `${String(i + 1).padStart(2, '0')} · ${m.name || m.id}`,
        })),
      ],
    })), [allScenarios])

  const save = async () => {
    if (!world || !mapRef) { setMsg('GROUND STILL LOADING'); return }
    const id = slugify(name)
    if (!id || !ownerPack) { setMsg('NAME IT FIRST'); return }
    setBusy(true); setMsg(null)
    try {
      const spec: ScenarioSpec = {
        type, name: name.trim() || id, map: mapRef, sides: sidePacks,
        player,
        situation: situationFromEntities(ed.entities, world.ground),
        ...(missions.length ? { missions } : {}),
        ...extras,
      }
      await saveScenario(ownerPack, id, spec)
      setLoadedKey(`${ownerPack}/${id}`)
      setMsg(`SAVED ${ownerPack}/scenarios/${id}`)
    } catch (e) {
      setMsg(`FAILED: ${String((e as Error).message ?? e)}`)
    } finally { setBusy(false) }
  }

  if (screen === 'library') {
    return <ScenarioLibrary onOpen={openScenario} onNew={createScenario} onExit={onExit} />
  }

  const cur = missions[Math.min(curM, Math.max(0, missions.length - 1))]
  const mapName = packMaps().find(m => `${m.packId}/${m.mapId}` === mapRef)?.name ?? mapRef

  return (
    <Box pos="fixed" inset={0} bg="#05080b"
      style={{ zIndex: 100, display: 'flex', flexDirection: 'column', fontFamily: MONO }}>
      <Group gap="sm" align="center" px="lg" py={10}
        style={{ borderBottom: '2px solid #2a3a48', flex: '0 0 auto' }}>
        <Button size="sm" variant="default" onClick={() => setScreen('library')}>
          ◀ SCENARIOS
        </Button>
        <Box style={{ flex: 1 }}>
          <TextInput size="sm" variant="unstyled" value={name}
            styles={{ input: {
              fontFamily: MONO, fontSize: 20, fontWeight: 700, letterSpacing: 3,
              color: '#dceeff', height: 26,
            } }}
            onChange={e => setName(e.currentTarget.value.toUpperCase())} />
          <Text fz={9.5} c="dark.3" style={{ letterSpacing: 1.5 }}>
            {loadedKey ? `EDITING ${loadedKey}` : `NEW · SAVES INTO ${ownerPack.toUpperCase()}`}
            {' · '}{mapName?.toUpperCase()}
            {missions.length > 0 && ` · ${missions.length} MISSION${missions.length > 1 ? 'S' : ''}`}
          </Text>
        </Box>
        {/* a formation placed beyond its real strength: the division does not
            have those platoons. Warn, never block — the author decides. */}
        {overStrength.length > 0 && (
          <Text fz={9} c="#e0b34e" maw={240}>
            ⚠ OVER STRENGTH · {overStrength.join(' · ')}
          </Text>
        )}
        {msg && <Text fz={10} c={msg.startsWith('FAILED') ? '#e8524a' : '#7ec8ff'}>{msg}</Text>}
        {/* THE PLAYER'S CHAIR — which battalion this scenario is written for.
            Everything friendly outside it (and unattached) is allied AI. */}
        {friendPack && (
          <Select size="xs" w={150} value={player}
            title="The battalion the player commands"
            onChange={v => {
              if (!v) return
              if (formation === player) setFormation(v)
              setPlayer(v)
            }}
            data={playableFormations(friendPack).map(f => ({ value: f.desig, label: f.label }))} />
        )}
        {/* the AUTHORED type — the menu door, the rules, the badge */}
        <Select size="xs" w={140} value={type} onChange={v => v && setType(v as ModeId)}
          data={[
            ...MODE_ORDER.map(id => ({ value: id, label: MODES[id].label })),
            { value: 'campaign', label: 'CAMPAIGN' },
          ]} />
        <Select size="xs" w={170} placeholder="PORT CONTENT…" value={null} searchable
          disabled={!world}
          onChange={v => { if (v) port(v) }}
          data={portData} />
        <Button size="sm" onClick={() => void save()} loading={busy} disabled={!world}>
          SAVE
        </Button>
      </Group>

      <Box style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <Palette side={side} sidePacks={sidePacks} armed={armed}
          formation={formation} placedByType={placedByType} playerFormation={player}
          onSide={setSide} onArm={setArmed} onFormation={setFormation} />
        <Box style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          {world ? (
            <>
              <SheetCanvas ref={sheetRef}
                map={world.map} ground={world.ground}
                entities={ed.entities} tracks={tracks}
                sel={ed.sel} placing={armed != null}
                night={night} sat={sat} playerFormation={player}
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
                LOADING GROUND…
              </Text>
            </Box>
          )}
        </Box>
        <Box w={rail === 'inspect' ? 230 : 320}
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
            <Inspector e={selected(ed)} friendPack={sidePacks.friend} playerFormation={player}
              onPatch={patch => setEd(s => (s.sel != null ? update(s, s.sel, patch) : s))}
              onDelete={() => setEd(s => (s.sel != null ? remove(s, s.sel) : s))} />
          ) : (
            <Box>
              {/* the mission bench: which mission's script is on the bench */}
              <Group gap={4} p={6} pb={0} wrap="nowrap">
                <Select size="xs" style={{ flex: 1 }} value={cur ? String(curM) : null}
                  placeholder="NO MISSIONS"
                  data={missions.map((m, i) => ({
                    value: String(i), label: `${String(i + 1).padStart(2, '0')} · ${m.name || m.id}`,
                  }))}
                  styles={{ input: { fontFamily: MONO, fontSize: 10 } }}
                  onChange={v => v != null && setCurM(Number(v))} />
                <Button size="compact-xs" variant="default"
                  onClick={() => { setMissions(ms => [...ms, newMission(ms.length + 1)]); setCurM(missions.length) }}>
                  ＋
                </Button>
                {cur && (
                  <Button size="compact-xs" variant="subtle" c="#e8524a" px={4}
                    onClick={() => { setMissions(ms => ms.filter((_, i) => i !== curM)); setCurM(0) }}>
                    ✕
                  </Button>
                )}
              </Group>
              {cur ? (
                <>
                  <Group gap={4} px={6} pt={4} wrap="nowrap">
                    <TextInput size="xs" w={100} value={cur.id} label="ID"
                      styles={{ input: { fontFamily: MONO, fontSize: 10 } }}
                      onChange={ev => {
                        // read the event SYNCHRONOUSLY — currentTarget is null
                        // by the time the state updater runs
                        const v = ev.currentTarget.value
                        setMissions(ms => ms.map((m, i) =>
                          i === curM ? { ...m, id: slugify(v) || m.id } : m))
                      }} />
                    <TextInput size="xs" style={{ flex: 1 }} value={cur.name} label="NAME"
                      styles={{ input: { fontFamily: MONO, fontSize: 10 } }}
                      onChange={ev => {
                        const v = ev.currentTarget.value
                        setMissions(ms => ms.map((m, i) =>
                          i === curM ? { ...m, name: v.toUpperCase() } : m))
                      }} />
                  </Group>
                  <ScriptPanel mission={cur} placeNames={placeNames}
                    onChange={patch => setMissions(ms => ms.map((m, i) =>
                      i === curM ? { ...m, ...patch } : m))} />
                </>
              ) : (
                <Text fz={9} c="dark.3" p="xs">
                  A CAMPAIGN'S RULES ARE ITS MISSIONS — ADD ONE WITH ＋. SKIRMISH
                  TYPES NEED NONE: THE RULESET JUDGES THE FIGHT.
                </Text>
              )}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  )
}
