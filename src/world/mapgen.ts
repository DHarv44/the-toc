// Terrain generation with real hydrology: elevation first, then depression
// filling (priority flood), D8 flow accumulation to trace rivers along true
// drainage lines, lakes only where water would actually pond.
// Ported verbatim from src/game/mapgen.js — behavior-identical per seed+size.
import { createNoise2D } from 'simplex-noise'
import { makeRng } from '../engine/rng'
import { MinHeap } from './minheap'
import { MOVE_FACTORS, ROAD_NAME, type Mobility } from './mobility'
import type { TheaterData } from './theaters'
import {
  CELL, GRID_DEFAULT, TERR_NAME, T_FIELD, T_FOREST, T_URBAN, T_WATER,
  R_PATH, R_ROAD, R_HIGHWAY,
  type BridgeSpan, type MapFeature, type RoadClass, type RoadPoly, type Terrain,
  type Town, type Vec2, type WorldMap,
} from './WorldMap'

const D8: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
]

export function genMap(seed: number, gridSize: number = GRID_DEFAULT, theater?: TheaterData): WorldMap {
  const GRID = gridSize
  const WORLD = GRID * CELL
  const rng = makeRng(seed)
  const n1 = createNoise2D(rng)
  const n2 = createNoise2D(rng)
  const n3 = createNoise2D(rng)
  const N = GRID * GRID

  const elev = new Float32Array(N)
  const terr = new Uint8Array(N)
  const road = new Uint8Array(N)
  const waterSurf = new Float32Array(N)
  const idx = (gx: number, gy: number) => gy * GRID + gx

  // --- 1. elevation: real-DEM theater window, or domain-warped fbm noise ---
  // Theater path: the baked patch is 50 m/px — one cell — so a GRID-sized
  // sub-window (seeded offset: one theater, many battlefields) maps 1:1 with
  // no resampling. Real meters are renormalized into the generator's gameplay
  // elevation range so every downstream pass (depression fill, flow-accum
  // rivers, slope mobility, town siting) runs unchanged on real relief. The
  // relief scale adapts: subtle steppe stays subtle, mountain theaters clamp
  // to what mobility costs are tuned for. A whisper of detail noise keeps
  // close zoom from looking silky (30 m source data under 50 m cells).
  // maps gameplay elevation back to real-world meters for labels (identity on
  // procgen maps; theater maps invert their normalization so HILL numbers read
  // as true spot elevations)
  let elevLabel = (e: number) => e
  if (theater) {
    const P = theater.meta.size
    const ox = Math.floor(rng() * (P - GRID + 1))
    const oy = Math.floor(rng() * (P - GRID + 1))
    let lo = Infinity, hi = -Infinity
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        const m = theater.hgt[(oy + gy) * P + (ox + gx)]!
        if (m < lo) lo = m
        if (m > hi) hi = m
      }
    }
    const relief = Math.min(110, Math.max(40, (hi - lo) * 0.35))
    const s = relief / (hi - lo || 1)
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        const m = theater.hgt[(oy + gy) * P + (ox + gx)]!
        elev[idx(gx, gy)] = Math.max(4, 8 + (m - lo) * s + 1.6 * n2(gx * 0.1, gy * 0.1))
      }
    }
    elevLabel = (e) => lo + (e - 8) / s
  } else {
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        const wx = 34 * n3(gx * 0.005, gy * 0.005)
        const wy = 34 * n3(gx * 0.005 + 57.3, gy * 0.005 + 57.3)
        let e = 0
        e += 46 * n1((gx + wx) * 0.0045, (gy + wy) * 0.0045)
        e += 20 * n1(gx * 0.013, gy * 0.013)
        e += 7 * n1(gx * 0.04, gy * 0.04)
        e += 2.5 * n2(gx * 0.1, gy * 0.1)
        const r = 1 - Math.abs(n2(gx * 0.007, gy * 0.007))
        e += 30 * r * r
        elev[idx(gx, gy)] = Math.max(4, 38 + e)
      }
    }
  }

  // --- 2. priority-flood depression fill (Barnes et al. style) ---
  const filled = new Float32Array(elev)
  {
    const heap = new MinHeap()
    const seen = new Uint8Array(N)
    for (let gx = 0; gx < GRID; gx++) {
      for (const gy of [0, GRID - 1]) {
        const i = idx(gx, gy)
        if (!seen[i]) { seen[i] = 1; heap.push(i, filled[i]!) }
      }
    }
    for (let gy = 0; gy < GRID; gy++) {
      for (const gx of [0, GRID - 1]) {
        const i = idx(gx, gy)
        if (!seen[i]) { seen[i] = 1; heap.push(i, filled[i]!) }
      }
    }
    while (heap.size) {
      const c = heap.pop()
      const cx = c % GRID, cy = (c / GRID) | 0
      for (const [dx, dy] of D8) {
        const nx = cx + dx, ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue
        const ni = ny * GRID + nx
        if (seen[ni]) continue
        seen[ni] = 1
        filled[ni] = Math.max(elev[ni]!, filled[c]! + 0.01)
        heap.push(ni, filled[ni]!)
      }
    }
  }

  // --- 3. D8 flow accumulation (process high to low) ---
  const acc = new Float32Array(N).fill(1)
  {
    const order = new Int32Array(N)
    for (let i = 0; i < N; i++) order[i] = i
    // sort by filled elevation, descending
    order.sort((a, b) => filled[b]! - filled[a]!)
    for (let k = 0; k < N; k++) {
      const c = order[k]!
      const cx = c % GRID, cy = (c / GRID) | 0
      let best = -1, bf = filled[c]!
      for (const [dx, dy] of D8) {
        const nx = cx + dx, ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue
        const ni = ny * GRID + nx
        if (filled[ni]! < bf) { bf = filled[ni]!; best = ni }
      }
      if (best >= 0) acc[best] += acc[c]!
    }
  }

  // --- 4. water: lakes in real depressions, rivers along drainage lines ---
  const RIVER_T = 650
  for (let i = 0; i < N; i++) {
    const lakeDepth = filled[i]! - elev[i]!
    if (lakeDepth > 2.2) {
      terr[i] = T_WATER
      waterSurf[i] = filled[i]! - 0.1
    } else if (acc[i]! > RIVER_T) {
      terr[i] = T_WATER
      waterSurf[i] = filled[i]! - 0.8
      elev[i] = filled[i]! - 2.6   // carve the channel bed
    } else {
      waterSurf[i] = elev[i]!
    }
  }
  // widen major rivers (large catchment) by one cell
  {
    const widen: number[] = []
    for (let gy = 1; gy < GRID - 1; gy++) {
      for (let gx = 1; gx < GRID - 1; gx++) {
        const i = idx(gx, gy)
        if (terr[i] !== T_WATER || acc[i]! < 2600) continue
        for (const [dx, dy] of D8) {
          const ni = idx(gx + dx, gy + dy)
          if (terr[ni] !== T_WATER) widen.push(ni)
        }
      }
    }
    for (const i of widen) {
      terr[i] = T_WATER
      waterSurf[i] = filled[i]! - 0.7
      elev[i] = Math.min(elev[i]!, filled[i]! - 2.2)
    }
  }

  // --- 5. slope (for forests, town siting, rendering hints) ---
  const slope = new Float32Array(N)
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const i = idx(gx, gy)
      let m = 0
      if (gx > 0) m = Math.max(m, Math.abs(elev[i]! - elev[i - 1]!))
      if (gx < GRID - 1) m = Math.max(m, Math.abs(elev[i]! - elev[i + 1]!))
      if (gy > 0) m = Math.max(m, Math.abs(elev[i]! - elev[i - GRID]!))
      if (gy < GRID - 1) m = Math.max(m, Math.abs(elev[i]! - elev[i + GRID]!))
      slope[i] = m
    }
  }

  // --- 6. distance-to-water (BFS, in cells, capped) ---
  const distW = new Float32Array(N).fill(60)
  {
    let q: number[] = []
    for (let i = 0; i < N; i++) if (terr[i] === T_WATER) { distW[i] = 0; q.push(i) }
    let d = 0
    while (q.length && d < 45) {
      d++
      const next: number[] = []
      for (const c of q) {
        const cx = c % GRID, cy = (c / GRID) | 0
        for (const [dx, dy] of D8) {
          const nx = cx + dx, ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue
          const ni = ny * GRID + nx
          if (distW[ni]! > d) { distW[ni] = d; next.push(ni) }
        }
      }
      q = next
    }
  }

  // --- 7. forests: moisture-seeking, avoid cliffs and high ground ---
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const i = idx(gx, gy)
      if (terr[i] === T_WATER) continue
      const f = 0.75 * n2(gx * 0.015, gy * 0.015)
        + 0.3 * n3(gx * 0.055, gy * 0.055)
        + 0.28 * Math.max(0, 1 - distW[i]! / 28)
        - 0.06 * Math.max(0, slope[i]! - 4)
        - 0.012 * Math.max(0, elev[i]! - 115)
      if (f > 0.42) terr[i] = T_FOREST
    }
  }

  // --- 8. bases: flat land in south (FOB) / north (enemy) bands ---
  function siteInBand(gyLo: number, gyHi: number): { gx: number; gy: number } {
    let best: { gx: number; gy: number } | null = null, bs = -Infinity
    for (let gy = gyLo; gy <= gyHi; gy += 2) {
      for (let gx = Math.floor(GRID * 0.2); gx < GRID * 0.8; gx += 2) {
        const i = idx(gx, gy)
        if (terr[i] === T_WATER) continue
        const s = -slope[i]! * 1.2 - Math.abs(elev[i]! - 48) * 0.03 + rng() * 0.4
        if (s > bs) { bs = s; best = { gx, gy } }
      }
    }
    return best!   // bands always contain at least one non-water cell in practice
  }
  const fobCell = siteInBand(GRID - 26, GRID - 10)
  const baseCell = siteInBand(10, 26)

  // --- 9. towns: flat, near (not in) water, spread out ---
  const towns: Town[] = []
  const NAMES = ['ASHFORD', 'BREVIK', 'CALDER', 'DORAN', 'ELMSTED', 'FALKE', 'GARWICK', 'HOLT']
  {
    const cands: Array<{ gx: number; gy: number; s: number }> = []
    for (let k = 0; k < 600; k++) {
      const gx = 16 + Math.floor(rng() * (GRID - 32))
      const gy = 30 + Math.floor(rng() * (GRID - 60))
      const i = idx(gx, gy)
      if (terr[i] === T_WATER) continue
      const s = -slope[i]! * 0.9 - Math.abs(elev[i]! - 48) * 0.02
        + (distW[i]! > 2 && distW[i]! < 22 ? 0.9 : 0) + rng() * 0.4
      cands.push({ gx, gy, s })
    }
    cands.sort((a, b) => b.s - a.s)
    for (const c of cands) {
      if (towns.length >= 5) break
      const px = c.gx * CELL, py = c.gy * CELL
      const tooClose = towns.some(t => Math.hypot(t.x - px, t.y - py) < 2400)
        || Math.hypot(fobCell.gx * CELL - px, fobCell.gy * CELL - py) < 2000
        || Math.hypot(baseCell.gx * CELL - px, baseCell.gy * CELL - py) < 2000
      if (tooClose) continue
      towns.push({ gx: c.gx, gy: c.gy, x: px, y: py, name: NAMES[towns.length]! })
    }
  }

  // --- 10. urban blocks ---
  // cells the stamp skips still get their woods cleared — a town's footprint
  // is yards and lots, not forest (rng draw order preserved: one draw per
  // dx,dy exactly as before)
  for (const t of towns) {
    const size = 4 + Math.floor(rng() * 4)
    for (let dy = -size; dy <= size; dy++) {
      for (let dx = -size; dx <= size; dx++) {
        const r = rng()
        const inTown = Math.hypot(dx, dy) < size
        const x = t.gx + dx, y = t.gy + dy
        if (x < 1 || y < 1 || x >= GRID - 1 || y >= GRID - 1) continue
        const i = idx(x, y)
        if (r < 0.65 && inTown) {
          if (terr[i] !== T_WATER && slope[i]! < 8) terr[i] = T_URBAN
        } else if (inTown && terr[i] === T_FOREST) {
          terr[i] = T_FIELD
        }
      }
    }
  }

  // --- 11. roads: a hierarchical network, slope-averse, bridge at narrows ---
  // MST over strongpoints = the paved net. The trunk from friendly base to
  // enemy base through the tree (the future MSR) is promoted to highway;
  // extra near-neighbour links that the MST skipped are laid as dirt paths.
  // Each A* cell path becomes a Chaikin-smoothed world-space polyline — the
  // vector source of truth for rendering and the future road graph — and the
  // raster gets the class stamped back in for O(1) mobility lookups (higher
  // class wins where routes overlap).
  const nodes = [
    { gx: fobCell.gx, gy: fobCell.gy },
    ...towns.map(t => ({ gx: t.gx, gy: t.gy })),
    { gx: baseCell.gx, gy: baseCell.gy },
  ]
  const edges = mstEdges(nodes)
  if (towns.length >= 2) edges.push([1, 2])

  // trunk: the edge chain from node 0 (friendly base) to the enemy base
  const trunk = new Set<number>()
  {
    const adj: number[][] = nodes.map(() => [])
    edges.forEach(([a, b], k) => { adj[a]!.push(k); adj[b]!.push(k) })
    const prevEdge = new Int32Array(nodes.length).fill(-1)
    const prevNode = new Int32Array(nodes.length).fill(-1)
    const seen = new Uint8Array(nodes.length)
    const q = [0]; seen[0] = 1
    while (q.length) {
      const n = q.shift()!
      for (const ek of adj[n]!) {
        const [a, b] = edges[ek]!
        const m = a === n ? b : a
        if (!seen[m]) { seen[m] = 1; prevEdge[m] = ek; prevNode[m] = n; q.push(m) }
      }
    }
    for (let n = nodes.length - 1; n > 0 && prevEdge[n]! >= 0; n = prevNode[n]!) trunk.add(prevEdge[n]!)
  }

  // dirt paths: shortest not-yet-connected neighbour pairs, ≤ 2 per node —
  // deterministic (no rng), so the road pass stays replayable per seed
  const pathEdges: Array<[number, number]> = []
  {
    const have = new Set(edges.map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`)))
    const cands: Array<{ a: number; b: number; d: number }> = []
    for (let a = 0; a < nodes.length; a++) {
      for (let b = a + 1; b < nodes.length; b++) {
        if (have.has(`${a}-${b}`)) continue
        const d = Math.hypot(nodes[a]!.gx - nodes[b]!.gx, nodes[a]!.gy - nodes[b]!.gy)
        if (d < GRID * 0.45) cands.push({ a, b, d })
      }
    }
    cands.sort((x, y) => x.d - y.d)
    const deg = new Map<number, number>()
    for (const c of cands) {
      if (pathEdges.length >= Math.max(2, towns.length)) break
      if ((deg.get(c.a) || 0) >= 2 || (deg.get(c.b) || 0) >= 2) continue
      pathEdges.push([c.a, c.b])
      deg.set(c.a, (deg.get(c.a) || 0) + 1)
      deg.set(c.b, (deg.get(c.b) || 0) + 1)
    }
  }

  const roads: RoadPoly[] = []
  const bridges: BridgeSpan[] = []
  const bridgeCells = new Set<number>()
  const wetAlong = (pts: Vec2[]): boolean => {
    for (let s = 0; s < pts.length - 1; s++) {
      const p = pts[s]!, q = pts[s + 1]!
      const steps = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / (CELL / 4)))
      for (let k = 0; k <= steps; k++) {
        const t = k / steps
        const gx = Math.floor((p.x + (q.x - p.x) * t) / CELL)
        const gy = Math.floor((p.y + (q.y - p.y) * t) / CELL)
        if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) continue
        if (terr[idx(gx, gy)] === T_WATER) return true
      }
    }
    return false
  }
  const lay = (a: { gx: number; gy: number }, b: { gx: number; gy: number }, cls: RoadClass) => {
    // dirt paths may not cross water at all — no route without one, no path.
    // Roads/highways may (every water cell they touch becomes a bridge).
    const cellPath = roadAstar(a, b, elev, terr, GRID, cls === R_PATH ? Infinity : 60)
    if (cellPath.length < 2) return
    const raw: Vec2[] = cellPath.map(i => ({ x: (i % GRID + 0.5) * CELL, y: ((i / GRID | 0) + 0.5) * CELL }))
    let pts = chaikin(chaikin(raw))
    // smoothing can cut a corner across a river bend the A* went around — for
    // paths that would break the no-water rule, so fall back to the raw line
    if (cls === R_PATH && wetAlong(pts)) pts = raw
    roads.push({ cls, pts })
    // stamp the smoothed line into the raster (sub-cell steps so no gaps)
    for (let s = 0; s < pts.length - 1; s++) {
      const p = pts[s]!, q = pts[s + 1]!
      const segLen = Math.hypot(q.x - p.x, q.y - p.y)
      const steps = Math.max(1, Math.ceil(segLen / (CELL / 2)))
      for (let k = 0; k <= steps; k++) {
        const t = k / steps
        const gx = Math.floor((p.x + (q.x - p.x) * t) / CELL)
        const gy = Math.floor((p.y + (q.y - p.y) * t) / CELL)
        if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) continue
        const i = idx(gx, gy)
        if (road[i]! < cls) road[i] = cls
        if (terr[i] === T_WATER && !bridgeCells.has(i)) {
          bridgeCells.add(i)
          bridges.push({
            x: (gx + 0.5) * CELL, y: (gy + 0.5) * CELL,
            angle: Math.atan2(q.y - p.y, q.x - p.x), cls,
          })
        }
      }
    }
  }
  edges.forEach(([a, b], k) => lay(nodes[a]!, nodes[b]!, trunk.has(k) ? R_HIGHWAY : R_ROAD))
  for (const [a, b] of pathEdges) lay(nodes[a]!, nodes[b]!, R_PATH)

  // --- 12. hamlets: small settlements strung along the paved network ---
  // Real culture follows the road, not the noise field: every so often along a
  // road/highway, far enough from towns and each other, a few urban cells dab
  // in a hamlet. Unnamed — they're texture and cover, not objectives.
  {
    const HAMLET_CAP = GRID >= 256 ? 7 : GRID >= 160 ? 4 : 2
    const hamlets: Vec2[] = []
    outer: for (const r of roads) {
      if (r.cls === R_PATH) continue
      let along = 0
      for (let s = 0; s < r.pts.length - 1; s++) {
        const p = r.pts[s]!, q = r.pts[s + 1]!
        along += Math.hypot(q.x - p.x, q.y - p.y)
        if (along < 900) continue
        along = 0
        if (rng() < 0.45) continue // irregular spacing
        const gx = Math.floor(q.x / CELL), gy = Math.floor(q.y / CELL)
        if (gx < 2 || gy < 2 || gx >= GRID - 2 || gy >= GRID - 2) continue
        const i = idx(gx, gy)
        if (terr[i] !== T_FIELD || slope[i]! > 6) continue
        const clear = towns.every(t => Math.hypot(t.x - q.x, t.y - q.y) > 1200)
          && hamlets.every(h => Math.hypot(h.x - q.x, h.y - q.y) > 1500)
          && Math.hypot(fobCell.gx * CELL - q.x, fobCell.gy * CELL - q.y) > 1500
          && Math.hypot(baseCell.gx * CELL - q.x, baseCell.gy * CELL - q.y) > 1500
        if (!clear) continue
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const r = rng()
            const j = idx(gx + dx, gy + dy)
            if (r < 0.55 && Math.abs(dx) + Math.abs(dy) < 2) {
              if (terr[j] !== T_WATER && slope[j]! < 8) terr[j] = T_URBAN
            } else if (terr[j] === T_FOREST) {
              terr[j] = T_FIELD // hamlet clearings — no woods against the walls
            }
          }
        }
        terr[i] = T_URBAN
        hamlets.push({ x: q.x, y: q.y })
        if (hamlets.length >= HAMLET_CAP) break outer
      }
    }
  }

  // --- 13. named features: hills and rivers ---
  const features: MapFeature[] = []
  {
    // hills: prominent local maxima (no higher ground within R), well
    // separated, labelled military-style by their map elevation
    const R = Math.max(8, Math.round(GRID * 0.055))
    const peaks: Array<{ gx: number; gy: number; e: number }> = []
    for (let gy = 2; gy < GRID - 2; gy += 2) {
      for (let gx = 2; gx < GRID - 2; gx += 2) {
        const i = idx(gx, gy)
        if (terr[i] === T_WATER) continue
        const e = elev[i]!
        let peak = true
        scan: for (let dy = -R; dy <= R; dy += 2) {
          for (let dx = -R; dx <= R; dx += 2) {
            const nx = gx + dx, ny = gy + dy
            if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue
            if (elev[idx(nx, ny)]! > e) { peak = false; break scan }
          }
        }
        if (peak) peaks.push({ gx, gy, e })
      }
    }
    peaks.sort((a, b) => b.e - a.e)
    const HILL_CAP = GRID >= 256 ? 5 : GRID >= 160 ? 4 : 3
    const used: Array<{ gx: number; gy: number }> = []
    const names = new Set<string>()
    for (const p of peaks) {
      if (used.length >= HILL_CAP) break
      if (!used.every(u => Math.hypot(u.gx - p.gx, u.gy - p.gy) > R * 2.2)) continue
      const name = `HILL ${Math.round(elevLabel(p.e))}`
      if (names.has(name)) continue // twin elevations read as one hill — skip
      names.add(name)
      used.push(p)
      features.push({ kind: 'hill', name, x: (p.gx + 0.5) * CELL, y: (p.gy + 0.5) * CELL })
    }

    // rivers: connected water components that carry real drainage, biggest
    // first; the label sits on the widest point of the main channel
    const RIVER_NAMES = ['VARDA', 'KESSEL', 'OSTRA', 'LENNE', 'MIRKA']
    const comp = new Int32Array(N).fill(-1)
    const comps: Array<{ cells: number[]; maxAcc: number; at: number }> = []
    for (let i0 = 0; i0 < N; i0++) {
      if (terr[i0] !== T_WATER || comp[i0] !== -1) continue
      const cells: number[] = []
      let maxAcc = 0, at = i0
      const q = [i0]; comp[i0] = comps.length
      while (q.length) {
        const c = q.pop()!
        cells.push(c)
        if (acc[c]! > maxAcc) { maxAcc = acc[c]!; at = c }
        const cx = c % GRID, cy = (c / GRID) | 0
        for (const [dx, dy] of D8) {
          const nx = cx + dx, ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue
          const ni = ny * GRID + nx
          if (terr[ni] === T_WATER && comp[ni] === -1) { comp[ni] = comps.length; q.push(ni) }
        }
      }
      comps.push({ cells, maxAcc, at })
    }
    const rivers = comps
      .filter(c => c.cells.length >= 25 && c.maxAcc > RIVER_T * 1.5)
      .sort((a, b) => b.cells.length - a.cells.length)
      .slice(0, 3)
    rivers.forEach((c, k) => {
      features.push({
        kind: 'river', name: `${RIVER_NAMES[k]!} RIVER`,
        x: (c.at % GRID + 0.5) * CELL, y: ((c.at / GRID | 0) + 0.5) * CELL,
      })
    })
  }

  const map: WorldMap = {
    GRID, CELL, WORLD, elev, terr, road, roads, bridges, features, waterSurf, slope, towns, seed,
    ...(theater ? { theaterId: theater.meta.id } : {}),
    fob: { x: (fobCell.gx + 0.5) * CELL, y: (fobCell.gy + 0.5) * CELL },
    enemyBase: { x: (baseCell.gx + 0.5) * CELL, y: (baseCell.gy + 0.5) * CELL },
    idx,
    inBounds: (gx, gy) => gx >= 0 && gy >= 0 && gx < GRID && gy < GRID,
    cellAt(x, y) {
      const gx = Math.max(0, Math.min(GRID - 1, Math.floor(x / CELL)))
      const gy = Math.max(0, Math.min(GRID - 1, Math.floor(y / CELL)))
      return idx(gx, gy)
    },
    terrAt(x, y) { return terr[map.cellAt(x, y)] as Terrain },
    terrNameAt(x, y) {
      const i = map.cellAt(x, y)
      return road[i] ? ROAD_NAME[road[i]!]! : TERR_NAME[terr[i]!]!
    },
    elevAt(x, y) { return elev[map.cellAt(x, y)]! },
    moveFactor(x, y, mob: Mobility) {
      return map.moveFactorCell(map.cellAt(x, y), mob)
    },
    moveFactorCell(i, mob: Mobility) {
      const f = MOVE_FACTORS[mob]
      if (road[i]) return f[ROAD_NAME[road[i]!]!]
      return f[TERR_NAME[terr[i]!]!]
    },
  }
  return map
}

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

// Prim's MST on euclidean distance between node cells
function mstEdges(nodes: Array<{ gx: number; gy: number }>): Array<[number, number]> {
  const inTree = new Set([0])
  const edges: Array<[number, number]> = []
  while (inTree.size < nodes.length) {
    let best: { a: number; b: number; d: number } | null = null
    for (const a of inTree) {
      for (let b = 0; b < nodes.length; b++) {
        if (inTree.has(b)) continue
        const d = Math.hypot(nodes[a]!.gx - nodes[b]!.gx, nodes[a]!.gy - nodes[b]!.gy)
        if (!best || d < best.d) best = { a, b, d }
      }
    }
    edges.push([best!.a, best!.b])
    inTree.add(best!.b)
  }
  return edges
}

// A* used only at generation time to lay roads (slope-averse, bridges
// expensive). waterCost Infinity = this class may not cross water at all
// (dirt paths — only engineered roads get bridges).
function roadAstar(
  from: { gx: number; gy: number }, to: { gx: number; gy: number },
  elev: Float32Array, terr: Uint8Array, GRID: number, waterCost = 60,
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
      // "between" them (corner-cutting the river) — treat it as a crossing:
      // impossible for paths, worse than a real perpendicular bridge for roads
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
