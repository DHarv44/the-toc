// SURFACE — the pack's mapped areas and roads, onto the sim's rasters.
//
// Areas rasterise by even-odd fill so inner rings survive: a lake with an
// island keeps the island, a clearing in a wood stays field. Priority where
// classes overlap is water > built > wood — water is impassable and must
// never lose an argument with a polygon that also covers the cell.
//
// Roads keep the data's five classes — the sim's vocabulary IS the pack's
// now (GROUNDWORK.md P5b) — and ALL of them stamp the raster, the way genMap
// stamped its own: sampled along each segment at half-cell steps. The raster
// is PRICING, not routing (the road graph owns routing on pack maps), so a
// city-core cell reading "minor" is roughly honest, and a unit driven down a
// track is priced on the track instead of the field beside it.
import type { PackArea, PackRoad, PackVectors } from '@dharv44/groundwork-core'
import {
  R_MINOR, R_MOTORWAY, R_PRIMARY, R_SECONDARY, R_TRACK,
  T_FIELD, T_FOREST, T_URBAN, T_WATER,
  type RoadClass, type RoadPoly, type Vec2,
} from '../WorldMap'
import { normToWorld, type Frame } from './frame'

// ---- areas -----------------------------------------------------------------

function fillKind(ctx: CanvasRenderingContext2D, f: Frame, areas: PackArea[], kind: string): void {
  ctx.clearRect(0, 0, f.GRID, f.GRID)
  ctx.fillStyle = '#fff'
  const path = new Path2D()
  for (const a of areas) {
    if (a.kind !== kind) continue
    for (const rings of [a.outer, a.inner]) {
      for (const ring of rings) {
        for (let i = 0; i + 1 < ring.length; i += 2) {
          const { x, y } = normToWorld(f, ring[i]!, ring[i + 1]!)
          const cx = x / f.CELL, cy = y / f.CELL
          if (i === 0) path.moveTo(cx, cy)
          else path.lineTo(cx, cy)
        }
        path.closePath()
      }
    }
  }
  ctx.fill(path, 'evenodd')
}

/** Rasterise water/wood/built onto a GRID² terrain array. */
export function terrainOf(vectors: PackVectors, f: Frame): Uint8Array {
  const { GRID } = f
  const terr = new Uint8Array(GRID * GRID) // T_FIELD
  const cv = document.createElement('canvas')
  cv.width = cv.height = GRID
  const ctx = cv.getContext('2d', { willReadFrequently: true })!

  // ascending priority: wood, then built over it, then water over everything
  for (const [kind, code] of [['wood', T_FOREST], ['built', T_URBAN], ['water', T_WATER]] as const) {
    fillKind(ctx, f, vectors.areas, kind)
    const px = ctx.getImageData(0, 0, GRID, GRID).data
    for (let i = 0; i < terr.length; i++) {
      // alpha over half a pixel = the class claims the cell
      if (px[i * 4 + 3]! > 127) terr[i] = code
    }
  }
  return terr
}

// ---- roads -----------------------------------------------------------------

function simClass(cls: PackRoad['cls']): RoadClass {
  switch (cls) {
    case 'motorway': return R_MOTORWAY
    case 'primary': return R_PRIMARY
    case 'secondary': return R_SECONDARY
    case 'minor': return R_MINOR
    case 'track': return R_TRACK
  }
}

export interface RoadLayer {
  roads: RoadPoly[]
  raster: Uint8Array
}

/**
 * Clip each polyline to the frame, emit world-space RoadPoly[], and stamp
 * roads/highways into the mobility raster (higher class wins a cell).
 */
export function roadsOf(vectors: PackVectors, f: Frame): RoadLayer {
  const { GRID, CELL, WORLD } = f
  const raster = new Uint8Array(GRID * GRID)
  const roads: RoadPoly[] = []
  const inSquare = (p: Vec2) => p.x >= 0 && p.y >= 0 && p.x <= WORLD && p.y <= WORLD

  for (const r of vectors.roads) {
    const cls = simClass(r.cls)
    // split into runs of in-frame points — a road that leaves the square and
    // comes back becomes two polylines, which is what it looks like anyway
    let run: Vec2[] = []
    const flush = () => {
      if (run.length >= 2) roads.push({ cls, pts: run })
      run = []
    }
    for (let i = 0; i + 1 < r.pts.length; i += 2) {
      const p = normToWorld(f, r.pts[i]!, r.pts[i + 1]!)
      if (inSquare(p)) run.push(p)
      else flush()
    }
    flush()
  }

  for (const r of roads) {
    for (let s = 0; s + 1 < r.pts.length; s++) {
      const p = r.pts[s]!, q = r.pts[s + 1]!
      const steps = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / (CELL / 2)))
      for (let k = 0; k <= steps; k++) {
        const t = k / steps
        const gx = Math.floor((p.x + (q.x - p.x) * t) / CELL)
        const gy = Math.floor((p.y + (q.y - p.y) * t) / CELL)
        if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) continue
        const i = gy * GRID + gx
        if (r.cls > raster[i]!) raster[i] = r.cls
      }
    }
  }
  return { roads, raster }
}
