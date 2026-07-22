import { CELL, MinHeap } from './mapgen.js'

// A* over the terrain grid for a mobility class. Returns array of world-space
// waypoints (cell centers, collinear points pruned), or null if unreachable.
// opts.crossCountry: strip the road speed bonus so tactical moves advance
// direct/off-road (roads still usable — and still the only water crossings).
export function findPath(map, sx, sy, tx, ty, mob, opts = {}) {
  const GRID = map.GRID
  const xc = opts.crossCountry ? 2.2 : 1
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
      if (xc > 1 && map.road[ni]) f *= xc // dampen road preference for tactical moves
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
