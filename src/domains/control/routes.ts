// NAMED ROUTES — MSRs the battalion OWNS.
//
// A route here is not what the pathfinder happened to produce for one order —
// it is a piece of INFRASTRUCTURE the commander commissioned, the engineers
// proofed, and the convoys trust. Three facts make it a game:
//
//   COMMISSIONED, NOT DRAWN. The player drags start to end and the ROUTER
//   solves it along the real roads (convoy doctrine profile). You approve a
//   solved route; you never freehand one. That keeps every MSR honest to the
//   ground and identical to what a truck would actually drive.
//
//   RED UNTIL PROOFED. Commissioning a route off the map does not make it
//   safe — it opens RED, and an engineer element (UnitType.eod, a pack noun)
//   has to WALK it, sweeping as it goes, before it reads GREEN. Anything that
//   goes off on a green route flips it RED again. The status is the whole
//   readout: a TOC talks about its MSRs in exactly these colours.
//
//   CONVOYS BELIEVE IT. A supply run whose two ends sit on a commissioned
//   route follows the route's exact polyline, every run — predictable friendly
//   traffic is what makes route security mean something. And a convoy does NOT
//   run a red route: it holds at its base and says so, which is the pressure
//   that makes the engineer worth dispatching.
//
// Engine verbs only, pack nouns only: the route object, the follow/hold rules
// and the sweep verb live here; WHO can sweep and how wide is the platform's
// `eod` spec, and the name pool is US flavour that moves pack-side with the
// radio-culture audit (#28).
import { S } from '../../engine/state'
import type { NamedRoute, Unit } from '../../engine/GameState'
import type { Vec2 } from '../../world/WorldMap'
import { findPath } from '../../world/pathfinding'
import { UNIT_TYPES } from '../forces/catalog'
import { effStats } from '../forces/elements'
import { radio, toast } from '../comms/radio'

// The classic US MSR names. Engine-side for now like the phase-line colours;
// both belong to the pack's radio culture eventually (#28).
const MSR_NAMES = [
  'TAMPA', 'IRISH', 'JACKSON', 'SANTA FE', 'BISMARCK', 'PLUTO', 'DODGE',
  'GOLDEN', 'LONG ISLAND', 'MICHIGAN',
]

export const msrLabel = (r: NamedRoute): string => `MSR ${r.name}`

/** COMMISSION a route: solve start → end along the real roads and put it on
 *  the sheet, RED. Null when the router can find no way (off-network ends). */
export function commissionRoute(a: Vec2, b: Vec2): NamedRoute | null {
  if (!S.map) return null
  const pts = findPath(S.map, a.x, a.y, b.x, b.y, 'wheeled', 'convoy')
  if (!pts || pts.length < 2) return null
  const used = new Set(S.msrs.map(r => r.name))
  const name = MSR_NAMES.find(n => !used.has(n)) ?? `ROUTE ${S.msrs.length + 1}`
  const r: NamedRoute = { id: S.counters.nextId++, name, pts, status: 'red' }
  S.msrs.push(r)
  radio('NET CONTROL', 'move',
    `${msrLabel(r)} COMMISSIONED — ROUTE IS RED UNTIL PROOFED`, a.x, a.y)
  return r
}

export function removeMsr(id: number): void {
  const i = S.msrs.findIndex(r => r.id === id)
  if (i >= 0) S.msrs.splice(i, 1)
}

/** Perpendicular distance from a point to the route's polyline. */
export function distToMsr(r: NamedRoute, x: number, y: number): number {
  let best = Infinity
  for (let i = 1; i < r.pts.length; i++) {
    const a = r.pts[i - 1]!, b = r.pts[i]!
    const dx = b.x - a.x, dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    let t = len2 > 0 ? ((x - a.x) * dx + (y - a.y) * dy) / len2 : 0
    t = t < 0 ? 0 : t > 1 ? 1 : t
    best = Math.min(best, Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t)))
  }
  return best
}

/** Something went off at (x,y): any GREEN route it sits on goes RED, and the
 *  net hears it. Called from the hazard strike — the ground event, not the
 *  intel assessment. */
export function routeStruck(x: number, y: number, what: string): void {
  for (const r of S.msrs) {
    if (r.status !== 'green' || distToMsr(r, x, y) > 80) continue
    r.status = 'red'
    radio('NET CONTROL', 'damage',
      `${msrLabel(r)} IS RED — ${what.toUpperCase()} STRIKE ON THE ROUTE`, x, y)
  }
}

/** The commissioned route between these two points, if one exists — both ends
 *  within `snap` of the route's own ends, either orientation. This is how a
 *  convoy leg finds "its" MSR without anyone filling in a form. */
export function msrBetween(a: Vec2, b: Vec2, snap = 400): NamedRoute | null {
  for (const r of S.msrs) {
    const p = r.pts[0]!, q = r.pts[r.pts.length - 1]!
    const fwd = Math.hypot(p.x - a.x, p.y - a.y) < snap && Math.hypot(q.x - b.x, q.y - b.y) < snap
    const rev = Math.hypot(q.x - a.x, q.y - a.y) < snap && Math.hypot(p.x - b.x, p.y - b.y) < snap
    if (fwd || rev) return r
  }
  return null
}

/** The route's polyline oriented to END nearest `dest`, with a road connector
 *  from the unit's position onto the entry when it is standing off it. */
export function msrPathTo(u: Unit, r: NamedRoute, dest: Vec2): Vec2[] {
  const p = r.pts[0]!, q = r.pts[r.pts.length - 1]!
  const pts = Math.hypot(q.x - dest.x, q.y - dest.y) <= Math.hypot(p.x - dest.x, p.y - dest.y)
    ? r.pts.slice() : r.pts.slice().reverse()
  const entry = pts[0]!
  if (Math.hypot(u.x - entry.x, u.y - entry.y) > 60 && S.map) {
    const conn = findPath(S.map, u.x, u.y, entry.x, entry.y, effStats(u).mob, 'convoy')
    if (conn) return [...conn, ...pts]
  }
  return pts
}

// --- route clearance ---------------------------------------------------------

/** Send an eod-capable element to sweep a route end-to-end. Enters at the
 *  nearer end, walks the full polyline; routeClearUpdate does the sweeping and
 *  calls it proofed at the far end. */
export function orderClearRoute(unitId: number, msrId: number): void | null {
  const u = S.units.find(x => x.id === unitId)
  const r = S.msrs.find(x => x.id === msrId)
  if (!u || !r) return
  if (!UNIT_TYPES[u.type]?.eod) return toast('ROUTE CLEARANCE NEEDS AN ENGINEER ELEMENT')
  const p = r.pts[0]!, q = r.pts[r.pts.length - 1]!
  const fromStart = Math.hypot(u.x - p.x, u.y - p.y) <= Math.hypot(u.x - q.x, u.y - q.y)
  const pts = fromStart ? r.pts.slice() : r.pts.slice().reverse()
  const entry = pts[0]!, far = pts[pts.length - 1]!
  let path: Vec2[] = pts
  if (Math.hypot(u.x - entry.x, u.y - entry.y) > 60 && S.map) {
    const conn = findPath(S.map, u.x, u.y, entry.x, entry.y, effStats(u).mob, 'fastest')
    if (conn) path = [...conn, ...pts]
  }
  // a clearance order is a movement order: same clean slate orderMove gives
  u.path = path
  u.legs = [{ x: far.x, y: far.y, n: path.length }]
  u.heldRoute = null; u.breaking = false; u.resumeDest = undefined
  u.convoy = null; u.attackId = null; u.attackMove = false
  u.groupId = null; u.colIdx = null; u.leadId = null; u.colS = undefined
  u.state = 'moving'
  u.clearing = r.id
  radio(u.label, 'move', `COMMENCING ROUTE CLEARANCE — ${msrLabel(r)}`, u.x, u.y)
}

/** The sweep, in the tick: a clearing element neutralizes armed hazards inside
 *  its eod radius as it drives, and the route goes GREEN when it reaches the
 *  far end with the polyline behind it. Runs BEFORE hazardUpdate so a charge
 *  inside the sweep radius is disarmed before it can be driven over. */
export function routeClearUpdate(): void {
  for (const u of S.units) {
    if (u.clearing == null) continue
    const r = S.msrs.find(m => m.id === u.clearing)
    const spec = UNIT_TYPES[u.type]?.eod
    if (!r || !spec || u.strength <= 0) { u.clearing = undefined; continue }
    for (let i = S.hazards.length - 1; i >= 0; i--) {
      const h = S.hazards[i]!
      if (!h.armed || h.side === u.side) continue
      if (Math.hypot(h.x - u.x, h.y - u.y) > spec.radius) continue
      S.hazards.splice(i, 1)
      radio(u.label, 'move', `${h.kind.toUpperCase()} FOUND AND NEUTRALIZED — ${msrLabel(r)}`, h.x, h.y)
    }
    if (u.path.length || u.breaking) continue
    // path spent: at the far end this is a proofed route; anywhere else the
    // clearance was overridden by another order
    const p = r.pts[0]!, q = r.pts[r.pts.length - 1]!
    const atEnd = Math.hypot(u.x - p.x, u.y - p.y) < 150 || Math.hypot(u.x - q.x, u.y - q.y) < 150
    u.clearing = undefined
    if (atEnd) {
      r.status = 'green'
      radio(u.label, 'move', `${msrLabel(r)} IS GREEN — ROUTE PROOFED END TO END`, u.x, u.y)
    } else {
      radio(u.label, 'move', `ROUTE CLEARANCE ABORTED — ${msrLabel(r)} REMAINS ${r.status.toUpperCase()}`, u.x, u.y)
    }
  }
}
