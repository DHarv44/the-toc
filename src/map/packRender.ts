// PACK RENDER — the exact BFT underlay (GROUNDWORK.md P4).
//
// The old renderer fakes continuous geography out of sim cells; this one draws
// the EXPORT: elevation art computed from the pack's real-metre heightfield,
// water/wood/built as the actual polygons filled even-odd (islands and
// clearings survive), and roads as the observed five-class geometry at true
// widths. Nothing is quantized into the picture on its way through the sim.
//
// Everything static bakes ONCE into one canvas and the per-frame cost is a
// blit — which is also the fix for real geography's density: Baghdad carries
// 51k road polylines, and the per-frame vector pass that was fine for forty
// procgen roads is not fine for that (MapView skips it on pack maps).
//
// The canvas keeps the old convention — GRID * TERRAIN_PX per side — so
// MapView's world→layer math is untouched. At a 512-cell frame that is a
// 4096² sheet, ~6.5 m/px on Baghdad: comfortably finer than the symbology
// drawn over it.
import { sampleBilinear, ROAD_WIDTH_METRES } from '@dharv44/groundwork-core'
import type { PackRoad } from '@dharv44/groundwork-core'
import type { WorldMap } from '../world/WorldMap'
import type { Ground } from '../world/pack/loadGround'
import { frameOf, type Frame } from '../world/pack/frame'
import { TERRAIN_PX } from './mapRender'

// The full gazetteer as screen-space label candidates: every named place in
// the pack, in world coords, ranked so MapView can gate visibility by zoom —
// cities always, hamlets only when close, like a chart that declutters
// itself. The sim's OWN towns/features (the capped 8+18) draw through their
// existing symbology pass; this list is everything else the ground knows.
export interface PlaceLabel {
  x: number
  y: number
  name: string
  kind: string
  /** min pixels-per-metre before this label draws (0 = always) */
  minPpm: number
}

const LABEL_GATE: Record<string, number> = {
  city: 0, town: 0.015, village: 0.045, hamlet: 0.09, locality: 0.12, water: 0.03, peak: 0.05,
}

export function packPlaceLabels(map: WorldMap, ground: Ground): PlaceLabel[] {
  const f = frameOf(ground.files.manifest)
  const skip = new Set([
    ...map.towns.map(t => t.name),
    ...map.features.map(x => x.name),
  ])
  const out: PlaceLabel[] = []
  for (const p of ground.vectors.places) {
    const gate = LABEL_GATE[p.kind]
    if (gate === undefined) continue
    const x = ((p.x - f.x0) / f.spanX) * f.WORLD
    const y = ((p.y - f.y0) / f.spanY) * f.WORLD
    if (x < 0 || y < 0 || x > f.WORLD || y > f.WORLD) continue
    const name = p.name.toUpperCase()
    if (skip.has(name) || (p.kind === 'peak' && skip.has(`${name} (${Math.round(p.elevation ?? 0)})`))) continue
    out.push({ x, y, name, kind: p.kind, minPpm: gate })
  }
  return out
}

export function renderPackLayer(map: WorldMap, ground: Ground): HTMLCanvasElement {
  const f = frameOf(ground.files.manifest)
  const size = map.GRID * TERRAIN_PX
  const ppm = size / map.WORLD               // layer px per metre
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const ctx = cv.getContext('2d')!

  paintElevation(ctx, size, ground, f)
  paintAreas(ctx, size, ground, f, ppm)
  paintRoads(ctx, ground, f, ppm)
  return cv
}

// ---- elevation art: hypsometric tint, hillshade, contours in real metres ---

function paintElevation(ctx: CanvasRenderingContext2D, size: number, g: Ground, f: Frame): void {
  const { hf } = g
  // one real-metre sample per layer pixel, bilinear over the frame's window
  const E = new Float32Array(size * size)
  let lo = Infinity, hi = -Infinity
  for (let py = 0; py < size; py++) {
    const fy = (f.y0 + ((py + 0.5) / size) * f.spanY) * (hf.height - 1)
    for (let px = 0; px < size; px++) {
      const fx = (f.x0 + ((px + 0.5) / size) * f.spanX) * (hf.width - 1)
      const m = sampleBilinear(hf, fx, fy)
      E[py * size + px] = m
      if (m < lo) lo = m
      if (m > hi) hi = m
    }
  }
  const relief = hi - lo || 1
  // contour interval by relief, like picking the right map sheet: alpine
  // country gets 50 m lines, river plains get 10 m
  const minor = relief > 1200 ? 50 : relief > 400 ? 20 : 10
  const index = minor * 5
  const mpp = 1 / (size / (f.WORLD))         // metres per layer px

  const img = ctx.createImageData(size, size)
  const d = img.data
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const o = py * size + px
      const e = E[o]!
      const eR = E[px < size - 1 ? o + 1 : o]!
      const eD = E[py < size - 1 ? o + size : o]!
      const eL = E[px > 0 ? o - 1 : o]!
      const eU = E[py > 0 ? o - size : o]!

      // hypsometric bands over the map's own range — the printed-sheet look
      const t = (e - lo) / relief
      let r: number, gc: number, b: number
      if (t < 0.25) { r = 205; gc = 213; b = 178 }
      else if (t < 0.5) {
        const k = (t - 0.25) / 0.25
        r = 213 + (202 - 213) * k; gc = 208 + (188 - 208) * k; b = 177 + (150 - 177) * k
      } else if (t < 0.75) {
        const k = (t - 0.5) / 0.25
        r = 202 + (184 - 202) * k; gc = 188 + (164 - 188) * k; b = 150 + (128 - 150) * k
      } else {
        const k = (t - 0.75) / 0.25
        r = 184 + (174 - 184) * k; gc = 164 + (160 - 164) * k; b = 128 + (142 - 128) * k
      }

      // grain, so flat country doesn't render as plastic
      const hash = ((px * 73856093) ^ (py * 19349663)) >>> 0
      const nz = (hash & 255) / 255
      const gr = 0.985 + 0.028 * nz
      r *= gr; gc *= gr; b *= gr

      // Lambertian hillshade, NW light, vertical exaggeration for legibility
      const dzdx = (eR - eL) / (2 * mpp)
      const dzdy = (eD - eU) / (2 * mpp)
      const nxv = -dzdx * 3, nyv = -dzdy * 3
      const len = Math.sqrt(nxv * nxv + nyv * nyv + 1)
      const lit = Math.max(0.62, Math.min(1.22, ((-0.5 * nxv) + (-0.5 * nyv) + 0.7071) / len + 0.35))
      r *= lit; gc *= lit; b *= lit

      // contours: a line where the band index changes against any neighbour
      const band = Math.floor(e / minor)
      if (Math.floor(eR / minor) !== band || Math.floor(eD / minor) !== band) {
        const isIndex = Math.floor(e / index) !== Math.floor(eR / index)
          || Math.floor(e / index) !== Math.floor(eD / index)
        const k = isIndex ? 0.62 : 0.8
        r *= k; gc *= k; b *= k
      }

      d[o * 4] = r; d[o * 4 + 1] = gc; d[o * 4 + 2] = b; d[o * 4 + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

// ---- areas: the actual polygons, even-odd --------------------------------

function areaPath(g: Ground, f: Frame, kind: string, ppm: number): Path2D {
  const path = new Path2D()
  for (const a of g.vectors.areas) {
    if (a.kind !== kind) continue
    for (const rings of [a.outer, a.inner]) {
      for (const ring of rings) {
        for (let i = 0; i + 1 < ring.length; i += 2) {
          const x = ((ring[i]! - f.x0) / f.spanX) * f.WORLD * ppm
          const y = ((ring[i + 1]! - f.y0) / f.spanY) * f.WORLD * ppm
          if (i === 0) path.moveTo(x, y)
          else path.lineTo(x, y)
        }
        path.closePath()
      }
    }
  }
  return path
}

function paintAreas(
  ctx: CanvasRenderingContext2D, size: number, g: Ground, f: Frame, ppm: number,
): void {
  ctx.save()
  // woodland: translucent over the relief so the ground still reads through
  ctx.fillStyle = 'rgba(96,138,84,0.55)'
  ctx.fill(areaPath(g, f, 'wood', ppm), 'evenodd')
  // built-up: the pale block tone the symbology sits well on
  ctx.fillStyle = 'rgba(148,138,126,0.82)'
  ctx.fill(areaPath(g, f, 'built', ppm), 'evenodd')
  // water last — impassable never loses an argument, on the sheet either
  const water = areaPath(g, f, 'water', ppm)
  ctx.fillStyle = '#a8cde8'
  ctx.fill(water, 'evenodd')
  ctx.strokeStyle = 'rgba(62,96,128,0.9)'
  ctx.lineWidth = Math.max(0.8, 1.2 * ppm)
  ctx.stroke(water)
  ctx.restore()
}

// ---- roads: observed classes at true widths -------------------------------

const ROAD_STYLE: Record<PackRoad['cls'], { fill: string; casing?: string; dash?: number[] }> = {
  motorway: { fill: '#b09055', casing: 'rgba(40,34,26,0.9)' },
  primary: { fill: '#b09055', casing: 'rgba(40,34,26,0.85)' },
  secondary: { fill: '#96794f', casing: 'rgba(52,44,34,0.8)' },
  minor: { fill: '#96794f' },
  track: { fill: 'rgba(122,98,66,0.8)', dash: [6, 5] },
}
const DRAW_ORDER: PackRoad['cls'][] = ['track', 'minor', 'secondary', 'primary', 'motorway']

function paintRoads(ctx: CanvasRenderingContext2D, g: Ground, f: Frame, ppm: number): void {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const cls of DRAW_ORDER) {
    const style = ROAD_STYLE[cls]
    const w = Math.max(cls === 'track' ? 0.7 : 1, ROAD_WIDTH_METRES[cls] * ppm)
    const path = new Path2D()
    for (const r of g.vectors.roads) {
      if (r.cls !== cls) continue
      for (let i = 0; i + 1 < r.pts.length; i += 2) {
        const x = ((r.pts[i]! - f.x0) / f.spanX) * f.WORLD * ppm
        const y = ((r.pts[i + 1]! - f.y0) / f.spanY) * f.WORLD * ppm
        if (i === 0) path.moveTo(x, y)
        else path.lineTo(x, y)
      }
    }
    if (style.casing) {
      ctx.strokeStyle = style.casing
      ctx.lineWidth = w + Math.max(0.8, 0.35 * w)
      ctx.setLineDash([])
      ctx.stroke(path)
    }
    ctx.strokeStyle = style.fill
    ctx.lineWidth = w
    ctx.setLineDash(style.dash ?? [])
    ctx.stroke(path)
  }
  ctx.setLineDash([])
  ctx.restore()
}
