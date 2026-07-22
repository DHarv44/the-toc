import { genMap, T_FOREST, T_URBAN, T_WATER, GRID, CELL } from './mapgen.js'
import { findPath } from './pathfinding.js'
import { UNIT_TYPES, STRUCTURES, DRONE_TYPES, COVER_DEF } from './units.js'
import { makeRng } from './rng.js'

// ---------------------------------------------------------------------------
// Singleton mutable game state. React reads it via polling; the sim loop
// mutates it. Kept as plain objects for speed and easy dev-console poking.
// ---------------------------------------------------------------------------
export const S = {
  t: 0,
  map: null,
  resources: 50000,        // dev: plenty
  income: 15,
  units: [],               // both sides
  structures: [],          // FOBs, HQs, airfields, OPs — both sides
  drones: [],
  shells: [],
  impacts: [],             // recent arty impacts (for map flash + drone view)
  smoke: [],               // active smoke clouds {x, y, t, r}
  wrecks: [],
  pontoons: [],            // cell indices of engineer-laid bridges
  contacts: new Map(),     // enemyId -> {x, y, type, lastSeen, live}
  structContacts: new Set(),// spotted hostile structure ids (permanent)
  fogEnabled: true,
  speed: 1,
  toasts: [],
  radio: [],               // net traffic: {t, callsign, kind, msg, x, y}
  won: false, lost: false,
  nextWave: 60,
  enemyGroups: [],         // hostile battlegroups (task-organized elements)
  rng: null,
  version: 0,
}

let nextId = 1
const designators = { friend: 0, hostile: 0 }
const FRIEND_CALLS = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOX', 'GOLF', 'HOTEL', 'INDIA', 'JULIET', 'KILO', 'LIMA', 'MIKE', 'NOVA', 'OSCAR', 'PAPA', 'QUEBEC', 'ROMEO', 'SIERRA', 'TANGO']

export function initGame(seed = 1337) {
  S.map = genMap(seed)
  S.t = 0
  S.units = []
  S.structures = []
  S.drones = []
  S.shells = []
  S.impacts = []
  S.smoke = []
  S.wrecks = []
  S.pontoons = []
  S.contacts = new Map()
  S.structContacts = new Set()
  S.radio = []
  S.resources = 50000
  S.won = false; S.lost = false
  S.nextWave = 60
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

  // Player starter force near FOB
  deployUnit('SCT', S.map.fob.x + 200, S.map.fob.y - 200, true)
  deployUnit('INF', S.map.fob.x - 200, S.map.fob.y - 100, true)
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
  return {
    id: nextId++, side, type: typeKey, label,
    x, y, heading: side === 'friend' ? -Math.PI / 2 : Math.PI / 2,
    strength: 100, path: [], legs: [], state: 'hold',
    mounted: !!type.carrier,
    roe: type.logi ? 'break' : 'halt', // supply trucks run, they don't fight
    heldRoute: null, autoDismounted: false, lastCombatT: -99, breaking: false, convoy: null,
    attackId: null, attackMove: false, attackRepathT: 0, groupId: null,
    posture: 'mobile', digT: 0, dugRadioed: false, weapons: 'free',
    fireCooldown: 0, missionCooldown: 0, targetId: null,
    bridging: null,
    lastContactT: -99, lastReqT: -99, lastSpotT: -99, lastFiredT: null, strMark: 100,
    aiRole: null, aiRepathT: 0,
    formSeed: S.rng ? S.rng() * 1000 : Math.random() * 1000,
    _spd: type.speed,
  }
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
  const nearOk = kind === 'OP'
    ? (S.units.some(u => u.side === 'friend' && Math.hypot(u.x - x, u.y - y) <= spec.near)
      || S.structures.some(s => s.side === 'friend' && Math.hypot(s.x - x, s.y - y) <= spec.near))
    : S.structures.some(s => s.side === 'friend' && s.buildT <= 0 && Math.hypot(s.x - x, s.y - y) <= spec.near)
  if (!nearOk) return toast(kind === 'OP' ? 'TOO FAR FROM FRIENDLY FORCES' : 'TOO FAR FROM EXISTING BASE')
  S.resources -= spec.cost
  const s = addStructure('friend', kind, x, y)
  toast(s.label + ' — CONSTRUCTION STARTED')
  return s
}

export function deployDrone(typeKey, x, y) {
  x = clampWorld(x); y = clampWorld(y)
  const spec = DRONE_TYPES[typeKey]
  if (!spec) return null
  let ox, oy
  let tether = null
  if (spec.src === 'tether') {
    // aerostat: raised at a FOB/HQ, one per site
    const site = S.structures
      .filter(s => s.side === 'friend' && s.buildT <= 0 && (s.kind === 'FOB' || s.kind === 'HQ')
        && Math.hypot(s.x - x, s.y - y) <= spec.tetherRange)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0]
    if (!site) return toast('MUST TETHER AT A FOB OR HQ')
    if (S.drones.some(d => d.tether === site.id)) return toast(site.label + ' ALREADY FLIES AN AEROSTAT')
    tether = site
    ox = site.x; oy = site.y
    x = site.x; y = site.y
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
  }
  if (S.resources < spec.cost) return toast('INSUFFICIENT SUPPLY')
  S.resources -= spec.cost
  const id = nextId++
  const d = {
    id, type: typeKey, x: ox, y: oy, ox, oy,
    tx: x, ty: y, state: tether ? 'onstation' : 'transit', route: [],
    tether: tether ? tether.id : null,
    altMul: 1, sightMul: 1, orbitMul: 1,
    endurance: spec.endurance, angle: 0,
    ammo: spec.weapons ? spec.weapons.ammo : 0,
    label: spec.abbr + '-' + (id % 100),
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
    S.drones.splice(S.drones.indexOf(d), 1)
    return
  }
  d.state = 'rtb'
  d.followId = null
  d.route = []
  radio(d.label, 'move', 'RTB PER TASKING', d.x, d.y)
}

// sensor lock: camera stays on a unit (track) or a grid (point) regardless of orbit
export function droneLock(droneId, lock) {
  const d = S.drones.find(d => d.id === droneId)
  if (!d) return
  if (!lock) {
    if (d.lock) radio(d.label, 'move', 'SENSOR LOCK BROKEN — RATE MODE', d.x, d.y)
    d.lock = null
    return
  }
  if (lock.unitId != null) {
    const u = S.units.find(u => u.id === lock.unitId)
    if (!u) return
    d.lock = { unitId: u.id, x: u.x, y: u.y }
    radio(d.label, 'spot', `SENSOR TRACKING ${u.side === 'friend' ? u.label : UNIT_TYPES[u.type].name.toUpperCase()}`, u.x, u.y)
  } else {
    d.lock = { x: lock.x, y: lock.y }
    radio(d.label, 'spot', `SENSOR LOCKED — GRID ${grid(lock.x, lock.y)}`, lock.x, lock.y)
  }
}

// task a drone to overwatch a friendly unit: the orbit anchor chases the unit
export function droneFollow(droneId, unitId) {
  const d = S.drones.find(d => d.id === droneId)
  if (!d) return
  if (unitId) {
    const u = S.units.find(u => u.id === unitId && u.side === 'friend')
    if (!u) return toast('CAN ONLY OVERWATCH FRIENDLY UNITS')
    if (d.tether) return toast(d.label + ' IS TETHERED')
    d.followId = unitId
    d.route = []
    radio(d.label, 'move', `TASKED — OVERWATCH ${u.label}`, u.x, u.y)
  } else {
    d.followId = null
    radio(d.label, 'move', `HOLDING FIXED ORBIT GRID ${grid(d.tx, d.ty)}`, d.tx, d.ty)
  }
}

// armed drones: VIPER fires an AGM at a point; SWITCHBLADE dives on it
export function droneStrike(droneId, x, y) {
  const d = S.drones.find(d => d.id === droneId)
  if (!d) return
  const spec = DRONE_TYPES[d.type]
  if (spec.weapons) {
    if (d.state !== 'onstation') return toast(d.label + ' NOT ON STATION')
    if (d.ammo <= 0) return toast(d.label + ' WINCHESTER — NO ORDNANCE')
    if (Math.hypot(d.x - x, d.y - y) > spec.weapons.range) return toast('TARGET OUTSIDE WEAPON RANGE')
    d.ammo--
    S.shells.push({
      fromX: d.x, fromY: d.y, x, y,
      impactT: S.t + spec.weapons.flight,
      dmg: spec.weapons.dmg, blast: spec.weapons.blast, side: 'friend',
      splashFrom: d.label,
    })
    radio(d.label, 'fires', `RIFLE — TGT GRID ${grid(x, y)}, ${d.ammo} AGM REMAINING`, x, y)
  } else if (spec.kamikaze) {
    if (d.state !== 'onstation' && d.state !== 'transit') return
    d.state = 'striking'
    d.sx = x; d.sy = y
    radio(d.label, 'fires', `TERMINAL ATTACK — GRID ${grid(x, y)}`, x, y)
  }
}

let groupSeq = 1
// allocate a shared movement-group id so co-issued units hold to the slowest pace
export function newMoveGroup() { return groupSeq++ }

export function orderMove(unitId, x, y, append = false, attack = false, groupId = null) {
  const u = S.units.find(u => u.id === unitId)
  if (!u || u.side !== 'friend') return
  x = clampWorld(x); y = clampWorld(y)
  const from = (append && u.path.length) ? u.path[u.path.length - 1] : u
  const p = findPath(S.map, from.x, from.y, x, y, effStats(u).mob)
  if (!p) return toast('ROUTE IMPASSABLE')
  u.bridging = null
  u.heldRoute = null
  u.breaking = false
  u.autoDismounted = false
  u.convoy = null
  u.attackId = null
  u.attackMove = attack
  if (!append) u.groupId = groupId
  if (append && u.path.length) {
    u.path = u.path.concat(p)
    u.legs.push({ x, y, n: p.length })
    radio(u.label, 'move', `COPY — WP ADDED, GRID ${grid(x, y)}`, x, y)
  } else {
    u.path = p
    u.legs = [{ x, y, n: p.length }]
    radio(u.label, 'move', attack
      ? `ADVANCING TO CONTACT — GRID ${grid(x, y)}`
      : `MOVING TO GRID ${grid(x, y)}`, x, y)
  }
  u.state = 'moving'
}

// deliberate attack on a specific enemy: pursue and destroy
export function orderAttack(unitId, enemyId, groupId = null) {
  const u = S.units.find(u => u.id === unitId)
  const e = S.units.find(x => x.id === enemyId && x.side === 'hostile')
  if (!u || u.side !== 'friend' || !e) return
  const p = findPath(S.map, u.x, u.y, e.x, e.y, effStats(u).mob)
  if (!p) return toast('ROUTE IMPASSABLE')
  u.bridging = null; u.heldRoute = null; u.breaking = false
  u.autoDismounted = false; u.convoy = null
  u.groupId = groupId
  u.attackId = enemyId
  u.attackMove = true
  u.attackRepathT = 8
  u.path = p
  u.legs = [{ x: e.x, y: e.y, n: p.length }]
  u.state = 'moving'
  radio(u.label, 'contact', `ATTACKING ${UNIT_TYPES[e.type].name.toUpperCase()} — GRID ${grid(e.x, e.y)}`, e.x, e.y)
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
  if (u) { u.path = []; u.legs = []; u.bridging = null; u.heldRoute = null; u.breaking = false; u.convoy = null; u.attackId = null; u.attackMove = false; u.groupId = null; u.state = 'hold' }
}

export function orderMount(unitId, mounted) {
  const u = S.units.find(u => u.id === unitId)
  if (!u || !UNIT_TYPES[u.type].carrier) return
  if (u.mounted === mounted) return
  if (mounted && u.targetId) return toast(u.label + ' — CANNOT MOUNT UNDER FIRE')
  u.mounted = mounted
  u.autoDismounted = false // manual posture change overrides the drill
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
  if (!u || u.side !== 'friend' || !ROE_NAMES[roe] || u.roe === roe) return
  u.roe = roe
  radio(u.label, 'move', `BATTLE DRILL SET — ${ROE_NAMES[roe]}`, u.x, u.y)
}

// defensive posture: unit halts and prepares positions per its type
export function orderDefend(unitId, on) {
  const u = S.units.find(u => u.id === unitId)
  if (!u || u.side !== 'friend') return
  const def = UNIT_TYPES[u.type].def
  if (!def) return
  if (on && u.posture !== 'dig') {
    u.posture = 'dig'
    u.digT = 0
    u.dugRadioed = false
    u.path = []; u.legs = []; u.heldRoute = null; u.state = 'hold'
    radio(u.label, 'move', `ESTABLISHING DEFENSE — ${def.name}`, u.x, u.y)
  } else if (!on && u.posture === 'dig') {
    u.posture = 'mobile'
    u.digT = 0
    radio(u.label, 'move', 'POSITIONS ABANDONED — MOBILE', u.x, u.y)
  }
}

// weapons control status: 'free' | 'tight' (return fire only) | 'hold'
const WPN_NAMES = { free: 'WEAPONS FREE', tight: 'WEAPONS TIGHT — RETURN FIRE ONLY', hold: 'WEAPONS HOLD' }
export function orderWeapons(unitId, wpn) {
  const u = S.units.find(u => u.id === unitId)
  if (!u || u.side !== 'friend' || !WPN_NAMES[wpn] || u.weapons === wpn) return
  u.weapons = wpn
  radio(u.label, 'move', WPN_NAMES[wpn], u.x, u.y)
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

// MGRS-lite grid reference (100 m precision), matches the cursor readout
export function grid(x, y) {
  return String(Math.floor(x / 100)).padStart(3, '0') + ' ' + String(Math.floor(y / 100)).padStart(3, '0')
}

function radio(callsign, kind, msg, x, y) {
  S.radio.push({ t: S.t, callsign, kind, msg, x, y })
  if (S.radio.length > 100) S.radio.shift()
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
  S.resources += S.income * dt

  // structures: construction + income
  for (const s of S.structures) {
    if (s.buildT > 0) s.buildT = Math.max(0, s.buildT - dt)
    else if (s.side === 'friend' && s.income) S.resources += s.income * dt
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
        u.strength = Math.min(100, u.strength + 0.8 * dt)
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
  const groupCap = new Map()
  for (const u of S.units) {
    if (u.groupId == null || !u.path.length || u.strength <= 0) continue
    const s = effStats(u).speed
    const cur = groupCap.get(u.groupId)
    if (cur == null || s < cur) groupCap.set(u.groupId, s)
  }

  // units: movement + bridging
  for (const u of S.units) {
    const type = UNIT_TYPES[u.type]
    u.fireCooldown = Math.max(0, u.fireCooldown - dt)
    u.missionCooldown = Math.max(0, u.missionCooldown - dt)
    // preparing positions: progress while stationary
    if (u.posture === 'dig' && !u.path.length && u.digT < 1 && type.def) {
      u.digT = Math.min(1, u.digT + dt / type.def.time)
      if (u.digT >= 1 && !u.dugRadioed && u.side === 'friend') {
        u.dugRadioed = true
        radio(u.label, 'arrive', `DEFENSE SET — ${type.def.name}`, u.x, u.y)
      }
    }
    // rest and buddy-aid in prepared positions: slow recovery, capped at 70%
    if (u.posture === 'dig' && u.digT >= 1 && u.strength > 0 && u.strength < 70
        && !u.targetId && S.t - u.lastCombatT > 20) {
      u.strength = Math.min(70, u.strength + 0.15 * dt)
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
      // hold to the group's slowest pace, then apply this unit's own terrain factor
      const cap = u.groupId != null ? groupCap.get(u.groupId) : undefined
      const base = cap != null ? Math.min(st.speed, cap) : st.speed
      const spd = base / (isFinite(f) ? f : 3)
      u._spd = spd
      if (d < Math.max(4, spd * dt)) {
        u.x = wp.x; u.y = wp.y
        u.path.shift()
        if (u.legs.length && --u.legs[0].n <= 0) {
          const leg = u.legs.shift()
          if (u.side === 'friend') {
            if (u.legs.length) radio(u.label, 'arrive', `WP CLEAR GRID ${grid(leg.x, leg.y)} — CONTINUING`, leg.x, leg.y)
            else radio(u.label, 'arrive', `AT GRID ${grid(leg.x, leg.y)} — HOLDING`, leg.x, leg.y)
          }
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
    const wpn = u.side === 'friend' ? (u.weapons || 'free') : 'free'
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
      const roe = u.side === 'friend' ? (u.roe || 'halt') : 'halt'
      // troops in contact: carriers drop their infantry (halt drill only — push/break stay mounted)
      if (type.carrier && u.mounted && tdist < 900 && roe === 'halt') {
        u.mounted = false
        u.autoDismounted = true
        if (u.side === 'friend') radio(u.label, 'contact', `IN CONTACT — DISMOUNTING`, u.x, u.y)
      }
      if (roe === 'halt') {
        // halt to fight rather than driving through the kill zone; keep the route to resume
        if (u.side === 'friend' && u.path.length && !type.indirect && type.range >= 500
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
      tgt.strength -= dps * dt * (u.strength / 100)
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
    if (u.side === 'friend' && u.roe === 'break' && !u.breaking) {
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
        radio(u.label, 'contact', `BREAKING CONTACT — MOVING GRID ${grid(bx, by)}`, u.x, u.y)
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
        for (const u of S.units) {
          const d = Math.hypot(u.x - sh.x, u.y - sh.y)
          if (d < sh.blast) {
            const et = UNIT_TYPES[u.type]
            const armorFactor = icm
              ? et.soft * 0.55 + (1 - et.soft) * 1.0   // shaped submunitions
              : et.soft * 1.0 + (1 - et.soft) * 0.45   // HE blast/frag
            // overhead cover: buildings shelter well, woods somewhat
            const terr = S.map.terr[S.map.cellAt(u.x, u.y)]
            const coverFactor = terr === T_URBAN ? 0.65 : terr === T_FOREST ? 0.85 : 1
            u.strength -= sh.dmg * (1 - d / sh.blast) * armorFactor * postureFactor(u) * coverFactor
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
  while (S.impacts.length && S.t - S.impacts[0].t > 6) S.impacts.shift()
  // smoke dissipates
  for (let i = S.smoke.length - 1; i >= 0; i--) {
    if (S.t - S.smoke[i].t > SMOKE_DURATION) S.smoke.splice(i, 1)
  }

  // mission resumption: contact clear and neighborhood quiet → continue movement
  for (const u of S.units) {
    if (u.side !== 'friend') continue
    // deliberate attack: pursue the designated target until it dies
    if (u.attackId != null) {
      const tgt = S.units.find(x => x.id === u.attackId)
      if (!tgt || tgt.strength <= 0) {
        u.attackId = null
        u.attackMove = false
        radio(u.label, 'contact', 'TARGET DESTROYED — HOLDING', u.x, u.y)
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
      radio(u.label, 'contact', 'CONTACT BROKEN — HOLDING, AWAITING ORDERS', u.x, u.y)
    }
    const calm = !u.targetId && S.t - u.lastCombatT > 12
    if (calm && (u.heldRoute || u.autoDismounted)) {
      const nearBusy = S.units.some(o => o !== u && o.side === 'friend' && o.targetId
        && Math.hypot(o.x - u.x, o.y - u.y) < 600)
      if (!nearBusy) {
        // remount applies whether or not the unit ever fully halted
        if (u.autoDismounted && UNIT_TYPES[u.type].carrier && !u.mounted) {
          u.mounted = true
          radio(u.label, 'move', 'REMOUNTING', u.x, u.y)
        }
        u.autoDismounted = false
        if (u.heldRoute) {
          u.path = u.heldRoute.path
          u.legs = u.heldRoute.legs
          u.heldRoute = null
          u.state = 'moving'
          radio(u.label, 'move', 'CONTACT CLEAR — CONTINUING MISSION', u.x, u.y)
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

  // deaths: units
  for (let i = S.units.length - 1; i >= 0; i--) {
    const u = S.units[i]
    if (u.strength <= 0) {
      S.wrecks.push({ x: u.x, y: u.y, side: u.side, type: u.type, t: S.t })
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
          S.drones.splice(k, 1)
        }
      }
      if (s.side === 'hostile' && s.kind === 'HQ' && !S.won) {
        S.won = true
        toast('★ RED HQ DESTROYED — OBJECTIVE SECURED ★')
      }
      if (s.side === 'friend' && s.label === 'FOB COBALT' && !S.lost) {
        S.lost = true
        toast('!! FOB COBALT LOST !!')
      }
    }
  }
  while (S.wrecks.length > 60) S.wrecks.shift()

  // drones
  for (let i = S.drones.length - 1; i >= 0; i--) {
    const d = S.drones[i]
    const spec = DRONE_TYPES[d.type]
    // sensor track maintenance: follow the locked unit, degrade to point lock if lost
    if (d.lock && d.lock.unitId != null) {
      const lu = S.units.find(x => x.id === d.lock.unitId)
      if (lu) { d.lock.x = lu.x; d.lock.y = lu.y }
      else {
        delete d.lock.unitId
        radio(d.label, 'spot', `TRACK LOST — HOLDING GRID ${grid(d.lock.x, d.lock.y)}`, d.lock.x, d.lock.y)
      }
    }
    // overwatch tasking: orbit anchor chases the assigned unit at airframe speed
    if (d.followId && (d.state === 'transit' || d.state === 'onstation')) {
      const u = S.units.find(x => x.id === d.followId)
      if (!u) {
        d.followId = null
        radio(d.label, 'move', `TRACK LOST — HOLDING ORBIT GRID ${grid(d.tx, d.ty)}`, d.tx, d.ty)
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
        }
      } else { d.x += (dx / dist) * spec.speed * dt; d.y += (dy / dist) * spec.speed * dt }
    } else if (d.state === 'onstation') {
      d.endurance -= dt
      const oR = spec.orbitR * (d.orbitMul || 1)
      if (d.orbR == null) d.orbR = oR
      // rate-limited spiral toward the commanded radius
      const maxStep = spec.speed * 0.5 * dt
      d.orbR += Math.max(-maxStep, Math.min(maxStep, oR - d.orbR))
      // angular rate keeps true airspeed roughly constant (balloons just sway)
      d.angle += dt * ((spec.speed || 3) / Math.max(80, d.orbR))
      d.x = d.tx + Math.cos(d.angle) * d.orbR
      d.y = d.ty + Math.sin(d.angle) * d.orbR
      if (d.endurance <= 0) {
        d.state = 'rtb'
        radio(d.label, 'move', `BINGO — RTB`, d.x, d.y)
      }
    } else if (d.state === 'rtb') {
      const dx = d.ox - d.x, dy = d.oy - d.y
      const dist = Math.hypot(dx, dy)
      if (dist < 80) {
        radio(d.label, 'arrive', 'RECOVERED', d.ox, d.oy)
        S.drones.splice(i, 1)
      } else { d.x += (dx / dist) * spec.speed * dt; d.y += (dy / dist) * spec.speed * dt }
    } else if (d.state === 'striking') {
      const dx = d.sx - d.x, dy = d.sy - d.y
      const dist = Math.hypot(dx, dy)
      if (dist < 25) {
        S.impacts.push({ x: d.sx, y: d.sy, t: S.t })
        const k = spec.kamikaze
        for (const u of S.units) {
          const ud = Math.hypot(u.x - d.sx, u.y - d.sy)
          if (ud < k.blast) {
            const et = UNIT_TYPES[u.type]
            u.strength -= k.dmg * (1 - ud / k.blast) * (et.soft + (1 - et.soft) * 0.55)
          }
        }
        for (const s of S.structures) {
          const sd = Math.hypot(s.x - d.sx, s.y - d.sy)
          if (sd < k.blast) s.hp -= k.dmg * (1 - sd / k.blast) * 0.7
        }
        radio(d.label, 'fires', `IMPACT — GRID ${grid(d.sx, d.sy)}`, d.sx, d.sy)
        S.drones.splice(i, 1)
      } else { d.x += (dx / dist) * spec.speed * 1.7 * dt; d.y += (dy / dist) * spec.speed * 1.7 * dt }
    }
  }

  updateContacts()
  enemyAI(dt)
  S.version++
}

// --- enemy AI -------------------------------------------------------------

function nearestFriendlyStructure(x, y) {
  let best = S.map.fob, bd = Infinity
  for (const s of S.structures) {
    if (s.side !== 'friend') continue
    const d = Math.hypot(s.x - x, s.y - y)
    if (d < bd) { bd = d; best = s }
  }
  return best
}

function enemyAI(dt) {
  S.nextWave -= dt
  if (S.nextWave <= 0) {
    S.nextWave = 75 + S.rng() * 40
    const n = 1 + (S.rng() < 0.5 ? 1 : 0)
    for (let i = 0; i < n; i++) {
      const roll = S.rng()
      const typeKey = roll < 0.25 ? 'INF' : roll < 0.45 ? 'MECH' : roll < 0.6 ? 'STRY'
        : roll < 0.78 ? 'ARM' : roll < 0.87 ? 'AT' : roll < 0.96 ? 'CAV' : 'SCT'
      const u = spawnEnemy(typeKey, S.map.enemyBase.x + (S.rng() - 0.5) * 400, S.map.enemyBase.y + (S.rng() - 0.5) * 300)
      u.aiRole = 'attack'
    }
  }

  for (const u of S.units) {
    if (u.side !== 'hostile') continue
    u.aiRepathT -= dt
    if (u.aiRole === 'attack' && !u.path.length && u.state !== 'engaging' && u.aiRepathT <= 0) {
      u.aiRepathT = 20 + S.rng() * 10
      let tgt = null, td = Infinity
      for (const f of S.units) {
        if (f.side !== 'friend') continue
        const d = Math.hypot(f.x - u.x, f.y - u.y)
        if (d < 2500 && d < td && d <= effStats(u).sight * concealment(S.map, f.x, f.y) * 1.6) { tgt = f; td = d }
      }
      const dest = tgt ? { x: tgt.x, y: tgt.y } : nearestFriendlyStructure(u.x, u.y)
      const p = findPath(S.map, u.x, u.y, dest.x, dest.y, effStats(u).mob)
      if (p) u.path = p
    }
    if (u.targetId && u.path.length) {
      const t = S.units.find(x => x.id === u.targetId)
      if (t && Math.hypot(t.x - u.x, t.y - u.y) < UNIT_TYPES[u.type].range * 0.8) { u.path = []; u.legs = [] }
    }
    if (u.aiRole === 'garrison' && !u.path.length && !u.targetId && u.anchorX != null) {
      if (Math.hypot(u.x - u.anchorX, u.y - u.anchorY) > 150 && u.aiRepathT <= 0) {
        u.aiRepathT = 15
        const p = findPath(S.map, u.x, u.y, u.anchorX, u.anchorY, effStats(u).mob)
        if (p) u.path = p
      }
    }
  }
}

// --- loop -----------------------------------------------------------------

let loopHandle = null
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
}

// Deterministic headless stepping for dev/verification (rAF-independent).
export function advance(seconds) {
  const steps = Math.ceil(seconds / 0.1)
  for (let i = 0; i < steps; i++) tick(0.1)
  return { t: S.t, units: S.units.length, contacts: S.contacts.size }
}

if (typeof window !== 'undefined') {
  window.__game = {
    S, initGame, advance, deployUnit, deployStructure, deployDrone, droneStrike, droneFollow, droneLock,
    orderDroneMove, droneDropWp, droneSet, droneRTB,
    orderMove, orderAttack, newMoveGroup, orderHold, orderMount, orderRoe, orderDefend, orderWeapons, orderBridge, orderConvoy, convertToHq, removeLastWaypoint, fireMission,
    reveal: () => { S.fogEnabled = false },
    fog: (on) => { S.fogEnabled = on },
    setSpeed: (x) => { S.speed = x },
  }
  window.__advance = advance
}
