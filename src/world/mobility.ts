// Terrain movement factors: effective speed = base speed / factor.
// A world/terrain concept (not a unit stat) — the map's moveFactor queries live on it,
// and unit specs reference a Mobility class by name.
//
// Roads speak the DATA's vocabulary (GROUNDWORK.md P5b): the five observed
// OSM-derived classes a pack carries, not the three procgen used to invent.
// A motorway moves wheels almost four times faster than open ground; a dirt
// track barely helps them at all; foot troops barely care past "not brush".
// Procgen's three classes map onto these codes for its remaining lifetime.
export type Mobility = 'foot' | 'wheeled' | 'tracked'
export type TerrainName = 'field' | 'forest' | 'urban' | 'water'
export type RoadName = 'track' | 'minor' | 'secondary' | 'primary' | 'motorway'

// Built-up ground is WALLS: vehicles do not drive through a block of houses —
// they drive the streets between them (road cells win the lookup below, so a
// street through a district prices as street). Foot passes at a cost: alleys,
// courtyards, rubble — the whole reason infantry owns urban ground. This one
// asymmetry is the combined-arms split: dismounts cut blocks, vics own roads.
export const MOVE_FACTORS: Record<Mobility, Record<TerrainName | RoadName, number>> = {
  foot: {
    field: 1.0, forest: 1.25, urban: 1.3, water: Infinity,
    track: 0.9, minor: 0.88, secondary: 0.85, primary: 0.85, motorway: 0.85,
  },
  wheeled: {
    field: 1.7, forest: 5.0, urban: Infinity, water: Infinity,
    track: 1.0, minor: 0.8, secondary: 0.6, primary: 0.5, motorway: 0.45,
  },
  tracked: {
    field: 1.15, forest: 2.6, urban: Infinity, water: Infinity,
    track: 0.85, minor: 0.85, secondary: 0.72, primary: 0.68, motorway: 0.65,
  },
}

// raster road-class value (WorldMap.road[i]) → factor key; 0 = no road
export const ROAD_NAME: readonly (RoadName | null)[] =
  [null, 'track', 'minor', 'secondary', 'primary', 'motorway']
