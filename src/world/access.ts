// Runtime access paths: lay a dirt track from a freshly-placed structure to
// the nearest existing road so convoys and pricing reach it. Extracted from
// the retired generator (P6, GROUNDWORK.md) because it is SIM behavior, not
// generation — and fixed to read map.CELL on the way out (the old code used
// the generator's 50 m constant, which misaligned on pack ground).
import { MinHeap } from './minheap'
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

// Lay a dirt access PATH from a freshly-placed structure to the nearest
// existing road of ANY class. Dry only (never crosses water), Chaikin-
// smoothed, stamped into the raster and pushed to map.roads so pricing and
// the raster fallbacks pick it up. No-op if the structure already sits on the
// network or no dry route exists. (Baked layers — the exact BFT, the drone
// feed — are cached per map, so a runtime path shows only after a rebuild.)
export function connectStructureToRoads(map: WorldMap, x: number, y: number): void {
  const { GRID, CELL, road, elev, terr, roads } = map
  const sgx = Math.max(1, Math.min(GRID - 2, Math.floor(x / CELL)))
  const sgy = Math.max(1, Math.min(GRID - 2, Math.floor(y / CELL)))
  if (road[sgy * GRID + sgx]) return // already on the network
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
  if (best < 0) return
  const cellPath = trackAstar(
    { gx: sgx, gy: sgy }, { gx: best % GRID, gy: (best / GRID) | 0 },
    elev, terr, GRID, Infinity, // Infinity waterCost: a dirt path can't cross water
  )
  if (cellPath.length < 2) return
  const raw: Vec2[] = cellPath.map(i => ({ x: (i % GRID + 0.5) * CELL, y: ((i / GRID | 0) + 0.5) * CELL }))
  let pts = chaikin(chaikin(raw))
  // smoothing must not cut a corner across water — fall back to the raw line
  const crossesWater = (ps: Vec2[]): boolean => {
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
  if (crossesWater(pts)) pts = raw
  roads.push({ cls: R_TRACK, pts })
  // stamp the raster (never downgrade a higher-class road at the junction)
  for (let s = 0; s < pts.length - 1; s++) {
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
