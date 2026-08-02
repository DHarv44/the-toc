// ELEVATION — the pack's real metres, resampled and renormalized for play.
//
// The renormalisation is genMap's, kept deliberately (GROUNDWORK.md): every
// mobility cost and slope penalty in the sim is tuned against the gameplay
// elevation range, not against real metres. Relief scales into ~40–110
// gameplay units — subtle country stays subtle, the Front Range clamps to
// what the tuning expects — and `toMetres` inverts it so labels and briefs
// still read true spot elevations.
import { sampleBox, type HeightField } from '@dharv44/groundwork-core'
import type { Frame } from './frame'

export interface PlayElevation {
  elev: Float32Array
  slope: Float32Array
  /** gameplay units → real metres, for anything player-facing */
  toMetres: (e: number) => number
}

export function elevationOf(hf: HeightField, f: Frame): PlayElevation {
  const { GRID } = f
  const N = GRID * GRID
  const raw = new Float32Array(N)
  let lo = Infinity, hi = -Infinity
  for (let gy = 0; gy < GRID; gy++) {
    const ny = f.y0 + ((gy + 0.5) / GRID) * f.spanY
    for (let gx = 0; gx < GRID; gx++) {
      const nx = f.x0 + ((gx + 0.5) / GRID) * f.spanX
      const m = sampleBox(hf, nx, ny)
      raw[gy * GRID + gx] = m
      if (m < lo) lo = m
      if (m > hi) hi = m
    }
  }
  const relief = Math.min(110, Math.max(40, (hi - lo) * 0.35))
  const s = relief / (hi - lo || 1)
  const elev = new Float32Array(N)
  for (let i = 0; i < N; i++) elev[i] = Math.max(4, 8 + (raw[i]! - lo) * s)

  const slope = new Float32Array(N)
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const i = gy * GRID + gx
      let m = 0
      if (gx > 0) m = Math.max(m, Math.abs(elev[i]! - elev[i - 1]!))
      if (gx < GRID - 1) m = Math.max(m, Math.abs(elev[i]! - elev[i + 1]!))
      if (gy > 0) m = Math.max(m, Math.abs(elev[i]! - elev[i - GRID]!))
      if (gy < GRID - 1) m = Math.max(m, Math.abs(elev[i]! - elev[i + GRID]!))
      slope[i] = m
    }
  }
  return { elev, slope, toMetres: (e) => lo + (e - 8) / s }
}
