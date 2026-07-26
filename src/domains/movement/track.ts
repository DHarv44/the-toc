// A RETAINED route.
//
// The sim's u.path is CONSUMED as the unit drives: the waypoint is shifted off
// the front the moment it's reached. That is exactly the wrong shape for a
// formation. The trail vic of a platoon in column is seven hundred metres back
// along ground the lead vic cleared a minute ago — and that ground is no longer
// in u.path. There is nothing left to stand on.
//
// A RouteTrack keeps it. Points are held until they fall out of the history
// window, and arc length is cumulative and ABSOLUTE: cum[i] is an odometer
// reading in metres, not a distance from the front of the array. So sample()
// can answer "where on this route is odometer s, and which way does it point"
// for any s at all — including values BEHIND the head, which is the entire
// reason this exists, and values PAST the end, which is what a vee or a line
// asks for when a slot is forward of the leader.
//
// It is pure geometry. It holds no unit, no speed and no formation; the mover
// owns its own odometer and hands it in.
import type { Vec2 } from '../../world/WorldMap'

// How far back the driven route is kept, metres. A platoon in column with the
// tail lagging is the deepest thing that ever reads it — comfortably inside
// this — and holding a kilometre of polyline is a few hundred bytes.
const HISTORY = 1400

export interface TrackPoint {
  x: number
  y: number
  tx: number   // unit tangent, direction of travel
  ty: number
}

export class RouteTrack {
  // pts[i] is at odometer cum[i]; both arrays are the same length and cum is
  // strictly increasing (zero-length segments are dropped at append time)
  private px: number[] = []
  private py: number[] = []
  private cum: number[] = []

  constructor(odo: number, x: number, y: number, path: readonly Vec2[]) {
    this.px.push(x); this.py.push(y); this.cum.push(odo)
    this.append(path)
  }

  get head(): number { return this.cum[this.cum.length - 1]! }
  get tail(): number { return this.cum[0]! }

  // Lay a new route from (x, y) at odometer `odo`, keeping everything already
  // driven. The odometer frame survives, so nobody's station moves: a unit
  // re-tasked mid-march sees its route change ahead of it and its column stays
  // exactly where it is behind it.
  retarget(odo: number, x: number, y: number, path: readonly Vec2[]): void {
    let n = this.cum.length
    while (n > 1 && this.cum[n - 1]! >= odo) n--
    this.px.length = n; this.py.length = n; this.cum.length = n
    this.pushPt(x, y, odo)
    this.append(path)
  }

  // Drop history that has fallen out of the window behind `odo`.
  prune(odo: number): void {
    let drop = 0
    while (drop + 1 < this.cum.length && this.cum[drop + 1]! < odo - HISTORY) drop++
    if (!drop) return
    this.px.splice(0, drop); this.py.splice(0, drop); this.cum.splice(0, drop)
  }

  // Where is odometer `s`, and which way is the route pointing there? Off
  // either end the terminal segment is extended straight — the route the unit
  // WOULD have driven getting here, and the one it will drive leaving.
  sample(s: number, out: TrackPoint = { x: 0, y: 0, tx: 1, ty: 0 }): TrackPoint {
    const n = this.cum.length
    if (n === 1) {
      out.x = this.px[0]!; out.y = this.py[0]!; out.tx = 1; out.ty = 0
      return out
    }
    // segment [i, i+1] containing s, clamped so both ends extrapolate
    let i: number
    if (s <= this.cum[0]!) i = 0
    else if (s >= this.cum[n - 1]!) i = n - 2
    else {
      let lo = 0, hi = n - 1
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if (this.cum[mid]! <= s) lo = mid; else hi = mid
      }
      i = lo
    }
    const a = this.cum[i]!, len = this.cum[i + 1]! - a
    const t = (s - a) / len
    const dx = this.px[i + 1]! - this.px[i]!, dy = this.py[i + 1]! - this.py[i]!
    out.x = this.px[i]! + dx * t
    out.y = this.py[i]! + dy * t
    out.tx = dx / len
    out.ty = dy / len
    return out
  }

  private append(path: readonly Vec2[]): void {
    let x = this.px[this.px.length - 1]!, y = this.py[this.py.length - 1]!
    let s = this.cum[this.cum.length - 1]!
    for (const p of path) {
      const d = Math.hypot(p.x - x, p.y - y)
      if (d < 0.01) continue   // a repeated point would make cum non-increasing
      s += d
      this.pushPt(p.x, p.y, s)
      x = p.x; y = p.y
    }
  }

  private pushPt(x: number, y: number, s: number): void {
    const n = this.cum.length
    // never let two points share an odometer reading — sample() divides by the
    // segment length
    if (n && s - this.cum[n - 1]! < 0.01) {
      this.px[n - 1] = x; this.py[n - 1] = y
      return
    }
    this.px.push(x); this.py.push(y); this.cum.push(s)
  }
}

// Offset a point on the route sideways. +lat is LEFT of the direction of
// travel, matching the body-frame convention the formation catalog is authored
// in (elemWorld's +oy).
export function offsetLeft(p: TrackPoint, lat: number): Vec2 {
  return { x: p.x - p.ty * lat, y: p.y + p.tx * lat }
}
