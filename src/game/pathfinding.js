import { CELL, MinHeap } from './mapgen.js'

// A* over the terrain grid for a mobility class. Returns array of world-space
// waypoints (cell centers, collinear points pruned), or null if unreachable.
// opts.crossCountry: strip the road speed bonus so tactical moves advance
// direct/off-road (roads still usable — and still the only water crossings).
// opts.roadBias: penalise off-road cells so a route sticks to the network.
// opts.roadsOnly: refuse off-road cells outright, except close to either end —
// a unit still has to get on and off the road somewhere.
export function findPath(map, sx, sy, tx, ty, mob, opts = {}) {
  const GRID = map.GRID
  // Road penalty. crossCountry (2.2) merely dampens the bonus — enough for the AI's
  // tactical advances, but wheeled roads are 3.1x better than open ground, so a route
  // still hugs them. offRoad (3.4) makes roads no cheaper than field for every mobility
  // class, which is what "the player clicked open ground, go there" actually needs.
  const xc = opts.offRoad ? 3.4 : opts.crossCountry ? 2.2 : 1
  const bias = opts.roadBias || 1
  const roadsOnly = !!opts.roadsOnly
  // Off-road slack allowed at each end in roads-only mode. Generous on purpose: the
  // order means "use the network for the trunk", not "refuse to move unless the
  // destination is itself paved" — a tight apron just makes the order fail.
  const APRON = 14
  const start = map.cellAt(sx, sy)
  let goal = map.cellAt(tx, ty)

  // if target cell impassable, walk outward to nearest passable cell
  if (!isFinite(map.moveFactorCell(goal, mob))) {
    const ggx = goal % GRID, ggy = (goal / GRID) | 0
    let found = null
    for (let r = 1; r < 60 && !found; r++) {
      for (let dy = -r; dy <= r && !found; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = ggx + dx, y = ggy + dy
        if (!map.inBounds(x, y)) continue
        if (isFinite(map.moveFactorCell(y * GRID + x, mob))) { found = y * GRID + x; break }
      }
    }
    if (found == null) return null
    goal = found
  }
  if (start === goal) return [{ x: tx, y: ty }]

  const N = GRID * GRID
  const g = new Float32Array(N).fill(Infinity)
  const came = new Int32Array(N).fill(-1)
  const closed = new Uint8Array(N)
  g[start] = 0
  const open = new MinHeap()
  open.push(start, 0)
  const gx0 = goal % GRID, gy0 = (goal / GRID) | 0
  const sx0 = start % GRID, sy0 = (start / GRID) | 0
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
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
      if (map.road[ni]) {
        if (xc > 1) f *= xc // dampen road preference for tactical moves
      } else {
        // off-road cell: blocked in roads-only mode unless we're still on the apron
        // at either end, otherwise merely penalised when a road route is wanted
        if (roadsOnly) {
          const nearStart = Math.abs(nx - sx0) <= APRON && Math.abs(ny - sy0) <= APRON
          const nearGoal = Math.abs(nx - gx0) <= APRON && Math.abs(ny - gy0) <= APRON
          if (!nearStart && !nearGoal) continue
        }
        if (bias > 1) f *= bias
      }
      const ng = g[cur] + ((dx && dy) ? 1.414 : 1) * f
      if (ng < g[ni]) {
        g[ni] = ng
        came[ni] = cur
        open.push(ni, ng + Math.hypot(nx - gx0, ny - gy0) * 0.5)
      }
    }
  }
  if (!ok) return null

  // reconstruct, convert to world coords
  const cells = []
  let c = goal
  while (c !== -1) { cells.push(c); c = came[c] }
  cells.reverse()
  const pts = cells.map(i => ({
    x: ((i % GRID) + 0.5) * CELL,
    y: (((i / GRID) | 0) + 0.5) * CELL,
  }))
  // prune collinear runs
  const out = [pts[0]]
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1], b = pts[i], d = pts[i + 1]
    const abx = b.x - a.x, aby = b.y - a.y, bdx = d.x - b.x, bdy = d.y - b.y
    if (abx * bdy - aby * bdx !== 0 || abx * bdx + aby * bdy < 0) out.push(b)
  }
  out.push(pts[pts.length - 1])
  out.shift() // drop the cell we're standing in
  return out.length ? out : [{ x: tx, y: ty }]
}
