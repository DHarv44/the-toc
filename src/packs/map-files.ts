// PACK MAP FILES — the battlefields a pack actually ships.
//
// A map is a folder under src/packs/<id>/maps/<mapId>/ holding the Groundwork
// export (ground.gwpack — GEOGRAPHY, with its own attribution inside) and a
// map.json sidecar (the SCENARIO layer: display name now; bases and MSR when
// P3 lands). Discovery is import.meta.glob over the pack folders, same as the
// GLB models: drop a folder in and the map exists, delete it and it doesn't.
//
// The .gwpack is globbed as a URL, not eagerly imported — it is megabytes of
// zip, fetched only when a map is actually opened (the editor's save writes
// it; mapFromPack consumes it).
const GROUND_URLS = import.meta.glob('./*/maps/*/ground.gwpack', {
  query: '?url', import: 'default', eager: true,
}) as Record<string, string>

const SIDECARS = import.meta.glob('./*/maps/*/map.json', {
  import: 'default', eager: true,
}) as Record<string, PackMapSidecar>

/** The scenario layer riding beside the ground. Everything optional but name —
 *  geography comes from the .gwpack, and the war is authored incrementally. */
export interface PackMapSidecar {
  name: string
  /** Base sites in normalized box coords (x west→east, y north→south). P3. */
  fob?: { x: number; y: number }
  enemyBase?: { x: number; y: number }
  /** MSR as an ordered list of place names to route through. P3. */
  msr?: string[]
  /** Satellite imagery permitted in-game (BFT underlay + feed SAT mode).
   *  A content decision, made at save: a fictional-world pack never wants
   *  Earth orthoimagery over its ground. Absent = NO satellite. */
  sat?: boolean
}

export interface PackMapEntry {
  packId: string
  mapId: string
  name: string
  groundUrl: string
  sidecar: PackMapSidecar
}

const ALL: PackMapEntry[] = Object.entries(GROUND_URLS)
  .map(([k, groundUrl]) => {
    // './1cd/maps/front-range/ground.gwpack' → packId '1cd', mapId 'front-range'
    const parts = k.replace(/^\.\//, '').split('/')
    const packId = parts[0]!, mapId = parts[2]!
    const sidecar = SIDECARS[`./${packId}/maps/${mapId}/map.json`] ?? { name: mapId }
    return { packId, mapId, name: sidecar.name ?? mapId, groundUrl, sidecar }
  })
  .sort((a, b) => a.packId.localeCompare(b.packId) || a.mapId.localeCompare(b.mapId))

/** Every map every installed pack ships, or one pack's. */
export function packMaps(packId?: string): PackMapEntry[] {
  return packId ? ALL.filter(m => m.packId === packId) : ALL
}

export function packMap(packId: string, mapId: string): PackMapEntry | undefined {
  return ALL.find(m => m.packId === packId && m.mapId === mapId)
}
