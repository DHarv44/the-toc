// Routing. ONE behaviour, no modes, no challengers (GROUNDWORK.md P5b,
// settled the hard way): on a pack map, movement IS the road network — every
// order takes the junction-graph route over the real polylines, full stop.
// The cell A* exists only as the fallback when the graph has nothing to say
// (procgen maps until P6 buries them; a map with no network at all).
//
// There is deliberately NO time-race between the graph and a direct cell
// route: on a road the cell version prices the same speed but measures
// shorter (cell centres chord the real curves), so any tie-breaker hands the
// stair-step garbage a win over the clean geometry. Tried it. Never again.
// A field-waypoint order that circles via the road instead of crossing the
// field is the accepted cost until a rule exists that cannot regress this.
//
// The optional `profile` is doctrine, not a mode: supply convoys over-prefer
// arterials beyond raw time.
import { MinHeap } from './minheap'
import { type Vec2, type WorldMap } from './WorldMap'
import type { Mobility } from './mobility'
import { routeOnRoads, type RouteProfile } from './pack/roadGraph'

export function findPath(
  map: WorldMap, sx: number, sy: number, tx: number, ty: number,
  mob: Mobility, profile: RouteProfile = 'fastest',
): Vec2[] | null {
  if (map.ground) {
    const road = routeOnRoads(map, sx, sy, tx, ty, mob, profile)
    if (road) return road
  }
  return findPathCells(map, sx, sy, tx, ty, mob)
}

function findPathCells(
  map: WorldMap, sx: number, sy: number, tx: number, ty: number,
  mob: Mobility,
): Vec2[] | null {
  const GRID = map.GRID
  const start = map.cellAt(sx, sy)
  let goal = map.cellAt(tx, ty)

  // if target cell impassable, walk outward to nearest passable cell — and
  // terminate AT that cell, never at the raw (possibly in-water) click point
  let gtx = tx, gty = ty
  if (!isFinite(map.moveFactorCell(goal, mob))) {
    const ggx = goal % GRID, ggy = (goal / GRID) | 0
    let found: number | null = null
    for (let r = 1; r < 60 && !found; r++) {
      for (let dy = -r; dy <= r && !found; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = ggx + dx, y = ggy + dy
        if (!map.inBounds(x, y)) continue
        if (isFinite(map.moveFactorCell(y * GRID + x, mob))) { found = y * GRID + x; break }
      }
    }
    if (found == null) return null
    goal = found
    gtx = ((goal % GRID) + 0.5) * map.CELL
    gty = (((goal / GRID) | 0) + 0.5) * map.CELL
  }
  if (start === goal) return [{ x: gtx, y: gty }]

  const N = GRID * GRID
  const g = new Float32Array(N).fill(Infinity)
  const came = new Int32Array(N).fill(-1)
  const closed = new Uint8Array(N)
  g[start] = 0
  const open = new MinHeap()
  open.push(start, 0)
  const gx0 = goal % GRID, gy0 = (goal / GRID) | 0
  const sx0 = start % GRID, sy0 = (start / GRID) | 0
  const DIRS: ReadonlyArray<readonly [number, number]> = [
    [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
  ]
  let ok = false
  let pops = 0
  while (open.size) {
    if (++pops > 1500000) {
      console.warn('findPath: iteration cap hit', { sx, sy, tx, ty, mob, openSize: open.size })
      return null
    }
    const cur = open.pop()
    if (cur === goal) { ok = true; break }
    if (closed[cur]) continue
    closed[cur] = 1
    const cx = cur % GRID, cy = (cur / GRID) | 0
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue
      const ni = ny * GRID + nx
      if (closed[ni]) continue
      let f = map.moveFactorCell(ni, mob)
      if (!isFinite(f)) continue
      // no cutting corners past impassable cells: a diagonal step between two
      // diagonally-adjacent water cells is fording the river at the elbow —
      // both orthogonal neighbours must be passable to take the diagonal.
      // (Bridge/pontoon cells are water WITH road → finite → still fine.)
      if (dx !== 0 && dy !== 0
        && (!isFinite(map.moveFactorCell(cy * GRID + (cx + dx), mob))
          || !isFinite(map.moveFactorCell((cy + dy) * GRID + cx, mob)))) continue
      const ng = g[cur]! + ((dx && dy) ? 1.414 : 1) * f
      if (ng < g[ni]!) {
        g[ni] = ng
        came[ni] = cur
        open.push(ni, ng + Math.hypot(nx - gx0, ny - gy0) * 0.5)
      }
    }
  }
  if (!ok) return null

  // reconstruct, convert to world coords
  const cells: number[] = []
  let c = goal
  while (c !== -1) { cells.push(c); c = came[c]! }
  cells.reverse()
  const pts: Vec2[] = cells.map(i => ({
    x: ((i % GRID) + 0.5) * map.CELL,
    y: (((i / GRID) | 0) + 0.5) * map.CELL,
  }))
  // prune collinear runs
  const out: Vec2[] = [pts[0]!]
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1]!, b = pts[i]!, d = pts[i + 1]!
    const abx = b.x - a.x, aby = b.y - a.y, bdx = d.x - b.x, bdy = d.y - b.y
    if (abx * bdy - aby * bdx !== 0 || abx * bdx + aby * bdy < 0) out.push(b)
  }
  out.push(pts[pts.length - 1]!)
  out.shift() // drop the cell we're standing in
  if (!out.length) return [{ x: gtx, y: gty }]
  return smooth(map, out, mob)
}

// Any-angle smoothing over a cell route. Grid A* only turns in 45° steps, so
// an open-field leg comes out as a stair of diagonals — reads as a drunk
// driver on the exact sheet. This walks the route pulling each waypoint as
// far ahead as the STRAIGHT line stays honest: every sampled cell passable,
// and no worse underfoot than the detour it replaces (so a shortcut never
// silently trades a road for a swamp, and never cuts across water — water is
// impassable and fails the passability check outright).
function smooth(map: WorldMap, pts: Vec2[], mob: Mobility): Vec2[] {
  if (pts.length < 3) return pts
  const step = map.CELL / 2
  const worstAlong = (a: Vec2, b: Vec2): number => {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step))
    let worst = 0
    for (let k = 0; k <= n; k++) {
      const f = map.moveFactor(a.x + (b.x - a.x) * (k / n), a.y + (b.y - a.y) * (k / n), mob)
      if (!isFinite(f)) return Infinity
      if (f > worst) worst = f
    }
    return worst
  }
  // Local by design: the pass kills stair-steps, it does not replan the
  // route — and unbounded lookahead over a 25 km path is quadratic sampling.
  const LOOKAHEAD = 40
  const out: Vec2[] = [pts[0]!]
  let i = 0
  while (i < pts.length - 1) {
    // worst ground of the original detour grows as j advances; track it
    let detourWorst = 0
    let best = i + 1
    for (let j = i + 1; j < Math.min(pts.length, i + 1 + LOOKAHEAD); j++) {
      const legWorst = worstAlong(pts[j - 1]!, pts[j]!)
      if (legWorst > detourWorst) detourWorst = legWorst
      const straight = worstAlong(pts[i]!, pts[j]!)
      if (straight <= detourWorst * 1.05) best = j
      // no early break: a blocked shortcut to j can reopen at j+1 around a bend
    }
    out.push(pts[best]!)
    i = best
  }
  return out
}
