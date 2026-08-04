// THE COLUMN'S SHARED ROUTE — the one path the station-keeping solver measures
// everybody against.
//
// ./follow is written to a contract, and the first line of it is that
// `distance` is a monotonic odometer along A path. Singular. What was here
// before gave every member its OWN path — a bespoke leg spliced onto whatever
// suffix of the lead's route happened to be nearest — and substituted "distance
// still to go" for the odometer. That looks equivalent and is not:
//
//   - members carry different amounts of the route, so two of them standing
//     side by side can read a kilometre apart;
//   - any repath (contact, break, resume, an individual order, a bridge) swaps
//     the curve underneath a member and teleports its reading;
//   - and nothing is monotonic across a swap.
//
// The lag those errors produce is indistinguishable from a real straggler, so
// the column stopped for phantoms and ignored genuine ones. The order of march
// was then re-derived every tick from those same readings, which is how the
// lead stopped being the lead.
//
// So the GROUP owns the polyline. A member's position on it is a real arc
// length, found by projection and tracked forward, and everything the solver
// needs — lag, sequence, spread — is arithmetic on one axis again.
import { S } from '../../engine/state'
import type { ColumnRoute, Unit } from '../../engine/GameState'
import type { Vec2 } from '../../world/WorldMap'

export const routeOf = (gid: number | null): ColumnRoute | undefined =>
  gid == null ? undefined : S.routes.find(r => r.gid === gid)

/** Lay the route a column will march on, and fix its order of march. */
export function setRoute(gid: number, pts: Vec2[], order: number[]): ColumnRoute {
  const cum: number[] = new Array(pts.length)
  let d = 0
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) d += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y)
    cum[i] = d
  }
  const r: ColumnRoute = { gid, pts: pts.map(p => ({ x: p.x, y: p.y })), cum, order: [...order] }
  const i = S.routes.findIndex(x => x.gid === gid)
  if (i >= 0) S.routes[i] = r
  else S.routes.push(r)
  return r
}

export function clearRoute(gid: number): void {
  const i = S.routes.findIndex(r => r.gid === gid)
  if (i >= 0) S.routes.splice(i, 1)
}

/** Total length of the march. */
export const routeLength = (r: ColumnRoute): number => r.cum[r.cum.length - 1] ?? 0

// How far either side of a member's last known position to look when
// re-projecting. Wide enough to absorb a fast platoon's tick, narrow enough
// that a route doubling back on itself cannot snap it onto the far leg — which
// is the failure mode a naive nearest-point search has on exactly the kind of
// looping route this map produces.
const SEARCH = 400
// past this far off the tracked position, assume the reading is stale rather
// than the unit being that far off the road, and search the whole route again
const REACQUIRE = 500

/** WHERE THIS MEMBER IS ON THE COLUMN'S ROUTE, in metres from the start point.
 *
 *  Tracked forward from its last reading rather than searched globally, so it
 *  stays monotonic over a route that crosses itself. A member that has not been
 *  on the route before is placed by a full search, once. */
export function alongRoute(u: Unit, r: ColumnRoute): number {
  const n = r.pts.length
  if (n < 2) return 0
  if (u.colS == null) return scan(u, r, 0, n - 2).s      // cold: place it once
  const lo = idxAt(r, u.colS - SEARCH)
  const hi = Math.min(n - 2, idxAt(r, u.colS + SEARCH))
  const near = scan(u, r, lo, hi)
  // RE-ACQUIRE IF THE WINDOW HAS LOST IT. A unit that broke contact, was
  // re-tasked and came back, or was shoved off the axis can end up nowhere near
  // where it was last seen; without this its reading sticks at a stale arc
  // length forever and the column solves against a ghost.
  if (near.d > REACQUIRE) return scan(u, r, 0, n - 2).s
  return near.s
}

function scan(u: Unit, r: ColumnRoute, lo: number, hi: number): { s: number; d: number } {
  let bestS = u.colS ?? 0, bestD = Infinity
  for (let i = lo; i <= hi; i++) {
    const a = r.pts[i]!, b = r.pts[i + 1]!
    const dx = b.x - a.x, dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    if (len2 <= 0) continue
    // parametric projection onto the segment, clamped to it
    let t = ((u.x - a.x) * dx + (u.y - a.y) * dy) / len2
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const d = Math.hypot(u.x - (a.x + dx * t), u.y - (a.y + dy * t))
    if (d < bestD) { bestD = d; bestS = r.cum[i]! + Math.sqrt(len2) * t }
  }
  return { s: bestS, d: bestD }
}

/** First segment index at or before a given arc length. */
function idxAt(r: ColumnRoute, s: number): number {
  const cum = r.cum
  let lo = 0, hi = cum.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (cum[mid]! <= s) lo = mid
    else hi = mid - 1
  }
  return Math.max(0, Math.min(cum.length - 2, lo))
}

/** How far this member is from the route it is supposed to be marching on.
 *  A member that has not made the start point yet is a long way off it, and
 *  that is the honest test of whether it is in the column or still forming up —
 *  better than counting path points, which says nothing about where it IS. */
export function offRoute(u: Unit, r: ColumnRoute, s: number): number {
  const i = idxAt(r, s)
  const a = r.pts[i]!, b = r.pts[i + 1] ?? a
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 <= 0) return Math.hypot(u.x - a.x, u.y - a.y)
  let t = ((u.x - a.x) * dx + (u.y - a.y) * dy) / len2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(u.x - (a.x + dx * t), u.y - (a.y + dy * t))
}

/** Drop routes whose group has gone. */
export function routeSweep(live: Set<number>): void {
  for (let i = S.routes.length - 1; i >= 0; i--) {
    const gid = S.routes[i]!.gid
    if (live.has(gid) || S.teams.some(t => t.id === gid)) continue
    S.routes.splice(i, 1)
  }
}
