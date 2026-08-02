// GROUND LOADER — a pack map's .gwpack, fetched once and held open.
//
// The file is the map. Reading it is core's job (packFromBytes validates the
// container and every layer); this service only decides WHEN bytes move:
// fetched on first open, cached for the session — a campaign restart or a
// feed opening must not re-download 20 MB.
import { packFromBytes, parseVectors, readHeightField } from '@dharv44/groundwork-core'
import type { HeightField, PackFiles, PackVectors } from '@dharv44/groundwork-core'

export interface Ground {
  files: PackFiles
  hf: HeightField
  vectors: PackVectors
}

const cache = new Map<string, Promise<Ground>>()

export function loadGround(url: string): Promise<Ground> {
  let hit = cache.get(url)
  if (!hit) {
    hit = (async () => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`ground ${url}: HTTP ${res.status}`)
      const files = await packFromBytes(await res.arrayBuffer())
      return {
        files,
        hf: readHeightField(files),
        vectors: files.vectors
          ? parseVectors(files.vectors)
          : { roads: [], areas: [], places: [] },
      }
    })()
    // a failed fetch must not poison the cache — retry on next open
    hit.catch(() => cache.delete(url))
    cache.set(url, hit)
  }
  return hit
}
