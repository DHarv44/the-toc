// MAP FROM PACK — the factory that turns a Groundwork export into a WorldMap.
//
// This is the pack pipeline's assembly point (GROUNDWORK.md P3): each service
// contributes one concern — frame, elevation, surface, culture — and this
// composes them into the same contract genMap produced, so everything behind
// the WorldMap seam (movement, combat, fog, pathfinding, both renderers-for-
// now) runs unchanged on real geography.
//
// What is deliberately NOT here:
//  - no procgen: nothing is invented; water, woods, towns and roads are data
//  - no bridges yet: a stamped road cell wins the moveFactor lookup over the
//    water beneath it, so crossings PRICE correctly — the drawn deck and
//    targetable span come later
//  - fob/enemyBase are SCENARIO, not geography: the sidecar places them; the
//    fallback puts them on opposite corners of viable ground
import type { PackMapSidecar } from '../../packs/map-files'
import { MOVE_FACTORS, ROAD_NAME, type Mobility } from '../mobility'
import { TERR_NAME, T_WATER, type Terrain, type Vec2, type WorldMap } from '../WorldMap'
import { nearestLand } from '../place'
import type { Ground } from './loadGround'
import { frameOf, normToWorld } from './frame'
import { elevationOf } from './elevation'
import { terrainOf, roadsOf } from './surface'
import { townsOf, featuresOf } from './culture'

export function mapFromPack(ground: Ground, sidecar: PackMapSidecar): WorldMap {
  const f = frameOf(ground.files.manifest)
  const { GRID, CELL, WORLD } = f
  const { elev, slope } = elevationOf(ground.hf, f)
  const terr = terrainOf(ground.vectors, f)
  const { roads, raster: road } = roadsOf(ground.vectors, f)
  const towns = townsOf(ground.vectors, f)
  const features = featuresOf(ground.vectors, f)

  // water carries its own surface: flat at the cell's elevation is enough for
  // both renderers' depth shading until the exact renderer reads the polygons
  const waterSurf = new Float32Array(elev)

  const idx = (gx: number, gy: number) => gy * GRID + gx

  // scenario anchors: authored in the sidecar (pack norm coords), or opposite
  // corners of the square nudged onto ground a unit can actually stand on
  const anchor = (authored: { x: number; y: number } | undefined, fx: number, fy: number): Vec2 => {
    const want = authored ? normToWorld(f, authored.x, authored.y) : { x: WORLD * fx, y: WORLD * fy }
    return nearestLand(map, want.x, want.y)
  }

  const map: WorldMap = {
    GRID, CELL, WORLD, elev, terr, road, roads, bridges: [], features, waterSurf, slope, towns,
    seed: 0, // nothing regenerates from it; identity is map.ref
    fob: { x: 0, y: 0 },        // placed below, once the query surface exists
    enemyBase: { x: 0, y: 0 },
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
      const fac = MOVE_FACTORS[mob]
      if (road[i]) return fac[ROAD_NAME[road[i]!]!]
      return fac[TERR_NAME[terr[i]!]!]
    },
  }
  // south-west for the friendly base, north-east for the enemy — same compass
  // logic the generator used, on ground instead of bands
  map.fob = anchor(sidecar.fob, 0.22, 0.78)
  map.enemyBase = anchor(sidecar.enemyBase, 0.78, 0.22)

  // guard against a sidecar/fallback landing both anchors in one lake corner
  if (Math.hypot(map.fob.x - map.enemyBase.x, map.fob.y - map.enemyBase.y) < WORLD * 0.2) {
    map.enemyBase = nearestLand(map, WORLD * 0.78, WORLD * 0.22)
  }
  return map
}
