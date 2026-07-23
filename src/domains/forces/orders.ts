// Ground-unit orders: movement, columns, posture, drills. Ported verbatim from
// src/game/sim.js. These are the ONLY mutations the UI and the enemy AI are
// allowed to make on units — the AI is a commander issuing player-legal orders.
import { S } from '../../engine/state'
import type { Unit } from '../../engine/GameState'
import { findPath, type PathOpts } from '../../world/pathfinding'
import { CELL, T_WATER } from '../../world/WorldMap'
import { clampWorld } from '../../world/place'
import { grid } from '../../lib/format'
import { UNIT_TYPES } from './catalog'
import { effStats, syncElements } from './elements'
import { netRadio, radio, toast } from '../comms/radio'

export const ROAD_SNAP = 2 // cells either side of the click that still count as "on the road"
export const COLUMN_GAP = 65     // metres a follower holds behind the vic ahead of it
export const STRAGGLE_GAP = 190  // metres before the column stops and waits for its tail

// allocate a shared movement-group id so co-issued units hold to the slowest pace
export function newMoveGroup(): number { return S.counters.groupSeq++ }

// A carrier that AUTO-dismounted in contact climbs back in when re-tasked out of
// contact, so the convoy travels mounted instead of crawling on foot. A unit the
// player MANUALLY dismounted has autoDismounted=false and stays dismounted until
// the player mounts it again. Call before pathing so it routes with vehicle mobility.
function autoRemount(u: Unit): void {
  if (u.autoDismounted && !u.targetId && !u.mounted && UNIT_TYPES[u.type].carrier) {
    u.mounted = true
    u.autoDismounted = false
    syncElements(u, true)
    netRadio(u, 'move', 'REMOUNTING', u.x, u.y)
  }
}

function nearRoad(x: number, y: number, r = ROAD_SNAP): boolean {
  const m = S.map!, GRID = m.GRID
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

// Read the player's routing intent from where they clicked. Dropping the pin on a road
// means "use the network" — hold the roads the whole way. Dropping it out in the open
// means they want that spot, so go direct rather than detouring along a road that
// happens to be cheaper. Callers that already know what they want (the enemy AI's
// cross-country moves, an explicit roads-only order) are left alone.
function roadIntent(x: number, y: number, opts: PathOpts): PathOpts {
  if (opts.crossCountry || opts.roadsOnly || opts.roadBias || opts.offRoad) return opts
  return nearRoad(x, y)
    ? { ...opts, roadBias: 3 }    // clicked the network — stay on it
    : { ...opts, offRoad: true }  // clicked open ground — go there direct
}

// Move a formation as a column behind one lead vic.
//
// The leader paths once and everyone shares that route, so the column follows
// the same road, the same bridge, the same gap in the treeline. Members hold
// station by trailing along it rather than by steering. The leader is the most
// constrained member (slowest real speed over its own terrain).
export function orderGroupMove(
  unitIds: number[], x: number, y: number,
  append = false, attack = false, opts: PathOpts = {},
): number | null {
  const units = unitIds
    .map(id => S.units.find(u => u.id === id))
    .filter((u): u is Unit => !!u && u.strength > 0)
  if (!units.length) return null
  if (units.length === 1) { orderMove(units[0]!.id, x, y, append, attack, null, opts); return null }
  // Appending keeps each unit's own multi-leg waypoint queue — a shared column route
  // collapses the legs into one, which would renumber the player's waypoints out from
  // under them. Columns form on a fresh order.
  if (append) {
    const gid = newMoveGroup()
    for (const u of units) orderMove(u.id, x, y, true, attack, gid, opts)
    return gid
  }

  let lead = units[0]!, leadSpd = Infinity
  for (const u of units) {
    const st = effStats(u)
    const f = S.map!.moveFactor(u.x, u.y, st.mob)
    const real = st.speed / (isFinite(f) ? f : 3)
    if (real < leadSpd) { leadSpd = real; lead = u }
  }

  const gid = newMoveGroup()
  orderMove(lead.id, x, y, append, attack, gid, opts)
  if (!lead.path.length) return null   // route refused — don't strand the followers

  // Everyone else takes a slot in the column. A follower paths its own short leg
  // onto the head of the route (with a road bias, so it gets on the network as
  // directly as it can) and then runs the shared route from there.
  const route = lead.path.map(p => ({ x: p.x, y: p.y }))
  // Column order follows position along the route, not selection order, so whoever is
  // already furthest along leads the tail rather than being made to fall in at the back.
  const joinAt = (u: Unit): number => {
    let best = 0, bestD = Infinity
    for (let k = 0; k < route.length; k++) {
      const d = Math.hypot(route[k]!.x - u.x, route[k]!.y - u.y)
      if (d < bestD) { bestD = d; best = k }
    }
    return best
  }
  // Column order is by progress along the route, and that includes the lead vic.
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
    const entry = route[k]!
    const join = findPath(S.map!, u.x, u.y, entry.x, entry.y, mob, { ...opts, roadBias: 3 })
    u.path = (join || [{ x: entry.x, y: entry.y }]).concat(route.slice(k + 1))
    // one leg to the objective — the join is plumbing, not a waypoint the player set
    u.legs = [{ x, y, n: u.path.length }]
    u.state = 'moving'
    u.posture = 'mobile'
  })
  netRadio(lead, 'move', `FORMATION MOVING — ${units.length} ELEMENTS, GRID ${grid(x, y)}`, x, y)
  return gid
}

export function orderMove(
  unitId: number, x: number, y: number,
  append = false, attack = false, groupId: number | null = null, opts: PathOpts = {},
): void {
  const u = S.units.find(u => u.id === unitId)
  if (!u) return
  autoRemount(u)
  x = clampWorld(S.map, x); y = clampWorld(S.map, y)
  const from = (append && u.path.length) ? u.path[u.path.length - 1]! : u
  const mob = effStats(u).mob
  let p = findPath(S.map!, from.x, from.y, x, y, mob, roadIntent(x, y, opts))
  // a roads-only order to somewhere the network doesn't reach shouldn't just refuse —
  // run the trunk as far as it goes and say why the rest is cross-country
  if (!p && opts.roadsOnly) {
    p = findPath(S.map!, from.x, from.y, x, y, mob, { ...opts, roadsOnly: false, roadBias: 3 })
    if (p && u.side === 'friend') toast('NO ROAD ROUTE — MOVING CROSS-COUNTRY')
  }
  // only surface the toast for player-issued orders; the enemy AI re-drives idle
  // units every tick, so an unreachable hostile objective would spam it forever
  if (!p) { if (u.side === 'friend') toast('ROUTE IMPASSABLE'); return }
  u.bridging = null
  u.heldRoute = null
  u.breaking = false
  u.resumeDest = undefined; u.breakRetried = undefined // fresh order supersedes any break-resume
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
    // long-detour advisory: water/terrain can turn a short click into a route
    // through half the map (often through the fight) — say so when it happens,
    // because the faint route line is easy to miss
    if (u.side === 'friend') {
      let len = 0, px = u.x, py = u.y
      for (const pt of p) { len += Math.hypot(pt.x - px, pt.y - py); px = pt.x; py = pt.y }
      const straight = Math.hypot(x - u.x, y - u.y)
      if (straight > 800 && len > straight * 1.6) {
        netRadio(u, 'move', `TAKING LONG DETOUR — ${(len / 1000).toFixed(1)} KM ROUTE`, u.x, u.y)
      }
    }
  }
  u.state = 'moving'
}

// deliberate attack on a specific enemy: pursue and destroy
export function orderAttack(unitId: number, enemyId: number, groupId: number | null = null): void {
  const u = S.units.find(u => u.id === unitId)
  if (!u) return
  const e = S.units.find(x => x.id === enemyId && x.side !== u.side)
  if (!e) return
  autoRemount(u)
  const p = findPath(S.map!, u.x, u.y, e.x, e.y, effStats(u).mob)
  if (!p) { if (u.side === 'friend') toast('ROUTE IMPASSABLE'); return }
  u.bridging = null; u.heldRoute = null; u.breaking = false
  u.resumeDest = undefined; u.breakRetried = undefined
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

export function removeLastWaypoint(unitId: number): void {
  const u = S.units.find(u => u.id === unitId)
  if (!u || !u.legs || !u.legs.length) return
  const last = u.legs.pop()!
  u.path.length = Math.max(0, u.path.length - last.n)
  if (!u.path.length) { u.legs = []; u.state = 'hold' }
}

// Remove one specific waypoint (right-click on its pip). The tail pops like
// removeLastWaypoint; removing a middle waypoint re-paths the bridge between
// its neighbours so the route stays continuous.
export function removeWaypoint(unitId: number, legIndex: number): void {
  const u = S.units.find(u => u.id === unitId)
  if (!u || !u.legs[legIndex]) return
  if (legIndex === u.legs.length - 1) {
    const last = u.legs.pop()!
    u.path.length = Math.max(0, u.path.length - last.n)
    if (!u.path.length) { u.legs = []; u.state = 'hold' }
    netRadio(u, 'move', `WP ${legIndex + 1} DELETED`, u.x, u.y)
    return
  }
  const before = u.legs.slice(0, legIndex).reduce((n, l) => n + l.n, 0)
  const removed = u.legs[legIndex]!
  const next = u.legs[legIndex + 1]!
  const start = legIndex === 0 ? { x: u.x, y: u.y } : u.path[before - 1]!
  const bridge = findPath(S.map!, start.x, start.y, next.x, next.y, effStats(u).mob,
    roadIntent(next.x, next.y, {}))
    || [{ x: next.x, y: next.y }]
  u.path = [...u.path.slice(0, before), ...bridge, ...u.path.slice(before + removed.n + next.n)]
  u.legs.splice(legIndex, 1)
  next.n = bridge.length
  netRadio(u, 'move', `WP ${legIndex + 1} DELETED — ROUTE ADJUSTED`, u.x, u.y)
}

export function orderHold(unitId: number): void {
  const u = S.units.find(u => u.id === unitId)
  if (u) { u.path = []; u.legs = []; u.bridging = null; u.heldRoute = null; u.breaking = false; u.resumeDest = undefined; u.breakRetried = undefined; u.convoy = null; u.attackId = null; u.attackMove = false; u.groupId = null; u.colIdx = null; u.leadId = null; u.state = 'hold' }
}

export function orderMount(unitId: number, mounted: boolean): void | null {
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

// assign a logistics platoon to run continuous supply loops HQ -> FOB
export function orderConvoy(unitId: number, structId: number): void | null {
  const u = S.units.find(u => u.id === unitId)
  if (!u || u.side !== 'friend' || !UNIT_TYPES[u.type].logi) return
  const fob = S.structures.find(s => s.id === structId && s.side === 'friend' && s.kind === 'FOB')
  if (!fob) return toast('SUPPLY RUNS DELIVER TO FOBS')
  u.convoy = { fobId: fob.id, phase: 'toSource', carrying: 0, timer: 0 }
  u.heldRoute = null; u.breaking = false
  radio(u.label, 'move', `COMMENCING SUPPLY RUNS — ${fob.label}`, fob.x, fob.y)
}

// actions-on-contact battle drill: 'push' | 'halt' | 'break'
const ROE_NAMES = { push: 'PUSH THROUGH', halt: 'HALT AND ENGAGE', break: 'BREAK CONTACT' } as const
export function orderRoe(unitId: number, roe: keyof typeof ROE_NAMES): void {
  const u = S.units.find(u => u.id === unitId)
  if (!u || !ROE_NAMES[roe] || u.roe === roe) return
  u.roe = roe
  netRadio(u, 'move', `BATTLE DRILL SET — ${ROE_NAMES[roe]}`, u.x, u.y)
}

// defensive posture: unit halts and prepares positions per its type
export function orderDefend(unitId: number, on: boolean): void {
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
const WPN_NAMES = { free: 'WEAPONS FREE', tight: 'WEAPONS TIGHT — RETURN FIRE ONLY', hold: 'WEAPONS HOLD' } as const
export function orderWeapons(unitId: number, wpn: keyof typeof WPN_NAMES): void {
  const u = S.units.find(u => u.id === unitId)
  if (!u || !WPN_NAMES[wpn] || u.weapons === wpn) return
  u.weapons = wpn
  netRadio(u, 'move', WPN_NAMES[wpn], u.x, u.y)
}

const OCTS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
]

export function orderBridge(unitId: number, x: number, y: number): void | null {
  const u = S.units.find(u => u.id === unitId)
  if (!u || !UNIT_TYPES[u.type].canBridge) return
  if (Math.hypot(x - u.x, y - u.y) > 700) return toast('MOVE WITHIN 700M OF THE CROSSING')
  const m = S.map!
  const GRID = m.GRID
  const ti = m.cellAt(x, y)
  if (m.terr[ti] !== T_WATER) return toast('TARGET IS NOT A WATER GAP')
  const oct = ((Math.round(Math.atan2(y - u.y, x - u.x) / (Math.PI / 4)) % 8) + 8) % 8
  const [sx, sy] = OCTS[oct]!
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
