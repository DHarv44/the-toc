// Runtime access paths: lay a dirt track from a freshly-placed structure to
// the nearest existing road so convoys and pricing reach it. Extracted from
// the retired generator (P6, GROUNDWORK.md) because it is SIM behavior, not
// generation — and fixed to read map.CELL on the way out (the old code used
// the generator's 50 m constant, which misaligned on pack ground).
import { MinHeap } from './minheap'
import { invalidateRoadGraph } from './pack/roadGraph'
import {
  R_TRACK, T_FOREST, T_URBAN, T_WATER,
  type Vec2, type WorldMap,
} from './WorldMap'

const D8: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
]

// Chaikin corner-cutting: one pass replaces each interior segment with two
// points at 1/4 and 3/4 — two passes turn the A* cell stair-steps into the
// natural curves the road renderer strokes. Endpoints are preserved.
function chaikin(pts: Vec2[]): Vec2[] {
  if (pts.length < 3) return pts
  const out: Vec2[] = [pts[0]!]
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i]!, q = pts[i + 1]!
    out.push({ x: p.x * 0.75 + q.x * 0.25, y: p.y * 0.75 + q.y * 0.25 })
    out.push({ x: p.x * 0.25 + q.x * 0.75, y: p.y * 0.25 + q.y * 0.75 })
  }
  out.push(pts[pts.length - 1]!)
  return out
}

// Slope-averse cell A* for laying a track. waterCost Infinity = the track may
// not cross water at all (a dirt path gets no bridge).
function trackAstar(
  from: { gx: number; gy: number }, to: { gx: number; gy: number },
  elev: Float32Array, terr: Uint8Array, GRID: number, waterCost: number,
): number[] {
  const N = GRID * GRID
  const g = new Float32Array(N).fill(Infinity)
  const came = new Int32Array(N).fill(-1)
  const closed = new Uint8Array(N)
  const start = from.gy * GRID + from.gx
  const goal = to.gy * GRID + to.gx
  g[start] = 0
  const open = new MinHeap()
  open.push(start, 0)
  while (open.size) {
    const cur = open.pop()
    if (cur === goal) break
    if (closed[cur]) continue
    closed[cur] = 1
    const cx = cur % GRID, cy = (cur / GRID) | 0
    for (const [dx, dy] of D8) {
      const nx = cx + dx, ny = cy + dy
      if (nx < 1 || ny < 1 || nx >= GRID - 1 || ny >= GRID - 1) continue
      const ni = ny * GRID + nx
      if (closed[ni]) continue
      const dist = (dx && dy) ? 1.414 : 1
      // a diagonal step between two diagonally-adjacent water cells slips
      // "between" them (corner-cutting the river) — treat it as a crossing
      const cornerWet = dx !== 0 && dy !== 0
        && (terr[cy * GRID + (cx + dx)] === T_WATER || terr[(cy + dy) * GRID + cx] === T_WATER)
      let c = 1
      if (terr[ni] === T_WATER) {
        if (!isFinite(waterCost)) continue
        c = waterCost
      } else if (cornerWet) {
        if (!isFinite(waterCost)) continue
        c = waterCost * 1.5
      } else if (terr[ni] === T_FOREST) c = 2.6
      else if (terr[ni] === T_URBAN) c = 0.8
      c += Math.abs(elev[ni]! - elev[cur]!) * 1.8
      const ng = g[cur]! + dist * c
      if (ng < g[ni]!) {
        g[ni] = ng
        came[ni] = cur
        const h = Math.hypot(nx - to.gx, ny - to.gy)
        open.push(ni, ng + h)
      }
    }
  }
  const path: number[] = []
  let c = goal
  while (c !== -1) { path.push(c); c = came[c]! }
  return path
}

// does any segment of this line pass over water? (smoothing must not cut a
// corner across a river — callers fall back to the raw cell line)
function lineCrossesWater(map: WorldMap, ps: Vec2[]): boolean {
  const { GRID, CELL, terr } = map
  for (let s = 0; s < ps.length - 1; s++) {
    const p = ps[s]!, q = ps[s + 1]!
    const steps = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / (CELL / 4)))
    for (let k = 0; k <= steps; k++) {
      const t = k / steps
      const gx = Math.floor((p.x + (q.x - p.x) * t) / CELL), gy = Math.floor((p.y + (q.y - p.y) * t) / CELL)
      if (gx >= 0 && gy >= 0 && gx < GRID && gy < GRID && terr[gy * GRID + gx] === T_WATER) return true
    }
  }
  return false
}

// nearest VERTEX of any existing road polyline within a few cells — the
// junction rule: the graph joins edges only where vertices COINCIDE, so a
// line that merely ends near a road is an island until it shares this vertex
export function nearestRoadVertex(map: WorldMap, p: Vec2): Vec2 | null {
  let best: Vec2 | null = null
  let bd = (map.CELL * 3) * (map.CELL * 3)
  for (const r of map.roads) {
    for (const q of r.pts) {
      const d = (q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y)
      if (d < bd) { bd = d; best = q }
    }
  }
  return best
}

// PLAN the dirt access track from a structure site to the nearest existing
// road of ANY class — pure compute, no mutation. Dry only (never crosses
// water), Chaikin-smoothed. Returns null if the site already sits on the
// network or no dry route exists. The game stamps what this plans
// (connectStructureToRoads below); the SCENARIO BUILDER draws it as a
// preview — one implementation, so the preview and H-hour reality cannot
// disagree.
export function planAccessTrack(map: WorldMap, x: number, y: number): Vec2[] | null {
  const { GRID, CELL, road, elev, terr } = map
  const sgx = Math.max(1, Math.min(GRID - 2, Math.floor(x / CELL)))
  const sgy = Math.max(1, Math.min(GRID - 2, Math.floor(y / CELL)))
  if (road[sgy * GRID + sgx]) return null // already on the network
  // nearest existing road cell of any class (bounded ring scan)
  let best = -1, bd = Infinity
  const R = Math.min(GRID - 2, 90)
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const gx = sgx + dx, gy = sgy + dy
      if (gx < 1 || gy < 1 || gx >= GRID - 1 || gy >= GRID - 1) continue
      if (!road[gy * GRID + gx]) continue
      const d = dx * dx + dy * dy
      if (d < bd) { bd = d; best = gy * GRID + gx }
    }
  }
  if (best < 0) return null
  const cellPath = trackAstar(
    { gx: sgx, gy: sgy }, { gx: best % GRID, gy: (best / GRID) | 0 },
    elev, terr, GRID, Infinity, // Infinity waterCost: a dirt path can't cross water
  )
  if (cellPath.length < 2) return null
  // trackAstar returns goal-first: raw[0] is the ROAD end, raw[last] the site
  const raw: Vec2[] = cellPath.map(i => ({ x: (i % GRID + 0.5) * CELL, y: ((i / GRID | 0) + 0.5) * CELL }))
  let pts = chaikin(chaikin(raw))
  // JOIN THE NETWORK FOR REAL: snap the road end onto the nearest actual
  // VERTEX of an existing polyline — shared vertex → junction → the track is
  // a drivable on-ramp (nearestRoadVertex above explains the rule).
  const vBest = nearestRoadVertex(map, raw[0]!)
  if (vBest) pts = [{ x: vBest.x, y: vBest.y }, ...pts]
  // smoothing must not cut a corner across water — fall back to the raw line
  if (lineCrossesWater(map, pts)) pts = raw
  return pts
}

/** PLAN A NEW ROAD LINE between two arbitrary points — the route an engineer
 *  element will BUILD (domains/forces/roadworks). Dry, slope-averse,
 *  Chaikin-smoothed, and BOTH ends vertex-snap to the existing network when
 *  close, so a finished road is a drivable junction-to-junction edge and not
 *  an island. Runs from `from` outward (the engineer starts at from). */
export function planRoadLine(map: WorldMap, from: Vec2, to: Vec2): Vec2[] | null {
  const { GRID, CELL, elev, terr } = map
  const g = (v: number) => Math.max(1, Math.min(GRID - 2, Math.floor(v / CELL)))
  const cellPath = trackAstar(
    { gx: g(from.x), gy: g(from.y) }, { gx: g(to.x), gy: g(to.y) },
    elev, terr, GRID, Infinity, // a built road gets no bridge either
  )
  if (cellPath.length < 2) return null
  // trackAstar returns goal-first — reverse so the line runs from the builder
  const raw: Vec2[] = cellPath
    .map(i => ({ x: (i % GRID + 0.5) * CELL, y: ((i / GRID | 0) + 0.5) * CELL }))
    .reverse()
  let pts = chaikin(chaikin(raw))
  if (lineCrossesWater(map, pts)) pts = raw
  const s0 = nearestRoadVertex(map, pts[0]!)
  if (s0) pts = [{ x: s0.x, y: s0.y }, ...pts]
  const s1 = nearestRoadVertex(map, pts[pts.length - 1]!)
  if (s1) pts = [...pts, { x: s1.x, y: s1.y }]
  return pts
}

/** Stamp a polyline into the road raster as R_TRACK (never downgrading a
 *  higher class), from segment `from` on — the engineer stamps as they go,
 *  so completed segments are priced and routable while the rest is dirt. */
export function stampTrack(map: WorldMap, pts: Vec2[], from = 0): void {
  const { GRID, CELL, road } = map
  for (let s = Math.max(0, from); s < pts.length - 1; s++) {
    const p = pts[s]!, q = pts[s + 1]!
    const steps = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / (CELL / 2)))
    for (let k = 0; k <= steps; k++) {
      const t = k / steps
      const gx = Math.floor((p.x + (q.x - p.x) * t) / CELL), gy = Math.floor((p.y + (q.y - p.y) * t) / CELL)
      if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) continue
      const i = gy * GRID + gx
      if (road[i]! < R_TRACK) road[i] = R_TRACK
    }
  }
}

// The base's OWN access spur: the track laid by connectStructureToRoads ends
// at the site (planAccessTrack builds road-end-first), so a structure's
// private driveway is the R_TRACK polyline whose last vertex sits on it.
// Returns null for a base with no spur (sited on the network, or roadless).
export function structureSpur(map: WorldMap, x: number, y: number): Vec2[] | null {
  const tol = (map.CELL * 1.5) * (map.CELL * 1.5)
  for (const r of map.roads) {
    if (r.cls !== R_TRACK || r.pts.length < 2) continue
    const p = r.pts[r.pts.length - 1]!
    if ((p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) < tol) return r.pts
  }
  return null
}

// Lay the planned track for real: pushed to map.roads and stamped into the
// raster so pricing and the raster fallbacks pick it up. (Baked layers — the
// exact BFT, the drone feed — are cached per map, so a runtime path shows
// only after a rebuild.)
export function connectStructureToRoads(map: WorldMap, x: number, y: number): void {
  const pts = planAccessTrack(map, x, y)
  if (!pts) return
  map.roads.push({ cls: R_TRACK, pts })
  // the network just changed: the router's cached junction graph is stale
  invalidateRoadGraph(map)
  // stamp the raster (never downgrade a higher-class road at the junction)
  stampTrack(map, pts)
}
