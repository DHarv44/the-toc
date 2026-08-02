// MAP IDENTITY — what "which map" means, in one place.
//
// A WorldMap carries closures and megabytes of raster; it is never serialized.
// What persists, and what a game is started FROM, is a MapRef: enough to build
// the same ground again. Procgen maps rebuild from seed + size (+ the real-DEM
// window and authored layout, while those last); pack maps are a pack's file
// and rebuild by reading it (P3 — GROUNDWORK.md).
//
// buildGameMap is the ONE async seam between "the player picked a map" and
// "S.map exists". The theater fetch lives here today; the pack fetch joins it
// in P3; initGame itself stays synchronous and takes a finished map.
import { genMap, type MapLayout } from './mapgen'
import { loadTheater } from './theaters'
import type { WorldMap } from './WorldMap'
import { packMap } from '../packs/map-files'
import { loadGround } from './pack/loadGround'
import { mapFromPack } from './pack/mapFromPack'

export type MapRef =
  | {
      kind: 'procgen'
      seed: number
      gridSize: number
      /** real-DEM source id (legacy baked patch — dies with procgen in P6) */
      theaterId?: string
      /** campaign-authored gazetteer, when the campaign plays procgen ground */
      layout?: MapLayout
    }
  | { kind: 'pack'; packId: string; mapId: string }

/**
 * Build the map a game will run on.
 *
 * `mapOk` is a mode's terrain requirement (e.g. King of the Hill needs a real
 * hill): procgen rerolls a bounded number of times to satisfy it — the reroll
 * arithmetic is verbatim from the old initGame, because the skirmish golden
 * hangs off the exact genMap call sequence. Pack ground is fixed; a mode
 * either fits it or the mode setup adapts (P5's problem, not this seam's).
 */
export async function buildGameMap(
  ref: MapRef,
  mapOk?: (m: WorldMap) => boolean,
): Promise<WorldMap> {
  if (ref.kind === 'pack') {
    const entry = packMap(ref.packId, ref.mapId)
    if (!entry) throw new Error(`no map ${ref.packId}/${ref.mapId} in any installed pack`)
    const ground = await loadGround(entry.groundUrl)
    const m = mapFromPack(ground, entry.sidecar)
    m.ref = ref
    return m
  }
  const theater = ref.theaterId ? await loadTheater(ref.theaterId) : undefined
  let m = genMap(ref.seed, ref.gridSize, theater, ref.layout)
  if (mapOk) {
    for (let a = 1; a <= 24 && !mapOk(m); a++) {
      m = genMap((ref.seed + a * 7919) >>> 0, ref.gridSize, theater, ref.layout)
    }
  }
  m.ref = ref
  return m
}
