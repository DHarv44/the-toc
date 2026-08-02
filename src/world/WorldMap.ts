// The typed world model: terrain rasters + query surface, built from a pack's
// ground file (world/pack/mapFromPack — GROUNDWORK.md).
// NOTE: carries closures — never JSON-serialize a WorldMap; persist `map.ref`
// (see ./mapref) and rebuild through buildGameMap by re-reading the file.
import type { MapRef } from './mapref'
import type { Mobility, RoadName, TerrainName } from './mobility'

// terrain codes (raster values in `terr`)
export const T_FIELD = 0, T_FOREST = 1, T_URBAN = 2, T_WATER = 3
export type Terrain = typeof T_FIELD | typeof T_FOREST | typeof T_URBAN | typeof T_WATER
export const TERR_NAME: readonly TerrainName[] = ['field', 'forest', 'urban', 'water']

// road classes (raster values in `road`; 0 = none) — the data's five-class
// vocabulary (GROUNDWORK.md P5b), ordered so a HIGHER value is always a
// better road and wins a stamping tie. The vector polylines in `roads` are
// the source of truth — the raster is stamped from them for O(1) mobility
// pricing (routing reads the road GRAPH on pack maps, not cells).
export const R_TRACK = 1, R_MINOR = 2, R_SECONDARY = 3, R_PRIMARY = 4, R_MOTORWAY = 5
export type RoadClass =
  | typeof R_TRACK | typeof R_MINOR | typeof R_SECONDARY
  | typeof R_PRIMARY | typeof R_MOTORWAY

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
// Named map features: generated terrain (hills, rivers) plus authored
// NON-DEPLOYABLE infrastructure — places, not assets. Infrastructure kinds are
// mission anchors and reasons to move into the emptier parts of the theater;
// they do nothing mechanically yet (functional effects like ford crossings or
// dam floods come with the missions that use them).
export type InfraKind = 'dam' | 'power' | 'rail' | 'depot' | 'comm' | 'ford' | 'camp'
export interface MapFeature extends Vec2 {
  kind: 'river' | 'hill' | InfraKind
  name: string
}

export interface WorldMap {
  GRID: number
  CELL: number
  WORLD: number
  elev: Float32Array
  terr: Uint8Array
  road: Uint8Array          // road class per cell (0 = none, else RoadClass)
  roads: RoadPoly[]
  bridges: BridgeSpan[]
  features: MapFeature[]
  waterSurf: Float32Array
  slope: Float32Array
  towns: Town[]
  seed: number
  /** How to build this map again — the identity that persists (see ./mapref). */
  ref?: MapRef
  /** The opened pack this map was built from — the exact renderer draws from
   *  it directly instead of from the sim rasters (pack maps only). */
  ground?: import('./pack/loadGround').Ground
  /** Satellite imagery permitted (map.json `sat`) — gates the BFT SAT
   *  underlay and the feed's SAT sensor mode. Content decides. */
  sat: boolean
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
