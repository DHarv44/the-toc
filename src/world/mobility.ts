// Terrain movement factors: effective speed = base speed / factor.
// A world/terrain concept (not a unit stat) — the map's moveFactor queries live on it,
// and unit specs reference a Mobility class by name.
// Roads come in three classes (see WorldMap.RoadClass): dirt paths help wheels
// a lot over open ground, paved roads more, highways most. Foot troops barely
// care past "not brush".
export type Mobility = 'foot' | 'wheeled' | 'tracked'
export type TerrainName = 'field' | 'forest' | 'urban' | 'water'
export type RoadName = 'path' | 'road' | 'highway'

export const MOVE_FACTORS: Record<Mobility, Record<TerrainName | RoadName, number>> = {
  foot:    { field: 1.0,  forest: 1.25, urban: 1.0,  water: Infinity, path: 0.9,  road: 0.85, highway: 0.85 },
  wheeled: { field: 1.7,  forest: 5.0,  urban: 1.25, water: Infinity, path: 1.0,  road: 0.55, highway: 0.45 },
  tracked: { field: 1.15, forest: 2.6,  urban: 1.35, water: Infinity, path: 0.85, road: 0.7,  highway: 0.65 },
}

// raster road-class value (WorldMap.road[i]) → factor key; 0 = no road
export const ROAD_NAME: readonly (RoadName | null)[] = [null, 'path', 'road', 'highway']
