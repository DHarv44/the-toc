// Front line & territory control — the campaign's COP assessment layer.
//
// Control is computed as TWO COMPETING FLOODS over a coarse grid: friendly
// influence spreads from the player's REAL units and installations (plus a
// rear anchor), enemy influence spreads from KNOWN intel (live/stale contacts,
// spotted structures) plus the campaign's assessed seeds beyond the authored
// phase line. The spread cost is TERRAIN-DEPENDENT — water is expensive to
// cross, climbs are expensive, roads are cheap — so the frontier where the two
// floods meet runs where a staff officer would draw it: along rivers, around
// high ground, bulging up the roads actually being used. The meeting line is
// the FLOT; ground the enemy flood reaches first is painted enemy-held.
//
// It is deliberately an ASSESSMENT, not ground truth: fog-hidden enemies the
// battalion has never seen don't bend the trace — the phase-line seeds claim
// their ground wholesale, and completing missions rolls those seeds north.
import type { GameState } from './GameState'
import { MinHeap } from '../world/minheap'
import { T_FOREST, T_WATER, type Vec2 } from '../world/WorldMap'

const REFRESH = 4         // sim-seconds between recomputes (slow-moving layer)

export interface ControlField {
  res: number
  cellM: number                 // meters per control cell
  ctl: Float32Array             // res² — >0 friendly, <0 enemy (normalized ±1)
  paths: Vec2[][]               // FLOT trace: chained, Chaikin-smoothed polylines (world m)
  tint: HTMLCanvasElement       // res² enemy-territory wash
}

let cache: { t: number; mapRef: unknown; field: ControlField } | null = null

// seed head starts: a stronger source projects influence further (its flood
// begins "ahead" by w × HEAD meters of cost-distance)
const HEAD = 550
const W_UNIT = 1.0, W_STRUCT = 2.2, W_CONTACT = 1.3, W_ASSESS = 1.0, W_REAR = 0.8

export function controlField(S: GameState): ControlField | null {
  const c = S.campaign
  if (!c || !S.map) return null
  if (cache && cache.mapRef === S.map && S.t >= cache.t && S.t - cache.t < REFRESH) return cache.field

  const m = S.map
  const WORLD = m.WORLD
  const RES = m.GRID >> 1                      // 100 m control cells on a 50 m map grid
  const cellM = WORLD / RES
  const N = RES * RES

  // --- terrain step cost per control cell (aggregated from the 2×2 map cells)
  // base 1 per cell; water is near-impassable unless bridged; forest and slope
  // drag; roads pull the flood along them (that's where advances actually run)
  const cost = new Float32Array(N)
  {
    const G = m.GRID
    for (let cy = 0; cy < RES; cy++) {
      for (let cx = 0; cx < RES; cx++) {
        let water = 0, road = 0, forest = 0, n = 0
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const gx = cx * 2 + dx, gy = cy * 2 + dy
            if (gx >= G || gy >= G) continue
            const i = gy * G + gx
            n++
            if (m.road[i]) road++
            else if (m.terr[i] === T_WATER) water++
            else if (m.terr[i] === T_FOREST) forest++
          }
        }
        let k = 1
        if (road) k *= 0.6                          // bridges count as road: passable
        if (water) k += (water / n) * 9              // unbridged water: a real obstacle
        if (forest) k += (forest / n) * 0.7
        cost[cy * RES + cx] = k
      }
    }
    // slope drag from the elevation field (control-cell resolution)
    const eAt = (cx: number, cy: number) => m.elev[(Math.min(m.GRID - 1, cy * 2) * m.GRID) + Math.min(m.GRID - 1, cx * 2)]!
    for (let cy = 0; cy < RES; cy++) {
      for (let cx = 0; cx < RES; cx++) {
        const e = eAt(cx, cy)
        const g = Math.max(
          Math.abs(eAt(Math.min(RES - 1, cx + 1), cy) - e),
          Math.abs(eAt(cx, Math.min(RES - 1, cy + 1)) - e),
        )
        cost[cy * RES + cx] += Math.min(1.6, g * 0.055)
      }
    }
  }

  // --- seed sets --------------------------------------------------------------
  type Seed = { x: number; y: number; w: number }
  const fr: Seed[] = [], en: Seed[] = []
  for (const u of S.units) {
    if (u.strength <= 0) continue
    const w = W_UNIT * (0.4 + 0.6 * u.strength / 100)
    if (u.side === 'friend') fr.push({ x: u.x, y: u.y, w })
    else if (!S.fogEnabled) en.push({ x: u.x, y: u.y, w })
  }
  if (S.fogEnabled) {
    for (const ct of S.contacts.values()) {
      if (ct.strength <= 0) continue
      en.push({ x: ct.x, y: ct.y, w: W_CONTACT * (ct.live ? 1 : 0.6) })
    }
  }
  for (const st of S.structures) {
    if (st.side === 'friend') fr.push({ x: st.x, y: st.y, w: W_STRUCT })
    else if (!S.fogEnabled || S.structContacts.has(st.id)) en.push({ x: st.x, y: st.y, w: W_STRUCT })
  }
  // assessment prior: seed rows either side of the authored phase line (the
  // floods fight to a midline ≈ frontY, warped by the terrain between them),
  // plus rear anchors so neither side's deep rear can flip empty
  for (let x = cellM / 2; x < WORLD; x += cellM * 2) {
    en.push({ x, y: c.frontY - 1200, w: W_ASSESS })
    fr.push({ x, y: c.frontY + 1200, w: W_ASSESS })
    en.push({ x, y: cellM, w: W_REAR })
    fr.push({ x, y: WORLD - cellM, w: W_REAR })
  }

  // --- multi-source Dijkstra flood (8-neighbour, cost in meters-equivalent) ---
  const flood = (seeds: Seed[]): Float32Array => {
    const d = new Float32Array(N).fill(Infinity)
    const heap = new MinHeap()
    for (const s of seeds) {
      const cx = Math.max(0, Math.min(RES - 1, Math.floor(s.x / cellM)))
      const cy = Math.max(0, Math.min(RES - 1, Math.floor(s.y / cellM)))
      const i = cy * RES + cx
      const d0 = -s.w * HEAD
      if (d0 < d[i]!) { d[i] = d0; heap.push(i, d0) }
    }
    const seen = new Uint8Array(N)
    while (heap.size) {
      const cur = heap.pop()
      if (seen[cur]) continue
      seen[cur] = 1
      const cx = cur % RES, cy = (cur / RES) | 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          const nx = cx + dx, ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= RES || ny >= RES) continue
          const ni = ny * RES + nx
          if (seen[ni]) continue
          const step = (dx && dy ? 1.414 : 1) * cellM * 0.5 * (cost[cur]! + cost[ni]!)
          const nd = d[cur]! + step
          if (nd < d[ni]!) { d[ni] = nd; heap.push(ni, nd) }
        }
      }
    }
    return d
  }
  const dF = flood(fr), dE = flood(en)

  // --- control: who reaches each cell first, normalized to ±1 ------------------
  const ctl = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const f = dF[i]!, e = dE[i]!
    if (!isFinite(f) && !isFinite(e)) { ctl[i] = 0; continue }
    if (!isFinite(f)) { ctl[i] = -1; continue }
    if (!isFinite(e)) { ctl[i] = 1; continue }
    ctl[i] = Math.max(-1, Math.min(1, (e - f) / 1200))
  }

  // --- FLOT trace: marching squares on the zero contour, then chained into
  // polylines and Chaikin-smoothed so it reads hand-drawn, not gridded --------
  const segs: Array<{ a: Vec2; b: Vec2 }> = []
  {
    const at = (gx: number, gy: number) => ctl[gy * RES + gx]!
    const lerp = (a: number, b: number) => (a === b ? 0.5 : a / (a - b))
    for (let gy = 0; gy < RES - 1; gy++) {
      for (let gx = 0; gx < RES - 1; gx++) {
        const tl = at(gx, gy), tr = at(gx + 1, gy), br = at(gx + 1, gy + 1), bl = at(gx, gy + 1)
        const idx = (tl > 0 ? 8 : 0) | (tr > 0 ? 4 : 0) | (br > 0 ? 2 : 0) | (bl > 0 ? 1 : 0)
        if (idx === 0 || idx === 15) continue
        const x = (gx + 0.5) * cellM, y = (gy + 0.5) * cellM
        const top = { x: x + lerp(tl, tr) * cellM, y }
        const bot = { x: x + lerp(bl, br) * cellM, y: y + cellM }
        const left = { x, y: y + lerp(tl, bl) * cellM }
        const right = { x: x + cellM, y: y + lerp(tr, br) * cellM }
        const put = (a: Vec2, b: Vec2) => segs.push({ a, b })
        switch (idx) {
          case 1: case 14: put(left, bot); break
          case 2: case 13: put(bot, right); break
          case 3: case 12: put(left, right); break
          case 4: case 11: put(top, right); break
          case 5: put(left, top); put(bot, right); break
          case 6: case 9: put(top, bot); break
          case 7: case 8: put(left, top); break
          case 10: put(top, right); put(left, bot); break
        }
      }
    }
  }
  const paths = smoothPaths(chainSegs(segs))

  // --- enemy-territory wash, painted once per recompute at field resolution ---
  const tint = document.createElement('canvas')
  tint.width = tint.height = RES
  const tctx = tint.getContext('2d')!
  const img = tctx.createImageData(RES, RES)
  for (let i = 0; i < N; i++) {
    const v = ctl[i]!
    if (v >= 0) continue
    const a = Math.min(0.30, 0.10 + Math.min(1, -v) * 0.20)
    const o = i * 4
    img.data[o] = 205; img.data[o + 1] = 46; img.data[o + 2] = 46; img.data[o + 3] = a * 255
  }
  tctx.putImageData(img, 0, 0)

  const field: ControlField = { res: RES, cellM, ctl, paths, tint }
  cache = { t: S.t, mapRef: S.map, field }
  return field
}

// chain unordered marching-squares segments into polylines (endpoint matching
// on a quantized key), so the trace can be smoothed and stroked as curves
function chainSegs(segs: Array<{ a: Vec2; b: Vec2 }>): Vec2[][] {
  const key = (p: Vec2) => `${Math.round(p.x * 2)}:${Math.round(p.y * 2)}`
  const adj = new Map<string, Array<{ seg: number; end: 0 | 1 }>>()
  segs.forEach((s, i) => {
    const ka = key(s.a), kb = key(s.b)
    if (!adj.has(ka)) adj.set(ka, [])
    if (!adj.has(kb)) adj.set(kb, [])
    adj.get(ka)!.push({ seg: i, end: 0 })
    adj.get(kb)!.push({ seg: i, end: 1 })
  })
  const used = new Uint8Array(segs.length)
  const paths: Vec2[][] = []
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue
    used[i] = 1
    // walk both directions from this seed segment
    const path: Vec2[] = [segs[i]!.a, segs[i]!.b]
    for (const dir of [1, 0] as const) {
      let cur = dir ? path[path.length - 1]! : path[0]!
      for (;;) {
        const links = adj.get(key(cur)) ?? []
        const next = links.find(l => !used[l.seg])
        if (!next) break
        used[next.seg] = 1
        const s = segs[next.seg]!
        cur = next.end === 0 ? s.b : s.a
        if (dir) path.push(cur)
        else path.unshift(cur)
      }
    }
    if (path.length >= 2) paths.push(path)
  }
  return paths
}

// two Chaikin corner-cut passes — same treatment the road renderer gets
function smoothPaths(paths: Vec2[][]): Vec2[][] {
  const pass = (pts: Vec2[]): Vec2[] => {
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
  return paths.map(p => pass(pass(p)))
}

// test/dev hook: drop the cache so the next call recomputes
export function invalidateControl(): void { cache = null }
