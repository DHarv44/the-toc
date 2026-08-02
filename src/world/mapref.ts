// MAP IDENTITY — what "which map" means, in one place.
//
// A WorldMap carries closures and megabytes of raster; it is never serialized.
// What persists, and what a game is started FROM, is a MapRef: enough to build
// the same ground again. Every map is a pack map (P6, GROUNDWORK.md — the
// generator and the baked DEM patches are gone): the ref names a pack's file
// and rebuilds by reading it.
//
// buildGameMap is the ONE async seam between "the player picked a map" and
// "S.map exists"; initGame stays synchronous and takes a finished map.
import type { WorldMap } from './WorldMap'
import { packMap } from '../packs/map-files'
import { loadGround } from './pack/loadGround'
import { mapFromPack } from './pack/mapFromPack'

export type MapRef = { kind: 'pack'; packId: string; mapId: string }

/** Build the map a game will run on. Pack ground is fixed: a mode either fits
 *  it or the mode's setup adapts — there is nothing to reroll. */
export async function buildGameMap(ref: MapRef): Promise<WorldMap> {
  const entry = packMap(ref.packId, ref.mapId)
  if (!entry) throw new Error(`no map ${ref.packId}/${ref.mapId} in any installed pack`)
  const ground = await loadGround(entry.groundUrl)
  const m = mapFromPack(ground, entry.sidecar)
  m.ref = ref
  return m
}
