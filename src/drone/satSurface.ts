// SAT high fidelity for the feed: the engine's imagery CLIPMAP.
//
// One-shot mosaics are budget-capped, so the whole-box drape lands coarse by
// design; sharpness comes from SMALLER bounds at the zooms they afford.
// TerrainSurface (engine 0.2.0) samples up to four nested rings coarse→fine
// in its shader and eases every swap — TOC runs only the logistics: nested
// boxes under the sensor look-point, each refetched when the look point
// leaves it, plus the base mosaic underneath. The engine mesh, the rings and
// everything standing on the ground share one datum (the pack heightfield).
import * as THREE from 'three'
import {
  TerrainSurface, DEFAULT_SURFACE_CONFIG, buildTerrain, computeSky,
} from '@dharv44/groundwork-engine'
import { fetchImagery } from '@dharv44/groundwork-builder'
import { S } from '../engine/state'
import type { WorldMap } from '../world/WorldMap'
import { normRectBounds } from '../world/pack/imagery'
import { groundCtx } from './ground'

// ring spans in metres, index 0 sharpest; ~1.4 km affords z17–18 (vehicles),
// the outer rings bridge to the base drape so no zoom band looks broken
const RING_SIZES = [1400, 4200, 12600] as const

interface RingState {
  size: number
  /** look-point the current texture was fetched around (NaN = never) */
  cx: number
  cy: number
  tex: THREE.CanvasTexture | null
  rect: readonly [number, number, number, number]
  busy: boolean
}

interface SatState {
  map: WorldMap
  surface: TerrainSurface
  rings: RingState[]
  baseTex: THREE.Texture | null
}

let state: SatState | null = null

/** The engine surface for the current map (created on first SAT frame). */
export function getSatSurface(): TerrainSurface {
  if (!state || state.map !== S.map) {
    state?.surface.dispose()
    for (const r of state?.rings ?? []) r.tex?.dispose()
    // the surface builds from the same heightfield the Lambert mesh uses —
    // its own build, because TerrainSurface owns normal/height textures too
    const build = buildTerrain(S.map!.ground!.hf, { detail: 1024, exaggeration: 1 })
    const surface = new TerrainSurface(build)
    surface.setConfig({
      ...DEFAULT_SURFACE_CONFIG,
      exaggeration: 1,          // true shape — must match the ground seam
      // a map whose sidecar shipped no satellite (map.json `sat`) is its own
      // world: SAT renders the engine's TERRAIN mode and never touches Esri
      textureMode: S.map!.sat ? 'satellite' : 'procedural',
    })
    surface.setSky(computeSky(135, 55)) // fixed clear-day light, SE sun
    state = {
      map: S.map!,
      surface,
      rings: RING_SIZES.map(size => ({
        size, cx: NaN, cy: NaN, tex: null, rect: [0, 0, 1, 1] as const, busy: false,
      })),
      baseTex: null,
    }
  }
  return state.surface
}

function pushLayers(s: SatState): void {
  s.surface.setLayers({
    imagery: s.baseTex,
    imageryRings: s.rings.map(r => (r.tex ? { texture: r.tex, rect: r.rect } : null)),
  })
}

/** Per-frame: advance fades, keep the rings centred on the look-point. */
export function satSurfaceFrame(
  dt: number, lookX: number, lookY: number, baseTex: THREE.Texture | null,
): void {
  const s = state
  if (!s || s.map !== S.map) return
  s.surface.update(dt)
  if (!S.map!.sat) return // terrain-mode world: no imagery, no rings, no fetches
  if (baseTex && s.baseTex !== baseTex) { s.baseTex = baseTex; pushLayers(s) }
  const { f } = groundCtx()
  const g = S.map!.ground!
  for (const r of s.rings) {
    if (r.busy) continue
    // still centred well enough — a refetch buys nothing yet
    if (Math.hypot(lookX - r.cx, lookY - r.cy) < r.size * 0.22) continue
    r.busy = true
    const fx = lookX, fy = lookY
    const half = r.size / 2
    // world → pack-norm (the engine's UV space), clamped to the box
    const n = (x: number, y: number) => ({
      nx: Math.max(0, Math.min(1, f.x0 + (x / f.WORLD) * f.spanX)),
      ny: Math.max(0, Math.min(1, f.y0 + (y / f.WORLD) * f.spanY)),
    })
    const a = n(fx - half, fy - half), b = n(fx + half, fy + half)
    if (b.nx - a.nx < 1e-4 || b.ny - a.ny < 1e-4) { r.busy = false; continue }
    fetchImagery(normRectBounds(g, a.nx, a.ny, b.nx, b.ny))
      .then(res => {
        if (state !== s) return // map changed under the fetch
        const tex = new THREE.CanvasTexture(res.canvas)
        tex.flipY = false
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 8
        r.tex?.dispose()
        r.tex = tex
        r.rect = [a.nx, a.ny, b.nx, b.ny]
        r.cx = fx; r.cy = fy
        r.busy = false
        pushLayers(s)
      })
      .catch(() => { r.busy = false })
  }
}
