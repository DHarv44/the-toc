// Ground-unit orders: movement, columns, posture, drills. Ported verbatim from
// src/game/sim.js. These are the ONLY mutations the UI and the enemy AI are
// allowed to make on units — the AI is a commander issuing player-legal orders.
import { S } from '../../engine/state'
import type { Formation, Unit } from '../../engine/GameState'
import { findPath } from '../../world/pathfinding'
import { T_WATER } from '../../world/WorldMap'
import { clampWorld } from '../../world/place'
import { grid } from '../../lib/format'
import { locRef } from '../../world/ref'
import { UNIT_TYPES } from './catalog'
import { effStats, formOf, layoutElements, FORMATION } from './elements'
import { liftFactor } from './loadplan'
import { teamOf } from './teams'
import { marchPlan, setMarchOrder } from '../movement/march'
import { setRoute } from '../movement/route'
import { deriveElements } from './casualties'
import { netRadio, radio, toast } from '../comms/radio'

export const COLUMN_GAP = 65     // metres a follower holds behind the vic ahead of it
export const STRAGGLE_GAP = 190  // metres before the column stops and waits for its tail

// allocate a shared movement-group id so co-issued units hold to the slowest pace
export function newMoveGroup(): number { return S.counters.groupSeq++ }

/** The gid a set of units should march under: their team's, when they are all
 *  of one team, otherwise none. A scratch grouping — three platoons box-selected
 *  and sent somewhere — is still a scratch grouping and gets a scratch id. */
function groupGid(units: Unit[]): number | null {
  const t = teamOf(units[0]!)
  if (!t) return null
  return units.every(u => t.members.includes(u.id)) ? t.id : null
}

// A carrier that AUTO-dismounted in contact climbs back in when re-tasked out of
// contact, so the convoy travels mounted instead of crawling on foot. A unit the
// player MANUALLY dismounted has autoDismounted=false and stays dismounted until
// the player mounts it again. Call before pathing so it routes with vehicle mobility.
function autoRemount(u: Unit): void {
  if (u.autoDismounted && !u.targetId && !u.mounted && UNIT_TYPES[u.type].carrier) {
    u.mounted = true
    u.autoDismounted = false
    deriveElements(u)
    netRadio(u, 'move', 'REMOUNTING', u.x, u.y)
  }
}


// Read the player's routing intent from where they clicked. Dropping the pin on a road
// means "use the network" — hold the roads the whole way. Dropping it out in the open
// means they want that spot, so go direct rather than detouring along a road that
// happens to be cheaper. Callers that already know what they want (the enemy AI's
// cross-country moves, an explicit roads-only order) are left alone.

// Move a formation as a column behind one lead vic.
//
// The leader paths once and everyone shares that route, so the column follows
// the same road, the same bridge, the same gap in the treeline. Members hold
// station by trailing along it rather than by steering. The leader is the most
// constrained member (slowest real speed over its own terrain).
export function orderGroupMove(
  unitIds: number[], x: number, y: number,
  append = false, attack = false,
): number | null {
  const units = unitIds
    .map(id => S.units.find(u => u.id === id))
    .filter((u): u is Unit => !!u && u.strength > 0)
  if (!units.length) return null
  if (units.length === 1) { orderMove(units[0]!.id, x, y, append, attack, null); return null }
  // A TEAM MARCHES UNDER ITS OWN ID. Minting a fresh gid for a grouping that
  // already exists is what used to throw its order of march away every time it
  // was given a new destination — the plan is keyed on the gid (movement/march)
  // and the gid changed. A named task organization has one for life.
  const own = groupGid(units)
  // Appending keeps each unit's own multi-leg waypoint queue — a shared column route
  // collapses the legs into one, which would renumber the player's waypoints out from
  // under them. Columns form on a fresh order.
  if (append) {
    const gid = own ?? newMoveGroup()
    for (const u of units) orderMove(u.id, x, y, true, attack, gid)
    return gid
  }

  let lead = units[0]!, leadSpd = Infinity
  for (const u of units) {
    const st = effStats(u)
    const f = S.map!.moveFactor(u.x, u.y, st.mob)
    // a platoon that has lost its lift IS the slowest — it should be found so
    // here, and lead, rather than be discovered trailing a kilometre back
    const real = (st.speed * liftFactor(u)) / (isFinite(f) ? f : 3)
    if (real < leadSpd) { leadSpd = real; lead = u }
  }

  const gid = own ?? newMoveGroup()
  orderMove(lead.id, x, y, append, attack, gid)
  if (!lead.path.length) return null   // route refused — don't strand the followers

  // ONE ROUTE. The whole column drives the same polyline from the same start
  // point, and every member's place on it is measured against that one curve
  // (domains/movement/route). Members used to splice their own leg onto
  // whichever part of the route was nearest, which cut corners for the
  // individual and destroyed the shared coordinate the solver needs.
  const route = lead.path.map(p => ({ x: p.x, y: p.y }))
  // WHERE A MEMBER GETS ON, AND IT IS NEVER AHEAD OF THE LEAD.
  //
  // Joining at the nearest point of the route is efficient for the individual
  // and ruinous for the column: on a 1.3 km route four platoons a few hundred
  // metres apart entered at arc 0, 83, 266 and 572, so the march started with
  // the order of march already 570 m out of true. The slot table says everyone
  // is BEHIND the leader (`along: -i * gap`), and a member that starts ahead of
  // its slot can only obey by stopping and waiting for the column to catch up —
  // which is exactly what it looked like: a platoon racing off, halting, and
  // sitting there while the rest closed.
  //
  // So the join is clamped to the leader's own position on the route. At the
  // moment an order is given that is the start point, which is what a start
  // point is for; re-issued mid-march it is wherever the head of the column has
  // got to, which is equally right.
  // WHERE A MEMBER GETS ON: the nearest point of the route.
  //
  // Sending everyone back to one start point is doctrinally tidy and wrong
  // here. On ground where a route can run five times the straight line, the
  // leg back to the SP is itself a detour — a platoon parked beside the road
  // ends up driving away from the column to join it, stays off the axis the
  // whole march, and is therefore never in the column at all.
  //
  // The reason the nearest-point join used to scramble the order was never the
  // join. It was that the order of march was declared independently of where
  // the elements were standing, so the two disagreed and the column spent the
  // march reconciling them. The order is read off road position now, so they
  // agree by construction.
  const joinAt = (u: Unit): number => {
    let best = 0, bestD = Infinity
    for (let k = 0; k < route.length; k++) {
      const d = Math.hypot(route[k]!.x - u.x, route[k]!.y - u.y)
      if (d < bestD) { bestD = d; best = k }
    }
    return best
  }

  // THE ORDER OF MARCH — settled ONCE, here, and not re-derived every tick
  // afterwards. That last part is the whole fix: re-sorting by whoever was
  // furthest along, every frame, is how the designated lead lost the front of
  // its own column.
  //
  // An AUTHORED order is obeyed and the column pays whatever reshuffling costs.
  // An unauthored one is taken from where the elements are actually standing on
  // the route, because that is how a real order of march is written — you do
  // not tell the platoon at the back of the assembly area to lead and expect
  // the other three to let it past.
  const plan = marchPlan(gid)
  const ordered = plan?.authored
    ? [...units].sort((a, b) => rankIn(plan.order, a.id) - rankIn(plan.order, b.id))
    : [...units].sort((a, b) => alongOn(route, b) - alongOn(route, a))

  ordered.forEach((u, i) => {
    u.colIdx = i
    u.leadId = ordered[0]!.id
    if (u.id !== lead.id) {
      autoRemount(u)
      u.bridging = null; u.heldRoute = null; u.breaking = false
      u.convoy = null; u.attackId = null; u.attackMove = attack
      u.groupId = gid
      const mob = effStats(u).mob
      const k = joinAt(u)
      const entry = route[k]!
      const join = findPath(S.map!, u.x, u.y, entry.x, entry.y, mob)
      u.path = (join || [{ x: entry.x, y: entry.y }]).concat(route.slice(k + 1))
      u.legs = [{ x, y, n: u.path.length }]
      u.state = 'moving'
      u.posture = 'mobile'
    }
    // Seed the odometer where this member will actually get on, so the first
    // solve does not have to find it from a cold start — the tracker searches
    // forward from the last reading and a wrong seed sticks.
    u.colS = undefined
  })
  const r = setRoute(gid, route, ordered.map(u => u.id))
  // the board shows the sequence the column is actually marching in, authored
  // or not — an order of march you cannot see is not an order of march
  setMarchOrder(gid, r.order, plan?.column ?? 'open', {
    ...(plan?.roe ? { roe: plan.roe } : {}),
    ...(plan?.weapons ? { weapons: plan.weapons } : {}),
    ...(plan?.disabled ? { disabled: plan.disabled } : {}),
    ...(plan?.authored ? { authored: true } : {}),
  })
  netRadio(ordered[0]!, 'move', `FORMATION MOVING — ${units.length} ELEMENTS, GRID ${grid(x, y)}`, x, y)
  return gid
}

const rankIn = (order: number[], id: number): number => {
  const i = order.indexOf(id)
  return i < 0 ? Infinity : i
}

/** How far along a candidate route this unit already is — used once, at issue,
 *  to read the order the elements are staged in. */
function alongOn(route: { x: number; y: number }[], u: Unit): number {
  let best = 0, bestD = Infinity, run = 0
  for (let k = 0; k < route.length - 1; k++) {
    const a = route[k]!, b = route[k + 1]!
    const dx = b.x - a.x, dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    const len = Math.sqrt(len2)
    if (len2 > 0) {
      let t = ((u.x - a.x) * dx + (u.y - a.y) * dy) / len2
      t = t < 0 ? 0 : t > 1 ? 1 : t
      const d = Math.hypot(u.x - (a.x + dx * t), u.y - (a.y + dy * t))
      if (d < bestD) { bestD = d; best = run + len * t }
    }
    run += len
  }
  return best
}

export function orderMove(
  unitId: number, x: number, y: number,
  append = false, attack = false, groupId: number | null = null,
): void {
  const u = S.units.find(u => u.id === unitId)
  if (!u) return
  autoRemount(u)
  x = clampWorld(S.map, x); y = clampWorld(S.map, y)
  const from = (append && u.path.length) ? u.path[u.path.length - 1]! : u
  const mob = effStats(u).mob
  const p = findPath(S.map!, from.x, from.y, x, y, mob)
  // only surface the toast for player-issued orders; the enemy AI re-drives idle
  // units every tick, so an unreachable hostile objective would spam it forever
  if (!p) { if (u.side === 'friend') toast('ROUTE IMPASSABLE'); return }
  u.bridging = null
  u.heldRoute = null
  u.breaking = false
  u.resumeDest = undefined; u.breakRetried = undefined; u.coverSought = undefined // fresh order supersedes any break-resume
  // don't clear autoDismounted here — autoRemount() already remounted it if it was
  // clear of contact; if it's still in contact the flag must survive so it climbs
  // back in once the fight is over (see the auto-remount drill in the tick)
  u.convoy = null
  u.attackId = null
  u.attackMove = attack
  u.rtgBase = null // a fresh order supersedes a return-to-garrison in progress
  // a unit given its own order drops out of any column it was marching in
  if (!append) { u.groupId = groupId; u.colIdx = null; u.leadId = null; u.colS = undefined }
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
  u.resumeDest = undefined; u.breakRetried = undefined; u.coverSought = undefined
  u.convoy = null // autoDismounted survives (see autoRemount / the remount drill)
  u.rtgBase = null
  u.groupId = groupId
  u.attackId = enemyId
  u.attackMove = true
  u.attackRepathT = 8
  u.path = p
  u.legs = [{ x: e.x, y: e.y, n: p.length }]
  u.state = 'moving'
  netRadio(u, 'contact', `ATTACKING ${UNIT_TYPES[e.type].name.toUpperCase()} — ${locRef(S.map!, e.x, e.y)}`, e.x, e.y)
}

export function removeLastWaypoint(unitId: number): void {
  const u = S.units.find(u => u.id === unitId)
  if (!u || !u.legs || !u.legs.length) return
  const last = u.legs.pop()!
  u.path.length = Math.max(0, u.path.length - last.n)
  if (!u.path.length) { u.legs = []; u.state = 'hold' }
}

// Re-point a unit's final leg to (x, y), re-pathing just that segment (silent —
// no radio). Used to collapse a group's terminal fan to a common transit point
// when a new waypoint is appended, so the spread lives only at the last leg
// instead of freezing into a kink mid-route.
export function convergeLastLeg(unitId: number, x: number, y: number): void {
  const u = S.units.find(u => u.id === unitId)
  if (!u || !u.legs || !u.legs.length) return
  x = clampWorld(S.map, x); y = clampWorld(S.map, y)
  const last = u.legs[u.legs.length - 1]!
  // start of the last leg = the path point just before its segment, else the unit
  const before = u.path.length - last.n - 1
  const start = before >= 0 ? u.path[before]! : { x: u.x, y: u.y }
  const p = findPath(S.map!, start.x, start.y, x, y, effStats(u).mob)
  if (!p) return
  u.path.length = u.path.length - last.n
  u.path = u.path.concat(p)
  u.legs[u.legs.length - 1] = { x, y, n: p.length }
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
  const bridge = findPath(S.map!, start.x, start.y, next.x, next.y, effStats(u).mob)
    || [{ x: next.x, y: next.y }]
  u.path = [...u.path.slice(0, before), ...bridge, ...u.path.slice(before + removed.n + next.n)]
  u.legs.splice(legIndex, 1)
  next.n = bridge.length
  netRadio(u, 'move', `WP ${legIndex + 1} DELETED — ROUTE ADJUSTED`, u.x, u.y)
}

export function orderHold(unitId: number): void {
  const u = S.units.find(u => u.id === unitId)
  if (u) { u.path = []; u.legs = []; u.bridging = null; u.heldRoute = null; u.breaking = false; u.resumeDest = undefined; u.breakRetried = undefined; u.coverSought = undefined; u.convoy = null; u.attackId = null; u.attackMove = false; u.groupId = null; u.colIdx = null; u.leadId = null; u.colS = undefined; u.state = 'hold' }
}

export function orderMount(unitId: number, mounted: boolean): void | null {
  const u = S.units.find(u => u.id === unitId)
  if (!u || !UNIT_TYPES[u.type].carrier) return
  if (u.mounted === mounted) return
  if (mounted && u.targetId) return toast(u.label + ' — CANNOT MOUNT UNDER FIRE')
  u.mounted = mounted
  u.autoDismounted = false // manual posture change overrides the drill
  deriveElements(u)        // the newly-exposed set reflects the roster
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

// Movement formation. Purely how the unit arranges itself on the ground — it
// does not change where the unit is or where it is going, so it is legal at any
// time, moving or halted, and takes effect as the vics drive to their new
// stations. Reported on the net because a formation change is a command
// decision the TOC would hear called.
export function orderFormation(unitId: number, form: Formation): void {
  const u = S.units.find(u => u.id === unitId)
  if (!u || formOf(u) === form) return
  u.formation = form
  layoutElements(u)
  netRadio(u, 'move', `FORMATION ${FORMATION[form].label}`, u.x, u.y)
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
