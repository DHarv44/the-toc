// ENGINEER ROADWORKS: an element whose platform ships a `roadworks` spec (a
// pack noun — combat engineers today, a horizontal-construction company when
// a pack ships one) can BUILD A ROAD. The commander clicks where it should
// go; the planner lays a dry, slope-averse line from the element's position
// (world/access planRoadLine — both ends junction-snap to the network), and
// the element CRAWLS it at build speed, leaving real road behind: the trail
// polyline grows vertex by vertex, each finished stretch is stamped into the
// raster and priced, and the router learns the junctions as they appear.
// Slow on purpose — route construction is an operation, not a click.
//
// Any manual order suspends the job. What is built stays built: a suspended
// road is a shorter road, exactly like real earthworks. Contact pauses the
// work (the blade stops when the shooting starts); it resumes on its own
// when things go quiet.
import { S } from '../../engine/state'
import type { Unit } from '../../engine/GameState'
import type { Vec2 } from '../../world/WorldMap'
import { R_TRACK } from '../../world/WorldMap'
import { planRoadLine, stampTrack } from '../../world/access'
import { invalidateRoadGraph } from '../../world/pack/roadGraph'
import { UNIT_TYPES } from './catalog'
import { toast, netRadio } from '../comms/radio'

const CONTACT_HOLD_S = 25   // recent fire this close in time = blade up, weapons out

export function orderBuildRoad(unitId: number, x: number, y: number): void {
  const u = S.units.find(v => v.id === unitId && v.side === 'friend')
  if (!u) return
  const spec = UNIT_TYPES[u.type]?.roadworks
  if (!spec) return void toast('ROAD BUILDING NEEDS AN ENGINEER ELEMENT')
  const m = S.map!
  const pts = planRoadLine(m, { x: u.x, y: u.y }, { x, y })
  if (!pts || pts.length < 2) return void toast('NO DRY LINE TO THERE')
  const cum: number[] = [0]
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y))
  }
  // the trail: ONE growing polyline, on the map from the first metre — the
  // same array rides S.engRoads (serialized) and map.roads (rendered/routed)
  const laid: Vec2[] = [{ x: pts[0]!.x, y: pts[0]!.y }]
  S.engRoads.push(laid)
  m.roads.push({ cls: R_TRACK, pts: laid })
  u.roadwork = { pts, cum, s: 0, v: 1, ri: S.engRoads.length - 1 }
  u.path = []
  netRadio(u, 'move',
    `${u.label} — ROADWORKS COMMENCING, ${Math.round(cum[cum.length - 1]!)} M OF NEW ROUTE`,
    u.x, u.y)
}

/** The blade, every tick: crawl the plan, drop vertices behind, stamp and
 *  re-junction the finished stretch. Movement is manual — a builder is not
 *  marching, it is WORKING its way along a line at the spec's build speed. */
export function roadworkUpdate(dt: number): void {
  const m = S.map
  if (!m) return
  for (const u of S.units) {
    const rw = u.roadwork
    if (!rw || u.strength <= 0) continue
    const spec = UNIT_TYPES[u.type]?.roadworks
    if (!spec) { delete u.roadwork; continue }
    // contact: the work pauses where it stands, and resumes when it is quiet
    if (S.t - (u.lastCombatT ?? -999) < CONTACT_HOLD_S) continue
    rw.s = Math.min(rw.cum[rw.cum.length - 1]!, rw.s + spec.speed * dt)
    const laid = S.engRoads[rw.ri]
    if (!laid) { delete u.roadwork; continue }
    // lay every plan vertex the blade has passed
    let stamped = false
    while (rw.v < rw.pts.length && rw.cum[rw.v]! <= rw.s) {
      laid.push({ x: rw.pts[rw.v]!.x, y: rw.pts[rw.v]!.y })
      stampTrack(m, laid, laid.length - 2)
      stamped = true
      rw.v++
    }
    // the router learns finished stretches as they appear (throttled: every
    // few vertices, and always at the end when the last junction closes)
    if (stamped && (rw.v % 4 === 0 || rw.v >= rw.pts.length)) invalidateRoadGraph(m)
    // the element rides the head of the works
    let seg = rw.v < rw.pts.length ? rw.v : rw.pts.length - 1
    const a = rw.pts[seg - 1]!, b = rw.pts[seg]!
    const segLen = rw.cum[seg]! - rw.cum[seg - 1]! || 1
    const t = Math.max(0, Math.min(1, (rw.s - rw.cum[seg - 1]!) / segLen))
    u.x = a.x + (b.x - a.x) * t
    u.y = a.y + (b.y - a.y) * t
    u.heading = Math.atan2(b.y - a.y, b.x - a.x)
    if (rw.s >= rw.cum[rw.cum.length - 1]!) {
      delete u.roadwork
      netRadio(u, 'arrive', `${u.label} — ROUTE COMPLETE AND OPEN TO TRAFFIC`, u.x, u.y)
    }
  }
}

/** Any manual order takes the element off the job — called by orders.ts the
 *  same way escort duty is released. The built stretch STAYS. */
export function suspendRoadwork(u: Unit): void {
  if (!u.roadwork) return
  delete u.roadwork
  netRadio(u, 'move', `${u.label} — ROADWORKS SUSPENDED, ROUTE ENDS WHERE IT ENDS`, u.x, u.y)
}
