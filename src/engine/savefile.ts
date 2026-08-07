// SAVE / CONTINUE — the battlefield serializer.
//
// GameState was built for this from the start: plain data, interfaces not
// classes, ids not object references — with exactly four deliberate exceptions,
// and this module is where all four are paid for:
//
//   1. `S.map` carries closures and megabytes of raster. It is never
//      serialized: the save keeps the MapRef and the ground is REBUILT from
//      the pack on load — then the few things a running game WRITES INTO the
//      ground are replayed on top (pontoon cells, FOB access tracks, relocated
//      base anchors). The ground is content; the war's marks on it are state.
//   2. `S.rng` is a closure. Its whole memory is one 32-bit word (engine/rng),
//      captured and resumed exactly — a restored run draws the same stream the
//      unsaved run would have.
//   3. contacts/structContacts/scenarioPlaces are Map/Set — flattened to
//      entry arrays and rebuilt.
//   4. THE SHARED ROSTERS. An org slot's soldiers ARE its fielded unit's
//      soldiers (and a DUSTWUN site's) — the same arrays, on purpose, so a
//      casualty is one record everywhere. JSON.parse knows nothing of that and
//      hands back three private copies; relinkRosters makes the org slot the
//      source of truth and points everyone back at it. Skipping this is not a
//      degraded save, it is a corrupted one: a medic treating the unit's copy
//      of a soldier while S1 reports the slot's copy.
//
// The campaign SCRIPT rides inside the save (the whole ScenarioSpec): the
// runner asks activeScenario() at runtime for mission triggers, and a save
// that named a pack file instead would break the moment the pack was edited —
// or had come from an unsaved builder playtest that exists nowhere on disk.
import { S } from './state'
import { makeRng } from './rng'
import type { GameState } from './GameState'
import type { Vec2 } from '../world/WorldMap'
import { buildGameMap, type MapRef } from '../world/mapref'
import { connectStructureToRoads, stampTrack } from '../world/access'
import { invalidateRoadGraph } from '../world/pack/roadGraph'
import { R_TRACK } from '../world/WorldMap'
import { installActivePacks, activePack } from '../packs'
import { activeScenario, setActiveScenario } from './campaign'
import type { ScenarioSpec } from '../scenario/types'
import type { Contact } from './GameState'
import { putSave, type SaveMeta } from './saves-db'

const SAVE_VERSION = 1

// Which campaign this session belongs to — the key the splash lists saves
// under. Set at start (App.begin) and by a restore; null = not a campaign
// session (skirmish/sandbox don't save yet — the ask was campaigns).
let _campaignKey: string | null = null
export function setSaveCampaign(key: string | null): void { _campaignKey = key }
export function saveCampaignKey(): string | null { return _campaignKey }

interface SaveFile {
  v: number
  mapRef: MapRef
  // the war's marks on the ground — re-applied over the rebuilt map
  fob: Vec2
  enemyBase: Vec2
  sides: { friend: string; hostile: string }
  scenario: ScenarioSpec | null
  rngState: number | null
  contacts: Array<[number, Contact]>
  structContacts: number[]
  scenarioPlaces: Array<[string, { x: number; y: number; r?: number }]> | null
  state: Record<string, unknown>   // everything else in S, verbatim plain data
}

export function serializeGame(): string {
  const m = S.map
  if (!m?.ref) throw new Error('no game to save — the map has no pack identity')
  // destructure the non-plain fields OUT; `rest` is the serializable remainder
  const { map: _map, rng, contacts, structContacts, scenarioPlaces, radio, toasts: _toasts, ...rest } = S
  const file: SaveFile = {
    v: SAVE_VERSION,
    mapRef: m.ref,
    fob: { x: m.fob.x, y: m.fob.y },
    enemyBase: { x: m.enemyBase.x, y: m.enemyBase.y },
    sides: {
      friend: activePack('friend')?.id ?? '1cd',
      hostile: activePack('hostile')?.id ?? 'opfor',
    },
    scenario: S.campaign ? activeScenario() : null,
    rngState: rng ? rng.state() : null,
    contacts: [...contacts.entries()],
    structContacts: [...structContacts],
    scenarioPlaces: scenarioPlaces ? [...scenarioPlaces.entries()] : null,
    // the net log is unbounded on a long campaign — keep what a scrollback reads
    state: { ...rest, radio: radio.slice(-400), toasts: [] },
  }
  return JSON.stringify(file)
}

export async function restoreGame(json: string): Promise<void> {
  const f = JSON.parse(json) as SaveFile
  if (f.v !== SAVE_VERSION) {
    throw new Error(`save is version ${f.v}, this build reads ${SAVE_VERSION}`)
  }
  // the same armies into the engine registries, the same script into the runner
  installActivePacks(f.sides)
  setActiveScenario(f.scenario)
  // the ground, rebuilt from the pack…
  const map = await buildGameMap(f.mapRef)
  map.fob = f.fob
  map.enemyBase = f.enemyBase
  // …then the war's marks replayed onto it. Pontoons first (they are road
  // cells the movement update stamped), then the FOB access tracks that
  // addStructure lays at placement — deterministic from (map, x, y), so laying
  // them again reproduces them.
  const state = f.state as unknown as GameState
  for (const i of state.pontoons) if (!map.road[i]) map.road[i] = 2
  Object.assign(S, state)
  S.contacts = new Map(f.contacts)
  S.structContacts = new Set(f.structContacts)
  S.scenarioPlaces = f.scenarioPlaces ? new Map(f.scenarioPlaces) : null
  S.rng = f.rngState != null ? makeRng(0, f.rngState) : null
  // re-lay every base's access spur on the fresh map (roads are runtime
  // mutations, not serialized) — was FOB-only, but HQs and OPs get spurs at
  // placement too, and the motor pool / rally logic parks on the base's OWN
  // spur, so a restored HQ without one would fall back to the dispersal arc
  for (const st of S.structures) {
    if (st.kind === 'HQ' || st.kind === 'FOB' || st.kind === 'OP') {
      connectStructureToRoads(map, st.x, st.y)
    }
  }
  // engineer-built roads back onto the fresh map: EVERY entry re-pushes (even
  // a one-point stub, so a mid-build roadwork's `ri` still points at the SAME
  // array and the element keeps building where it left off), finished
  // stretches re-stamp, and the router re-junctions once at the end
  for (const pts of S.engRoads ?? (S.engRoads = [])) {
    map.roads.push({ cls: R_TRACK, pts })
    if (pts.length >= 2) stampTrack(map, pts)
  }
  invalidateRoadGraph(map)
  relinkRosters(S)
  S.map = map
  // restored PAUSED: the commander gets the picture back before the war moves
  S.speed = 0
}

/** JSON gave every holder its own copy of the shared rosters — re-point them
 *  at the org slot's arrays, which are the source of truth (factory.ts:
 *  "the slot's people ARE the unit's people"). */
function relinkRosters(S: GameState): void {
  const slots = S.org?.slots ?? []
  const units = new Map(S.units.map(u => [u.id, u]))
  for (const slot of slots) {
    if (slot.unitId == null) continue
    const u = units.get(slot.unitId)
    if (u) { u.soldiers = slot.soldiers; u.vehicles = slot.vehicles }
  }
  // a DUSTWUN site keeps the fallen unit's roster — its slot still records the
  // dead unit's id (deliberately dangling), which is exactly the join key
  for (const site of S.downed) {
    const slot = slots.find(s => s.unitId === site.unitId)
    if (slot) { site.soldiers = slot.soldiers; site.vehicles = slot.vehicles }
  }
}

/** Write a save point for the running campaign. No-op outside one. */
export async function saveCampaign(kind: 'manual' | 'auto'): Promise<boolean> {
  if (!_campaignKey || !S.map || !S.campaign || S.won || S.lost) return false
  const body = serializeGame()
  const meta: SaveMeta = {
    id: `${_campaignKey}~${Date.now()}`,
    campaign: _campaignKey,
    kind,
    ts: Date.now(),
    simT: S.t,
    // the most recent tasking is what a save point IS to the player
    label: S.campaign.fragoLog.at(-1)?.title ?? 'OPERATION',
    difficulty: S.difficulty,
  }
  await putSave(meta, body)
  return true
}
