// The typed world model: terrain rasters + query surface returned by genMap.
// NOTE: carries closures — never JSON-serialize a WorldMap; persist { seed, GRID }
// and regenerate (genMap is deterministic per seed+size).
import type { Mobility, RoadName, TerrainName } from './mobility'

// terrain codes (raster values in `terr`)
export const T_FIELD = 0, T_FOREST = 1, T_URBAN = 2, T_WATER = 3
export type Terrain = typeof T_FIELD | typeof T_FOREST | typeof T_URBAN | typeof T_WATER
export const TERR_NAME: readonly TerrainName[] = ['field', 'forest', 'urban', 'water']

// road classes (raster values in `road`; 0 = none). The vector polylines in
// `roads` are the source of truth — the raster is stamped from them for O(1)
// mobility/pathfinding lookups.
export const R_PATH = 1, R_ROAD = 2, R_HIGHWAY = 3
export type RoadClass = typeof R_PATH | typeof R_ROAD | typeof R_HIGHWAY

export const GRID_DEFAULT = 256   // default (large) cells per side
export const CELL = 50            // meters per cell (constant across sizes)
export const WORLD_DEFAULT = GRID_DEFAULT * CELL

// selectable map sizes — cells per side (world span = size * CELL meters)
export const MAP_SIZES = {
  small: 96,    // 4.8 km — dev sandbox / quick skirmish
  medium: 160,  // 8.0 km
  large: 256,   // 12.8 km — the original full map
} as const
export type MapSizeKey = keyof typeof MAP_SIZES

export interface Vec2 { x: number; y: number }

export interface Town extends Vec2 {
  gx: number
  gy: number
  name: string
}

// one road as vector geometry: a Chaikin-smoothed world-space polyline with a
// class. Rendering draws these per-frame (crisp at any zoom); the sim never
// reads them — it reads the stamped raster.
export interface RoadPoly {
  cls: RoadClass
  pts: Vec2[]
}

// a road-over-water cell, with the road's heading there (for drawing the deck)
export interface BridgeSpan extends Vec2 {
  angle: number
  cls: RoadClass
}

// named terrain: rivers (biggest drainage lines) and hills (prominent peaks,
// military-labelled by elevation — "HILL 91"). Radio calls, briefings and
// objectives anchor to these instead of bare grid references.
export interface MapFeature extends Vec2 {
  kind: 'river' | 'hill'
  name: string
}

export interface WorldMap {
  GRID: number
  CELL: number
  WORLD: number
  elev: Float32Array
  terr: Uint8Array
  road: Uint8Array          // road class per cell (0 none / 1 path / 2 road / 3 highway)
  roads: RoadPoly[]
  bridges: BridgeSpan[]
  features: MapFeature[]
  waterSurf: Float32Array
  slope: Float32Array
  towns: Town[]
  seed: number
  theaterId?: string        // real-DEM theater the elevation came from (absent = procgen noise)
  fob: Vec2                 // friendly base site (mutable: dev sandbox relocates it)
  enemyBase: Vec2
  devView?: { cx: number; cy: number; fit: number }  // sandbox initial framing
  idx(gx: number, gy: number): number
  inBounds(gx: number, gy: number): boolean
  cellAt(x: number, y: number): number
  terrAt(x: number, y: number): Terrain
  terrNameAt(x: number, y: number): TerrainName | RoadName
  elevAt(x: number, y: number): number
  moveFactor(x: number, y: number, mob: Mobility): number
  moveFactorCell(i: number, mob: Mobility): number
}
