// Satellite imagery for pack ground — the builder's OWN intake, consumed as
// a package (groundwork-builder 0.2.0 exports it for exactly this: "a game's
// aerial camera wants mosaics by bounds and zoom"). fetchImagery pulls Esri
// World Imagery through the /api/imagery proxy, reprojects Web Mercator into
// the plate-carrée grid the DEM uses (so it registers with relief and the
// vectors), and rides a shared IndexedDB tile cache — namespaced by the
// configureBuilder call MapEditor makes at module load, which App imports
// statically, so the config is live before any fetch here can run.
//
// TOC adds only WHICH bounds — the whole box for the feed drape, the sim
// frame for the BFT sheet — and a session cache of the stitched canvases.
// Not pack bytes (upstream chose live-intake-with-cache over baking imagery
// into the .gwpack), so first view needs the net; after that the tiles are
// local.
import { fetchImagery } from '@dharv44/groundwork-builder'
import type { Bounds } from '@dharv44/groundwork-core'
import type { Ground } from './loadGround'
import type { Frame } from './frame'

/** Esri's required credit — printed wherever the imagery is shown. */
export const IMAGERY_CREDIT = 'Imagery © Esri — Esri, Maxar, Earthstar Geographics'

/** The frame window's own lat/lon bounds (the square the sim plays on). */
export function frameBounds(g: Ground, f: Frame): Bounds {
  const b = g.files.manifest.bounds
  const lonSpan = b.east - b.west, latSpan = b.north - b.south
  return {
    west: b.west + f.x0 * lonSpan,
    east: b.west + (f.x0 + f.spanX) * lonSpan,
    north: b.north - f.y0 * latSpan,
    south: b.north - (f.y0 + f.spanY) * latSpan,
  }
}

const cache = new Map<string, Promise<HTMLCanvasElement>>()

function imagery(key: string, bounds: Bounds): Promise<HTMLCanvasElement> {
  let hit = cache.get(key)
  if (!hit) {
    hit = fetchImagery(bounds).then(r => r.canvas)
    hit.catch(() => cache.delete(key)) // a dead net must not poison the session
    cache.set(key, hit)
  }
  return hit
}

/** The whole pack box — what the UAV feed drapes on the engine mesh. */
export function boxImagery(g: Ground): Promise<HTMLCanvasElement> {
  return imagery(`box:${g.files.manifest.id}`, g.files.manifest.bounds)
}

/** The sim frame only — what the BFT's SAT underlay blits. */
export function frameImagery(g: Ground, f: Frame): Promise<HTMLCanvasElement> {
  return imagery(`frame:${g.files.manifest.id}`, frameBounds(g, f))
}
