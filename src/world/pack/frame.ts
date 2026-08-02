// THE FRAME — how a pack's box becomes the sim's square grid.
//
// The sim runs on a square: GRID cells of CELL metres. A pack's box is
// whatever the author dragged, usually not square, at ~30 m samples. The
// frame is the largest centred square of the box, sampled at the finest cell
// the stopgap renderer can carry:
//
//   CELL = max(pack resolution, square/GRID_CAP)
//
// GRID_CAP exists for the OLD terrain renderer (8 px per cell — 512 cells is
// already a 4096² canvas) and the O(N) sim arrays. The exact BFT renderer
// (P4) draws from the pack directly and does not care; when the old renderer
// dies, the cap can rise or go. Authors who want full resolution author boxes
// near GRID_CAP × resolution across — ~15 km at 30 m — which is battalion AO
// sized anyway. Bigger boxes still play, at proportionally coarser cells.
//
// All norm coords here are PACK norm coords (x 0→1 west→east, y 0→1
// north→south) — the same space the vectors are in.
import type { PackManifest } from '@dharv44/groundwork-core'

const GRID_CAP = 512

export interface Frame {
  GRID: number
  CELL: number
  WORLD: number             // metres across the square
  /** pack norm coords of the square's north-west corner */
  x0: number
  y0: number
  /** norm span the square covers in each axis (≤ 1) */
  spanX: number
  spanY: number
}

export function frameOf(m: PackManifest): Frame {
  const side = Math.min(m.widthMetres, m.heightMetres)
  const res = Math.max(1, (m.widthMetres / m.width + m.heightMetres / m.height) / 2)
  const CELL = Math.max(res, side / GRID_CAP)
  const GRID = Math.max(16, Math.floor(side / CELL))
  const WORLD = GRID * CELL
  return {
    GRID, CELL, WORLD,
    x0: (m.widthMetres - WORLD) / 2 / m.widthMetres,
    y0: (m.heightMetres - WORLD) / 2 / m.heightMetres,
    spanX: WORLD / m.widthMetres,
    spanY: WORLD / m.heightMetres,
  }
}

/** world metres (sim space) → pack norm coords */
export const worldToNorm = (f: Frame, x: number, y: number) =>
  ({ nx: f.x0 + (x / f.WORLD) * f.spanX, ny: f.y0 + (y / f.WORLD) * f.spanY })

/** pack norm coords → world metres (sim space); may land outside the square */
export const normToWorld = (f: Frame, nx: number, ny: number) =>
  ({ x: ((nx - f.x0) / f.spanX) * f.WORLD, y: ((ny - f.y0) / f.spanY) * f.WORLD })
