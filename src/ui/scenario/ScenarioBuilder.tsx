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
//
// THE DOCUMENT IS ONE OBJECT (scenario/edit Doc): name, type, sides, chair,
// fog, entities, missions, dressing. Undo, redo and DIRTY all read it, so
// they cannot disagree — and every field of the file that gets SAVED is a
// field the builder actually LOADED. `sides` used to be neither: a `const`
// with no setter, ignored on open, written from whatever lineup happened to
// be installed. Opening the Mobile Infantry's scenario with 1CD loaded and
// pressing SAVE quietly turned it into a 1CD scenario.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Group, Select, Text, TextInput } from '@mantine/core'
import { activePack, allPacks, PACKS } from '../../packs'
import { defaultPlayerFormation } from '../../packs/orgquery'
import { packMaps } from '../../packs/map-files'
import { packScenarios, type PackScenarioEntry } from '../../packs/scenario-files'
import { loadGround, type Ground } from '../../world/pack/loadGround'
import { mapFromPack } from '../../world/pack/mapFromPack'
import type { WorldMap } from '../../world/WorldMap'
import { nearestLand } from '../../world/place'
import { UNIT_TYPES } from '../../domains/forces/catalog'
import type { MissionScript, ScenarioSide, ScenarioSpec } from '../../scenario/types'
import {
  type Doc, type EditorState, type Entity, type Extras, type Sel,
  emptyEditor, openEditor, freshId, dirty, markSaved, carryOf, inKeyOrder,
  place, update, moveLive, facLive, beginDrag, remove, select, selected, duplicate, arrange,
  selEntity, selIds, selMission, oneEntity, toggleId, setDoc, setMissions, undo, redo,
} from '../../scenario/edit'
import {
  entitiesFromSituation, situationFromEntities, saveScenario,
} from '../../scenario/io'
import { referencedPlaces, renamePlaceRefs, isBuiltinPlace } from '../../scenario/content'
import { planAccessTrack } from '../../world/access'
import {
  footprintAt, gatewardAt, layoutFacilitiesAt, organicFacilities,
} from '../../domains/installations/anatomy'
import { MapButton, MapControlStack } from '../MapControls'
import { DATA_FONT, field, INK, TextBtn, UI_FONT } from './panel'
import SheetCanvas, { type SheetHandle } from './SheetCanvas'
import Palette, { type Armed } from './Palette'
import Inspector from './Inspector'
import Outline from './Outline'
import ScriptInspector from './ScriptInspector'
import TutInspector from './TutInspector'
import { missionGhosts } from './ghosts'
import ContextMenu from './ContextMenu'
import ProblemsBar from './ProblemsBar'
import { findProblems } from './problems'
import ScenarioLibrary, { type NewScenarioCfg } from './ScenarioLibrary'
import Attributes from './Attributes'

const MONO = 'Consolas, monospace'
const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

const pickExtras = (s: ScenarioSpec): Extras => ({
  ...(s.operation != null ? { operation: s.operation } : {}),
  ...(s.hqLabel != null ? { hqLabel: s.hqLabel } : {}),
  ...(s.airfieldLabel != null ? { airfieldLabel: s.airfieldLabel } : {}),
  ...(s.divHq != null ? { divHq: s.divHq } : {}),
  ...(s.anchors != null ? { anchors: s.anchors } : {}),
  ...(s.preAllocations != null ? { preAllocations: s.preAllocations } : {}),
})

// a NEW scenario starts from whatever lineup is currently installed — the
// assignment is the SCENARIO's to make, so this is a starting point to edit,
// not a property read off either army. An EXISTING scenario always uses its
// own; this is never consulted for one.
const defaultSides = () => ({
  friend: activePack('friend')?.id ?? allPacks()[0]?.id ?? '',
  hostile: activePack('hostile')?.id ?? allPacks()[0]?.id ?? '',
})

const newMission = (n: number): MissionScript =>
  ({ id: `mission-${n}`, name: `MISSION ${n}` })

export default function ScenarioBuilder({ onExit, onPlay }: {
  onExit: () => void
  /** Play the document as it stands. Absent = the tool is mounted somewhere
   *  that cannot run a sim, and the button stays out of the toolbar. */
  onPlay?: (spec: ScenarioSpec) => void
}) {
  const [screen, setScreen] = useState<'library' | 'editor'>('library')
  // WHERE IT SAVES and WHICH GROUND it is bound to. Not document CONTENT —
  // rebinding either is a different act from editing, so neither is undoable.
  const [ownerPack, setOwnerPack] = useState(() => allPacks()[0]?.id ?? '')
  const [mapRef, setMapRef] = useState<string | null>(null) // 'packId/mapId'
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  // THE DOCUMENT + its history
  const [ed, setEd] = useState<EditorState>(emptyEditor)
  // TOOL state: which side and formation the palette is placing as, what is
  // armed, which mission is on the bench. Not the document.
  const [side, setSide] = useState<ScenarioSide>('friend')
  const [formation, setFormation] = useState('')
  // WHAT THE CURSOR IS CARRYING. Not an armed mode — you pick a row up and put
  // it down, and if you let go anywhere else it is simply dropped.
  const [carry, setCarry] = useState<Armed>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; id: number | null } | null>(null)
  const [world, setWorld] = useState<{ map: WorldMap; ground: Ground } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  // the shared map-control toggles (MapControls) — same look as the game's BFT
  const [night, setNight] = useState(false)
  const [sat, setSat] = useState(false)
  const sheetRef = useRef<SheetHandle>(null)
  // Ctrl+S and F reach the CURRENT handler through refs — the keydown listener
  // is bound once and must never close over a stale document
  const saveRef = useRef<() => Promise<void>>(async () => {})
  const frameRef = useRef<() => void>(() => {})

  const doc = ed.doc
  const { entities, missions, player } = doc
  const isDirty = dirty(ed)
  // WHICH MISSION IS ON THE MAP. The selection carries it — pick an objective
  // and you are inside its mission — so there is no separate "current mission"
  // to keep in step with what the inspector is showing. Nothing script-side
  // selected means the first one, so opening a campaign draws its opening
  // mission immediately rather than an empty map plus a form to go find.
  const benchM = selMission(ed.sel) ?? 0
  const benchMission = missions[benchM]

  // Base access tracks: the exact dirt road the game lays at H-hour, planned
  // by the SAME function (world/access) for the same kinds addStructure
  // connects (HQ/FOB/OP — was FOB-only on both sides of this seam). Keyed on
  // cell-quantized positions so a drag recomputes on cell crossings, not
  // every pointer event — MOVE a base and its track re-plans with it.
  const hasTrack = (e: (typeof entities)[number]): boolean =>
    e.ent === 'structure' && (e.kind === 'HQ' || e.kind === 'FOB' || e.kind === 'OP')
  const fobKey = entities
    .filter(hasTrack)
    .map(e => `${e.id}:${Math.round(e.x / 50)}:${Math.round(e.y / 50)}`)
    .join('|')
  const tracks = useMemo(() => {
    if (!world) return []
    return entities
      .filter(hasTrack)
      .map(e => ({ id: e.id, pts: planAccessTrack(world.map, e.x, e.y) }))
      .filter((t): t is { id: number; pts: { x: number; y: number }[] } => t.pts != null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, fobKey])

  // Base anatomy preview: THE SAME derivation the game runs at H-hour
  // (installations/anatomy — footprint seeded on quantized position, gate on
  // the planned track's bearing), so what the author sees IS what gets built.
  const wires = useMemo(() => {
    if (!world) return []
    return entities.flatMap(e => {
      if (e.ent !== 'structure' || e.side !== 'friend' || e.kind === 'OP') return []
      const plan = tracks.find(t => t.id === e.id)?.pts ?? null
      const gate = gatewardAt(world.map, e.x, e.y, plan)
      const fp = footprintAt(world.map, e.x, e.y, e.kind, gate)
      // default layout first, the author's dragged spots on top of it
      const facs = layoutFacilitiesAt(
        world.map, e.x, e.y, organicFacilities(e.side, e.kind), gate)
      for (const [k, o] of Object.entries(e.fac ?? {})) {
        facs[k] = { x: e.x + o.dx, y: e.y + o.dy }
      }
      return [{
        id: e.id, poly: fp.poly, gate: fp.gate, anchor: { x: e.x, y: e.y }, facs,
      }]
    })
  }, [world, entities, tracks])

  // TASK ORG on the sheet: what the formation being placed already has, and
  // where the author has over-committed a formation beyond its real strength
  const friendPack = PACKS[doc.sides.friend]
  // the army's own unit keys — a tutorial names pack nouns, so its pickers
  // read from the catalog rather than trusting free text
  const friendUnitTypes = useMemo(
    () => Object.keys(friendPack?.catalogs?.units ?? {}), [friendPack])
  const placedByType = useMemo(() => {
    const out: Record<string, number> = {}
    for (const e of entities) {
      if (e.ent !== 'unit' || e.side !== 'friend') continue
      if ((e.formation ?? player) !== formation) continue
      out[e.type] = (out[e.type] ?? 0) + 1
    }
    return out
  }, [entities, formation, player])

  // DANGLING REFERENCES — a script naming a place nobody authored. The
  // problems list carries the full account; the outline uses this set to mark
  // the offending objective without opening it.
  const danglingPlaces = useMemo(() => {
    const known = new Set([
      ...entities.filter(e => e.ent === 'place').map(e => e.name),
      ...Object.keys(doc.extras.anchors ?? {}),
      ...(world ? world.map.towns.map(t => t.name) : []),
      ...(world ? world.map.features.map(f => f.name) : []),
    ])
    return referencedPlaces(missions).filter(n => !known.has(n) && !isBuiltinPlace(n))
  }, [entities, world, missions, doc.extras.anchors])

  // what a script place param can name: authored places first, then the map's
  // real gazetteer (OSM towns/features), then the builtin anchors
  const placeNames = useMemo(() => {
    const authored = entities.filter(e => e.ent === 'place').map(e => e.name)
    // campaign ANCHORS are authored places too — resolved once at start from a
    // query against the terrain, so they never appear as a pin on the sheet
    const anchors = Object.keys(doc.extras.anchors ?? {})
    const gaz = world
      ? [...world.map.towns.map(t => t.name), ...world.map.features.map(f => f.name)]
      : []
    return [...new Set([...authored, ...anchors, ...gaz, 'player-hq', 'enemy-base'])]
  }, [entities, world, doc.extras.anchors])

  // EVERYTHING WRONG WITH THE DOCUMENT, recomputed as it changes. Cheap: it
  // walks the entities and the script once, and both are small.
  const problems = useMemo(
    () => findProblems(doc, world?.map ?? null),
    [doc, world])

  // THE MISSION, DRAWN. Every script verb that names a place becomes a shape
  // on the sheet, so the counterattack, the objective's real size and the
  // direction the OPFOR gets pushed are things you LOOK at instead of things
  // you read in a form and imagine.
  const ghosts = useMemo(
    () => (world ? missionGhosts(benchMission, benchM, entities, world.map, ed.sel) : []),
    [benchMission, benchM, entities, world, ed.sel])

  // dev hook, same convention as window.__game: the document and what the
  // sheet is drawing, readable from the console without React devtools
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as Record<string, unknown>).__builder =
      { doc, sel: ed.sel, ghosts, benchM, world }
  }, [doc, ed.sel, ghosts, benchM, world])

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

  // keyboard: delete + undo/redo (the entity workspace's spine) + save
  useEffect(() => {
    const key = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')
      const mod = ev.ctrlKey || ev.metaKey
      if (mod && ev.key.toLowerCase() === 's') { ev.preventDefault(); void saveRef.current(); return }
      if (typing) return
      if (mod && ev.key.toLowerCase() === 'd') {
        // Ctrl+D — the move every scene editor makes cheap
        ev.preventDefault()
        setEd(s => duplicate(s, selIds(s.sel)))
      } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
        // DEL only removes ENTITIES. A script node is deleted from its own
        // header, where the thing being destroyed is named on screen — a
        // stray keypress should not silently eat a trigger.
        setEd(s => {
          const ids = selIds(s.sel)
          return ids.length ? remove(s, ids) : s
        })
      } else if (ev.key.toLowerCase() === 'f') {
        // F frames the selection — the one keystroke every 3D editor shares
        frameRef.current()
      } else if (mod && ev.key.toLowerCase() === 'z' && !ev.shiftKey) {
        ev.preventDefault(); setEd(undo)
      } else if (mod && (ev.key.toLowerCase() === 'y' || (ev.key.toLowerCase() === 'z' && ev.shiftKey))) {
        ev.preventDefault(); setEd(redo)
      } else if (ev.key === 'Escape') {
        setCarry(null); setMenu(null)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  // NOTHING BETWEEN SAVES SURVIVES A RELOAD — the dogfood log's finding 2.
  // Autosave is the real answer (a draft written on every edit); until then
  // the browser at least asks before throwing the work away.
  useEffect(() => {
    if (!isDirty) return
    const warn = (ev: BeforeUnloadEvent) => { ev.preventDefault(); ev.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isDirty])

  const snap = (wx: number, wy: number, mob?: 'foot' | 'wheeled' | 'tracked') =>
    world ? nearestLand(world.map, wx, wy, mob) : { x: wx, y: wy }

  // A DROP places what the cursor was carrying, and empties the cursor. One
  // gesture, one entity: the old armed mode stayed armed and stamped another
  // copy on every subsequent click.
  const onDrop = (wx: number, wy: number) => {
    const armed = carry
    if (!armed || !world) return
    setCarry(null)
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
        const n = s.doc.entities.filter(e => e.ent === 'place').length + 1
        return place(s, {
          id: freshId(), ent: 'place', x: wx, y: wy,
          name: zone ? `ZONE ${n}` : `PT ${n}`, ...(zone ? { r: 400 } : {}),
        })
      })
    }
  }

  // Editing an entity. RENAMING A PLACE CARRIES ITS REFERENCES: every
  // objective zone, spawn anchor and OPFOR objective pointing at the old name
  // follows it. Silently leaving them dangling is never what an author meant.
  // Both halves land in ONE document edit, so one Ctrl+Z takes back both.
  const patchEntity = (patch: Partial<Entity>) => {
    setEd(s => {
      const ids = selIds(s.sel)
      if (!ids.length) return s
      const sel = selected(s)
      const renamed = (patch as { name?: unknown }).name
      const next = update(s, ids, patch)
      if (sel?.ent === 'place' && typeof renamed === 'string' && renamed && renamed !== sel.name) {
        return {
          ...next,
          doc: { ...next.doc, missions: renamePlaceRefs(next.doc.missions, sel.name, renamed) },
        }
      }
      return next
    })
  }

  // ◎ on a script place field — show me where that actually is
  const centerOnPlace = (name: string) => {
    const p = entities.find(e => e.ent === 'place' && e.name === name)
    if (p) sheetRef.current?.centerOn(p.x, p.y)
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
  // the one just chosen for a groundless campaign — saving binds it).
  // THE FILE IS THE TRUTH: sides, chair and fog come out of the spec, not off
  // the installed lineup. An army the spec names that this checkout does not
  // have is PRESERVED and said out loud — falling back to an installed one
  // would write the substitution back to disk on the next save.
  const openScenario = (e: PackScenarioEntry, map: string) => {
    const d = defaultSides()
    const sides = {
      friend: e.spec.sides?.friend ?? d.friend,
      hostile: e.spec.sides?.hostile ?? d.hostile,
    }
    const missing = [sides.friend, sides.hostile].filter(id => id && !PACKS[id])
    const fp = PACKS[sides.friend]
    const chair = e.spec.player || (fp ? defaultPlayerFormation(fp) : '')
    setLoadedKey(`${e.packId}/${e.scenarioId}`)
    setOwnerPack(e.packId)
    setEd(openEditor({
      name: e.spec.name.toUpperCase(),
      type: e.spec.type,
      sides,
      player: chair,
      ...(e.spec.fog === false ? { fog: false } : {}),
      entities: [],
      missions: e.spec.missions ?? [],
      extras: pickExtras(e.spec),
      carry: carryOf(e.spec),
      keyOrder: Object.keys(e.spec),
    }))
    setFormation(chair)
    setMapRef(map)
    setMsg(missing.length
      ? `⚠ NOT INSTALLED: ${missing.join(', ').toUpperCase()} — PRESERVED, NOT EDITABLE`
      : null)
    const [p, m] = map.split('/') as [string, string]
    const mapEntry = packMaps(p).find(x => x.mapId === m)
    if (!mapEntry) { setMsg(`MAP ${map} IS NOT INSTALLED`); return }
    void loadGround(mapEntry.groundUrl).then(g => {
      // the ground arrives after the document — fold the situation in as a
      // LOAD, not an edit, so the freshly opened scenario is not born dirty
      setEd(s => openEditor({
        ...s.doc, entities: entitiesFromSituation(e.spec.situation, g),
      }))
    })
    setScreen('editor')
  }

  // LIBRARY → EDITOR: a fresh document — everything the editor needs was
  // asked up front, so it never opens half-made
  const createScenario = (cfg: NewScenarioCfg) => {
    const sides = defaultSides()
    // the pack it saves INTO is the army it is about, unless that pack is not
    // an army you can play — then keep the lineup's
    if (PACKS[cfg.packId]) sides.friend = cfg.packId
    const fp = PACKS[sides.friend]
    const chair = fp ? defaultPlayerFormation(fp) : ''
    setLoadedKey(null)
    setOwnerPack(cfg.packId)
    setEd(openEditor({
      name: cfg.name.toUpperCase(), type: cfg.type, sides, player: chair,
      entities: [], missions: cfg.type === 'campaign' ? [newMission(1)] : [],
      extras: {}, carry: {}, keyOrder: [],
    }))
    setFormation(chair)
    setMapRef(cfg.mapRef)
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
      const staged = stagePlaces(ms, ents)
      setEd(s => select(setDoc(s, { missions: ms, entities: [...ents, ...staged] }),
        ms.length ? { k: 'mission', m: 0 } : null))
      setMsg(`PORTED ${e.spec.name}${staged.length ? ` · ${staged.length} PLACES NEED ANCHORING` : ''}`)
    } else {
      const src = e.spec.missions?.[Number(idx)]
      if (!src) return
      const ids = new Set(missions.map(m => m.id))
      const m = ids.has(src.id) ? { ...src, id: `${src.id}-2` } : src
      const staged = stagePlaces([m], entities)
      setEd(s => select(setDoc(s, {
        missions: [...s.doc.missions, m],
        ...(staged.length ? { entities: [...s.doc.entities, ...staged] } : {}),
      }), { k: 'mission', m: s.doc.missions.length }))
      // A CURRICULUM TRAVELS WITH ITS MISSION — it is bespoke to it, so the
      // lessons belong to it (SCENARIO-MODEL decisions log, 2026-08-04). But
      // its conditions and anchors name PACK NOUNS: a lesson that waits on an
      // SCT and rings `field-MECH` is nonsense the moment it lands beside a
      // different army. The problems panel will list every one; this says it
      // at the moment of the port, when the author can still change their mind.
      const lessons = m.tutorial?.steps.length ?? 0
      const foreignArmy = lessons > 0 && (e.spec.sides?.friend ?? '') !== doc.sides.friend
      setMsg([
        `PORTED MISSION ${m.name}`,
        staged.length ? `${staged.length} PLACES NEED ANCHORING` : '',
        lessons ? `${lessons} LESSONS CAME WITH IT` : '',
        foreignArmy ? '⚠ WRITTEN FOR ANOTHER ARMY — ITS UNIT TYPES WILL NOT RESOLVE' : '',
      ].filter(Boolean).join(' · '))
    }
  }

  // THE DOCUMENT AS A SPEC. Save writes this; PLAY runs it. One function, so
  // what you playtest is exactly what would be written to disk — a preview
  // built from a second, slightly different assembly is a preview you cannot
  // trust.
  const specOf = (id: string): ScenarioSpec | null => {
    if (!world || !mapRef) return null
    return inKeyOrder({
      // whatever this tool does not model rides underneath, so the fields
      // below always win and the author's own keys survive the trip
      ...doc.carry,
      type: doc.type, name: doc.name.trim() || id, map: mapRef,
      sides: doc.sides, player: doc.player,
      ...(doc.fog === false ? { fog: false } : {}),
      situation: situationFromEntities(doc.entities, world.ground),
      ...(doc.missions.length ? { missions: doc.missions } : {}),
      ...doc.extras,
    } as ScenarioSpec, doc.keyOrder)
  }

  // PLAY — the loop this tool did not have. Testing a change used to mean
  // save, exit, main menu, SKIRMISH, find it, pick a difficulty, play, quit,
  // reopen, find it again. It runs the IN-MEMORY document, so an unsaved
  // experiment is playable and a bad one is thrown away by not saving it.
  const play = () => {
    const spec = specOf(slugify(doc.name) || 'untitled')
    if (!spec) { setMsg('GROUND STILL LOADING'); return }
    if (spec.type !== 'campaign' && !doc.entities.length) {
      setMsg('NOTHING PLACED — A SKIRMISH NEEDS A SITUATION')
      return
    }
    onPlay?.(spec)
  }

  const save = async () => {
    if (!world || !mapRef) { setMsg('GROUND STILL LOADING'); return }
    // AN OPEN SCENARIO SAVES BACK OVER ITSELF. The id used to be slugified
    // from the NAME every time, so a file whose id did not happen to match
    // its own title forked on save: opening mi/camp-currie, changing nothing
    // and pressing SAVE wrote a second scenario called live-fire-camp-currie
    // and left the original untouched. Only a NEW document gets its id from
    // its name; renaming an existing one is a move, and a move is its own act.
    const id = loadedKey ? loadedKey.split('/')[1]! : slugify(doc.name)
    if (!id || !ownerPack) { setMsg('NAME IT FIRST'); return }
    setBusy(true); setMsg(null)
    try {
      const spec = specOf(id)
      if (!spec) { setMsg('GROUND STILL LOADING'); return }
      await saveScenario(ownerPack, id, spec)
      setLoadedKey(`${ownerPack}/${id}`)
      setEd(markSaved)
      setMsg(`SAVED ${ownerPack}/scenarios/${id}`)
    } catch (e) {
      setMsg(`FAILED: ${String((e as Error).message ?? e)}`)
    } finally { setBusy(false) }
  }
  saveRef.current = save
  // F — frame the selection, or the whole sheet when nothing is selected
  frameRef.current = () => {
    const ids = selIds(ed.sel)
    const picked = entities.filter(e => ids.includes(e.id))
    if (!picked.length) { sheetRef.current?.fit(); return }
    const cx = picked.reduce((a, e) => a + e.x, 0) / picked.length
    const cy = picked.reduce((a, e) => a + e.y, 0) / picked.length
    sheetRef.current?.centerOn(cx, cy)
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

  if (screen === 'library') {
    return <ScenarioLibrary onOpen={openScenario} onNew={createScenario} onExit={onExit} />
  }

  const mapName = packMaps().find(m => `${m.packId}/${m.mapId}` === mapRef)?.name ?? mapRef
  const patchMission = (patch: Partial<MissionScript>) =>
    setEd(s => setMissions(s, ms => ms.map((m, i) => (i === benchM ? { ...m, ...patch } : m))))
  // what the cursor is holding, said in words beside the cursor
  const carryLabel = (a: NonNullable<Armed>): string =>
    a.ent === 'structure' ? a.kind
      : a.ent === 'unit' ? (UNIT_TYPES[a.type]?.abbr ?? a.type)
      : a.zone ? 'ZONE' : 'POINT'

  const addMission = () => setEd(s => select(
    setMissions(s, ms => [...ms, newMission(ms.length + 1)]),
    { k: 'mission', m: s.doc.missions.length }))
  const danglingSet = new Set(danglingPlaces)
  // THE AXIS an arrangement faces: the bearing from the selection to the enemy
  // command post, because that is what a defensive line is oriented on. With
  // no enemy CP authored yet, the map's own enemy base stands in.
  const axis = (() => {
    const ids = selIds(ed.sel)
    const picked = entities.filter(e => ids.includes(e.id))
    if (!picked.length || !world) return -Math.PI / 2
    const cx = picked.reduce((a, e) => a + e.x, 0) / picked.length
    const cy = picked.reduce((a, e) => a + e.y, 0) / picked.length
    const foe = entities.find(e => e.ent === 'structure' && e.side === 'hostile' && e.kind === 'HQ')
      ?? { x: world.map.enemyBase.x, y: world.map.enemyBase.y }
    return Math.atan2(foe.y - cy, foe.x - cx)
  })()

  return (
    <Box pos="fixed" inset={0} bg="#05080b"
      style={{ zIndex: 100, display: 'flex', flexDirection: 'column', fontFamily: MONO }}>
      {/* THE TOOLBAR HOLDS VERBS. Type, sides, chair and the campaign dressing
          are document PROPERTIES and live behind ⚙ — the split Eden makes
          between its toolbar and its Scenario Attributes dialog. What was here
          was nine unlike things in a row: navigation, the title, two truncating
          warnings, a transient message, two properties, an import and one
          action. */}
      <Group gap={8} align="center" px={12} py={8}
        style={{
          borderBottom: `1px solid ${INK.line}`, background: '#111922', flex: '0 0 auto',
        }}>
        <TextBtn title="Back to the shelf" onClick={() => setScreen('library')}>
          ◀ Scenarios
        </TextBtn>
        <Box style={{ flex: 1, minWidth: 0 }}>
          <TextInput size="sm" variant="unstyled" value={doc.name}
            styles={{ input: {
              fontFamily: DATA_FONT, fontSize: 19, fontWeight: 700, letterSpacing: 1,
              color: INK.value, height: 26,
            } }}
            onChange={e => setEd(s => setDoc(s, { name: e.currentTarget.value.toUpperCase() }))} />
          {/* the document's provenance, in the tool's voice rather than the
              game's: this line is chrome, not a radio transmission */}
          <Text truncate style={{ fontFamily: UI_FONT, fontSize: 11.5, color: INK.dim }}>
            {loadedKey ? `Editing ${loadedKey}` : `New · saves into ${ownerPack}`}
            {' · '}{mapName}
            {' · '}{doc.sides.friend.toUpperCase()} vs {doc.sides.hostile.toUpperCase()}
            {' · '}chair {doc.player || '—'}
            {missions.length > 0 && ` · ${missions.length} mission${missions.length > 1 ? 's' : ''}`}
          </Text>
        </Box>
        {msg && (
          <Text maw={300} truncate style={{
            fontFamily: UI_FONT, fontSize: 12,
            color: msg.startsWith('FAILED') || msg.startsWith('⚠') ? INK.bad : INK.accent,
          }}>
            {msg}
          </Text>
        )}
        <Attributes doc={doc} onChange={patch => setEd(s => setDoc(s, patch))} />
        <Select size="xs" w={170} placeholder="Port content…" value={null} searchable
          disabled={!world} styles={field}
          onChange={v => { if (v) port(v) }}
          data={portData} />
        {/* PLAY — the toolbar's other verb, and the reason this is an editor
            rather than a form. Runs what is on the bench, saved or not. */}
        {onPlay && (
          <Box component="button" onClick={play} disabled={!world}
            title="Play this scenario as it stands (unsaved changes included)"
            style={{
              fontFamily: UI_FONT, fontSize: 12.5, padding: '5px 14px', borderRadius: 2,
              border: '1px solid #2f6b4a', background: '#16341f', color: '#a8e0bd',
              cursor: world ? 'pointer' : 'default',
            }}>
            ▶ Play
          </Box>
        )}
        {/* the one action, and it says whether there is anything to do */}
        <Box component="button" onClick={() => void save()} disabled={!world || busy}
          style={{
            fontFamily: UI_FONT, fontSize: 12.5, padding: '5px 14px', borderRadius: 2,
            border: `1px solid ${isDirty ? '#3d7cb8' : INK.line}`,
            background: isDirty ? '#1d3d5c' : '#141c24',
            color: isDirty ? '#dceeff' : INK.dim,
            cursor: world && !busy ? 'pointer' : 'default',
          }}>
          {busy ? 'Saving…' : isDirty ? '● Save' : 'Saved'}
        </Box>
      </Group>

      <Box style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <Palette side={side} sidePacks={doc.sides} carry={carry}
          formation={formation} placedByType={placedByType} playerFormation={player}
          onSide={setSide} onCarry={setCarry} onFormation={setFormation} />
        {/* the map column: sheet above, problems below — both real layout
            siblings, so opening the list genuinely shortens the sheet rather
            than covering the ground you are working on */}
        <Box style={{
          flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0,
        }}>
          <Box style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {world ? (
            <>
              <SheetCanvas ref={sheetRef}
                map={world.map} ground={world.ground}
                entities={entities} tracks={tracks} wires={wires} ghosts={ghosts}
                sel={selIds(ed.sel)}
                carry={carry ? { label: carryLabel(carry) } : null}
                night={night} sat={sat} playerFormation={player}
                friendPack={doc.sides.friend}
                onPick={(id, add) => setEd(s => select(s,
                  id == null ? (add ? s.sel : null)
                    : add ? toggleId(s.sel, id) : oneEntity(id)))}
                onMarquee={(ids, add) => setEd(s => select(s, {
                  k: 'entity', ids: add ? [...new Set([...selIds(s.sel), ...ids])] : ids,
                }))}
                onPickGhost={g => setEd(s => select(s, g))}
                onDrop={onDrop}
                onDragStart={() => setEd(beginDrag)}
                onDragBy={(dx, dy) => setEd(s => moveLive(s, selIds(s.sel), dx, dy))}
                onHandle={(id, patch) => setEd(s => update(s, [id], patch))}
                onFacStart={() => setEd(beginDrag)}
                onFac={(id, key, dx, dy) => setEd(s => facLive(s, id, key, dx, dy))}
                onContext={(x, y, id) => {
                  if (id != null) setEd(s => (selIds(s.sel).includes(id) ? s : select(s, oneEntity(id))))
                  setMenu({ x, y, id })
                }}
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
              <Text style={{ fontFamily: UI_FONT, fontSize: 13, color: INK.dim }}>
                Loading ground…
              </Text>
            </Box>
          )}
          </Box>
          {/* PROBLEMS sit under the sheet, where the thing they are about is.
              A strip when the document is clean, a jump list when it is not. */}
          <ProblemsBar problems={problems}
            onGo={s => {
              setEd(st => select(st, s))
              if (s.k === 'entity') {
                const t = entities.find(x => x.id === s.ids[0])
                if (t) sheetRef.current?.centerOn(t.x, t.y)
              }
            }} />
        </Box>
        {/* THE RAIL: OUTLINE over INSPECTOR, both always present. The outline
            says what the document CONTAINS, the inspector says what the
            selected thing IS. Every editor this tool takes after keeps that
            pair on screen together, because you navigate in one and edit in
            the other — a toggle between them meant selecting a tank destroyed
            the list of tanks. */}
        <Box w={340} style={{
          borderLeft: '1px solid #22303d', display: 'flex', flexDirection: 'column',
        }}>
          <Outline entities={entities} missions={missions} chair={player}
            sel={ed.sel} dangling={danglingSet}
            onSelect={s => setEd(st => select(st, s))}
            onLocate={e => sheetRef.current?.centerOn(e.x, e.y)}
            onAddMission={addMission} />
          {/* the inspector takes only what it needs, up to 60% — so with
              nothing selected the outline gets the whole rail and a campaign's
              missions are not pushed below the fold by an empty panel */}
          <Box style={{
            borderTop: '1px solid #22303d', overflowY: 'auto',
            flex: '0 1 auto', maxHeight: '60%', background: 'rgba(10,16,22,0.5)',
          }}>
            {ed.sel == null ? (
              <Text p={10} style={{
                fontFamily: UI_FONT, fontSize: 12.5, color: INK.dim, lineHeight: 1.5,
              }}>
                Nothing selected. Pick a row above, a symbol on the sheet, or a
                ghost — the dashed shapes are this mission's script.
              </Text>
            ) : ed.sel.k === 'entity' ? (
              <Inspector e={selected(ed)} count={selIds(ed.sel).length}
                friendPack={doc.sides.friend} playerFormation={player}
                onCenter={() => frameRef.current()}
                onPatch={patchEntity}
                onDuplicate={() => setEd(s => duplicate(s, selIds(s.sel)))}
                onArrange={(kind, spacing) =>
                  setEd(s => arrange(s, selIds(s.sel), kind, spacing, axis))}
                onDelete={() => setEd(s => remove(s, selIds(s.sel)))} />
            ) : !benchMission ? null
              : (ed.sel.k === 'tutStep' || ed.sel.k === 'tutHint') ? (
                (() => {
                  const steps = benchMission.tutorial?.steps ?? []
                  const st = steps[ed.sel.s]
                  if (!st) return null
                  const setSteps = (v: typeof steps) => patchMission({
                    tutorial: { ...(benchMission.tutorial ?? {}), steps: v },
                  })
                  return (
                    <TutInspector sel={ed.sel} step={st} stepCount={steps.length}
                      placeNames={placeNames} unitTypes={friendUnitTypes}
                      onSelect={s => setEd(x => select(x, s))}
                      onPatchStep={p => setSteps(steps.map((x, k) =>
                        (k === (ed.sel as { s: number }).s ? { ...x, ...p } : x)))}
                      onDeleteStep={() => {
                        const i = (ed.sel as { s: number }).s
                        setSteps(steps.filter((_, k) => k !== i))
                        setEd(x => select(x, { k: 'mission', m: benchM }))
                      }}
                      onMoveStep={d => {
                        const i = (ed.sel as { s: number }).s
                        const j = i + d
                        if (j < 0 || j >= steps.length) return
                        const v = [...steps]; const t = v[i]!; v[i] = v[j]!; v[j] = t
                        setSteps(v)
                        setEd(x => select(x, { k: 'tutStep', m: benchM, s: j }))
                      }} />
                  )
                })()
              ) : (
                <ScriptInspector sel={ed.sel} mission={benchMission} placeNames={placeNames}
                  onSelect={s => setEd(st => select(st, s))}
                  onPatchMission={patchMission} onCenter={centerOnPlace} />
              )}
          </Box>
        </Box>
      </Box>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}
          items={menu.id != null ? [
            { label: `Frame`, key: 'F', onClick: () => frameRef.current() },
            { label: 'Duplicate', key: 'Ctrl+D',
              onClick: () => setEd(s => duplicate(s, selIds(s.sel))) },
            'sep',
            { label: `Delete${selIds(ed.sel).length > 1 ? ` (${selIds(ed.sel).length})` : ''}`,
              key: 'Del', danger: true,
              onClick: () => setEd(s => remove(s, selIds(s.sel))) },
          ] : [
            { label: 'Select all', key: 'Ctrl+A',
              onClick: () => setEd(s => select(s, { k: 'entity', ids: s.doc.entities.map(e => e.id) })) },
            { label: 'Fit sheet', onClick: () => sheetRef.current?.fit() },
            'sep',
            { label: 'Undo', key: 'Ctrl+Z', onClick: () => setEd(undo) },
            { label: 'Redo', key: 'Ctrl+Y', onClick: () => setEd(redo) },
          ]} />
      )}
    </Box>
  )
}
