// Terrain generation with real hydrology: elevation first, then depression
// filling (priority flood), D8 flow accumulation to trace rivers along true
// drainage lines, lakes only where water would actually pond.
// Ported verbatim from src/game/mapgen.js — behavior-identical per seed+size.
import { createNoise2D } from 'simplex-noise'
import { makeRng } from '../engine/rng'
import { MinHeap } from './minheap'
import { MOVE_FACTORS, type Mobility } from './mobility'
import {
  CELL, GRID_DEFAULT, TERR_NAME, T_FIELD, T_FOREST, T_URBAN, T_WATER,
  type Terrain, type Town, type WorldMap,
} from './WorldMap'

const D8: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
]

export function genMap(seed: number, gridSize: number = GRID_DEFAULT): WorldMap {
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

  // --- 1. elevation: domain-warped fbm + ridged component ---
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
  for (const t of towns) {
    const size = 4 + Math.floor(rng() * 4)
    for (let dy = -size; dy <= size; dy++) {
      for (let dx = -size; dx <= size; dx++) {
        if (rng() < 0.65 && Math.hypot(dx, dy) < size) {
          const x = t.gx + dx, y = t.gy + dy
          if (x < 1 || y < 1 || x >= GRID - 1 || y >= GRID - 1) continue
          const i = idx(x, y)
          if (terr[i] !== T_WATER && slope[i]! < 8) terr[i] = T_URBAN
        }
      }
    }
  }

  // --- 11. roads: MST over strongpoints, slope-averse, bridge at narrows ---
  const nodes = [
    { gx: fobCell.gx, gy: fobCell.gy },
    ...towns.map(t => ({ gx: t.gx, gy: t.gy })),
    { gx: baseCell.gx, gy: baseCell.gy },
  ]
  const edges = mstEdges(nodes)
  if (towns.length >= 2) edges.push([1, 2])
  for (const [a, b] of edges) {
    const path = roadAstar(nodes[a]!, nodes[b]!, elev, terr, GRID)
    for (const i of path) road[i] = 1
  }

  const map: WorldMap = {
    GRID, CELL, WORLD, elev, terr, road, waterSurf, slope, towns, seed,
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
      return road[i] ? 'road' : TERR_NAME[terr[i]!]!
    },
    elevAt(x, y) { return elev[map.cellAt(x, y)]! },
    moveFactor(x, y, mob: Mobility) {
      const i = map.cellAt(x, y)
      const f = MOVE_FACTORS[mob]
      if (road[i]) return f.road
      return f[TERR_NAME[terr[i]!]!]
    },
    moveFactorCell(i, mob: Mobility) {
      const f = MOVE_FACTORS[mob]
      if (road[i]) return f.road
      return f[TERR_NAME[terr[i]!]!]
    },
  }
  return map
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

// A* used only at generation time to lay roads (slope-averse, bridges expensive)
function roadAstar(
  from: { gx: number; gy: number }, to: { gx: number; gy: number },
  elev: Float32Array, terr: Uint8Array, GRID: number,
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
      let c = 1
      if (terr[ni] === T_WATER) c = 60
      else if (terr[ni] === T_FOREST) c = 2.6
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
