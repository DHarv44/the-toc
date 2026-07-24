// Terrain-anchored location references for radio traffic. Reports call out
// named terrain when something is close enough to anchor to — "VIC CALDER",
// "VIC HILL 1190" — and fall back to a grid otherwise. Precision traffic
// (fire missions, waypoints, LKPs) should keep using raw grids.
import { grid } from '../lib/format'
import type { WorldMap } from './WorldMap'

export function locRef(map: WorldMap, x: number, y: number): string {
  let best: string | null = null
  let bd = Infinity
  for (const t of map.towns) {
    const d = Math.hypot(t.x - x, t.y - y)
    if (d < 1200 && d < bd) { bd = d; best = `VIC ${t.name}` }
  }
  for (const f of map.features) {
    if (f.kind !== 'hill') continue
    const d = Math.hypot(f.x - x, f.y - y)
    if (d < 900 && d < bd) { bd = d; best = `VIC ${f.name}` }
  }
  return best ?? `GRID ${grid(x, y)}`
}
