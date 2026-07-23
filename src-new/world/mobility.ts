// Terrain movement factors: effective speed = base speed / factor.
// A world/terrain concept (not a unit stat) — the map's moveFactor queries live on it,
// and unit specs reference a Mobility class by name.
export type Mobility = 'foot' | 'wheeled' | 'tracked'
export type TerrainName = 'field' | 'forest' | 'urban' | 'water'

export const MOVE_FACTORS: Record<Mobility, Record<TerrainName | 'road', number>> = {
  foot:    { field: 1.0,  forest: 1.25, urban: 1.0,  water: Infinity, road: 0.85 },
  wheeled: { field: 1.7,  forest: 5.0,  urban: 1.25, water: Infinity, road: 0.55 },
  tracked: { field: 1.15, forest: 2.6,  urban: 1.35, water: Infinity, road: 0.7  },
}
