// High-detail topo rendering, 8 px per cell (2048 px layer).
// Pass 1 builds bilinear-interpolated per-pixel fields (elevation, water depth,
// forest/urban coverage); pass 2 shades: hypsometric tint, hillshade, contour
// lines every 10 m (index every 50 m), depth-shaded water with soft shorelines,
// forest/field texture. Roads + bridges stroked on top.
// Ported verbatim from src/map/mapRender.js.
import { CELL, T_FOREST, T_URBAN, T_WATER, type WorldMap } from '../world/WorldMap'

const PX = 8

export function renderTerrainLayer(map: WorldMap): HTMLCanvasElement {
  const GRID = map.GRID
  const size = GRID * PX
  const cv = document.createElement('canvas')
  cv.width = size; cv.height = size
  const ctx = cv.getContext('2d')!

  const { elev, terr, road, waterSurf } = map
  const N = size * size

  // per-cell source fields
  const depthC = new Float32Array(GRID * GRID)
  const forestC = new Float32Array(GRID * GRID)
  const urbanC = new Float32Array(GRID * GRID)
  for (let i = 0; i < GRID * GRID; i++) {
    if (terr[i] === T_WATER) depthC[i] = Math.max(0.6, waterSurf[i]! - elev[i]!)
    if (terr[i] === T_FOREST) forestC[i] = 1
    if (terr[i] === T_URBAN) urbanC[i] = 1
  }

  // pass 1: bilinear per-pixel fields
  const elevPx = new Float32Array(N)
  const depthPx = new Float32Array(N)
  const forestPx = new Float32Array(N)
  const urbanPx = new Float32Array(N)
  for (let py = 0; py < size; py++) {
    const cy = py / PX - 0.5
    let gy0 = Math.floor(cy)
    const wy = cy - gy0
    let gy1 = gy0 + 1
    if (gy0 < 0) gy0 = 0
    if (gy1 > GRID - 1) gy1 = GRID - 1
    const r0 = gy0 * GRID, r1 = gy1 * GRID
    for (let px = 0; px < size; px++) {
      const cx = px / PX - 0.5
      let gx0 = Math.floor(cx)
      const wx = cx - gx0
      let gx1 = gx0 + 1
      if (gx0 < 0) gx0 = 0
      if (gx1 > GRID - 1) gx1 = GRID - 1
      const w00 = (1 - wx) * (1 - wy), w10 = wx * (1 - wy)
      const w01 = (1 - wx) * wy, w11 = wx * wy
      const a = r0 + gx0, b = r0 + gx1, c = r1 + gx0, d = r1 + gx1
      const o = py * size + px
      elevPx[o] = elev[a]! * w00 + elev[b]! * w10 + elev[c]! * w01 + elev[d]! * w11
      depthPx[o] = depthC[a]! * w00 + depthC[b]! * w10 + depthC[c]! * w01 + depthC[d]! * w11
      forestPx[o] = forestC[a]! * w00 + forestC[b]! * w10 + forestC[c]! * w01 + forestC[d]! * w11
      urbanPx[o] = urbanC[a]! * w00 + urbanC[b]! * w10 + urbanC[c]! * w01 + urbanC[d]! * w11
    }
  }

  // pass 2: shading — Lambertian hillshade (NW light), hypsometric tint,
  // farmland mosaic on open flat ground, forest edge lines, river banks
  const img = ctx.createImageData(size, size)
  const data = img.data
  const CONTOUR = 10, INDEX = 50
  const MPPX = CELL / PX          // meters per layer pixel
  const VEX = 3.0                 // vertical exaggeration for legible relief
  const LX = -0.5, LY = -0.5, LZ = 0.7071 // light from the NW at ~45° altitude
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const o = py * size + px
      const e = elevPx[o]!
      const eR = elevPx[px < size - 1 ? o + 1 : o]!
      const eD = elevPx[py < size - 1 ? o + size : o]!
      const eL = elevPx[px > 0 ? o - 1 : o]!
      const eU = elevPx[py > 0 ? o - size : o]!
      const depth = depthPx[o]!
      const hash = ((px * 73856093) ^ (py * 19349663)) >>> 0
      const nz = ((hash & 255) / 255)
      // terrain gradient (m/m) — drives the hillshade and the field/slope fade
      const dzdx = (eR - eL) / (2 * MPPX)
      const dzdy = (eD - eU) / (2 * MPPX)
      const grade = Math.hypot(dzdx, dzdy)

      let r: number, g: number, b: number
      if (depth > 0.32) {
        // water: depth-tinted, with a solid bank line where it meets land
        const t = Math.min(1, depth / 5)
        r = 168 - 62 * t; g = 205 - 48 * t; b = 232 - 30 * t
        const dR2 = depthPx[px < size - 1 ? o + 1 : o]!
        const dD2 = depthPx[py < size - 1 ? o + size : o]!
        const dL2 = depthPx[px > 0 ? o - 1 : o]!
        const dU2 = depthPx[py > 0 ? o - size : o]!
        if (dR2 <= 0.32 || dD2 <= 0.32 || dL2 <= 0.32 || dU2 <= 0.32) {
          r = r * 0.5 + 62 * 0.5; g = g * 0.5 + 96 * 0.5; b = b * 0.5 + 128 * 0.5
        } else if (depth < 0.85) { r *= 0.84; g *= 0.86; b *= 0.9 }
        r += (nz - 0.5) * 4; g += (nz - 0.5) * 4; b += (nz - 0.5) * 4
      } else {
        // hypsometric land tint
        if (e < 35) { r = 205; g = 213; b = 178 }
        else if (e < 70) {
          const t = (e - 35) / 35
          r = 213 + (202 - 213) * t; g = 208 + (188 - 208) * t; b = 177 + (150 - 177) * t
        } else if (e < 110) {
          const t = (e - 70) / 40
          r = 202 + (184 - 202) * t; g = 188 + (164 - 188) * t; b = 150 + (128 - 150) * t
        } else {
          const t = Math.min(1, (e - 110) / 40)
          r = 184 + (174 - 184) * t; g = 164 + (160 - 164) * t; b = 128 + (142 - 128) * t
        }

        const fo = forestPx[o]! + (nz - 0.5) * 0.22
        const ur = urbanPx[o]!
        if (ur > 0.45) {
          // urban wins the tie where town and treeline coverage bleed together
          r = r * 0.35 + 197 * 0.65; g = g * 0.35 + 191 * 0.65; b = b * 0.35 + 183 * 0.65
        } else if (fo > 0.5) {
          // forest overlay with canopy texture + a darker treeline at the edge
          r = r * 0.3 + 133 * 0.7; g = g * 0.3 + 167 * 0.7; b = b * 0.3 + 117 * 0.7
          const m = 0.93 + 0.1 * nz
          r *= m; g *= m; b *= m
          if (nz > 0.88) { r *= 0.86; g *= 0.88; b *= 0.86 }
          const foR = forestPx[px < size - 1 ? o + 1 : o]!
          const foD = forestPx[py < size - 1 ? o + size : o]!
          const foL = forestPx[px > 0 ? o - 1 : o]!
          const foU = forestPx[py > 0 ? o - size : o]!
          if (Math.min(foR, foD, foL, foU) + (nz - 0.5) * 0.22 <= 0.42) {
            r *= 0.78; g *= 0.82; b *= 0.78
          }
        } else {
          // open ground: farmland mosaic on flat ground, fading out on slopes.
          // The field lattice is domain-warped by elevation, so boundaries
          // bend with the terrain — fields hug the contours instead of
          // stamping a square grid over them. Rows stagger like brickwork;
          // patches hash to subtle tint families (stubble/crop/fallow).
          const FP = 26 // patch size in layer px (~200 m)
          const flat = Math.max(0, Math.min(1, 1 - grade / 0.085))
          if (flat > 0) {
            const wu = px + e * 6.5
            const wv = py + e * 4.5
            const vg = Math.floor(wv / FP)
            const uo = wu + (((vg * 2654435761) >>> 0) % FP)
            const ug = Math.floor(uo / FP)
            const ph = ((ug * 40503) ^ (vg * 63689)) >>> 0
            const fam = ph % 4
            if (fam === 0) { r += 5 * flat; g += 3 * flat; b -= 3 * flat }
            else if (fam === 1) { r -= 4 * flat; g += 2 * flat; b -= 2 * flat }
            else if (fam === 2) { r += 2 * flat; g += 4 * flat; b += 1.5 * flat }
            const lum = 0.99 + ((((ph >> 4) & 15) / 15) - 0.5) * 0.04 * flat
            r *= lum; g *= lum; b *= lum
            const fu = ((uo % FP) + FP) % FP
            const fv = ((wv % FP) + FP) % FP
            if (fu < 1.1 || fv < 1.1) {
              r *= 1 - 0.09 * flat; g *= 1 - 0.08 * flat; b *= 1 - 0.09 * flat
            }
          }
          const m = 0.985 + 0.028 * nz
          r *= m; g *= m; b *= m
        }

        // Lambertian hillshade: flat ground sits at 1.0, NW-lit faces brighten,
        // SE faces fall into shadow
        const nxv = -dzdx * VEX, nyv = -dzdy * VEX
        const len = Math.sqrt(nxv * nxv + nyv * nyv + 1)
        const lamb = Math.max(0, (nxv * LX + nyv * LY + LZ) / len)
        const sh = Math.max(0.6, Math.min(1.18, 0.62 + 0.54 * lamb))
        r *= sh; g *= sh; b *= sh

        // contour lines
        const dR = depthPx[px < size - 1 ? o + 1 : o]!
        const dD = depthPx[py < size - 1 ? o + size : o]!
        if (dR <= 0.32 && dD <= 0.32) {
          const k = Math.floor(e / CONTOUR)
          if (k !== Math.floor(eR / CONTOUR) || k !== Math.floor(eD / CONTOUR)) {
            const strong = (e % INDEX) < CONTOUR
            const a2 = strong ? 0.48 : 0.24
            r = r * (1 - a2) + 118 * a2
            g = g * (1 - a2) + 92 * a2
            b = b * (1 - a2) + 58 * a2
          }
        }
      }

      const di = o * 4
      data[di] = r; data[di + 1] = g; data[di + 2] = b; data[di + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)

  // urban blocks: small building footprints per urban cell
  ctx.fillStyle = 'rgba(84,78,72,0.62)'
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const i = gy * GRID + gx
      if (terr[i] !== T_URBAN) continue
      const h = ((gx * 7349) ^ (gy * 4373)) >>> 0
      const nb = 1 + (h % 3)
      for (let k = 0; k < nb; k++) {
        const ox = (h >> (k * 3)) % 5, oy = (h >> (k * 3 + 4)) % 5
        ctx.fillRect(gx * PX + ox + 0.5, gy * PX + oy + 0.5, 2.2, 2.2)
      }
    }
  }

  // Roads and bridges are NOT baked here — they're vector polylines
  // (map.roads / map.bridges) stroked per-frame by MapView, so they stay
  // crisp at every zoom and can be styled per class.

  return cv
}

export const TERRAIN_PX = PX
