// Placement queries: keep points on the map and off no-go terrain. Ported
// verbatim from src/game/sim.js (clampWorld/nearestLand); the seam change is
// taking the map as a parameter instead of closing over the state singleton,
// so world stays below the domains.
import type { WorldMap, Vec2 } from './WorldMap'
import type { Mobility } from './mobility'

export const clampWorld = (map: WorldMap | null, v: number): number =>
  Math.max(75, Math.min(map ? map.WORLD - 75 : v, v))

// spiral out from a target point to the nearest cell a given mobility class can
// actually occupy — used to keep spawns and rally points off water/no-go terrain
export function nearestLand(map: WorldMap, x: number, y: number, mob: Mobility = 'tracked'): Vec2 {
  x = clampWorld(map, x); y = clampWorld(map, y)
  if (isFinite(map.moveFactor(x, y, mob))) return { x, y }
  for (let r = 1; r < 50; r++) {
    const n = r * 8
    for (let a = 0; a < n; a++) {
      const ang = (a / n) * Math.PI * 2
      const px = clampWorld(map, x + Math.cos(ang) * r * 120)
      const py = clampWorld(map, y + Math.sin(ang) * r * 120)
      if (isFinite(map.moveFactor(px, py, mob))) return { x: px, y: py }
    }
  }
  return { x, y }
}
