// THE ROAD GRAPH — routing on the roads that actually exist.
//
// Cell A* walks a raster and stair-steps within half a cell of the road it
// thinks it is on; on an exact sheet that reads as a convoy driving through
// front gardens. This routes on the network itself: a junction graph built
// once per pack map from the real polylines, edges carrying their true
// geometry, length and class.
//
// Cost is TIME — length × the mobility factor for the edge's class — which is
// the whole of the "Google Maps" behaviour (GROUNDWORK.md P5b): local streets
// to the on-ramp because that is the fastest way to the fast network,
// arterials for the trunk because shortcuts lose on the clock, and a dirt
// track for the last leg because the destination is at the end of one. No
// mode ever fails; preference is arithmetic.
//
// Profiles multiply that honest time per class: `fastest` is the identity;
// `convoy` is doctrine — a column pays extra for alleys and tracks beyond
// their real slowness, because width, predictability and the MSR matter to a
// column in ways a clock does not measure. (Authored-MSR discounts hook in
// here later.)
//
// Junction detection leans on the data: OSM ways share exact vertices where
// they intersect, and the pack's floats survive the trip — vertices are
// quantized to half a metre so float wobble cannot split a junction. An
// overpass that shares no vertex correctly does NOT connect.
import { MinHeap } from '../minheap'
import { MOVE_FACTORS, ROAD_NAME, type Mobility } from '../mobility'
import type { RoadClass, Vec2, WorldMap } from '../WorldMap'

export type RouteProfile = 'fastest' | 'convoy'

// per-class multipliers over honest time (indexed by RoadClass 1..5)
const PROFILE_WEIGHT: Record<RouteProfile, readonly number[]> = {
  fastest: [0, 1, 1, 1, 1, 1],
  convoy: [0, 4, 2.5, 1.3, 1.05, 1],
}

interface Edge {
  a: number               // node index
  b: number
  pts: Vec2[]             // full geometry, a → b
  len: number
  cls: RoadClass
  /** cumulative length at each pt, for splitting at an entry/exit point */
  cum: number[]
}

interface Graph {
  nodes: Vec2[]
  edges: Edge[]
  adj: number[][]         // node index → edge indices
  // spatial hash of edge SEGMENTS for nearest-point-on-network queries
  buckets: Map<number, number[]>   // bucket key → edge indices (deduped)
  bucketSize: number
}

const QUANT = 2 // vertex quantization: 1/QUANT metres

const graphs = new WeakMap<WorldMap, Graph>()

export function roadGraphOf(map: WorldMap): Graph {
  let g = graphs.get(map)
  if (!g) {
    g = build(map)
    graphs.set(map, g)
  }
  return g
}

function build(map: WorldMap): Graph {
  const key = (p: Vec2) =>
    (Math.round(p.x * QUANT) * 0x400000) + Math.round(p.y * QUANT)

  // pass 1 — how many polyline vertices land on each quantized point. A count
  // above 1 is two ways meeting: a junction.
  const count = new Map<number, number>()
  for (const r of map.roads) {
    for (const p of r.pts) {
      const k = key(p)
      count.set(k, (count.get(k) ?? 0) + 1)
    }
  }

  const nodes: Vec2[] = []
  const nodeAt = new Map<number, number>()
  const nodeOf = (p: Vec2): number => {
    const k = key(p)
    let i = nodeAt.get(k)
    if (i === undefined) {
      i = nodes.length
      nodes.push(p)
      nodeAt.set(k, i)
    }
    return i
  }

  // pass 2 — cut each polyline at its junctions; each piece is one edge
  const edges: Edge[] = []
  for (const r of map.roads) {
    let runPts: Vec2[] = [r.pts[0]!]
    for (let i = 1; i < r.pts.length; i++) {
      const p = r.pts[i]!
      runPts.push(p)
      const isEnd = i === r.pts.length - 1
      if (isEnd || (count.get(key(p)) ?? 0) > 1) {
        if (runPts.length >= 2) {
          let len = 0
          const cum = [0]
          for (let s = 1; s < runPts.length; s++) {
            len += Math.hypot(runPts[s]!.x - runPts[s - 1]!.x, runPts[s]!.y - runPts[s - 1]!.y)
            cum.push(len)
          }
          if (len > 0) {
            edges.push({ a: nodeOf(runPts[0]!), b: nodeOf(p), pts: runPts, len, cls: r.cls, cum })
          }
        }
        runPts = [p]
      }
    }
  }

  const adj: number[][] = nodes.map(() => [])
  edges.forEach((e, i) => { adj[e.a]!.push(i); adj[e.b]!.push(i) })

  // spatial hash — bucket every edge by the cells its segments pass through
  const bucketSize = Math.max(200, map.CELL * 4)
  const buckets = new Map<number, number[]>()
  const bkey = (bx: number, by: number) => bx * 0x8000 + by
  edges.forEach((e, i) => {
    let lastB = -1
    for (const p of e.pts) {
      const b = bkey(Math.floor(p.x / bucketSize), Math.floor(p.y / bucketSize))
      if (b === lastB) continue
      lastB = b
      const arr = buckets.get(b)
      if (!arr) buckets.set(b, [i])
      else if (arr[arr.length - 1] !== i) arr.push(i)
    }
  })

  return { nodes, edges, adj, buckets, bucketSize }
}

// ---- nearest point on the network -----------------------------------------

interface NetPoint {
  edge: number
  /** metres along the edge (in cum terms) */
  at: number
  point: Vec2
  distSq: number
}

function nearestOnNetwork(g: Graph, x: number, y: number): NetPoint | null {
  const bx = Math.floor(x / g.bucketSize), by = Math.floor(y / g.bucketSize)
  let best: NetPoint | null = null
  // ring search outward until a hit ring is fully explored one ring beyond
  for (let r = 0; r < 64; r++) {
    if (best && r * g.bucketSize > Math.sqrt(best.distSq) + g.bucketSize) break
    const seen = new Set<number>()
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue // ring only
        const arr = g.buckets.get((bx + dx) * 0x8000 + (by + dy))
        if (!arr) continue
        for (const ei of arr) {
          if (seen.has(ei)) continue
          seen.add(ei)
          const e = g.edges[ei]!
          for (let s = 0; s + 1 < e.pts.length; s++) {
            const p = e.pts[s]!, q = e.pts[s + 1]!
            const vx = q.x - p.x, vy = q.y - p.y
            const L2 = vx * vx + vy * vy
            const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - p.x) * vx + (y - p.y) * vy) / L2)) : 0
            const px = p.x + vx * t, py = p.y + vy * t
            const d2 = (x - px) * (x - px) + (y - py) * (y - py)
            if (!best || d2 < best.distSq) {
              best = {
                edge: ei,
                at: e.cum[s]! + Math.sqrt(L2) * t,
                point: { x: px, y: py },
                distSq: d2,
              }
            }
          }
        }
      }
    }
  }
  return best
}

// ---- routing ---------------------------------------------------------------

const timeFactor = (mob: Mobility, cls: RoadClass, profile: RouteProfile): number =>
  MOVE_FACTORS[mob][ROAD_NAME[cls]!] * PROFILE_WEIGHT[profile][cls]!

/** geometry of an edge between two along-lengths (a ≤ b), as points */
function slice(e: Edge, a: number, b: number): Vec2[] {
  const out: Vec2[] = []
  const at = (d: number): Vec2 => {
    let s = 0
    while (s + 1 < e.cum.length && e.cum[s + 1]! < d) s++
    const seg = e.cum[s + 1]! - e.cum[s]! || 1
    const t = Math.max(0, Math.min(1, (d - e.cum[s]!) / seg))
    const p = e.pts[s]!, q = e.pts[Math.min(s + 1, e.pts.length - 1)]!
    return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }
  }
  out.push(at(a))
  for (let s = 0; s < e.pts.length; s++) {
    if (e.cum[s]! > a && e.cum[s]! < b) out.push(e.pts[s]!)
  }
  out.push(at(b))
  return out
}

/**
 * Route from world point to world point along the network. Returns waypoints
 * INCLUDING the on-ramp point, the real geometry, the off-ramp point, and the
 * destination itself — the caller's unit drives to the network, along it, off
 * it, and to the click. Null only when the map has no network at all.
 */
export function routeOnRoads(
  map: WorldMap, sx: number, sy: number, tx: number, ty: number,
  mob: Mobility, profile: RouteProfile = 'fastest',
): Vec2[] | null {
  const g = roadGraphOf(map)
  if (g.edges.length === 0) return null
  const from = nearestOnNetwork(g, sx, sy)
  const to = nearestOnNetwork(g, tx, ty)
  if (!from || !to) return null

  // same edge, no junction needed: drive the stretch between the two points
  if (from.edge === to.edge) {
    const e = g.edges[from.edge]!
    const [a, b] = from.at <= to.at ? [from.at, to.at] : [to.at, from.at]
    let pts = slice(e, a, b)
    if (from.at > to.at) pts = pts.reverse()
    return [...pts, { x: tx, y: ty }]
  }

  // A* over junction nodes, seeded from both ends of each entry/exit edge.
  // best per-metre factor for the heuristic (admissible: no edge is cheaper)
  const eF = g.edges[from.edge]!, eT = g.edges[to.edge]!
  let hBest = Infinity
  for (const p of [1, 2, 3, 4, 5] as const) {
    hBest = Math.min(hBest, timeFactor(mob, p, profile))
  }
  const goalPt = to.point
  const h = (n: number) =>
    Math.hypot(g.nodes[n]!.x - goalPt.x, g.nodes[n]!.y - goalPt.y) * hBest

  const N = g.nodes.length
  const dist = new Float64Array(N).fill(Infinity)
  const prevEdge = new Int32Array(N).fill(-1)
  const prevNode = new Int32Array(N).fill(-1)
  const closed = new Uint8Array(N)
  const open = new MinHeap()

  const fFac = timeFactor(mob, eF.cls, profile)
  dist[eF.a] = from.at * fFac
  dist[eF.b] = (eF.len - from.at) * fFac
  open.push(eF.a, dist[eF.a]! + h(eF.a))
  open.push(eF.b, dist[eF.b]! + h(eF.b))

  // exit costs from the goal side of the exit edge
  const tFac = timeFactor(mob, eT.cls, profile)
  const exitCost = (n: number): number | null => {
    if (n === eT.a) return to.at * tFac
    if (n === eT.b) return (eT.len - to.at) * tFac
    return null
  }

  let bestGoalNode = -1
  let bestTotal = Infinity
  while (open.size) {
    const n = open.pop()
    if (closed[n]) continue
    closed[n] = 1
    const ec = exitCost(n)
    if (ec !== null && dist[n]! + ec < bestTotal) {
      bestTotal = dist[n]! + ec
      bestGoalNode = n
      // keep expanding briefly — a cheaper approach to the other end may exist —
      // but the heap is monotone in f, so once popped costs pass bestTotal, stop
    }
    if (dist[n]! + h(n) > bestTotal) break
    for (const ei of g.adj[n]!) {
      const e = g.edges[ei]!
      const m = e.a === n ? e.b : e.a
      if (closed[m]) continue
      const nd = dist[n]! + e.len * timeFactor(mob, e.cls, profile)
      if (nd < dist[m]!) {
        dist[m] = nd
        prevEdge[m] = ei
        prevNode[m] = n
        open.push(m, nd + h(m))
      }
    }
  }
  if (bestGoalNode < 0) return null

  // reconstruct: junction chain → geometry
  const chain: number[] = []
  for (let n = bestGoalNode; n !== -1; n = prevNode[n]!) chain.push(n)
  chain.reverse()

  const pts: Vec2[] = []
  const push = (arr: Vec2[]) => {
    for (const p of arr) {
      const last = pts[pts.length - 1]
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 0.5) pts.push(p)
    }
  }
  // entry stretch: from.point to the first chain node along the entry edge
  const first = chain[0]!
  push(first === eF.a ? slice(eF, 0, from.at).reverse() : slice(eF, from.at, eF.len))
  // middle edges
  for (let i = 1; i < chain.length; i++) {
    const e = g.edges[prevEdge[chain[i]!]!]!
    push(chain[i] === e.b ? e.pts : [...e.pts].reverse())
  }
  // exit stretch: last chain node to to.point along the exit edge
  const last = chain[chain.length - 1]!
  push(last === eT.a ? slice(eT, 0, to.at) : slice(eT, to.at, eT.len).reverse())
  // and off the network to the click itself
  push([{ x: tx, y: ty }])
  return pts
}
