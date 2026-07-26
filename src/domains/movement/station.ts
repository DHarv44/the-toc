// STATION KEEPING inside a unit — the vics of a platoon following their leader.
//
// Before this, a unit's elements were a rigid lattice: elemWorld rotated a
// fixed body-frame offset by the unit's heading, so a platoon was one object.
// Turn it and every vic translated on a rail, all fourteen pointing the same
// way at the same instant. The sim assigns heading outright (atan2 at the next
// waypoint, no rate limit), so a ninety-degree corner threw the trail vic three
// hundred metres sideways in a single fifty-millisecond tick.
//
// Now each vic drives. It holds an odometer along the unit's RETAINED route
// (../movement/track) and a signed offset from its centreline, and every tick
// the follow-the-leader solver gives it a speed and a slew rate to close on its
// station. The station is still ox/oy/oh — laid down by layoutElements, changed
// by orderFormation — but it is now a place the vic is DRIVING TO rather than a
// place it is welded to. A column turning a corner deforms: the trail vics run
// wide, cut back in on the driven ground, and settle.
//
// This is SIM state, not decoration. The positions it writes are what combat
// kills, what the gunner lays on, and what both the map and the feed draw —
// there is one answer and everything reads it (see elemWorld).
//
// A unit that has never moved has no route, so it has no track and keeps the
// rigid layout. That is the overwhelming majority of units for most of a match,
// and their behaviour is untouched.
import { S } from '../../engine/state'
import type { Unit, UnitElement } from '../../engine/GameState'
import type { Vec2 } from '../../world/WorldMap'
import { effStats, elemExposed, formOf, FORMATION } from '../forces/elements'
import { RouteTrack, offsetLeft, type TrackPoint } from './track'
import { followTheLeader, type Mover, type Slot } from './follow'

// How fast one hull comes round, rad/s. A tracked vehicle does not pivot; the
// solver hands out a velocity and this is what stops the drawn hull snapping to
// it. Applied here rather than in the renderer so the map and the feed agree.
const HULL_TURN = 1.1

// A unit whose position disagrees with its own track by more than this did not
// drive there — it was spawned, teleported, or unloaded off a transport. Drop
// the track and lay a fresh one.
const DESYNC = 250

// Slowest a vic may be reckoned to move because of the ground the formation put
// it on. Zero would let one element in a swamp stop the whole platoon dead.
const MOB_FLOOR = 0.25

// How much faster than the unit's pace a vic may drive to close a gap.
//
// This has to be paid for, or the formation quietly taxes every move in the
// game. The solver sets pace from the slowest mover's ceiling times paceMargin,
// so a ceiling equal to the unit's speed yields a pace BELOW it — the vics can
// never keep up, lag settles at whatever the ease ramp needs, and every unit on
// the map runs ten percent slow forever with nothing on screen to explain it.
// So the ceiling is the unit's terrain speed with headroom on top, and the
// margin is its exact reciprocal: pace comes out at the unit's real speed, a
// formed platoon asks for no correction at all, and the headroom is there for
// the vic that has to catch up.
const HEADROOM = 1.25

interface Held { track: RouteTrack; path: Vec2[]; ex: number; ey: number; seen: number }

const held = new Map<number, Held>()
let frame = 0

// --- public ----------------------------------------------------------------

// One unit's vics, one tick. Call AFTER the unit itself has moved: the vics
// station-keep on where the unit now is, and the pace they ask for is applied
// on the next tick (u.formCap). Fifty milliseconds of lag on a pace correction
// is invisible; the alternative is solving the formation before knowing where
// the unit went.
export function stationUpdate(u: Unit, dt: number): void {
  let rec = held.get(u.id)

  if (!rec) {
    if (!u.path.length) {
      // No route and no record. Either it has never moved — rigid layout,
      // nothing to do — or it carries resolved poses whose track is gone (a
      // reload), in which case leaving them set would freeze its vics wherever
      // they were when the track was lost.
      if (u.elements.some(el => el.wx !== undefined)) release(u)
      return
    }
    rec = lay(u)
  } else {
    rec.seen = frame
    const last = u.path[u.path.length - 1]
    if (last && (rec.path !== u.path || last.x !== rec.ex || last.y !== rec.ey)) {
      // re-tasked: the route ahead changes, the ground behind is kept, and the
      // odometer frame survives — so nobody's station moves
      rec.track.retarget(u.odo, u.x, u.y, u.path)
      rec.path = u.path; rec.ex = last.x; rec.ey = last.y
    } else if (!last) {
      rec.path = u.path
    }
    const p = rec.track.sample(u.odo)
    if (Math.hypot(p.x - u.x, p.y - u.y) > DESYNC) {
      release(u)
      if (!u.path.length) return
      rec = lay(u)
    }
  }

  rec.track.prune(u.odo)
  solve(u, rec.track, dt)
}

// Hand a unit back to the rigid layout: forget its route and clear the resolved
// poses, so elemWorld falls back to the body-frame transform.
export function release(u: Unit): void {
  held.delete(u.id)
  for (const el of u.elements) {
    el.dist = undefined; el.lat = undefined; el.spd = undefined
    el.wx = undefined; el.wy = undefined; el.wh = undefined
  }
  u.formHold = undefined
  u.formCap = undefined
}

// Once per tick, after every unit has been updated. Units die and are spliced
// out of S.units without telling anyone; their routes would otherwise sit here
// forever.
export function stationSweep(): void {
  frame++
  if (frame % 600 !== 0) return
  for (const [id, rec] of held) if (frame - rec.seen > 600) held.delete(id)
}

// --- internals -------------------------------------------------------------

// Lay a fresh track under a unit and put its elements onto it exactly where
// they already are. Seeding from the CURRENT rigid positions rather than from
// the slot table is what makes this lurch-free: behind the unit the track is
// the straight backward extension of its first segment, so projecting onto it
// and reconstructing is exact, and no vic moves on the tick the track appears —
// even when the unit is facing one way and its new route heads another.
function lay(u: Unit): Held {
  const track = new RouteTrack(u.odo, u.x, u.y, u.path)
  const p = track.sample(u.odo)
  const s = Math.sin(u.heading), c = Math.cos(u.heading)
  for (const el of u.elements) {
    const wx = u.x + c * el.ox - s * el.oy
    const wy = u.y + s * el.ox + c * el.oy
    const rx = wx - p.x, ry = wy - p.y
    el.dist = u.odo + rx * p.tx + ry * p.ty
    el.lat = -rx * p.ty + ry * p.tx
    el.spd = 0
    el.wx = wx; el.wy = wy
    el.wh = u.heading + (el.oh ?? 0)
  }
  const last = u.path[u.path.length - 1]
  const rec: Held = {
    track, path: u.path, ex: last ? last.x : u.x, ey: last ? last.y : u.y, seen: frame,
  }
  held.set(u.id, rec)
  return rec
}

const tmp: TrackPoint = { x: 0, y: 0, tx: 1, ty: 0 }

function solve(u: Unit, track: RouteTrack, dt: number): void {
  const st = effStats(u)
  const els = u.elements
  const n = els.length
  if (!n) return

  // Terrain the FORMATION chose to put a vic on is the solver's problem, so it
  // is priced here and handed in as mobility. Terrain the vic merely finds
  // itself in — mud on the route everyone is taking — is not, and stays in the
  // unit's own speed where the lag loop reacts to it. Model the cost you cause.
  const base = S.map!.moveFactor(u.x, u.y, st.mob)
  const baseF = isFinite(base) ? base : 3
  const ceiling = (st.speed / baseF) * HEADROOM
  const mob = new Map<number, number>()

  const movers: Mover[] = new Array(n + 1)
  const slots: Slot[] = new Array(n + 1)
  // Index 0 is the UNIT itself — a virtual mover at the formation's origin.
  // Not element 0: the unit keeps moving when its commander's vic is destroyed,
  // and the position everything else is measured from has to survive that.
  movers[0] = { id: -1, dist: u.odo, spd: u._spd, maxSpd: ceiling, lat: 0 }
  slots[0] = { along: 0, lat: 0, face: 0 }

  for (let i = 0; i < n; i++) {
    const el = els[i]!
    const exposed = el.alive && elemExposed(u, el)
    const p = track.sample(el.dist ?? u.odo, tmp)
    const w = offsetLeft(p, el.lat ?? 0)
    const f = S.map!.moveFactor(w.x, w.y, st.mob)
    const m = Math.max(MOB_FLOOR, Math.min(1, baseF / (isFinite(f) ? f : 3)))
    mob.set(i, m)
    movers[i + 1] = {
      id: i,
      dist: el.dist ?? u.odo,
      spd: el.spd ?? 0,
      maxSpd: ceiling,
      lat: el.lat ?? 0,
      out: !exposed,
    }
    slots[i + 1] = { along: el.ox, lat: el.oy, face: el.oh ?? 0 }
  }

  const halt = FORMATION[formOf(u)].halt === true
  const r = followTheLeader({
    movers, slots, dt, halt, holding: u.formHold,
    opts: {
      paceMargin: 1 / HEADROOM,   // exact reciprocal — see HEADROOM
      mobility: mv => (mv.id < 0 ? 1 : mob.get(mv.id) ?? 1),
    },
  })
  u.formHold = r.holding
  // What the formation is asking the unit to do about the tail. A halt posture
  // asks for zero, which is the honest reading of it: a unit told to coil goes
  // into the coil where it is standing.
  u.formCap = r.group.pace > 0 ? Math.min(1, r.group.leaderTarget / r.group.pace) : 1

  for (let i = 0; i < n; i++) {
    const el = els[i]!
    const o = r.orders[i + 1]
    const p = track.sample(el.dist ?? u.odo, tmp)
    if (!o) {
      // not in the solve — a dead vic, or a carrier's hulls while its squads are
      // on the ground. Keep it parked on its station so it is in place the
      // moment it comes back.
      el.dist = u.odo + el.ox
      el.lat = el.oy
      el.spd = 0
      resolve(el, track.sample(el.dist, tmp), Math.atan2(tmp.ty, tmp.tx) + (el.oh ?? 0), dt, true)
      continue
    }
    el.spd = o.spd
    el.dist = (el.dist ?? u.odo) + o.spd * dt
    el.lat = (el.lat ?? 0) + o.latSpd * dt
    // Hull points where the vic is actually going — tangent and slew composed,
    // which is what makes a trail vic swing wide through a corner and cut back
    // in. Below a walking pace there is no track to read, so it comes round to
    // the facing its formation wants instead: how a unit dropping into a coil
    // or a herringbone turns its guns outward without going anywhere.
    const vx = p.tx * o.spd - p.ty * o.latSpd
    const vy = p.ty * o.spd + p.tx * o.latSpd
    const want = Math.hypot(vx, vy) > 0.6
      ? Math.atan2(vy, vx)
      : Math.atan2(p.ty, p.tx) + o.face
    resolve(el, track.sample(el.dist, tmp), want, dt, false)
  }
}

// Place the element and bring its hull round toward `want` at a plausible rate.
function resolve(el: UnitElement, p: TrackPoint, want: number, dt: number, snap: boolean): void {
  const w = offsetLeft(p, el.lat ?? 0)
  el.wx = w.x; el.wy = w.y
  if (snap || el.wh === undefined) { el.wh = want; return }
  const d = Math.atan2(Math.sin(want - el.wh), Math.cos(want - el.wh))
  const lim = HULL_TURN * dt
  el.wh += Math.max(-lim, Math.min(lim, d))
}
