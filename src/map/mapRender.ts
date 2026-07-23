// High-detail topo rendering, 8 px per cell (2048 px layer).
// Pass 1 builds bilinear-interpolated per-pixel fields (elevation, water depth,
// forest/urban coverage); pass 2 shades: hypsometric tint, hillshade, contour
// lines every 10 m (index every 50 m), depth-shaded water with soft shorelines,
// forest/field texture. Roads + bridges stroked on top.
// Ported verbatim from src/map/mapRender.js.
import { T_FOREST, T_URBAN, T_WATER, type WorldMap } from '../world/WorldMap'

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

  // pass 2: shading
  const img = ctx.createImageData(size, size)
  const data = img.data
  const CONTOUR = 10, INDEX = 50
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const o = py * size + px
      const e = elevPx[o]!
      const eR = elevPx[px < size - 1 ? o + 1 : o]!
      const eD = elevPx[py < size - 1 ? o + size : o]!
      const depth = depthPx[o]!
      const hash = ((px * 73856093) ^ (py * 19349663)) >>> 0
      const nz = ((hash & 255) / 255)

      let r: number, g: number, b: number
      if (depth > 0.32) {
        // water: depth-tinted, dark shoreline
        const t = Math.min(1, depth / 5)
        r = 168 - 62 * t; g = 205 - 48 * t; b = 232 - 30 * t
        if (depth < 0.85) { r *= 0.8; g *= 0.82; b *= 0.88 }
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
        if (fo > 0.5) {
          // forest overlay with canopy texture
          r = r * 0.3 + 133 * 0.7; g = g * 0.3 + 167 * 0.7; b = b * 0.3 + 117 * 0.7
          const m = 0.93 + 0.1 * nz
          r *= m; g *= m; b *= m
          if (nz > 0.88) { r *= 0.86; g *= 0.88; b *= 0.86 }
        } else if (ur > 0.45) {
          r = r * 0.35 + 197 * 0.65; g = g * 0.35 + 191 * 0.65; b = b * 0.35 + 183 * 0.65
        } else {
          // open ground mottle
          const m = 0.985 + 0.028 * nz
          r *= m; g *= m; b *= m
        }

        // hillshade (NW light)
        const sh = Math.max(0.74, Math.min(1.22, 1 - ((eR - e) + (eD - e)) * 0.085))
        r *= sh; g *= sh; b *= sh

        // contour lines
        const dR = depthPx[px < size - 1 ? o + 1 : o]!
        const dD = depthPx[py < size - 1 ? o + size : o]!
        if (dR <= 0.32 && dD <= 0.32) {
          const k = Math.floor(e / CONTOUR)
          if (k !== Math.floor(eR / CONTOUR) || k !== Math.floor(eD / CONTOUR)) {
            const strong = (e % INDEX) < CONTOUR
            const a2 = strong ? 0.42 : 0.22
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

  // roads: casing + fill, connect neighbouring road cells
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const pass of [
    { color: 'rgba(52,44,34,0.85)', w: 5 },
    { color: '#96794f', w: 2.8 },
  ]) {
    ctx.strokeStyle = pass.color
    ctx.lineWidth = pass.w
    ctx.beginPath()
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        const i = gy * GRID + gx
        if (!road[i]) continue
        const cx = gx * PX + PX / 2, cy = gy * PX + PX / 2
        for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]] as const) {
          const nx = gx + dx, ny = gy + dy
          if (nx < 0 || nx >= GRID || ny >= GRID) continue
          if (road[ny * GRID + nx]) {
            ctx.moveTo(cx, cy)
            ctx.lineTo(nx * PX + PX / 2, ny * PX + PX / 2)
          }
        }
      }
    }
    ctx.stroke()
  }

  // bridges: dark abutment ticks + light deck over water road cells
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const i = gy * GRID + gx
      if (road[i] && terr[i] === T_WATER) {
        ctx.strokeStyle = '#26221c'
        ctx.lineWidth = 1.2
        ctx.strokeRect(gx * PX - 1, gy * PX - 1, PX + 2, PX + 2)
        ctx.fillStyle = '#b8a67e'
        ctx.fillRect(gx * PX + 1.5, gy * PX + 1.5, PX - 3, PX - 3)
      }
    }
  }

  return cv
}

export const TERRAIN_PX = PX
