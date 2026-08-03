// Scenario setup: the real game and the dev sandbox. Ported verbatim from
// src/game/sim.js initGame/initDevGame. Part of the engine's composition root
// (with SimLoop) — allowed to import the domains.
//
// NOTE on counters: initGame resets nextId and the designators exactly as the
// old module did; groupSeq is deliberately NOT reset (the old module-level
// counter persisted across initGame calls within a session).
import { S } from './state'
import { makeRng } from './rng'
import { DEFAULT_MODE, MODES, type ModeId } from './modes'
import type { WorldMap } from '../world/WorldMap'
import { nearestLand } from '../world/place'
import {
  DIFFICULTIES, DEFAULT_DIFFICULTY, MAP_FORCE_CAP, CAP_MUL,
  type Difficulty, type DifficultyKey,
} from '../domains/economy/difficulty'
import { addStructure, deployUnit } from '../domains/installations/orders'
import { spawnEnemy } from '../domains/forces/factory'
import type { UnitTypeKey } from '../domains/forces/catalog'
import type { ScenarioSpec } from '../scenario/types'
import { applyScenario } from './applyScenario'
import { playerPack, installActivePacks } from '../packs'
import { buildDivisionOrg } from '../packs/org'
import { defaultPlayerFormation } from '../packs/orgquery'
import { buildAssetRegistry } from '../domains/assets/registry'

export function initGame(
  map: WorldMap, seed = 1337, difficulty: string = DEFAULT_DIFFICULTY,
  mode: ModeId = DEFAULT_MODE,
  // THE CHAIR: which battalion the player commands. A campaign scenario pins
  // it, a skirmish player picks it; the division's task-force marking is built
  // around it, so it must be known BEFORE the org is materialized.
  playerBn?: string,
): void {
  // Map construction is the caller's job (world/mapref buildGameMap): which
  // ground, which source, mode terrain rerolls — all decided before this
  // runs. initGame is synchronous scenario composition over a finished map;
  // `seed` seeds the SCENARIO rng (spawns, waves), not the ground.
  // the active packs' catalogs go into the engine registries FIRST — every
  // platform lookup below reads them (idempotent re-install; module load
  // already installed the defaults for pre-init reads)
  installActivePacks()
  const gridSize = map.GRID
  const diff: Difficulty = (DIFFICULTIES as Record<string, Difficulty>)[difficulty]
    || DIFFICULTIES[DEFAULT_DIFFICULTY]
  S.map = map
  S.t = 0
  S.units = []
  S.structures = []
  S.drones = []
  S.shells = []
  S.gunRounds = []
  S.impacts = []
  S.smoke = []
  S.wrecks = []
  S.pontoons = []
  S.contacts = new Map()
  S.structContacts = new Set()
  S.scenarioPlaces = null
  S.downed = []
  S.replT = 0
  S.radio = []
  S.difficulty = diff.key as DifficultyKey // diff came from the table; key is a real preset key
  S.damageMul = diff.damageMul
  S.supplyLift = diff.supplyLift
  S.supplyT = 0
  // difficulty is economic asymmetry, not hidden rules: the OPFOR's rate is the lever
  S.enemySupplyLift = diff.enemySupplyLift
  S.enemyResources = diff.enemyStart
  // force caps: map size sets the room, difficulty tilts who gets more of it
  const base = MAP_FORCE_CAP[gridSize] || MAP_FORCE_CAP[160]!
  const mul = (CAP_MUL as Record<string, { player: number; enemy: number }>)[diff.key] || CAP_MUL.regular
  S.forceCap = Math.round(base * mul.player)
  S.enemyForceCap = Math.round(base * mul.enemy)
  S.fieldCooldown = {}
  S.devMode = false        // dev tooling is opt-in via the sandbox, not on in a real game
  S.resources = 0          // DEAD counter: nothing is purchased (ASSET-REQUESTS.md)
  S.mode = mode
  S.won = false; S.lost = false
  S.endT = null
  S.stats = { fielded: 0, lost: 0, enemyDestroyed: 0, supplySpent: 0 }
  S.hill = null // the mode's setup hook creates these if the mode wants them
  S.waves = null
  S.campaign = null
  S.speed = 1 // a previous match may have ended frozen
  S.enemyFiresOkT = -999
  S.nextWave = 60
  S.airCooldown = {}
  S.enemyGroups = []
  S.opforCmd = { posture: 'attack', effortId: null, supportId: null, effortT: 0 }
  S.rng = makeRng(seed ^ 0xBEEF)
  S.counters.nextId = 1
  S.counters.designators.friend = 0; S.counters.designators.hostile = 0
  S.counters.lineage = {}
  // the player pack's whole division, people and all — built BEFORE any friendly
  // unit spawns so the starter force draws real garrison slots (rng-free).
  // The chair decides what is task-force inside it.
  S.playerBn = playerBn || defaultPlayerFormation(playerPack())
  S.org = buildDivisionOrg(playerPack(), S.playerBn)
  // the division asset pool the TOC can request from (ASSET-REQUESTS.md);
  // campaign scripting pre-allocates pieces to sister brigades in startCampaign
  S.assets = buildAssetRegistry(playerPack())

  // starting installations: the single command post, plus its airstrip
  addStructure('friend', 'HQ', S.map.fob.x, S.map.fob.y, 'HQ COBALT', true)
  addStructure('friend', 'AFLD', S.map.fob.x + 420, S.map.fob.y + 260, 'COBALT STRIP', true)
  addStructure('hostile', 'HQ', S.map.enemyBase.x, S.map.enemyBase.y, 'RED HQ', true)

  // Enemy garrisons: base + towns (northern towns heavier)
  spawnEnemy('ARM', S.map.enemyBase.x - 200, S.map.enemyBase.y + 100)
  spawnEnemy('ARM', S.map.enemyBase.x + 200, S.map.enemyBase.y + 100)
  spawnEnemy('MECH', S.map.enemyBase.x - 100, S.map.enemyBase.y + 250)
  spawnEnemy('INF', S.map.enemyBase.x + 100, S.map.enemyBase.y + 250)
  spawnEnemy('ARTY', S.map.enemyBase.x, S.map.enemyBase.y - 100)
  for (const t of S.map.towns) {
    spawnEnemy('INF', t.x + 100, t.y)
    if (t.y < S.map.WORLD * 0.55) spawnEnemy('MECH', t.x - 150, t.y + 100)
  }

  // Player starter force near the HQ, laid out in a shallow arc so nothing overlaps.
  // Slots that land on no-go terrain (a lake against the base) are nudged to the nearest
  // spot the unit can actually sit on, so the force is never short a vic.
  diff.startForce.forEach((typeKey, i) => {
    const n = diff.startForce.length
    const a = -Math.PI / 2 + (n > 1 ? (i / (n - 1) - 0.5) * 1.5 : 0)
    const p = nearestLand(S.map!, S.map!.fob.x + Math.cos(a) * 260, S.map!.fob.y + Math.sin(a) * 260)
    deployUnit(typeKey, p.x, p.y, true)
  })

  // mode-specific scenario shaping (e.g. King of the Hill places its objective)
  MODES[mode].setup?.(S)
}

// Start an AUTHORED scenario (SCENARIO-MODEL.md): the type IS the mode.
// 'campaign' delegates — the campaign mode's setup reads the active scenario
// (the caller set it) and applies the situation itself. Skirmish types run
// their ruleset over the authored situation: the default staging is
// discarded wholesale and the situation is the world.
export function initScenarioGame(
  map: WorldMap, spec: ScenarioSpec, seed = 1337,
  difficulty: string = DEFAULT_DIFFICULTY,
  // skirmish only: the player took a different playable battalion than the
  // scenario's default. A campaign's chair is scripted and never overridden.
  chair?: string,
): void {
  initGame(map, seed, difficulty, spec.type, chair || spec.player)
  if (spec.type === 'campaign') return // startCampaign applied the situation
  S.units = []
  S.structures = []
  applyScenario(S, spec)
}

// Dev sandbox: a compact, reproducible scenario for fast feature testing — fog off,
// full supply, no incoming waves. Both HQs sit in one screen (friendly bottom-left,
// enemy top-right) with one of every unit type staged near its base, weapons held so
// nothing attrits until the dev commits to a fight.
export function initDevGame(map: WorldMap, seed = 1337): void {
  // The sandbox plays whatever pack map it is handed (the App picks BAGHDAD
  // by default). Every map is a pack map now (P6) — a checkout with no maps
  // saved authors one in the MAP EDITOR first.
  initGame(map, seed)
  S.devMode = true         // unlocks the DEV controls in the top bar
  S.fogEnabled = false
  S.nextWave = Infinity
  S.units = []
  S.structures = []              // place a clean corner-to-corner layout ourselves
  S.enemyGroups = []
  // the discarded starter force burned slots — reissue, same chair
  S.org = buildDivisionOrg(playerPack(), S.playerBn)

  const W = S.map!.WORLD
  // friendly lower-left, enemy upper-right (screen up = -y)
  const blue = nearestLand(S.map!, W * 0.26, W * 0.74)
  const red = nearestLand(S.map!, W * 0.74, W * 0.26)
  S.map!.fob = { x: blue.x, y: blue.y }
  S.map!.enemyBase = { x: red.x, y: red.y }

  // installations spaced well clear of the HQ so their map icons never overlap
  addStructure('friend', 'HQ', blue.x, blue.y, 'HQ COBALT', true)
  const af = nearestLand(S.map!, blue.x + 700, blue.y - 500); addStructure('friend', 'AFLD', af.x, af.y, 'COBALT STRIP', true)
  const fb = nearestLand(S.map!, blue.x - 750, blue.y - 250); addStructure('friend', 'FOB', fb.x, fb.y, 'FOB DEV', true)
  const op = nearestLand(S.map!, blue.x + 250, blue.y + 750); addStructure('friend', 'OP', op.x, op.y, 'OP DEV', true)
  addStructure('hostile', 'HQ', red.x, red.y, 'RED HQ', true)
  const rfb = nearestLand(S.map!, red.x + 700, red.y + 350); addStructure('hostile', 'FOB', rfb.x, rfb.y, 'RED FOB', true)
  const rop = nearestLand(S.map!, red.x - 250, red.y - 750); addStructure('hostile', 'OP', rop.x, rop.y, 'RED OP', true)

  // one of every friendly unit type, in a tidy block forward of the friendly HQ
  // one of every fieldable type in the DIVISION PACKAGE (incl. the MED det) —
  // each draws its real 1CD/attachment slot from S.org
  const BLUE: readonly UnitTypeKey[] = ['INF', 'STRY', 'MECH', 'ARM', 'AT', 'SCT', 'CAV', 'MOR', 'ARTY', 'ENG', 'SIG', 'LOG', 'MED']
  BLUE.forEach((k, i) => {
    const c = i % 4, r = (i / 4) | 0
    const p = nearestLand(S.map!, blue.x - 240 + c * 200, blue.y - 200 + r * 200)
    deployUnit(k, p.x, p.y, true)
  })
  // one of every hostile type, in a block forward of the enemy HQ
  const RED: readonly UnitTypeKey[] = ['INF', 'MECH', 'ARM', 'AT', 'CAV', 'ARTY']
  RED.forEach((k, i) => {
    const c = i % 3, r = (i / 3) | 0
    const p = nearestLand(S.map!, red.x - 200 + c * 200, red.y + 200 - r * 200)
    spawnEnemy(k, p.x, p.y)
  })
  // hold fire so the sandbox stays static until the dev sets a unit weapons-free
  for (const u of S.units) u.weapons = 'hold'

  // open framed on both bases (read by MapView on mount)
  const span = Math.max(Math.abs(red.x - blue.x), Math.abs(red.y - blue.y))
  S.map!.devView = { cx: (blue.x + red.x) / 2, cy: (blue.y + red.y) / 2, fit: span * 1.6 }
}
