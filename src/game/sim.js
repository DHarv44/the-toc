import { genMap, T_FOREST, T_URBAN, T_WATER, CELL, MAP_SIZES } from './mapgen.js'
import { findPath } from './pathfinding.js'
import { UNIT_TYPES, STRUCTURES, DRONE_TYPES, COVER_DEF } from './units.js'
import { makeRng } from './rng.js'
import { DIFFICULTIES, DEFAULT_DIFFICULTY, MAP_FORCE_CAP, CAP_MUL, fieldCooldownFor } from './difficulty.js'
import { radioMsg } from './audio.js'

// ---------------------------------------------------------------------------
// Singleton mutable game state. React reads it via polling; the sim loop
// mutates it. Kept as plain objects for speed and easy dev-console poking.
// ---------------------------------------------------------------------------
// Preserve the live game state across Vite HMR (stashed on globalThis and reused when a hot
// update re-runs this module) so editing this file doesn't reset your session. See the HMR
// block at the bottom, which clears/restarts the loop and self-accepts.
const _hmr = (typeof globalThis !== 'undefined' ? globalThis : window)
export const S = _hmr.__WOD_STATE || (_hmr.__WOD_STATE = {
  t: 0,
  map: null,
  resources: 50000,        // dev: plenty
  supplyLift: 30,          // supply per resupply tick (see SUPPLY_INTERVAL)
  supplyT: 0,              // seconds since the last lift
  // the OPFOR runs the same economy: it buys what it fields and pays upkeep on it,
  // so it can't put more on the board than it can afford — same rules as the player
  enemyResources: 0,
  enemySupplyLift: 30,
  forceCap: 20,            // max ground units each side may have fielded at once
  enemyForceCap: 20,
  fieldCooldown: {},       // 'friend'/'hostile' -> { UNIT_KEY: sim time it's available }
  units: [],               // both sides
  structures: [],          // FOBs, HQs, airfields, OPs — both sides
  drones: [],
  shells: [],
  gunRounds: [],           // gunship cannon rounds in flight
  impacts: [],             // recent arty impacts (for map flash + drone view)
  smoke: [],               // active smoke clouds {x, y, t, r}
  wrecks: [],
  pontoons: [],            // cell indices of engineer-laid bridges
  contacts: new Map(),     // enemyId -> {x, y, type, lastSeen, live}
  structContacts: new Set(),// spotted hostile structure ids (permanent)
  fogEnabled: true,
  devMode: false,          // dev sandbox only: exposes the fog/supply cheats in the top bar
  difficulty: 'regular',
  damageMul: 1,            // global damage scale (difficulty): lower = longer firefights
  speed: 1,
  toasts: [],
  radio: [],               // net traffic: {t, callsign, kind, msg, x, y}
  won: false, lost: false,
  nextWave: 60,
  airCooldown: {},         // drone type -> sim time the type is available again
  enemyGroups: [],         // hostile battlegroups (task-organized elements)
  rng: null,
  version: 0,
})

// resume id allocation past any existing entities so a hot reload doesn't collide
let nextId = 1
for (const e of S.units) if (e.id >= nextId) nextId = e.id + 1
for (const e of S.drones) if (e.id >= nextId) nextId = e.id + 1
for (const e of S.structures) if (e.id >= nextId) nextId = e.id + 1
const designators = { friend: 0, hostile: 0 }
const FRIEND_CALLS = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOX', 'GOLF', 'HOTEL', 'INDIA', 'JULIET', 'KILO', 'LIMA', 'MIKE', 'NOVA', 'OSCAR', 'PAPA', 'QUEBEC', 'ROMEO', 'SIERRA', 'TANGO']

export function initGame(seed = 1337, gridSize = MAP_SIZES.large, difficulty = DEFAULT_DIFFICULTY) {
  const diff = DIFFICULTIES[difficulty] || DIFFICULTIES[DEFAULT_DIFFICULTY]
  S.map = genMap(seed, gridSize)
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
  S.radio = []
  S.difficulty = diff.key
  S.damageMul = diff.damageMul
  S.supplyLift = diff.supplyLift
  S.supplyT = 0
  // difficulty is economic asymmetry, not hidden rules: the OPFOR's rate is the lever
  S.enemySupplyLift = diff.enemySupplyLift
  S.enemyResources = diff.enemyStart
  // force caps: map size sets the room, difficulty tilts who gets more of it
  const base = MAP_FORCE_CAP[gridSize] || MAP_FORCE_CAP[160]
  const mul = CAP_MUL[diff.key] || CAP_MUL.regular
  S.forceCap = Math.round(base * mul.player)
  S.enemyForceCap = Math.round(base * mul.enemy)
  S.fieldCooldown = {}
  S.devMode = false        // dev tooling is opt-in via the sandbox, not on in a real game
  S.resources = diff.supplies
  S.won = false; S.lost = false
  S.nextWave = 60
  S.airCooldown = {}
  S.enemyGroups = []
  S.rng = makeRng(seed ^ 0xBEEF)
  nextId = 1
  designators.friend = 0; designators.hostile = 0

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
    const p = nearestLand(S.map.fob.x + Math.cos(a) * 260, S.map.fob.y + Math.sin(a) * 260)
    deployUnit(typeKey, p.x, p.y, true)
  })
}

// spiral out from a target point to the nearest cell a tracked vehicle can occupy,
// so staged units/bases never land in water regardless of the seed's terrain
// nearest spot a given mobility class can actually occupy — used to keep spawns and
// rally points off water/no-go terrain
function nearestLand(x, y, mob = 'tracked') {
  x = clampWorld(x); y = clampWorld(y)
  if (isFinite(S.map.moveFactor(x, y, mob))) return { x, y }
  for (let r = 1; r < 50; r++) {
    const n = r * 8
    for (let a = 0; a < n; a++) {
      const ang = (a / n) * Math.PI * 2
      const px = clampWorld(x + Math.cos(ang) * r * 120)
      const py = clampWorld(y + Math.sin(ang) * r * 120)
      if (isFinite(S.map.moveFactor(px, py, mob))) return { x: px, y: py }
    }
  }
  return { x, y }
}

// Dev sandbox: a compact, reproducible scenario for fast feature testing — fog off,
// full supply, no incoming waves. Both HQs sit in one screen (friendly bottom-left,
// enemy top-right) with one of every unit type staged near its base, weapons held so
// nothing attrits until the dev commits to a fight.
export function initDevGame(seed = 1337) {
  initGame(seed, MAP_SIZES.small) // smallest map — both bases fit in one screen
  S.devMode = true         // unlocks the DEV controls in the top bar
  S.resources = 999999
  S.fogEnabled = false
  S.nextWave = Infinity
  S.units = []
  S.structures = []              // place a clean corner-to-corner layout ourselves
  S.enemyGroups = []
  const W = S.map.WORLD
  // friendly lower-left, enemy upper-right (screen up = -y)
  const blue = nearestLand(W * 0.26, W * 0.74)
  const red = nearestLand(W * 0.74, W * 0.26)
  S.map.fob = { x: blue.x, y: blue.y }
  S.map.enemyBase = { x: red.x, y: red.y }

  // installations spaced well clear of the HQ so their map icons never overlap
  addStructure('friend', 'HQ', blue.x, blue.y, 'HQ COBALT', true)
  const af = nearestLand(blue.x + 700, blue.y - 500); addStructure('friend', 'AFLD', af.x, af.y, 'COBALT STRIP', true)
  const fb = nearestLand(blue.x - 750, blue.y - 250); addStructure('friend', 'FOB', fb.x, fb.y, 'FOB DEV', true)
  const op = nearestLand(blue.x + 250, blue.y + 750); addStructure('friend', 'OP', op.x, op.y, 'OP DEV', true)
  addStructure('hostile', 'HQ', red.x, red.y, 'RED HQ', true)
  const rfb = nearestLand(red.x + 700, red.y + 350); addStructure('hostile', 'FOB', rfb.x, rfb.y, 'RED FOB', true)
  const rop = nearestLand(red.x - 250, red.y - 750); addStructure('hostile', 'OP', rop.x, rop.y, 'RED OP', true)

  // one of every friendly unit type, in a tidy block forward of the friendly HQ
  const BLUE = ['INF', 'STRY', 'MECH', 'ARM', 'AT', 'SCT', 'CAV', 'MOR', 'ARTY', 'ENG', 'SIG', 'LOG']
  BLUE.forEach((k, i) => {
    const c = i % 4, r = (i / 4) | 0
    const p = nearestLand(blue.x - 240 + c * 200, blue.y - 200 + r * 200)
    deployUnit(k, p.x, p.y, true)
  })
  // one of every hostile type, in a block forward of the enemy HQ
  const RED = ['INF', 'MECH', 'ARM', 'AT', 'CAV', 'ARTY']
  RED.forEach((k, i) => {
    const c = i % 3, r = (i / 3) | 0
    const p = nearestLand(red.x - 200 + c * 200, red.y + 200 - r * 200)
    spawnEnemy(k, p.x, p.y)
  })
  // hold fire so the sandbox stays static until the dev sets a unit weapons-free
  for (const u of S.units) u.weapons = 'hold'

  // open framed on both bases (read by MapView on mount)
  const span = Math.max(Math.abs(red.x - blue.x), Math.abs(red.y - blue.y))
  S.map.devView = { cx: (blue.x + red.x) / 2, cy: (blue.y + red.y) / 2, fit: span * 1.6 }
}

function addStructure(side, kind, x, y, label, instant = false) {
  const spec = STRUCTURES[kind]
  const s = {
    id: nextId++, side, kind, x, y,
    label: label || (spec.abbr + '-' + nextId),
    hp: spec.hp, maxHp: spec.hp,
    buildT: instant ? 0 : spec.buildTime,
    sight: spec.sight, deployZone: spec.deployZone,
    income: spec.income, launchesDrones: !!spec.launchesDrones,
    stock: spec.stock0 || 0,
  }
  S.structures.push(s)
  return s
}

// Effective stats for a unit's current posture. Carrier types swap between
// mounted (vehicle mobility/protection, scaled firepower) and dismounted
// (base infantry stats). Variants are cached on the type object.
export function effStats(u) {
  const t = UNIT_TYPES[u.type]
  if (!t.carrier) return t
  if (!t._mtd) {
    const c = t.carrier
    t._mtd = {
      ...t, mob: c.mob, speed: c.speed, soft: c.soft,
      sight: t.sight * 0.85, dpsSoft: t.dpsSoft * c.fireMul, dpsHard: t.dpsHard * c.fireMul,
    }
    t._dis = { ...t }
  }
  return u.mounted ? t._mtd : t._dis
}

function newUnit(typeKey, side, x, y) {
  const type = UNIT_TYPES[typeKey]
  designators[side]++
  const label = side === 'friend'
    ? FRIEND_CALLS[(designators.friend - 1) % FRIEND_CALLS.length] + '-' + designators.friend
    : 'E' + String(designators.hostile).padStart(2, '0')
  const u = {
    id: nextId++, side, type: typeKey, label,
    x, y, heading: side === 'friend' ? -Math.PI / 2 : Math.PI / 2,
    strength: 100, path: [], legs: [], state: 'hold',
    mounted: !!type.carrier,
    roe: type.logi ? 'break' : 'halt', // supply trucks run, they don't fight
    heldRoute: null, autoDismounted: false, lastCombatT: -99, breaking: false, convoy: null,
    attackId: null, attackMove: false, attackRepathT: 0, groupId: null,
    colIdx: null, leadId: null,   // slot in a shared-route column, if marching in one
    posture: 'mobile', digT: 0, dugRadioed: false, weapons: 'free',
    fireCooldown: 0, missionCooldown: 0, targetId: null,
    bridging: null,
    lastContactT: -99, lastReqT: -99, lastSpotT: -99, lastFiredT: null, strMark: 100,
    aiRole: null, aiRepathT: 0,
    formSeed: S.rng ? S.rng() * 1000 : Math.random() * 1000,
    _spd: type.speed,
    elements: [],
  }
  initElements(u)
  return u
}

// --- sub-element layer: each unit is a formation of individual vics/troops ----
// The unit stays the command/movement/AI entity; elements let precision fires
// hit specific platforms and each destroyed vic leave its own wreck/explosion.
function bgOffset(n, seed) {
  const row = Math.ceil(n / 2)
  const side = n === 0 ? 0 : (n % 2 === 1 ? -1 : 1)
  return { fwd: -row * 28 - (seed % 7), lat: side * (22 + row * 14) + ((seed * 13) % 9) - 4 }
}
function initElements(u) {
  const type = UNIT_TYPES[u.type]
  const seed = u.formSeed | 0
  const els = []
  const nVeh = type.carrier ? type.carrier.veh : type.veh
  for (let n = 0; n < nVeh; n++) {
    const o = bgOffset(n, (seed * 10 + n) | 0)
    els.push({ ox: o.fwd, oy: o.lat, kind: 'veh', alive: true })
  }
  const nTrp = type.troops > 0 ? Math.max(1, Math.round(type.troops / 4)) : 0
  for (let n = 0; n < nTrp; n++) {
    const o = bgOffset(n + 1, (seed * 17 + n * 3) | 0)
    els.push({ ox: o.fwd * 0.5, oy: o.lat * 0.7, kind: 'troop', alive: true })
  }
  if (!els.length) els.push({ ox: 0, oy: 0, kind: 'troop', alive: true })
  u.elements = els
}
// world position of an element given the unit's heading
export function elemWorld(u, el) {
  const s = Math.sin(u.heading), c = Math.cos(u.heading)
  return { x: u.x + c * el.ox - s * el.oy, y: u.y + s * el.ox + c * el.oy }
}
// which elements are "exposed": carrier units show vics when mounted, troops when
// dismounted; integral units (recon/armor/guns) always show their full set.
export function elemExposed(u, el) {
  const type = UNIT_TYPES[u.type]
  if (!type.carrier) return true
  return u.mounted ? el.kind === 'veh' : el.kind === 'troop'
}
function exposedList(u) { return u.elements.filter(el => elemExposed(u, el)) }

function killElement(u, el) {
  if (!el.alive) return
  el.alive = false
  if (el.kind === 'veh') {
    const w = elemWorld(u, el)
    S.wrecks.push({ x: w.x, y: w.y, side: u.side, type: u.type, t: S.t })
    while (S.wrecks.length > 140) S.wrecks.shift()
  }
}

// keep the exposed element count in step with the unit's strength: kill front-most
// vics as it drops (attrition), revive rear-most only when told to (reinforcement).
function syncElements(u, allowRevive = false) {
  const exp = exposedList(u)
  if (!exp.length) return
  if (u.strength <= 0) { for (const el of exp) killElement(u, el); return }
  const target = Math.max(1, Math.round(u.strength / 100 * exp.length))
  let aliveN = exp.reduce((n, el) => n + (el.alive ? 1 : 0), 0)
  while (aliveN > target) {
    const el = exp.find(e => e.alive)
    if (!el) break
    killElement(u, el); aliveN--
  }
  if (allowRevive) {
    while (aliveN < target) {
      let el = null
      for (let i = exp.length - 1; i >= 0; i--) if (!exp[i].alive) { el = exp[i]; break }
      if (!el) break
      el.alive = true; aliveN++
    }
  }
}

// precision/blast fires resolve against individual elements by distance, so a
// direct hit kills the vic you aimed at; sub-lethal splash chips aggregate strength.
function precisionBlast(u, ix, iy, blast, dmg, shell, apMul = 1) {
  const type = UNIT_TYPES[u.type]
  const icm = shell === 'ICM'
  const armorFactor = icm ? type.soft * 0.55 + (1 - type.soft) * 1.0 : type.soft * 1.0 + (1 - type.soft) * 0.45
  const terr = S.map.terr[S.map.cellAt(u.x, u.y)]
  const cover = terr === T_URBAN ? 0.65 : terr === T_FOREST ? 0.85 : 1
  const post = postureFactor(u)
  const exp = exposedList(u)
  if (!exp.length) return
  let killed = 0, residual = 0
  for (const el of exp) {
    if (!el.alive) continue
    const w = elemWorld(u, el)
    const dEl = Math.hypot(w.x - ix, w.y - iy)
    // exposed foot mobiles catch fragmentation over a wider radius (anti-personnel splash)
    const elBlast = el.kind === 'troop' ? blast * apMul : blast
    if (dEl >= elBlast) continue
    const lethality = dmg * (1 - dEl / elBlast) * armorFactor * cover * post * (S.damageMul ?? 1)
    if (lethality >= 18) { killElement(u, el); killed++ }
    else residual += lethality
  }
  if (killed) u.strength = Math.max(0, u.strength - killed / exp.length * 100)
  if (residual) u.strength = Math.max(0, u.strength - residual * 0.12)
}

function healUnit(u, points, cap, revive) {
  if (points <= 0 || u.strength >= cap) return
  u.strength = Math.min(cap, u.strength + points)
  if (revive) syncElements(u, true)
}

function spawnEnemy(typeKey, x, y) {
  const u = newUnit(typeKey, 'hostile', x, y)
  u.aiRole = 'garrison'
  u.anchorX = x; u.anchorY = y
  S.units.push(u)
  return u
}

// --- player commands ------------------------------------------------------

const clampWorld = (v) => Math.max(75, Math.min(S.map ? S.map.WORLD - 75 : v, v))

// the structure whose deploy zone covers this point (nearest if several)
function fundingStructure(x, y) {
  let best = null, bd = Infinity
  for (const s of S.structures) {
    if (s.side !== 'friend' || s.buildT > 0 || !s.deployZone) continue
    const d = Math.hypot(x - s.x, y - s.y)
    if (d <= s.deployZone && d < bd) { best = s; bd = d }
  }
  return best
}

export function deployUnit(typeKey, x, y, free = false) {
  const type = UNIT_TYPES[typeKey]
  const mob = type.carrier ? type.carrier.mob : type.mob
  if (!isFinite(S.map.moveFactor(x, y, mob))) return toast('NO-GO TERRAIN')
  if (!free) {
    const site = fundingStructure(x, y)
    if (!site) return toast('OUTSIDE DEPLOY ZONE')
    if (site.kind === 'FOB') {
      // forward bases spend their own stock — keep the convoys rolling
      if ((site.stock || 0) < type.cost) {
        return toast(`${site.label} LOW ON SUPPLY — ${type.abbr} NEEDS ${type.cost}, HAS ${Math.floor(site.stock || 0)}`)
      }
      site.stock -= type.cost
    } else {
      if (S.resources < type.cost) return toast('INSUFFICIENT SUPPLY')
      S.resources -= type.cost
    }
  }
  const u = newUnit(typeKey, 'friend', x, y)
  S.units.push(u)
  return u
}

// Rally point for a unit fielded at a site: a spot just clear of the base, facing the
// map interior. Successive units fan left/right of that bearing so a production queue
// spreads out instead of stacking on one grid square.
function rallyPoint(st, mob) {
  st.rallySeq = (st.rallySeq || 0) + 1
  const toward = Math.atan2(S.map.WORLD / 2 - st.y, S.map.WORLD / 2 - st.x)
  const n = st.rallySeq
  const spread = Math.ceil(n / 2) * (n % 2 ? 1 : -1) * 0.3
  for (const rad of [340, 460, 600, 780]) {
    const x = clampWorld(st.x + Math.cos(toward + spread) * rad)
    const y = clampWorld(st.y + Math.sin(toward + spread) * rad)
    if (isFinite(S.map.moveFactor(x, y, mob))) return { x, y }
  }
  return nearestLand(st.x + Math.cos(toward) * 340, st.y + Math.sin(toward) * 340, mob)
}

// Field a ground unit from a specific installation — the one-click flow. The unit is
// built AT the site and then moves out to a rally point on its own, rather than being
// placed by the player somewhere inside the deploy zone. No map click, no deploy mode:
// the selected installation already says where it comes from.
// Raise the aerostat at a selected FOB/HQ — the one-click equivalent for the tethered
// balloon. It tethers at that site anyway, so there's nothing to place on the map.
// deployDrone enforces the cost and the one-per-site rule.
export function fieldAerostat(structId) {
  const st = S.structures.find(s => s.id === structId && s.side === 'friend')
  if (!st) return toast('NO SITE SELECTED')
  if (st.kind !== 'HQ' && st.kind !== 'FOB') return toast(`${st.label} CANNOT FLY AN AEROSTAT`)
  return deployDrone('AEROSTAT', st.x, st.y)
}

export function fieldUnit(typeKey, structId) {
  const type = UNIT_TYPES[typeKey]
  if (!type) return null
  const st = S.structures.find(s => s.id === structId && s.side === 'friend')
  if (!st) return toast('NO FIELDING SITE SELECTED')
  if (st.buildT > 0) return toast(`${st.label} STILL UNDER CONSTRUCTION`)
  if (st.kind !== 'HQ' && st.kind !== 'FOB') return toast(`${st.label} CANNOT FIELD GROUND UNITS`)

  // force cap and per-type turnaround, same shape as the airframe limits
  const av = unitAvailability(typeKey, 'friend')
  if (av.capped) return toast(`FORCE AT CAPACITY — ${av.used}/${av.max} FIELDED`)
  if (av.cooldown > 0) return toast(`${type.abbr} REFITTING — ${fmtCooldown(av.cooldown)}`)

  // forward bases spend their own stock; the HQ draws on the theatre pool
  if (st.kind === 'FOB') {
    if ((st.stock || 0) < type.cost) {
      return toast(`${st.label} LOW ON SUPPLY — ${type.abbr} NEEDS ${type.cost}, HAS ${Math.floor(st.stock || 0)}`)
    }
    st.stock -= type.cost
  } else {
    if (S.resources < type.cost) return toast('INSUFFICIENT SUPPLY')
    S.resources -= type.cost
  }

  const mob = type.carrier ? type.carrier.mob : type.mob
  const spawn = nearestLand(st.x, st.y, mob)
  const u = newUnit(typeKey, 'friend', spawn.x, spawn.y)
  S.units.push(u)
  stampFieldCooldown(typeKey, 'friend')

  const r = rallyPoint(st, mob)
  netRadio(u, 'move', `FIELDED AT ${st.label} — MOVING TO RALLY`, u.x, u.y)
  orderMove(u.id, r.x, r.y)
  return u
}

export function deployStructure(kind, x, y) {
  x = clampWorld(x); y = clampWorld(y)
  const spec = STRUCTURES[kind]
  if (!spec) return null
  if (S.resources < spec.cost) return toast('INSUFFICIENT SUPPLY')
  if (S.map.terrAt(x, y) === T_WATER) return toast('CANNOT BUILD ON WATER')
  if (kind === 'HQ' && S.structures.some(s => s.side === 'friend' && s.kind === 'HQ')) {
    return toast('ONLY ONE COMMAND POST PERMITTED')
  }
  if (kind === 'FOB' && !S.units.some(u => u.side === 'friend' && u.type === 'ENG'
      && u.strength > 0 && Math.hypot(u.x - x, u.y - y) <= 500)) {
    return toast('FOB CONSTRUCTION REQUIRES ENGINEERS ON SITE')
  }
  const nearStruct = S.structures.some(s => s.side === 'friend' && s.buildT <= 0 && Math.hypot(s.x - x, s.y - y) <= spec.near)
  // a supply truck on site lets an engineer establish a FOB forward of the base network
  const supplyOnSite = kind === 'FOB' && S.units.some(u => u.side === 'friend' && u.type === 'LOG'
    && u.strength > 0 && Math.hypot(u.x - x, u.y - y) <= 500)
  // airfields are a strategic asset — only the HQ can stand one up
  const nearHQ = kind === 'AFLD' && S.structures.some(s => s.side === 'friend' && s.kind === 'HQ'
    && s.buildT <= 0 && Math.hypot(s.x - x, s.y - y) <= spec.near)
  const nearOk = kind === 'OP'
    ? (S.units.some(u => u.side === 'friend' && Math.hypot(u.x - x, u.y - y) <= spec.near) || nearStruct)
    : kind === 'AFLD' ? nearHQ
      : (nearStruct || supplyOnSite)
  if (!nearOk) return toast(
    kind === 'OP' ? 'TOO FAR FROM FRIENDLY FORCES'
      : kind === 'AFLD' ? 'AIRFIELD MUST BE ESTABLISHED NEAR THE HQ'
        : kind === 'FOB' ? 'TOO FAR FROM BASE — NEEDS A SUPPLY TRUCK ON SITE'
          : 'TOO FAR FROM EXISTING BASE')
  S.resources -= spec.cost
  const s = addStructure('friend', kind, x, y)
  toast(s.label + ' — CONSTRUCTION STARTED')
  return s
}

// Supply economy. Lifts land every SUPPLY_INTERVAL seconds in whole multiples of 10, so
// the counter steps rather than spins. Upkeep is a fixed share of a unit's purchase cost
// per minute: a unit costs roughly UPKEEP_DIVISOR minutes of its own price to keep in the
// field, which is what stops a standing army from accumulating for free.
export const SUPPLY_INTERVAL = 3
export const UPKEEP_DIVISOR = 12

// running upkeep of a side's units, in supply per minute
export function upkeepPerMin(side = 'friend') {
  let n = 0
  for (const u of S.units) {
    if (u.side !== side || u.strength <= 0) continue
    // hostile garrisons are locally sustained and pre-positioned — only manoeuvre
    // battlegroups draw on the OPFOR's mobile supply, so a static defence doesn't
    // starve its ability to ever attack
    if (side === 'hostile' && u.bgGroup == null) continue
    n += (UNIT_TYPES[u.type]?.cost || 0) / UPKEEP_DIVISOR
  }
  return n
}

// what a battlegroup template costs to field, from its members' own prices
export function templateCost(comp) {
  return comp.reduce((n, t) => n + (UNIT_TYPES[t]?.cost || 0), 0)
}

// Ground force headroom for a side. Hostile garrisons don't count — they're the map's
// furniture, not the OPFOR's manoeuvre force, and counting them would cap the attack
// out of existence on a town-heavy map.
export function forceCount(side = 'friend') {
  let n = 0
  for (const u of S.units) {
    if (u.side !== side || u.strength <= 0) continue
    if (side === 'hostile' && u.bgGroup == null) continue
    n++
  }
  return n
}

export function forceCap(side = 'friend') {
  return side === 'hostile' ? (S.enemyForceCap || 0) : (S.forceCap || 0)
}

// Availability of a ground unit type: force headroom plus its per-type cooldown. Mirrors
// airAvailability, so the palette can grey a row before it's clicked either way.
export function unitAvailability(typeKey, side = 'friend') {
  const cd = (S.fieldCooldown[side] || {})[typeKey] || 0
  const cooldown = Math.max(0, cd - S.t)
  const used = forceCount(side), max = forceCap(side)
  return { used, max, cooldown, capped: used >= max, ready: used < max && cooldown <= 0 }
}

function stampFieldCooldown(typeKey, side) {
  if (!S.fieldCooldown[side]) S.fieldCooldown[side] = {}
  S.fieldCooldown[side][typeKey] = S.t + fieldCooldownFor(UNIT_TYPES[typeKey]?.cost || 0)
}

// gross supply per minute before upkeep
export function incomePerMin() {
  return (S.supplyLift || 0) * (60 / SUPPLY_INTERVAL)
}

// mm:ss for a turnaround readout — cooldowns run to 15 minutes, so bare seconds read badly
export function fmtCooldown(s) {
  const m = Math.floor(s / 60), r = Math.ceil(s % 60)
  return m > 0 ? `${m}:${String(r).padStart(2, '0')}` : `${r}s`
}

// Availability of an airframe type: how many are up against its cap, and whether the
// type is still in turnaround from the last sortie. Used both to gate deployDrone and
// to render the palette, so the player sees the block before clicking rather than after.
export function airAvailability(typeKey) {
  const spec = DRONE_TYPES[typeKey]
  const active = S.drones.reduce((n, d) => n + (d.type === typeKey ? 1 : 0), 0)
  const max = spec && spec.maxActive != null ? spec.maxActive : Infinity
  const until = S.airCooldown[typeKey] || 0
  const cooldown = Math.max(0, until - S.t)
  return { active, max, cooldown, capped: active >= max, ready: active < max && cooldown <= 0 }
}

// Stamp the turnaround clock when a sortie ends — RTB recovery, bingo, shootdown or
// crash all count. Called from every path that removes a drone from S.drones.
function endSortie(d) {
  const spec = DRONE_TYPES[d.type]
  if (spec && spec.cooldown) S.airCooldown[d.type] = S.t + spec.cooldown
}

export function deployDrone(typeKey, x, y) {
  x = clampWorld(x); y = clampWorld(y)
  const spec = DRONE_TYPES[typeKey]
  if (!spec) return null
  // structural scarcity: concurrent cap, then turnaround from the last sortie
  const avail = airAvailability(typeKey)
  if (avail.capped) {
    return toast(`${spec.abbr} AT LIMIT — ${avail.active}/${avail.max} AIRBORNE`)
  }
  if (avail.cooldown > 0) {
    return toast(`${spec.abbr} IN TURNAROUND — ${fmtCooldown(avail.cooldown)}`)
  }
  let ox, oy
  let tether = null
  let launcherId = null
  if (spec.src === 'tether') {
    // aerostat: raised at a FOB/HQ, one per site
    const site = S.structures
      .filter(s => s.side === 'friend' && s.buildT <= 0 && (s.kind === 'FOB' || s.kind === 'HQ')
        && Math.hypot(s.x - x, s.y - y) <= spec.tetherRange)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0]
    if (!site) return toast('MUST TETHER AT A FOB OR HQ')
    if (S.drones.some(d => d.tether === site.id)) return toast(site.label + ' ALREADY FLIES AN AEROSTAT')
    tether = site
    // stand the mast off to the side of the base rather than on top of its symbol, on a
    // bearing away from the map interior (behind the base) and on passable ground
    const away = Math.atan2(site.y - S.map.WORLD / 2, site.x - S.map.WORLD / 2)
    const p = nearestLand(site.x + Math.cos(away) * 220, site.y + Math.sin(away) * 220, 'foot')
    ox = p.x; oy = p.y
    x = p.x; y = p.y
  } else if (spec.src === 'airfield') {
    const afld = S.structures
      .filter(s => s.side === 'friend' && s.buildT <= 0 && s.launchesDrones)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0]
    if (!afld) return toast('NO ACTIVE AIRFIELD')
    ox = afld.x; oy = afld.y
  } else {
    // field-launched: hand-thrown by the nearest friendly unit in control range
    const launcher = S.units
      .filter(u => u.side === 'friend' && Math.hypot(u.x - x, u.y - y) <= spec.ctrlRange)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0]
    if (!launcher) return toast('NO FRIENDLY UNIT IN CONTROL RANGE')
    ox = launcher.x; oy = launcher.y
    launcherId = launcher.id
  }
  if (S.resources < spec.cost) return toast('INSUFFICIENT SUPPLY')
  S.resources -= spec.cost
  const id = nextId++
  const d = {
    id, type: typeKey, x: ox, y: oy, ox, oy,
    tx: x, ty: y, state: tether ? 'onstation' : 'transit', route: [],
    tether: tether ? tether.id : null,
    sensorMode: tether ? 'auto' : null,   // aerostat turret: free / auto / lock
    scanAngle: 0,
    altMul: 1, sightMul: 1, orbitMul: 1,
    endurance: spec.endurance, angle: 0,
    ammo: spec.weapons ? spec.weapons.ammo : 0,
    label: spec.abbr + '-' + (id % 100),
    // a unit-launched bird recovers to its parent unit, and stays over it by default
    launcherId,
    followId: launcherId,
  }
  if (spec.gunship) {
    d.gunSel = spec.gunship.order[0]        // active weapon
    d.fireMode = 'hold'                      // guns start safe until the player commits
    d.gunCd = 0
    d.gunAmmo = {}
    for (const k of spec.gunship.order) d.gunAmmo[k] = spec.gunship.weapons[k].ammo
    d.targets = []
  }
  S.drones.push(d)
  radio(d.label, 'move', tether
    ? `${spec.name.toUpperCase()} ALOFT AT ${tether.label}`
    : `${spec.name.toUpperCase()} LAUNCHED — ORBIT GRID ${grid(x, y)}`, x, y)
  return d
}

// retask a drone's orbit anchor; shift-click appends route waypoints
export function orderDroneMove(droneId, x, y, append = false) {
  const d = S.drones.find(d => d.id === droneId)
  if (!d) return
  if (d.tether) return toast(d.label + ' IS TETHERED')
  if (d.state === 'rtb' || d.state === 'striking') return toast(d.label + ' — UNABLE, COMMITTED')
  x = clampWorld(x); y = clampWorld(y)
  d.followId = null
  if (!d.route) d.route = []
  if (append && d.route.length) {
    d.route.push({ x, y })
    radio(d.label, 'move', `COPY — WP ADDED, GRID ${grid(x, y)}`, x, y)
  } else {
    d.route = [{ x, y }]
    d.tx = x; d.ty = y
    if (d.state === 'onstation') d.state = 'transit'
    radio(d.label, 'move', `RETASKING — ORBIT GRID ${grid(x, y)}`, x, y)
  }
}

export function droneDropWp(droneId) {
  const d = S.drones.find(d => d.id === droneId)
  if (!d || !d.route || !d.route.length) return
  d.route.pop()
  if (d.route.length) {
    d.tx = d.route[0].x; d.ty = d.route[0].y
  } else if (d.state === 'transit') {
    // dropped the active leg: orbit right here
    d.tx = d.x; d.ty = d.y
    d.state = 'onstation'
  }
}

// altitude / orbit radius presets from the drone context menu
export function droneSet(droneId, patch) {
  const d = S.drones.find(d => d.id === droneId)
  if (!d) return
  Object.assign(d, patch)
  d.sightMul = d.altMul >= 1.5 ? 1.25 : d.altMul <= 0.7 ? 0.8 : 1
  if (patch.altMul != null) {
    radio(d.label, 'move', `ANGELS ${patch.altMul <= 0.7 ? 'LOW' : patch.altMul >= 1.5 ? 'HIGH' : 'MED'}`, d.x, d.y)
  }
}

export function droneRTB(droneId) {
  const d = S.drones.find(d => d.id === droneId)
  if (!d || d.state === 'rtb') return
  if (d.tether) {
    // balloons don't fly home — winch down and recover
    radio(d.label, 'move', 'AEROSTAT WINCHED DOWN', d.x, d.y)
    endSortie(d)
    S.drones.splice(S.drones.indexOf(d), 1)
    return
  }
  d.state = 'rtb'
  d.followId = null
  d.route = []
  radio(d.label, 'move', 'RTB PER TASKING', d.x, d.y)
}

// sensor lock: camera stays on a unit (track) or a grid (point) regardless of orbit
// Aerostat turret mode: 'auto' (continuous 360° survey sweep) or 'free' (operator slews
// the bearing by hand). Pointing at a specific contact is FOLLOW, not a mode — designate
// it in the feed and press FOLLOW, same as every other drone.
export function droneSensorMode(droneId, mode) {
  const d = S.drones.find(d => d.id === droneId)
  if (!d) return
  d.sensorMode = mode
  // FREE starts level — the operator can only tilt down from the horizon
  if (mode === 'free' && d.tilt == null) d.tilt = 0.05
  // taking manual/auto control drops any follow-track the sensor was holding
  if (d.followId) { d.followId = null; if (d.lock && d.lock.track) d.lock = null }
}

export function droneLock(droneId, lock) {
  const d = S.drones.find(d => d.id === droneId)
  if (!d) return
  // sensor lock is a silent camera action — no net traffic. The transmission happens on
  // TARGET lock instead (see droneToggleTarget), as a request for permission to fire.
  if (!lock) { d.lock = null; return }
  if (lock.unitId != null) {
    const u = S.units.find(u => u.id === lock.unitId)
    if (!u) return
    d.lock = { unitId: u.id, x: u.x, y: u.y }
  } else {
    d.lock = { x: lock.x, y: lock.y }
  }
}

// track a designated contact: the orbit anchor chases the unit (movable airframes),
// or the sensor slaves to it while it stays in the field of regard (tethered aerostat).
// unitId is any unit the sensor can see — usually a hostile picked in the feed.
export function droneFollow(droneId, unitId) {
  const d = S.drones.find(d => d.id === droneId)
  if (!d) return
  if (unitId) {
    const u = S.units.find(u => u.id === unitId)
    if (!u) return
    d.followId = unitId
    d.route = []
    const who = u.side === 'friend' ? u.label : 'HOSTILE ' + UNIT_TYPES[u.type].abbr
    radio(d.label, 'spot', d.tether
      ? `SENSOR TRACKING ${who} — GRID ${grid(u.x, u.y)}`
      : `TRACKING ${who} — GRID ${grid(u.x, u.y)}`, u.x, u.y)
  } else {
    d.followId = null
    if (d.lock && d.lock.track) d.lock = null   // release the follow camera
    radio(d.label, 'move', `TRACK DROPPED — HOLDING GRID ${grid(d.tx, d.ty)}`, d.tx, d.ty)
  }
}

// armed drones: VIPER fires an AGM at a point; SWITCHBLADE dives on it
export function droneStrike(droneId, x, y) {
  const d = S.drones.find(d => d.id === droneId)
  if (!d) return
  const spec = DRONE_TYPES[d.type]
  if (spec.weapons) {
    // fires from the orbit or while transiting — not once committed to RTB/striking
    if (d.state !== 'onstation' && d.state !== 'transit') return toast(d.label + ' NOT ON STATION')
    if (d.ammo <= 0) return toast(d.label + ' WINCHESTER — NO ORDNANCE')
    if (Math.hypot(d.x - x, d.y - y) > spec.weapons.range) return toast('TARGET OUTSIDE WEAPON RANGE')
    d.ammo--
    const impactT = S.t + spec.weapons.flight
    S.shells.push({
      fromX: d.x, fromY: d.y, x, y,
      impactT,
      dmg: spec.weapons.dmg, blast: spec.weapons.blast, side: 'friend',
      splashFrom: d.label,
    })
    d.strikeMark = { x, y, until: impactT }
    radio(d.label, 'fires', `RIFLE — TGT GRID ${grid(x, y)}, ${d.ammo} AGM REMAINING`, x, y)
  } else if (spec.kamikaze) {
    if (d.state !== 'onstation' && d.state !== 'transit') return
    d.state = 'striking'
    d.sx = x; d.sy = y
    d.strikeMark = { x, y, until: S.t + 30 } // cleared on impact when the drone despawns
    radio(d.label, 'fires', `TERMINAL ATTACK — GRID ${grid(x, y)}`, x, y)
  }
}

// --- viewer target designation (per-vic) ---
// the player clicks individual vics/troops in the UAV feed to build a target set,
// then presses FIRE. targets track the specific element so a moving vic stays marked.
export function droneToggleTarget(droneId, unitId, ei) {
  const d = S.drones.find(d => d.id === droneId)
  if (!d) return
  const spec = DRONE_TYPES[d.type]
  // any drone can designate a target in its feed — armed drones use it to FIRE,
  // every drone can use it to FOLLOW. Selecting is silent for unarmed sensors.
  const armed = spec.weapons || spec.kamikaze || spec.gunship
  if (!d.targets) d.targets = []
  const i = d.targets.findIndex(t => t.unitId === unitId && t.ei === ei)
  if (i >= 0) { d.targets.splice(i, 1); return }
  const wasEmpty = !d.targets.length
  d.targets.push({ unitId, ei })
  // first target of an engagement on an armed platform → request permission to fire
  if (wasEmpty && armed) {
    const p = targetPoint({ unitId, ei })
    if (p) radio(d.label, 'fires', `TARGET LOCKED — GRID ${grid(p.x, p.y)}, REQUEST PERMISSION TO ENGAGE`, p.x, p.y)
  }
}
export function droneClearTargets(droneId) {
  const d = S.drones.find(d => d.id === droneId)
  if (d) d.targets = []
}
// resolve a target descriptor to a live element's world position (null if dead/gone)
function targetPoint(t) {
  const u = S.units.find(x => x.id === t.unitId && x.strength > 0)
  if (!u || !u.elements) return null
  const el = u.elements[t.ei]
  if (!el || !el.alive) return null
  return elemWorld(u, el)
}
// release ordnance against every designated vic (one munition each) until winchester.
// the target set is NOT cleared — reticles stay put; targets drop only when destroyed.
export function droneFire(droneId) {
  const d = S.drones.find(d => d.id === droneId)
  if (!d) return
  const spec = DRONE_TYPES[d.type]
  if (spec.gunship) return gunshipHowitzerFire(d) // manual round on the selected big gun
  if (!d.targets || !d.targets.length) return
  const live = d.targets.filter(t => targetPoint(t))
  if (!live.length) return
  if (spec.kamikaze) {
    // one-shot airframe: dive on the first designated vic
    const p = targetPoint(live[0])
    droneStrike(droneId, p.x, p.y)
    return
  }
  // weapons drone: service targets in order, one AGM per vic, stop when out
  for (const t of live) {
    if (d.ammo <= 0) break
    const p = targetPoint(t)
    droneStrike(droneId, p.x, p.y)
  }
}

// --- AC-130 gunship ---
export function gunshipSelectWeapon(droneId, key) {
  const d = S.drones.find(d => d.id === droneId)
  const g = d && DRONE_TYPES[d.type].gunship
  if (!g || !g.weapons[key]) return
  d.gunSel = key
}
export function gunshipSetMode(droneId, mode) {
  const d = S.drones.find(d => d.id === droneId)
  if (d) d.fireMode = mode
}
// manual fire for the selected howitzer: one round per designated vic, until winchester
function gunshipHowitzerFire(d) {
  const g = DRONE_TYPES[d.type].gunship
  const w = g.weapons[d.gunSel]
  if (!w || w.kind !== 'howitzer') return
  if (!d.targets || !d.targets.length) return
  const live = d.targets.filter(t => targetPoint(t))
  for (const t of live) {
    if ((d.gunAmmo[d.gunSel] || 0) <= 0) { toast(d.label + ' — ' + w.short + ' WINCHESTER'); break }
    const p = targetPoint(t)
    if (Math.hypot(d.x - p.x, d.y - p.y) > w.range) continue
    d.gunAmmo[d.gunSel]--
    S.shells.push({
      fromX: d.x, fromY: d.y, x: p.x, y: p.y,
      impactT: S.t + w.flight, dmg: w.dmg, blast: w.blast, side: 'friend', splashFrom: d.label,
      t0: S.t, bigGun: true, // firing-report cue for feed audio (deepest thud)
    })
    d.strikeMark = { x: p.x, y: p.y, until: S.t + w.flight }
    radio(d.label, 'fires', `SHOT — ${w.short} GRID ${grid(p.x, p.y)}`, p.x, p.y)
  }
}
// the gunship flies a pylon turn with the guns pointed inboard, so it can only
// engage the killbox INSIDE its orbit ring — not everything within gun range. The
// bound matches the drawn orbit ring exactly (no margin) so nothing outside the
// visible circle is ever acquired.
function inKillbox(d, x, y) {
  const spec = DRONE_TYPES[d.type]
  const oR = spec.orbitR * (d.orbitMul || 1)
  return Math.hypot(x - d.tx, y - d.ty) <= oR
}
// nearest visible hostile vic/troop inside the turn and within range (weapons-free acquire)
function gunshipAcquire(d, range) {
  let best = null, bd = range
  for (const u of S.units) {
    if (u.side === 'friend' || u.strength <= 0 || !u.elements) continue
    if (S.fogEnabled) { const c = S.contacts.get(u.id); if (!c || !c.live) continue }
    for (const el of u.elements) {
      if (!el.alive || !elemExposed(u, el)) continue
      const w = elemWorld(u, el)
      if (!inKillbox(d, w.x, w.y)) continue          // only inward of the turn
      const dd = Math.hypot(w.x - d.x, w.y - d.y)
      if (dd < bd) { bd = dd; best = { x: w.x, y: w.y } }
    }
  }
  return best
}
// per-tick automatic gun fire for the selected 25mm/40mm gun by its fire mode
function updateGunship(d, dt) {
  const spec = DRONE_TYPES[d.type]
  const g = spec.gunship
  const w = g.weapons[d.gunSel]
  if (!w || w.kind !== 'gun') return           // howitzer is manual only
  if (d.fireMode === 'hold' || !d.fireMode) return
  if ((d.gunAmmo[d.gunSel] || 0) <= 0) return
  d.gunCd -= dt
  if (d.gunCd > 0) return
  let aim = null
  if (d.fireMode === 'will') {
    aim = gunshipAcquire(d, w.range)           // engage anything visible in range
  } else if (d.fireMode === 'designated') {
    // the player explicitly picked these vics, so engage them anywhere in range —
    // the inboard-of-the-turn restriction only governs weapons-free acquisition
    let bd = w.range
    for (const t of (d.targets || [])) {
      const p = targetPoint(t); if (!p) continue
      const dd = Math.hypot(p.x - d.x, p.y - d.y)
      if (dd <= bd) { bd = dd; aim = p }
    }
  }
  if (!aim) { d.burstLeft = 0; return }   // nothing to shoot — end any burst in progress
  // fire in bursts, not a continuous stream: N rounds at ROF, then an inter-burst pause
  if (!(d.burstLeft > 0)) {
    d.burstLeft = w.burst[0] + Math.floor(Math.random() * (w.burst[1] - w.burst[0] + 1))
  }
  d.gunAmmo[d.gunSel]--
  d.burstLeft--
  // within a burst rounds come at the ROF; after the last round hold for the gap
  d.gunCd = d.burstLeft > 0 ? 1 / w.rof : w.gap + Math.random() * 0.5
  // dispersed aim: Gaussian scatter (sum of uniforms) — area fire, never pinpoint
  const gs = () => (Math.random() + Math.random() + Math.random() - 1.5) * (2 / 1.5)
  let dx0 = aim.x + gs() * w.disp, dy0 = aim.y + gs() * w.disp
  // keep every round inside the visible orbit ring: the gunship only brings guns to
  // bear inboard of its pylon turn, so dispersion can't fling a round past the ring
  const oR = spec.orbitR * (d.orbitMul || 1)
  const rdx = dx0 - d.tx, rdy = dy0 - d.ty, rd = Math.hypot(rdx, rdy)
  if (rd > oR) { const k = oR / rd; dx0 = d.tx + rdx * k; dy0 = d.ty + rdy * k }
  const ix = clampWorld(dx0)
  const iy = clampWorld(dy0)
  // ballistic round from the (moving) aircraft muzzle; time-of-flight forces lead,
  // damage/flash resolve on impact, not at the trigger pull
  const mAlt = spec.alt * (d.altMul || 1)
  const dist = Math.hypot(ix - d.x, iy - d.y, mAlt)
  S.gunRounds.push({
    fromX: d.x, fromY: d.y, mAlt, x: ix, y: iy,
    t0: S.t, impactT: S.t + dist / w.muzzleV,
    blast: w.blast, dmg: w.dmg, flash: w.flash, ap: w.ap || 1,
  })
  if (S.gunRounds.length > 260) S.gunRounds.shift()
}

let groupSeq = 1
// allocate a shared movement-group id so co-issued units hold to the slowest pace
export function newMoveGroup() { return groupSeq++ }

// A carrier that AUTO-dismounted in contact climbs back in when re-tasked out of
// contact, so the convoy travels mounted instead of crawling on foot. A unit the
// player MANUALLY dismounted has autoDismounted=false and stays dismounted until
// the player mounts it again. Call before pathing so it routes with vehicle mobility.
// Read the player's routing intent from where they clicked. Dropping the pin on a road
// means "use the network" — hold the roads the whole way. Dropping it out in the open
// means they want that spot, so go direct rather than detouring along a road that
// happens to be cheaper. Callers that already know what they want (the enemy AI's
// cross-country moves, an explicit roads-only order) are left alone.
const ROAD_SNAP = 2 // cells either side of the click that still count as "on the road"
const AEROSTAT_SCAN_RATE = 0.055 // rad/s — a full turret sweep takes ~114s
const COLUMN_GAP = 65     // metres a follower holds behind the vic ahead of it
const STRAGGLE_GAP = 190  // metres before the column stops and waits for its tail

function nearRoad(x, y, r = ROAD_SNAP) {
  const m = S.map, GRID = m.GRID
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL)
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const nx = cx + dx, ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue
      if (m.road[ny * GRID + nx]) return true
    }
  }
  return false
}

function roadIntent(x, y, opts) {
  if (opts.crossCountry || opts.roadsOnly || opts.roadBias || opts.offRoad) return opts
  return nearRoad(x, y)
    ? { ...opts, roadBias: 3 }    // clicked the network — stay on it
    : { ...opts, offRoad: true }  // clicked open ground — go there direct
}

function autoRemount(u) {
  if (u.autoDismounted && !u.targetId && !u.mounted && UNIT_TYPES[u.type].carrier) {
    u.mounted = true
    u.autoDismounted = false
    syncElements(u, true)
    netRadio(u, 'move', 'REMOUNTING', u.x, u.y)
  }
}

// Move a formation as a column behind one lead vic.
//
// Previously every member ran its own A* to its own offset point, which is both N times
// the pathfinding work and the reason a "formation" arrived as a loose scatter — each
// unit picked its own line through the terrain. Now the leader paths once and everyone
// shares that route, so the column follows the same road, the same bridge, the same gap
// in the treeline. Members hold station by trailing along it rather than by steering.
//
// The leader is the most constrained member (slowest real speed over its own terrain):
// picking the fastest would just mean the column immediately outruns its own point.
export function orderGroupMove(unitIds, x, y, append = false, attack = false, opts = {}) {
  const units = unitIds.map(id => S.units.find(u => u.id === id)).filter(u => u && u.strength > 0)
  if (!units.length) return null
  if (units.length === 1) { orderMove(units[0].id, x, y, append, attack, null, opts); return null }
  // Appending keeps each unit's own multi-leg waypoint queue — a shared column route
  // collapses the legs into one, which would renumber the player's waypoints out from
  // under them. Columns form on a fresh order.
  if (append) {
    const gid = newMoveGroup()
    for (const u of units) orderMove(u.id, x, y, true, attack, gid, opts)
    return gid
  }

  let lead = units[0], leadSpd = Infinity
  for (const u of units) {
    const st = effStats(u)
    const f = S.map.moveFactor(u.x, u.y, st.mob)
    const real = st.speed / (isFinite(f) ? f : 3)
    if (real < leadSpd) { leadSpd = real; lead = u }
  }

  const gid = newMoveGroup()
  orderMove(lead.id, x, y, append, attack, gid, opts)
  if (!lead.path.length) return null   // route refused — don't strand the followers

  // Everyone else takes a slot in the column. A follower can't just adopt the leader's
  // waypoints — those start at the leader's position, so it would strike out across
  // country on a straight line to join them, which is exactly the "vics leaving the
  // road" problem. Instead it paths its own short leg onto the head of the route (with
  // a road bias, so it gets on the network as directly as it can) and then runs the
  // shared route from there.
  const route = lead.path.map(p => ({ x: p.x, y: p.y }))
  // Column order follows position along the route, not selection order, so whoever is
  // already furthest along leads the tail rather than being made to fall in at the back.
  const joinAt = (u) => {
    let best = 0, bestD = Infinity
    for (let k = 0; k < route.length; k++) {
      const d = Math.hypot(route[k].x - u.x, route[k].y - u.y)
      if (d < bestD) { bestD = d; best = k }
    }
    return best
  }
  // Column order is by progress along the route, and that includes the lead vic. The
  // unit whose path everyone shares is the SLOWEST one, which is very often physically
  // at the back — numbering it 0 regardless put the head of the column at the rear, so
  // the real front ran free while the rear sat waiting for units already ahead of them.
  // Route owner and column head are different jobs.
  const ordered = units
    .map(u => ({ u, k: u.id === lead.id ? 0 : joinAt(u) }))
    .sort((a, b) => b.k - a.k)   // furthest along the route leads
  ordered.forEach(({ u, k }, i) => {
    u.colIdx = i
    u.leadId = lead.id
    if (u.id === lead.id) return   // its path is already the route, set by orderMove
    autoRemount(u)
    u.bridging = null; u.heldRoute = null; u.breaking = false
    u.convoy = null; u.attackId = null; u.attackMove = attack
    u.groupId = gid
    const mob = effStats(u).mob
    const entry = route[k]
    const join = findPath(S.map, u.x, u.y, entry.x, entry.y, mob, { ...opts, roadBias: 3 })
    u.path = (join || [{ x: entry.x, y: entry.y }]).concat(route.slice(k + 1))
    // one leg to the objective — the join is plumbing, not a waypoint the player set
    u.legs = [{ x, y, n: u.path.length }]
    u.state = 'moving'
    u.posture = 'mobile'
  })
  netRadio(lead, 'move', `FORMATION MOVING — ${units.length} ELEMENTS, GRID ${grid(x, y)}`, x, y)
  return gid
}

export function orderMove(unitId, x, y, append = false, attack = false, groupId = null, opts = {}) {
  const u = S.units.find(u => u.id === unitId)
  if (!u) return
  autoRemount(u)
  x = clampWorld(x); y = clampWorld(y)
  const from = (append && u.path.length) ? u.path[u.path.length - 1] : u
  const mob = effStats(u).mob
  let p = findPath(S.map, from.x, from.y, x, y, mob, roadIntent(x, y, opts))
  // a roads-only order to somewhere the network doesn't reach shouldn't just refuse —
  // run the trunk as far as it goes and say why the rest is cross-country
  if (!p && opts.roadsOnly) {
    p = findPath(S.map, from.x, from.y, x, y, mob, { ...opts, roadsOnly: false, roadBias: 3 })
    if (p && u.side === 'friend') toast('NO ROAD ROUTE — MOVING CROSS-COUNTRY')
  }
  // only surface the toast for player-issued orders; the enemy AI re-drives idle
  // units every tick, so an unreachable hostile objective would spam it forever
  if (!p) { if (u.side === 'friend') toast('ROUTE IMPASSABLE'); return }
  u.bridging = null
  u.heldRoute = null
  u.breaking = false
  // don't clear autoDismounted here — autoRemount() already remounted it if it was
  // clear of contact; if it's still in contact the flag must survive so it climbs
  // back in once the fight is over (see the auto-remount drill in the tick)
  u.convoy = null
  u.attackId = null
  u.attackMove = attack
  // a unit given its own order drops out of any column it was marching in
  if (!append) { u.groupId = groupId; u.colIdx = null; u.leadId = null }
  if (append && u.path.length) {
    u.path = u.path.concat(p)
    u.legs.push({ x, y, n: p.length })
    netRadio(u, 'move', `COPY — WP ADDED, GRID ${grid(x, y)}`, x, y)
  } else {
    u.path = p
    u.legs = [{ x, y, n: p.length }]
    netRadio(u, 'move', attack
      ? `ADVANCING TO CONTACT — GRID ${grid(x, y)}`
      : `MOVING TO GRID ${grid(x, y)}`, x, y)
  }
  u.state = 'moving'
}

// deliberate attack on a specific enemy: pursue and destroy
export function orderAttack(unitId, enemyId, groupId = null) {
  const u = S.units.find(u => u.id === unitId)
  if (!u) return
  const e = S.units.find(x => x.id === enemyId && x.side !== u.side)
  if (!e) return
  autoRemount(u)
  const p = findPath(S.map, u.x, u.y, e.x, e.y, effStats(u).mob)
  if (!p) { if (u.side === 'friend') toast('ROUTE IMPASSABLE'); return }
  u.bridging = null; u.heldRoute = null; u.breaking = false
  u.convoy = null // autoDismounted survives (see autoRemount / the remount drill)
  u.groupId = groupId
  u.attackId = enemyId
  u.attackMove = true
  u.attackRepathT = 8
  u.path = p
  u.legs = [{ x: e.x, y: e.y, n: p.length }]
  u.state = 'moving'
  netRadio(u, 'contact', `ATTACKING ${UNIT_TYPES[e.type].name.toUpperCase()} — GRID ${grid(e.x, e.y)}`, e.x, e.y)
}

export function removeLastWaypoint(unitId) {
  const u = S.units.find(u => u.id === unitId)
  if (!u || !u.legs || !u.legs.length) return
  const last = u.legs.pop()
  u.path.length = Math.max(0, u.path.length - last.n)
  if (!u.path.length) { u.legs = []; u.state = 'hold' }
}

export function orderHold(unitId) {
  const u = S.units.find(u => u.id === unitId)
  if (u) { u.path = []; u.legs = []; u.bridging = null; u.heldRoute = null; u.breaking = false; u.convoy = null; u.attackId = null; u.attackMove = false; u.groupId = null; u.colIdx = null; u.leadId = null; u.state = 'hold' }
}

export function orderMount(unitId, mounted) {
  const u = S.units.find(u => u.id === unitId)
  if (!u || !UNIT_TYPES[u.type].carrier) return
  if (u.mounted === mounted) return
  if (mounted && u.targetId) return toast(u.label + ' — CANNOT MOUNT UNDER FIRE')
  u.mounted = mounted
  u.autoDismounted = false // manual posture change overrides the drill
  syncElements(u, true)    // the newly-exposed set reflects current strength
  if (u.side === 'friend') {
    radio(u.label, 'move', mounted ? 'MOUNTING UP' : 'DISMOUNTING', u.x, u.y)
  }
}

// re-establish command: convert a FOB into the (single) command post
export function convertToHq(structId) {
  const s = S.structures.find(s => s.id === structId)
  if (!s || s.side !== 'friend' || s.kind !== 'FOB') return
  if (S.structures.some(o => o.side === 'friend' && o.kind === 'HQ')) {
    return toast('ONLY ONE COMMAND POST PERMITTED')
  }
  if (S.resources < 300) return toast('INSUFFICIENT SUPPLY')
  S.resources += (s.stock || 0) // remaining FOB stock absorbed into the main pool
  S.resources -= 300
  const spec = STRUCTURES.HQ
  s.kind = 'HQ'
  s.buildT = 40
  s.sight = spec.sight
  s.deployZone = spec.deployZone
  s.income = spec.income
  s.stock = 0
  s.hp = Math.min(s.hp, spec.hp); s.maxHp = spec.hp
  radio(s.label, 'struct', 'CONVERTING TO COMMAND POST — 40S', s.x, s.y)
  return s
}

// assign a logistics platoon to run continuous supply loops HQ -> FOB
export function orderConvoy(unitId, structId) {
  const u = S.units.find(u => u.id === unitId)
  if (!u || u.side !== 'friend' || !UNIT_TYPES[u.type].logi) return
  const fob = S.structures.find(s => s.id === structId && s.side === 'friend' && s.kind === 'FOB')
  if (!fob) return toast('SUPPLY RUNS DELIVER TO FOBS')
  u.convoy = { fobId: fob.id, phase: 'toSource', carrying: 0, timer: 0 }
  u.heldRoute = null; u.breaking = false
  radio(u.label, 'move', `COMMENCING SUPPLY RUNS — ${fob.label}`, fob.x, fob.y)
}

// actions-on-contact battle drill: 'push' | 'halt' | 'break'
const ROE_NAMES = { push: 'PUSH THROUGH', halt: 'HALT AND ENGAGE', break: 'BREAK CONTACT' }
export function orderRoe(unitId, roe) {
  const u = S.units.find(u => u.id === unitId)
  if (!u || !ROE_NAMES[roe] || u.roe === roe) return
  u.roe = roe
  netRadio(u, 'move', `BATTLE DRILL SET — ${ROE_NAMES[roe]}`, u.x, u.y)
}

// defensive posture: unit halts and prepares positions per its type
export function orderDefend(unitId, on) {
  const u = S.units.find(u => u.id === unitId)
  if (!u) return
  const def = UNIT_TYPES[u.type].def
  if (!def) return
  if (on && u.posture !== 'dig') {
    u.posture = 'dig'
    u.digT = 0
    u.dugRadioed = false
    u.path = []; u.legs = []; u.heldRoute = null; u.state = 'hold'
    netRadio(u, 'move', `ESTABLISHING DEFENSE — ${def.name}`, u.x, u.y)
  } else if (!on && u.posture === 'dig') {
    u.posture = 'mobile'
    u.digT = 0
    netRadio(u, 'move', 'POSITIONS ABANDONED — MOBILE', u.x, u.y)
  }
}

// weapons control status: 'free' | 'tight' (return fire only) | 'hold'
const WPN_NAMES = { free: 'WEAPONS FREE', tight: 'WEAPONS TIGHT — RETURN FIRE ONLY', hold: 'WEAPONS HOLD' }
export function orderWeapons(unitId, wpn) {
  const u = S.units.find(u => u.id === unitId)
  if (!u || !WPN_NAMES[wpn] || u.weapons === wpn) return
  u.weapons = wpn
  netRadio(u, 'move', WPN_NAMES[wpn], u.x, u.y)
}

// damage taken multiplier for a prepared defender
function postureFactor(t) {
  if (t.posture !== 'dig' || !t.digT) return 1
  const def = UNIT_TYPES[t.type].def
  if (!def) return 1
  return 1 - (1 - def.factor) * t.digT
}

// Method of fire: opts = {shell: 'HE'|'ICM'|'SMOKE', rounds: n, sheaf: 'POINT'|'STD'|'AREA'}
const ROUND_COST = { HE: 15, ICM: 25, SMOKE: 12 }

export function fireMission(unitId, x, y, opts = {}) {
  const u = S.units.find(u => u.id === unitId)
  if (!u || !UNIT_TYPES[u.type].indirect) return
  const ind = UNIT_TYPES[u.type].indirect
  if (u.missionCooldown > 0) return toast('BATTERY RELOADING')
  if (Math.hypot(x - u.x, y - u.y) > ind.range) return toast('TARGET BEYOND MAX RANGE')
  const shell = opts.shell || 'HE'
  const rounds = opts.rounds || ind.salvo
  const sheafMul = opts.sheaf === 'AREA' ? 2.2 : opts.sheaf === 'POINT' ? 0.55 : 1
  const cost = rounds * (ROUND_COST[shell] || 15)
  if (S.resources < cost) return toast('INSUFFICIENT SUPPLY FOR MISSION')
  S.resources -= cost
  u.missionCooldown = ind.cooldown * Math.max(0.6, rounds / ind.salvo)
  u.path = []; u.legs = []; u.state = 'firing'
  for (let i = 0; i < rounds; i++) {
    const a = S.rng() * Math.PI * 2
    const r = S.rng() * ind.scatter * sheafMul
    S.shells.push({
      fromX: u.x, fromY: u.y,
      x: x + Math.cos(a) * r, y: y + Math.sin(a) * r,
      impactT: S.t + ind.flight + i * 2.2,
      dmg: ind.dmg, blast: ind.blast, side: u.side, shell,
    })
  }
  const last = S.shells[S.shells.length - 1]
  if (u.side === 'friend') {
    last.splashFrom = u.label
    // danger close advisory
    const danger = ind.scatter * sheafMul + ind.blast + 80
    if (S.units.some(f => f.side === 'friend' && f.id !== u.id && Math.hypot(f.x - x, f.y - y) < danger)) {
      radio(u.label, 'damage', `DANGER CLOSE — FRIENDLIES NEAR TGT GRID ${grid(x, y)}`, x, y)
    }
    radio(u.label, 'fires', `SHOT, ${rounds} RDS ${shell} — TGT GRID ${grid(x, y)}, SPLASH ${Math.round(ind.flight)}S`, x, y)
  }
}

const OCTS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]

export function orderBridge(unitId, x, y) {
  const u = S.units.find(u => u.id === unitId)
  if (!u || !UNIT_TYPES[u.type].canBridge) return
  if (Math.hypot(x - u.x, y - u.y) > 700) return toast('MOVE WITHIN 700M OF THE CROSSING')
  const m = S.map
  const GRID = m.GRID
  const ti = m.cellAt(x, y)
  if (m.terr[ti] !== T_WATER) return toast('TARGET IS NOT A WATER GAP')
  const oct = ((Math.round(Math.atan2(y - u.y, x - u.x) / (Math.PI / 4)) % 8) + 8) % 8
  const [sx, sy] = OCTS[oct]
  const tgx = ti % GRID, tgy = (ti / GRID) | 0
  // walk both ways along the crossing axis to find banks
  const cells = [ti]
  let ok = true
  for (const dir of [1, -1]) {
    let gx = tgx, gy = tgy, n = 0
    for (;;) {
      gx += sx * dir; gy += sy * dir; n++
      if (n > 10 || !m.inBounds(gx, gy)) { ok = false; break }
      const i = gy * GRID + gx
      if (m.terr[i] !== T_WATER) break
      cells.push(i)
    }
    if (!ok) break
  }
  if (!ok || cells.length > 9) return toast('CROSSING TOO WIDE FOR PONTOONS')
  u.path = []; u.legs = []
  u.bridging = { cells, t: 40 }
  u.state = 'bridging'
  toast(u.label + ' EMPLACING PONTOON BRIDGE — 40S')
}

function toast(msg) {
  S.toasts.push({ msg, t: S.t })
  if (S.toasts.length > 5) S.toasts.shift()
  return null
}

// unit chatter only reaches the player's JBC-P net for friendly callsigns;
// enemy elements execute the identical orders silently.
function netRadio(u, kind, msg, x, y) {
  if (u.side === 'friend') radio(u.label, kind, msg, x, y)
}

// MGRS-lite grid reference (100 m precision), matches the cursor readout
export function grid(x, y) {
  return String(Math.floor(x / 100)).padStart(3, '0') + ' ' + String(Math.floor(y / 100)).padStart(3, '0')
}

// net traffic urgency drives the chatter throttle: contact/loss/fires cut in, routine yields
function radioPriority(kind) {
  if (kind === 'contact' || kind === 'loss' || kind === 'fires') return 2
  if (kind === 'spot' || kind === 'struct') return 1
  return 0
}

// dress terse traffic up into a full radio transmission — addressee + self-ID, the report,
// a range read-back for spot/contact, and a closing proword — so it reads and *sounds* like
// real net chatter (longer transmissions = a fuller mumble voice).
const NET_HIGHER = ['COMMAND', 'BASE', 'TOC', 'MOTHER', 'NET CONTROL']
const RADIO_CLOSINGS = ['OVER', 'HOW COPY, OVER', 'OUT', 'ACKNOWLEDGE, OVER', 'SEND IT']
function radioHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) }
function phraseRadio(callsign, kind, msg, x, y) {
  if (callsign === 'NET') return `ALL STATIONS, THIS IS NET CONTROL. ${msg}, OUT.`
  const higher = NET_HIGHER[radioHash(callsign) % NET_HIGHER.length] // each element calls the same higher
  const close = RADIO_CLOSINGS[(Math.random() * RADIO_CLOSINGS.length) | 0]
  let dist = ''
  if ((kind === 'spot' || kind === 'contact') && x != null) {
    const u = S.units.find(uu => uu.label === callsign) || S.drones.find(dd => dd.label === callsign)
    if (u) {
      const c = Math.hypot(u.x - x, u.y - y) / 1000
      if (c >= 0.4) dist = `, ${c < 10 ? c.toFixed(1) : c.toFixed(0)} CLICKS FROM OUR POSITION`
    }
  }
  return `${higher}, THIS IS ${callsign}. ${msg}${dist}, ${close}.`
}

function radio(callsign, kind, msg, x, y) {
  const full = phraseRadio(callsign, kind, msg, x, y)
  S.radio.push({ t: S.t, callsign, kind, msg: full, x, y })
  if (S.radio.length > 100) S.radio.shift()
  radioMsg(full, callsign, radioPriority(kind)) // audible net chatter (no-op if muted/not ready)
}

// --- sensing --------------------------------------------------------------

const SMOKE_DURATION = 75

function concealment(map, x, y) {
  const t = map.terr[map.cellAt(x, y)]
  let c = (t === T_FOREST || t === T_URBAN) ? 0.45 : 1.0
  // smoke screens beat everything — sensors and gunners alike
  for (const sm of S.smoke) {
    if (Math.hypot(sm.x - x, sm.y - y) < sm.r) { c = Math.min(c, 0.22); break }
  }
  return c
}

function unitSees(u, sight, x, y) {
  const d = Math.hypot(u.x - x, u.y - y)
  return d <= sight * concealment(S.map, x, y)
}

export function isVisibleToFriendlies(x, y) {
  for (const u of S.units) {
    if (u.side !== 'friend') continue
    if (unitSees(u, effStats(u).sight, x, y)) return true
  }
  for (const s of S.structures) {
    if (s.side !== 'friend' || s.buildT > 0 || !s.sight) continue
    if (Math.hypot(s.x - x, s.y - y) <= s.sight * concealment(S.map, x, y)) return true
  }
  for (const d of S.drones) {
    if (d.state !== 'onstation') continue
    const dd = Math.hypot(d.tx - x, d.ty - y)
    if (dd <= DRONE_TYPES[d.type].sight * (d.sightMul || 1) * Math.max(0.55, concealment(S.map, x, y))) return true
  }
  return false
}

// like isVisibleToFriendlies, but returns WHO sees the point (for spot reports)
function findSpotter(x, y) {
  for (const u of S.units) {
    if (u.side !== 'friend') continue
    if (unitSees(u, effStats(u).sight, x, y)) return { cs: u.label, obj: u }
  }
  for (const s of S.structures) {
    if (s.side !== 'friend' || s.buildT > 0 || !s.sight) continue
    if (Math.hypot(s.x - x, s.y - y) <= s.sight * concealment(S.map, x, y)) return { cs: s.label, obj: s }
  }
  for (const d of S.drones) {
    if (d.state !== 'onstation') continue
    const dd = Math.hypot(d.tx - x, d.ty - y)
    if (dd <= DRONE_TYPES[d.type].sight * (d.sightMul || 1) * Math.max(0.55, concealment(S.map, x, y))) return { cs: d.label, obj: d }
  }
  return null
}

function updateContacts() {
  const newSpots = new Map() // spotter obj -> {cs, types[], x, y}
  for (const u of S.units) {
    if (u.side !== 'hostile') continue
    const sp = findSpotter(u.x, u.y)
    if (sp) {
      const prev = S.contacts.get(u.id)
      S.contacts.set(u.id, { x: u.x, y: u.y, type: u.type, lastSeen: S.t, live: true, strength: u.strength })
      if (!prev || !prev.live) {
        let batch = newSpots.get(sp.obj)
        if (!batch) newSpots.set(sp.obj, batch = { cs: sp.cs, types: [], x: u.x, y: u.y })
        batch.types.push(u.type)
      }
    } else {
      const c = S.contacts.get(u.id)
      if (c) c.live = false
    }
  }
  // one spot report per sensor, aggregated, throttled per sensor
  for (const [obj, batch] of newSpots) {
    if (S.t - (obj.lastSpotT ?? -99) <= 12) continue
    obj.lastSpotT = S.t
    const msg = batch.types.length === 1
      ? `SPOT REPORT — ${UNIT_TYPES[batch.types[0]].name.toUpperCase()} GRID ${grid(batch.x, batch.y)}`
      : `SPOT REPORT — ${batch.types.length}X HOSTILE (${batch.types.map(t => UNIT_TYPES[t].abbr).join(', ')}) GRID ${grid(batch.x, batch.y)}`
    radio(batch.cs, 'spot', msg, batch.x, batch.y)
  }
  for (const [id, c] of S.contacts) {
    const u = S.units.find(u => u.id === id)
    if (!u) { S.contacts.delete(id); continue }
    if (!c.live && isVisibleToFriendlies(c.x, c.y)
        && Math.hypot(u.x - c.x, u.y - c.y) > 250) {
      S.contacts.delete(id)
    }
  }
  // hostile structures: once spotted, marked forever (buildings don't move)
  for (const s of S.structures) {
    if (s.side !== 'hostile' || S.structContacts.has(s.id)) continue
    if (isVisibleToFriendlies(s.x, s.y)) S.structContacts.add(s.id)
  }
}

// a hostile that fires is only revealed if something can actually detect it:
// any friendly within earshot (2.5 km) or a SIG unit doing DF within range
function firingDetected(u) {
  for (const f of S.units) {
    if (f.side !== 'friend') continue
    const d = Math.hypot(f.x - u.x, f.y - u.y)
    if (d < 2500) return true
    const df = UNIT_TYPES[f.type].df
    if (df && d < df) return true
  }
  return false
}

function canEngage(u, x, y, tgt) {
  const st = effStats(u)
  const d = Math.hypot(u.x - x, u.y - y)
  if (d > st.range) return false
  let eff = st.sight * concealment(S.map, x, y) * 1.15
  // a camouflaged, dug-in defender is harder to spot
  if (tgt && tgt.posture === 'dig' && tgt.digT) eff *= 1 - 0.3 * tgt.digT
  // muzzle flash: a target that fired recently is visible well beyond normal sight
  if (tgt && tgt.lastFiredT != null && S.t - tgt.lastFiredT < 5) {
    eff = Math.max(eff, st.sight * 1.6)
  }
  return d <= eff
}

// --- tick -----------------------------------------------------------------

export function tick(dt) {
  S.t += dt

  // Supply arrives as discrete lifts rather than a continuously spinning counter: a
  // resupply either landed or it didn't. Upkeep is netted off the same lift so the
  // readout moves in one clean step instead of two fighting each other.
  S.supplyT = (S.supplyT || 0) + dt
  while (S.supplyT >= SUPPLY_INTERVAL) {
    S.supplyT -= SUPPLY_INTERVAL
    const draw = Math.round(upkeepPerMin('friend') * SUPPLY_INTERVAL / 60)
    S.resources = Math.max(0, S.resources + (S.supplyLift || 0) - draw)
    // the OPFOR banks and pays on the same clock
    const eDraw = Math.round(upkeepPerMin('hostile') * SUPPLY_INTERVAL / 60)
    S.enemyResources = Math.max(0, S.enemyResources + (S.enemySupplyLift || 0) - eDraw)
  }

  // structures: construction
  for (const s of S.structures) {
    if (s.buildT > 0) s.buildT = Math.max(0, s.buildT - dt)
  }

  // garrison reconstitution: units resting at a FOB/HQ regain strength;
  // a garrisoned site slowly repairs itself
  for (const s of S.structures) {
    if (s.buildT > 0 || (s.kind !== 'FOB' && s.kind !== 'HQ')) continue
    let garrisoned = false
    for (const u of S.units) {
      if (u.side !== s.side) continue
      if (Math.hypot(u.x - s.x, u.y - s.y) > 450) continue
      garrisoned = true
      if (u.strength > 0 && u.strength < 100 && !u.targetId && S.t - u.lastCombatT > 15) {
        const before = u.strength
        healUnit(u, 0.8 * dt, 100, true) // reconstitution brings replacements — revive lost vics
        u.strMark = Math.max(u.strMark, u.strength)
        if (before < 100 && u.strength >= 100 && u.side === 'friend') {
          radio(u.label, 'arrive', 'RECONSTITUTED — FULL STRENGTH', u.x, u.y)
        }
      }
    }
    if (garrisoned && s.hp > 0 && s.hp < s.maxHp) {
      s.hp = Math.min(s.maxHp, s.hp + 0.4 * dt)
      if (s.strMark != null) s.strMark = Math.max(s.strMark, s.hp / s.maxHp)
    }
  }

  // group movement: a formation moves no faster than its slowest moving member.
  // recomputed each tick from live, still-moving members (arrived/dead don't count).
  // a formation moves no faster than its slowest moving member — cap the REAL
  // (post-terrain) speed so a member on a road can't outrun one in a field.
  const groupCap = new Map()
  for (const u of S.units) {
    if (u.groupId == null || !u.path.length || u.strength <= 0) continue
    const st = effStats(u)
    const f = S.map.moveFactor(u.x, u.y, st.mob)
    const real = st.speed / (isFinite(f) ? f : 3)
    const cur = groupCap.get(u.groupId)
    if (cur == null || real < cur) groupCap.set(u.groupId, real)
  }

  // column order lookup: members of a shared-route formation trail the vic ahead of
  // them rather than piling onto the same waypoints
  // Column order is recomputed every tick from progress along the shared route (fewest
  // waypoints remaining = furthest along). Fixing the order when the move is issued
  // doesn't survive contact with reality: at that moment every unit is bunched at the
  // start with indistinguishable route positions, and the order then drifts as the
  // faster ones pull ahead — leaving "the vic ahead" pointing at a unit that's actually
  // behind, so the front ran free while the rear waited on it.
  const colMembers = new Map()
  for (const u of S.units) {
    if (u.groupId == null || u.colIdx == null || u.strength <= 0) continue
    if (!colMembers.has(u.groupId)) colMembers.set(u.groupId, [])
    colMembers.get(u.groupId).push(u)
  }
  const colAhead = new Map()
  for (const [gid, list] of colMembers) {
    list.sort((a, b) => a.path.length - b.path.length)
    list.forEach((u, i) => { u.colIdx = i; colAhead.set(gid + ':' + i, u) })
  }

  // A column doesn't leave its tail behind: if a gap opens past STRAGGLE_GAP, everyone
  // forward of the break stops and goes firm until the straggler closes up. Waiting
  // units dig in rather than idling in the open — a halted convoy is a target.
  const colStall = new Map()
  for (const [gid, list] of colMembers) {
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i], b = list[i + 1]
      if (!b.path.length) continue // already arrived — not a straggler
      if (Math.hypot(b.x - a.x, b.y - a.y) > STRAGGLE_GAP) { colStall.set(gid, a.colIdx); break }
    }
  }

  // units: movement + bridging
  for (const u of S.units) {
    const type = UNIT_TYPES[u.type]
    u.fireCooldown = Math.max(0, u.fireCooldown - dt)
    u.missionCooldown = Math.max(0, u.missionCooldown - dt)
    // preparing positions: progress while stationary
    // a column halted for its stragglers digs in too, even though it still holds a route
    if (u.posture === 'dig' && (!u.path.length || u.colWait) && u.digT < 1 && type.def) {
      u.digT = Math.min(1, u.digT + dt / type.def.time)
      if (u.digT >= 1 && !u.dugRadioed && u.side === 'friend') {
        u.dugRadioed = true
        radio(u.label, 'arrive', `DEFENSE SET — ${type.def.name}`, u.x, u.y)
      }
    }
    // rest and buddy-aid in prepared positions: slow recovery, capped at 70%
    if (u.posture === 'dig' && u.digT >= 1 && u.strength > 0 && u.strength < 70
        && !u.targetId && S.t - u.lastCombatT > 20) {
      healUnit(u, 0.15 * dt, 70, false) // buddy-aid patches crews; destroyed vics stay dead
    }
    // logistics loop: HQ -> load -> FOB -> unload -> repeat
    if (u.convoy && u.side === 'friend' && u.strength > 0) {
      const c = u.convoy
      const fob = S.structures.find(s => s.id === c.fobId && s.side === 'friend')
      const hq = S.structures.find(s => s.side === 'friend' && s.kind === 'HQ' && s.buildT <= 0)
      const logi = UNIT_TYPES[u.type].logi
      if (!fob) {
        u.convoy = null
        radio(u.label, 'move', 'SUPPLY ROUTE TERMINATED — DESTINATION LOST', u.x, u.y)
      } else if (!hq) {
        // no command post: convoys pause where they are
      } else if (!u.breaking && !u.targetId) {
        if (c.phase === 'toSource') {
          if (Math.hypot(u.x - hq.x, u.y - hq.y) < 300) {
            u.path = []; u.legs = []
            c.phase = 'load'; c.timer = logi.loadTime
          } else if (!u.path.length) {
            const p = findPath(S.map, u.x, u.y, hq.x, hq.y, effStats(u).mob)
            if (p) { u.path = p; u.legs = [{ x: hq.x, y: hq.y, n: p.length }] }
          }
        } else if (c.phase === 'load') {
          c.timer -= dt
          if (c.timer <= 0) {
            c.carrying = Math.min(logi.capacity, Math.floor(S.resources))
            S.resources -= c.carrying
            c.phase = 'toFob'
          }
        } else if (c.phase === 'toFob') {
          if (Math.hypot(u.x - fob.x, u.y - fob.y) < 300) {
            u.path = []; u.legs = []
            c.phase = 'unload'; c.timer = logi.loadTime
          } else if (!u.path.length) {
            const p = findPath(S.map, u.x, u.y, fob.x, fob.y, effStats(u).mob)
            if (p) { u.path = p; u.legs = [{ x: fob.x, y: fob.y, n: p.length }] }
          }
        } else if (c.phase === 'unload') {
          c.timer -= dt
          if (c.timer <= 0) {
            fob.stock = (fob.stock || 0) + c.carrying
            radio(u.label, 'arrive', `RESUPPLY COMPLETE — ${fob.label} +${c.carrying}`, fob.x, fob.y)
            c.carrying = 0
            c.phase = 'toSource'
          }
        }
      }
    }
    if (u.bridging) {
      u.bridging.t -= dt
      if (u.bridging.t <= 0) {
        for (const i of u.bridging.cells) {
          if (!S.map.road[i]) { S.map.road[i] = 1; S.pontoons.push(i) }
        }
        toast(u.label + ' — PONTOON BRIDGE ESTABLISHED')
        u.bridging = null
        u.state = 'hold'
      }
      continue
    }
    if (u.path.length) {
      // any movement abandons a defensive posture
      if (u.posture === 'dig') { u.posture = 'mobile'; u.digT = 0 }
      const st = effStats(u)
      const wp = u.path[0]
      const dx = wp.x - u.x, dy = wp.y - u.y
      const d = Math.hypot(dx, dy)
      const f = S.map.moveFactor(u.x, u.y, st.mob)
      // this unit's own terrain-adjusted speed, then held to the group's slowest real pace
      let spd = st.speed / (isFinite(f) ? f : 3)
      if (u.groupId != null) {
        // halt and go firm if the tail has fallen behind us
        const stall = colStall.get(u.groupId)
        const waiting = stall != null && u.colIdx != null && u.colIdx <= stall
        if (waiting !== !!u.colWait) {
          u.colWait = waiting
          if (waiting) {
            u.posture = 'dig'
            netRadio(u, 'move', 'HOLDING FOR TRAIL ELEMENTS — GOING FIRM', u.x, u.y)
          } else {
            u.posture = 'mobile'
            u.digT = 0
          }
        }
        // Station-keeping. The group cap stops a formation outrunning its slowest
        // member, but applied blindly it also means a unit that falls behind can NEVER
        // close the gap — everyone crawls at the same speed and the column stretches
        // out forever. So a follower outside its station is released from the cap and
        // runs at its own speed until it's back on the vic ahead.
        let capped = true
        if (u.colIdx > 0) {
          const ahead = colAhead.get(u.groupId + ':' + (u.colIdx - 1))
          if (ahead) {
            const gap = Math.hypot(ahead.x - u.x, ahead.y - u.y)
            if (gap > COLUMN_GAP * 1.2) capped = false          // trailing — close up
            else if (gap < COLUMN_GAP) {                        // closed up — ease off
              spd *= Math.max(0, (gap - COLUMN_GAP * 0.45) / (COLUMN_GAP * 0.55))
            }
          }
        }
        const cap = groupCap.get(u.groupId)
        if (capped && cap != null) spd = Math.min(spd, cap)
        if (waiting) spd = 0
      }
      u._spd = spd
      if (d < Math.max(4, spd * dt)) {
        u.x = wp.x; u.y = wp.y
        u.path.shift()
        if (u.legs.length && --u.legs[0].n <= 0) {
          const leg = u.legs.shift()
          if (u.legs.length) netRadio(u, 'arrive', `WP CLEAR GRID ${grid(leg.x, leg.y)} — CONTINUING`, leg.x, leg.y)
          else netRadio(u, 'arrive', `AT GRID ${grid(leg.x, leg.y)} — HOLDING`, leg.x, leg.y)
        }
        if (!u.path.length) { u.legs = []; u.state = 'hold' }
      } else {
        u.x += (dx / d) * spd * dt
        u.y += (dy / d) * spd * dt
        u.heading = Math.atan2(dy, dx)
        u.state = 'moving'
      }
    }
  }

  // direct-fire combat: units first, then structures
  for (const u of S.units) {
    const type = UNIT_TYPES[u.type]
    const wpn = u.weapons || 'free'
    let tgt = null, tdist = Infinity
    if (wpn !== 'hold') {
      const provoked = S.t - (u.underFireT ?? -99) < 6
      for (const e of S.units) {
        if (e.side === u.side) continue
        // weapons tight: only engage shooters, or anyone once we're taking fire
        if (wpn === 'tight' && !provoked && !(e.lastFiredT != null && S.t - e.lastFiredT < 6)) continue
        const d = Math.hypot(u.x - e.x, u.y - e.y)
        if (d < tdist && canEngage(u, e.x, e.y, e)) { tgt = e; tdist = d }
      }
    }
    u.targetId = tgt ? tgt.id : null
    let fired = false
    if (tgt) {
      u.lastCombatT = S.t
      const roe = u.roe || 'halt'
      // troops in contact: carriers drop their infantry (halt drill only — push/break stay mounted)
      if (type.carrier && u.mounted && tdist < 900 && roe === 'halt') {
        u.mounted = false
        u.autoDismounted = true
        syncElements(u, true)
        netRadio(u, 'contact', `IN CONTACT — DISMOUNTING`, u.x, u.y)
      }
      if (roe === 'halt') {
        // halt to fight rather than driving through the kill zone; keep the route to resume
        if (u.path.length && !type.indirect && type.range >= 500
            && tdist < type.range * 0.85) {
          u.heldRoute = { path: u.path, legs: u.legs }
          u.path = []; u.legs = []
        }
      }
      // push: no halt, no dismount — return fire on the move and keep rolling
      const at = effStats(u)
      const et = effStats(tgt)
      let dps = at.dpsSoft * et.soft + at.dpsHard * (1 - et.soft)
      dps *= COVER_DEF[['field', 'forest', 'urban', 'water'][S.map.terr[S.map.cellAt(tgt.x, tgt.y)]]]
      dps *= postureFactor(tgt)
      if (et.soft < 0.3 && at.soft >= 0.7 && concealment(S.map, u.x, u.y) < 1 && tdist < 400) dps *= 2.2
      if (u.state === 'moving') dps *= 0.6
      tgt.strength -= dps * dt * (u.strength / 100) * (S.damageMul ?? 1)
      // the victim is in contact too, even if it can't answer
      tgt.underFireT = S.t
      tgt.lastCombatT = S.t
      tgt.threatX = u.x; tgt.threatY = u.y
      u.state = u.path.length ? 'moving' : 'engaging'
      fired = true
      if (u.side === 'friend') {
        if (S.t - u.lastContactT > 25) {
          u.lastContactT = S.t
          radio(u.label, 'contact', `CONTACT — ${et.name.toUpperCase()} GRID ${grid(tgt.x, tgt.y)}, ENGAGING`, tgt.x, tgt.y)
        }
        if (S.t - u.lastReqT > 60) {
          if (et.soft < 0.25 && type.dpsHard < 2.5) {
            u.lastReqT = S.t
            radio(u.label, 'request', `HARD TARGET, CANNOT PENETRATE — REQUEST AT SUPPORT GRID ${grid(tgt.x, tgt.y)}`, tgt.x, tgt.y)
          } else if (u.strength < 50) {
            u.lastReqT = S.t
            radio(u.label, 'request', `HEAVY CONTACT — REQUEST IMMEDIATE FIRES GRID ${grid(tgt.x, tgt.y)}`, tgt.x, tgt.y)
          }
        }
      }
    } else {
      // no unit target: engage enemy structures in range
      let st = null, sd = Infinity
      for (const s of S.structures) {
        if (s.side === u.side) continue
        const d = Math.hypot(u.x - s.x, u.y - s.y)
        if (d < sd && canEngage(u, s.x, s.y)) { st = s; sd = d }
      }
      if (st) {
        st.hp -= (type.dpsSoft * 0.6 + type.dpsHard * 0.5) * dt * (u.strength / 100)
        u.state = u.path.length ? 'moving' : 'engaging'
        fired = true
      } else if (u.state === 'engaging') {
        u.state = 'hold'
      }
    }
    if (fired) u.lastFiredT = S.t
    if (fired && u.side === 'hostile' && firingDetected(u)) {
      S.contacts.set(u.id, { x: u.x, y: u.y, type: u.type, lastSeen: S.t, live: true, strength: u.strength })
    }
    // break-contact drill: triggers on acquiring a target OR on taking fire
    if (u.roe === 'break' && !u.breaking) {
      const underFire = S.t - (u.underFireT ?? -99) < 3
      const threat = tgt ? { x: tgt.x, y: tgt.y }
        : underFire && u.threatX != null ? { x: u.threatX, y: u.threatY } : null
      if (threat) {
        u.breaking = true
        u.heldRoute = null
        const bdx = u.x - threat.x, bdy = u.y - threat.y
        const bL = Math.hypot(bdx, bdy) || 1
        const bx = clampWorld(u.x + (bdx / bL) * 900), by = clampWorld(u.y + (bdy / bL) * 900)
        const bp = findPath(S.map, u.x, u.y, bx, by, effStats(u).mob)
        if (bp) { u.path = bp; u.legs = [{ x: bx, y: by, n: bp.length }] }
        netRadio(u, 'contact', `BREAKING CONTACT — MOVING GRID ${grid(bx, by)}`, u.x, u.y)
      }
    }
  }

  // artillery shells
  for (let i = S.shells.length - 1; i >= 0; i--) {
    const sh = S.shells[i]
    if (S.t >= sh.impactT) {
      S.shells.splice(i, 1)
      if (sh.shell === 'SMOKE') {
        S.smoke.push({ x: sh.x, y: sh.y, t: S.t, r: 140 })
      } else {
        S.impacts.push({ x: sh.x, y: sh.y, t: S.t })
        const icm = sh.shell === 'ICM'
        // resolve against individual vics — units whose formation reaches the blast
        for (const u of S.units) {
          if (Math.hypot(u.x - sh.x, u.y - sh.y) < sh.blast + 90) {
            precisionBlast(u, sh.x, sh.y, sh.blast, sh.dmg, sh.shell)
          }
        }
        for (const s of S.structures) {
          const d = Math.hypot(s.x - sh.x, s.y - sh.y)
          if (d < sh.blast) s.hp -= sh.dmg * (1 - d / sh.blast) * (icm ? 0.5 : 0.8)
        }
      }
      if (sh.splashFrom) radio(sh.splashFrom, 'fires', `SPLASH — TGT GRID ${grid(sh.x, sh.y)}`, sh.x, sh.y)
    }
  }
  // gunship cannon rounds land after their time-of-flight: small blast, small flash
  for (let i = S.gunRounds.length - 1; i >= 0; i--) {
    const r = S.gunRounds[i]
    if (S.t < r.impactT) continue
    S.gunRounds.splice(i, 1)
    const reach = r.blast * (r.ap || 1) + 90 // widen so anti-personnel splash finds spread-out troops
    for (const u of S.units) {
      if (Math.hypot(u.x - r.x, u.y - r.y) < reach) precisionBlast(u, r.x, r.y, r.blast, r.dmg, 'HE', r.ap || 1)
    }
    S.impacts.push({ x: r.x, y: r.y, t: S.t, gun: true, sz: r.flash })
  }
  while (S.impacts.length && S.t - S.impacts[0].t > 6) S.impacts.shift()
  // smoke dissipates
  for (let i = S.smoke.length - 1; i >= 0; i--) {
    if (S.t - S.smoke[i].t > SMOKE_DURATION) S.smoke.splice(i, 1)
  }

  // mission resumption: contact clear and neighborhood quiet → continue movement.
  // side-agnostic: friendly and hostile units execute the identical drill code.
  for (const u of S.units) {
    if (u.strength <= 0) continue
    // deliberate attack: pursue the designated target until it dies
    if (u.attackId != null) {
      const tgt = S.units.find(x => x.id === u.attackId)
      if (!tgt || tgt.strength <= 0) {
        u.attackId = null
        u.attackMove = false
        netRadio(u, 'contact', 'TARGET DESTROYED — HOLDING', u.x, u.y)
        u.path = []; u.legs = []
      } else if (u.targetId === u.attackId) {
        // in engagement range of the designated target: stand and fight
        u.path = []; u.legs = []
      } else {
        u.attackRepathT -= dt
        if (u.attackRepathT <= 0 && !u.targetId) {
          u.attackRepathT = 8
          const drift = u.legs.length
            ? Math.hypot(u.legs[u.legs.length - 1].x - tgt.x, u.legs[u.legs.length - 1].y - tgt.y)
            : Infinity
          if (drift > 250) {
            const p = findPath(S.map, u.x, u.y, tgt.x, tgt.y, effStats(u).mob)
            if (p) { u.path = p; u.legs = [{ x: tgt.x, y: tgt.y, n: p.length }] }
          }
        }
      }
    }
    if (u.breaking && !u.targetId && S.t - u.lastCombatT > 15) {
      u.breaking = false
      netRadio(u, 'contact', 'CONTACT BROKEN — HOLDING, AWAITING ORDERS', u.x, u.y)
    }
    const calm = !u.targetId && S.t - u.lastCombatT > 12
    if (calm && (u.heldRoute || u.autoDismounted)) {
      const nearBusy = S.units.some(o => o !== u && o.side === u.side && o.targetId
        && Math.hypot(o.x - u.x, o.y - u.y) < 600)
      if (!nearBusy) {
        // remount applies whether or not the unit ever fully halted
        if (u.autoDismounted && UNIT_TYPES[u.type].carrier && !u.mounted) {
          u.mounted = true
          syncElements(u, true)
          netRadio(u, 'move', 'REMOUNTING', u.x, u.y)
        }
        u.autoDismounted = false
        if (u.heldRoute) {
          u.path = u.heldRoute.path
          u.legs = u.heldRoute.legs
          u.heldRoute = null
          u.state = 'moving'
          netRadio(u, 'move', 'CONTACT CLEAR — CONTINUING MISSION', u.x, u.y)
        }
      }
    }
  }

  // casualty reports (friendly net)
  for (const u of S.units) {
    if (u.side !== 'friend') continue
    for (const th of [70, 45, 20]) {
      if (u.strength <= th && u.strMark > th) {
        radio(u.label, 'damage', `TAKING CASUALTIES — STRENGTH ${Math.max(0, Math.round(u.strength))}%`, u.x, u.y)
        break
      }
    }
    u.strMark = Math.min(u.strMark, u.strength)
  }

  // surrender: a worn-down unit under fire may throw in the towel instead of fighting on.
  // Rolled once, when strength first crosses below ~30% while in/just out of contact.
  for (let i = S.units.length - 1; i >= 0; i--) {
    const u = S.units[i]
    if (u.strength <= 0 || u.surrenderRolled) continue
    if (u.strength > 30) continue
    if (u.targetId == null && S.t - (u.lastCombatT ?? -99) > 12) continue // not under duress
    u.surrenderRolled = true
    const p = 0.01 + Math.random() * 0.04 // 1–5%
    if (Math.random() < p) {
      S.contacts.delete(u.id)
      if (u.side === 'friend') {
        radio(u.label, 'loss', 'ELEMENTS SURRENDERING — WE ARE COMBAT INEFFECTIVE', u.x, u.y)
        toast(u.label + ' SURRENDERED')
      } else {
        radio('NET', 'spot', `ENEMY ELEMENT SURRENDERING — GRID ${grid(u.x, u.y)}`, u.x, u.y)
      }
      S.units.splice(i, 1)
    }
  }

  for (const s of S.structures) {
    if (s.side !== 'friend') continue
    if (s.strMark == null) s.strMark = 1
    const frac = s.hp / s.maxHp
    for (const th of [0.75, 0.5, 0.25]) {
      if (frac <= th && s.strMark > th) {
        radio(s.label, 'struct', `UNDER ATTACK — INTEGRITY ${Math.max(0, Math.round(frac * 100))}%`, s.x, s.y)
        break
      }
    }
    s.strMark = Math.min(s.strMark, frac)
  }

  // element attrition: bring each unit's vics/troops in line with its strength,
  // spawning individual wrecks/explosions as they're picked off by direct fire
  for (const u of S.units) syncElements(u, false)

  // deaths: units (per-element wrecks were already spawned as elements died)
  for (let i = S.units.length - 1; i >= 0; i--) {
    const u = S.units[i]
    if (u.strength <= 0) {
      S.contacts.delete(u.id)
      if (u.side === 'friend') {
        radio('NET', 'loss', `${u.label} SIGNAL LOST — LKP GRID ${grid(u.x, u.y)}`, u.x, u.y)
        toast(u.label + ' DESTROYED')
      }
      S.units.splice(i, 1)
    }
  }
  // deaths: structures
  for (let i = S.structures.length - 1; i >= 0; i--) {
    const s = S.structures[i]
    if (s.hp <= 0) {
      S.wrecks.push({ x: s.x, y: s.y, side: s.side, type: s.kind, t: S.t })
      S.structContacts.delete(s.id)
      S.structures.splice(i, 1)
      toast(s.label + ' DESTROYED')
      // any aerostat tethered here goes down with the site
      for (let k = S.drones.length - 1; k >= 0; k--) {
        if (S.drones[k].tether === s.id) {
          radio(S.drones[k].label, 'loss', `AEROSTAT LOST WITH ${s.label}`, s.x, s.y)
          endSortie(S.drones[k])
          S.drones.splice(k, 1)
        }
      }
      if (s.side === 'hostile' && s.kind === 'HQ' && !S.won) {
        S.won = true
        toast('★ RED HQ DESTROYED — OBJECTIVE SECURED ★')
      }
      // losing your command post with no FOB to convert = defeat
      if (s.side === 'friend' && s.kind === 'HQ' && !S.lost) {
        const canRecover = S.structures.some(o => o.side === 'friend' && o.kind === 'FOB')
        if (!canRecover) {
          S.lost = true
          toast('!! COMMAND POST LOST — NO FALLBACK !!')
        }
      }
    }
  }
  while (S.wrecks.length > 60) S.wrecks.shift()

  // drones
  for (let i = S.drones.length - 1; i >= 0; i--) {
    const d = S.drones[i]
    const spec = DRONE_TYPES[d.type]
    // drop designated targets only once the vic is actually destroyed
    if (d.targets && d.targets.length) d.targets = d.targets.filter(t => targetPoint(t))
    // AC-130 automatic gun fire (selected gun + fire mode)
    if (spec.gunship && d.state === 'onstation') updateGunship(d, dt)
    // sensor track maintenance: follow the locked unit, degrade to point lock if lost
    if (d.lock && d.lock.unitId != null) {
      const lu = S.units.find(x => x.id === d.lock.unitId)
      if (lu) { d.lock.x = lu.x; d.lock.y = lu.y }
      else {
        delete d.lock.unitId
        radio(d.label, 'spot', `TRACK LOST — HOLDING GRID ${grid(d.lock.x, d.lock.y)}`, d.lock.x, d.lock.y)
      }
    }
    // contact tracking. A movable airframe flies its orbit anchor after the
    // contact — the SENSOR is left under operator control (following moves the
    // aircraft, not the camera). The tethered aerostat can't move, so it follows
    // with the sensor only (camera lock) and drops once the contact leaves its arc.
    if (d.followId && (d.state === 'transit' || d.state === 'onstation')) {
      const u = S.units.find(x => x.id === d.followId)
      if (!u || u.strength <= 0) {
        d.followId = null
        if (d.lock && d.lock.track) d.lock = null
        radio(d.label, 'spot', `TRACK LOST — CONTACT GONE`, d.tx, d.ty)
      } else if (d.tether) {
        d.lock = { x: u.x, y: u.y, track: true }   // aerostat: sensor slaves to the contact
        const reach = spec.sight * (d.sightMul || 1)
        if (Math.hypot(u.x - d.x, u.y - d.y) > reach) {
          d.followId = null; d.lock = null
          radio(d.label, 'spot', `TRACK LOST — CONTACT OUTSIDE SENSOR RANGE`, u.x, u.y)
        }
      } else {
        const dx = u.x - d.tx, dy = u.y - d.ty
        const dist = Math.hypot(dx, dy)
        if (dist > 2) {
          const chase = Math.min(dist, spec.speed * 0.95 * dt)
          d.tx += (dx / dist) * chase
          d.ty += (dy / dist) * chase
        }
      }
    }
    if (d.state === 'transit') {
      const oR = spec.orbitR * (d.orbitMul || 1)
      const dx = d.tx - d.x, dy = d.ty - d.y
      const dist = Math.hypot(dx, dy)
      const midLeg = d.route && d.route.length > 1
      // intermediate waypoints: cut the corner; final leg: intercept the ring itself
      const arrive = midLeg ? 100 : Math.max(oR, 60)
      if (dist <= arrive) {
        if (midLeg) {
          d.route.shift()
          d.tx = d.route[0].x; d.ty = d.route[0].y
        } else {
          d.route = []
          d.state = 'onstation'
          // enter the pattern where we actually are: phase from approach bearing,
          // current distance becomes the starting radius, then spiral to standard
          d.angle = Math.atan2(d.y - d.ty, d.x - d.tx)
          d.orbR = Math.max(dist, 25)
          radio(d.label, 'move', `ON STATION — ORBIT ESTABLISHED GRID ${grid(d.tx, d.ty)}`, d.tx, d.ty)
        }
      } else { d.x += (dx / dist) * spec.speed * dt; d.y += (dy / dist) * spec.speed * dt }
    } else if (d.state === 'onstation') {
      d.endurance -= dt
      if (d.tether) {
        // the aerostat holds a fixed station over its tether point — it does not
        // orbit. Its sensor turret sweeps a continuous 360° survey of the ground
        // around the mast; a lock stops the sweep and holds the point (handled in
        // DroneCamera). scanAngle is the bearing the turret is currently looking down.
        d.x = d.tx; d.y = d.ty; d.orbR = 0
        // sweep only in AUTO; FREE holds the manual bearing, LOCK holds the point
        if (d.sensorMode === 'auto' && !d.lock) d.scanAngle = (d.scanAngle || 0) + dt * AEROSTAT_SCAN_RATE
      } else {
        const oR = spec.orbitR * (d.orbitMul || 1)
        if (d.orbR == null) d.orbR = oR
        // rate-limited spiral toward the commanded radius
        const maxStep = spec.speed * 0.5 * dt
        d.orbR += Math.max(-maxStep, Math.min(maxStep, oR - d.orbR))
        // gunships fly a left-hand (counter-clockwise) pylon turn so the guns face inboard
        const turnDir = spec.gunship ? -1 : 1
        d.angle += turnDir * dt * ((spec.speed || 3) / Math.max(80, d.orbR))
        d.x = d.tx + Math.cos(d.angle) * d.orbR
        d.y = d.ty + Math.sin(d.angle) * d.orbR
      }
      if (d.endurance <= 0) {
        d.state = 'rtb'
        radio(d.label, 'move', `BINGO — RTB`, d.x, d.y)
      }
    } else if (d.state === 'rtb') {
      // unit-launched birds recover to the unit that launched them (it may have
      // moved). If that unit is gone/dead there is no one to recover it — it crashes.
      let hx = d.ox, hy = d.oy
      if (d.launcherId != null) {
        const home = S.units.find(u => u.id === d.launcherId && u.side === 'friend' && u.strength > 0)
        if (!home) {
          radio(d.label, 'loss', 'NO RECOVERY UNIT — AIRFRAME LOST', d.x, d.y)
          S.impacts.push({ x: d.x, y: d.y, t: S.t }) // crash puff
          endSortie(d)
          S.drones.splice(i, 1)
          continue
        }
        hx = home.x; hy = home.y
      }
      const dx = hx - d.x, dy = hy - d.y
      const dist = Math.hypot(dx, dy)
      if (dist < 80) {
        radio(d.label, 'arrive', 'RECOVERED', hx, hy)
        endSortie(d)
        S.drones.splice(i, 1)
      } else { d.x += (dx / dist) * spec.speed * dt; d.y += (dy / dist) * spec.speed * dt }
    } else if (d.state === 'striking') {
      const dx = d.sx - d.x, dy = d.sy - d.y
      const dist = Math.hypot(dx, dy)
      if (dist < 25) {
        S.impacts.push({ x: d.sx, y: d.sy, t: S.t })
        const k = spec.kamikaze
        for (const u of S.units) {
          if (Math.hypot(u.x - d.sx, u.y - d.sy) < k.blast + 90) {
            precisionBlast(u, d.sx, d.sy, k.blast, k.dmg, 'HE')
          }
        }
        for (const s of S.structures) {
          const sd = Math.hypot(s.x - d.sx, s.y - d.sy)
          if (sd < k.blast) s.hp -= k.dmg * (1 - sd / k.blast) * 0.7
        }
        radio(d.label, 'fires', `IMPACT — GRID ${grid(d.sx, d.sy)}`, d.sx, d.sy)
        endSortie(d)
        S.drones.splice(i, 1)
      } else { d.x += (dx / dist) * spec.speed * 1.7 * dt; d.y += (dy / dist) * spec.speed * 1.7 * dt }
    }
  }

  updateContacts()
  enemyAI(dt)
  S.version++
}

// --- enemy AI -------------------------------------------------------------

// ---------------------------------------------------------------------------
// Enemy AI. It is purely a COMMANDER: it never manipulates unit internals, it
// only issues the same orders the player uses (orderMove/orderAttack/orderRoe/
// orderDefend). All tactical execution — halting to fight, breaking contact,
// dismounting, resuming the mission, group pacing — runs in the shared tick
// code, identically to friendly units. This keeps behaviour symmetric and
// makes a future second human/AI commander a drop-in.
// ---------------------------------------------------------------------------
const BG_TEMPLATES = [
  { name: 'MECH TEAM',    comp: ['ARM', 'ARM', 'MECH', 'SCT', 'AT'] },
  { name: 'ARMOR THRUST', comp: ['ARM', 'ARM', 'ARM', 'CAV'] },
  { name: 'INF ASSAULT',  comp: ['MECH', 'INF', 'INF', 'SCT', 'MOR'] },
  { name: 'RECON FORCE',  comp: ['CAV', 'CAV', 'SCT', 'AT'] },
]

function centroidOf(list) {
  if (!list.length) return null
  let x = 0, y = 0
  for (const u of list) { x += u.x; y += u.y }
  return { x: x / list.length, y: y / list.length }
}

// pick the enemy's objective: nearest player installation, HQ prioritised
function enemyObjective(from) {
  let best = null, bd = Infinity
  for (const s of S.structures) {
    if (s.side !== 'friend') continue
    const w = Math.hypot(s.x - from.x, s.y - from.y) * (s.kind === 'HQ' ? 0.6 : 1)
    if (w < bd) { bd = w; best = { x: s.x, y: s.y } }
  }
  return best || { x: S.map.fob.x, y: S.map.fob.y }
}

function spawnBattlegroup() {
  // The OPFOR buys its battlegroups. It can only field what it has banked, so it can't
  // put everything on the board at once — and because it pays upkeep on what's already
  // out, a large standing force starves the next group. Same constraint the player has.
  // You can't field from a base you no longer hold — the same rule the player plays by.
  // Battlegroups muster at a live hostile HQ/FOB; lose them all and the OPFOR is done
  // reinforcing, whatever it has banked.
  const base = S.structures.find(s => s.side === 'hostile' && s.buildT <= 0
    && (s.kind === 'HQ' || s.kind === 'FOB'))
  if (!base) return null

  // and it lives under the same force cap — a template that would breach it isn't fielded
  const room = forceCap('hostile') - forceCount('hostile')
  const affordable = BG_TEMPLATES.filter(t =>
    templateCost(t.comp) <= S.enemyResources && t.comp.length <= room)
  if (!affordable.length) return null
  const tpl = affordable[Math.floor(S.rng() * affordable.length)]
  S.enemyResources -= templateCost(tpl.comp)
  const gid = newMoveGroup()
  const grp = {
    id: gid, name: tpl.name, phase: 'muster',
    musterT: 10 + S.rng() * 8, retaskT: 0, objective: null,
    members: [], initStr: tpl.comp.length * 100, dead: false,
  }
  // muster at the base that's actually fielding them, not a fixed map coordinate
  const bx = base.x, by = base.y
  for (const t of tpl.comp) {
    const u = spawnEnemy(t, bx + (S.rng() - 0.5) * 500, by + (S.rng() - 0.5) * 300 + 150)
    u.aiRole = 'bg'
    u.bgGroup = gid
    u.bgRole = (t === 'SCT' || t === 'CAV') ? 'recon' : 'main'
    // recon screens & disengages; the main body advances to contact and fights
    orderRoe(u.id, u.bgRole === 'recon' ? 'break' : 'halt')
  }
  grp.members = S.units.filter(u => u.bgGroup === gid).map(u => u.id)
  S.enemyGroups.push(grp)
}

function updateBattlegroup(grp, dt) {
  const mem = grp.members.map(id => S.units.find(u => u.id === id)).filter(u => u && u.strength > 0)
  if (!mem.length) { grp.dead = true; return }
  const curStr = mem.reduce((s, u) => s + u.strength, 0)

  if (grp.phase === 'muster') {
    grp.musterT -= dt
    if (grp.musterT <= 0) { grp.objective = enemyObjective(centroidOf(mem)); grp.phase = 'advance' }
    return
  }

  // combat-ineffective (< 35% of committed strength) → withdraw under break discipline
  if (grp.phase !== 'withdraw' && curStr < grp.initStr * 0.35) {
    grp.phase = 'withdraw'
    grp.objective = { x: S.map.enemyBase.x, y: S.map.enemyBase.y }
    for (const u of mem) orderRoe(u.id, 'break')
  }

  // refresh the objective as the player's disposition changes
  grp.retaskT -= dt
  if (grp.phase === 'advance' && grp.retaskT <= 0) {
    grp.retaskT = 10
    grp.objective = enemyObjective(centroidOf(mem.filter(u => u.bgRole === 'main')) || centroidOf(mem))
  }

  const obj = grp.objective
  if (!obj) return
  const mainBody = mem.filter(u => u.bgRole === 'main')
  const mainCen = centroidOf(mainBody) || centroidOf(mem)
  const XC = { crossCountry: true } // advance off-road, dispersed

  let mainIdx = 0
  for (const u of mem) {
    // only redirect genuinely idle units — units in contact / breaking / resuming
    // are being handled by the shared SOP code and must be left alone
    const idle = !u.path.length && !u.targetId && !u.breaking && !u.heldRoute && u.attackId == null
    if (u.bgRole === 'main') mainIdx++
    if (!idle) continue
    if (grp.phase === 'withdraw') {
      if (Math.hypot(u.x - obj.x, u.y - obj.y) > 200) orderMove(u.id, obj.x, obj.y)
    } else if (u.bgRole === 'recon') {
      // screen ~750 m ahead of the main body along the axis of advance
      const ax = obj.x - mainCen.x, ay = obj.y - mainCen.y, L = Math.hypot(ax, ay) || 1
      orderMove(u.id, mainCen.x + ax / L * 750, mainCen.y + ay / L * 750, false, false, null, XC)
    } else if (Math.hypot(u.x - obj.x, u.y - obj.y) > 300) {
      // main body: attack-move to a dispersed aim point (loose line abreast the
      // axis), paced together as a group, cross-country
      const ax = obj.x - mainCen.x, ay = obj.y - mainCen.y, L = Math.hypot(ax, ay) || 1
      const px = -ay / L, py = ax / L // perpendicular to the axis of advance
      const off = ((mainIdx - 1) - (mainBody.length - 1) / 2) * 180
      orderMove(u.id, obj.x + px * off, obj.y + py * off, false, true, grp.id, XC)
    }
  }

  // a withdrawing group that reaches home reverts to garrison defence
  if (grp.phase === 'withdraw'
      && mem.every(u => Math.hypot(u.x - S.map.enemyBase.x, u.y - S.map.enemyBase.y) < 500)) {
    for (const u of mem) {
      u.aiRole = 'garrison'; u.anchorX = u.x; u.anchorY = u.y; u.bgGroup = null; u.groupId = null
      orderRoe(u.id, 'halt')
    }
    grp.dead = true
  }
}

function enemyAI(dt) {
  S.nextWave -= dt
  if (S.nextWave <= 0) {
    S.nextWave = 110 + S.rng() * 70
    spawnBattlegroup()
    if (S.t > 420 && S.rng() < 0.5) spawnBattlegroup() // escalate the tempo later
  }

  for (const grp of S.enemyGroups) updateBattlegroup(grp, dt)
  S.enemyGroups = S.enemyGroups.filter(g => !g.dead)

  // garrison defenders: hold their anchor, dig in when a threat closes
  for (const u of S.units) {
    if (u.side !== 'hostile' || u.aiRole !== 'garrison') continue
    if (u.targetId) continue
    u.aiRepathT -= dt
    const off = Math.hypot(u.x - (u.anchorX ?? u.x), u.y - (u.anchorY ?? u.y))
    if (off > 160 && !u.path.length && u.aiRepathT <= 0) {
      u.aiRepathT = 15
      orderMove(u.id, u.anchorX, u.anchorY)
    } else if (off <= 160 && !u.path.length && u.posture !== 'dig') {
      const threat = S.units.some(f => f.side === 'friend' && Math.hypot(f.x - u.x, f.y - u.y) < 1600)
      if (threat) orderDefend(u.id, true)
    }
  }
}

// --- loop -----------------------------------------------------------------

let loopHandle = _hmr.__WOD_LOOP || null // survives HMR so we don't stack loops
export function startLoop() {
  if (loopHandle) return
  let last = performance.now()
  loopHandle = setInterval(() => {
    const now = performance.now()
    let dt = Math.min(0.25, (now - last) / 1000) * S.speed
    last = now
    while (dt > 0) {
      const step = Math.min(dt, 0.12)
      tick(step)
      dt -= step
    }
  }, 50)
  _hmr.__WOD_LOOP = loopHandle
}

// Deterministic headless stepping for dev/verification (rAF-independent).
export function advance(seconds) {
  const steps = Math.ceil(seconds / 0.1)
  for (let i = 0; i < steps; i++) tick(0.1)
  return { t: S.t, units: S.units.length, contacts: S.contacts.size }
}

if (typeof window !== 'undefined') {
  window.__game = {
    S, initGame, initDevGame, advance, deployUnit, fieldUnit, deployStructure, deployDrone, droneStrike, droneToggleTarget, droneClearTargets, droneFire, gunshipSelectWeapon, gunshipSetMode, droneFollow, droneLock,
    orderDroneMove, droneDropWp, droneSet, droneRTB, droneSensorMode, fieldAerostat, airAvailability, unitAvailability, forceCount, forceCap, incomePerMin, upkeepPerMin,
    orderMove, orderGroupMove, orderAttack, newMoveGroup, orderHold, orderMount, orderRoe, orderDefend, orderWeapons, orderBridge, orderConvoy, convertToHq, removeLastWaypoint, fireMission,
    reveal: () => { S.fogEnabled = false },
    fog: (on) => { S.fogEnabled = on },
    setSpeed: (x) => { S.speed = x },
  }
  window.__advance = advance
}

// --- HMR: keep the session alive when this file is edited (state survives hot updates) ---
// On a hot update, stop the old loop and let the fresh module resume it with the new code;
// S is already preserved on globalThis, so units/map/drones/etc. carry over.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (loopHandle) { clearInterval(loopHandle); loopHandle = null; _hmr.__WOD_LOOP = null }
  })
  import.meta.hot.accept()
  // a game is already in progress → restart the loop against this updated module
  if (S.map) startLoop()
}
