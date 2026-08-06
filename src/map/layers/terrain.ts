// THE GROUND ITSELF — the backdrop, the baked sheet or the orthoimagery over
// it, the AO's edge, and the campaign's control field.
//
// CONSOLE.md step 6. Everything here is a BLIT: the sheet is baked once
// (map/packRender, shared across panes) because real geography carries fifty
// thousand road polylines and walking them every frame is exactly why this map
// crawled before the exact renderer landed. Nothing in this file iterates
// geometry; it draws images and one rectangle.
import { S } from '../../engine/state'
import { controlField } from '../../engine/frontline'
import { TERRAIN_PX } from '../packRender'
import type { Frame } from '../frame'

/** The off-map backdrop — shown wherever the square map does not fill the pane.
 *  Mirrors the splash screen (radial wash + faint mesh) so a fit-to-screen view
 *  reads as a FRAMED map rather than a clipped one. */
export function drawBackdrop(f: Frame): void {
  const { ctx, w: W, h: H } = f
  const bg = ctx.createRadialGradient(W * 0.5, H * 0.3, 0, W * 0.5, H * 0.3, Math.max(W, H) * 0.8)
  bg.addColorStop(0, f.night ? '#232427' : '#2f3033')
  bg.addColorStop(1, f.night ? '#1a1b1d' : '#242528')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  ctx.save()
  ctx.globalAlpha = f.night ? 0.12 : 0.09
  ctx.strokeStyle = '#4a4d52'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let gx = 0; gx <= W; gx += 48) { ctx.moveTo(gx + 0.5, 0); ctx.lineTo(gx + 0.5, H) }
  for (let gy = 0; gy <= H; gy += 48) { ctx.moveTo(0, gy + 0.5); ctx.lineTo(W, gy + 0.5) }
  ctx.stroke()
  ctx.restore()
}

export interface TerrainSources {
  /** the baked BFT sheet — one per world, shared by every pane */
  sheet: HTMLCanvasElement
  /** orthoimagery of the same frame, when the commander has SAT on */
  sat: HTMLCanvasElement | null
  /** a sharper patch of wherever the view is, past the mosaic's own resolution */
  patch: { cv: HTMLCanvasElement; x0: number; y0: number; x1: number; y1: number } | null
  satOn: boolean
  /** ask for a sharper patch of this world rect (throttled by the caller) */
  kickPatch: (x0: number, y0: number, x1: number, y1: number) => void
}

/** THE SHEET, dimmed and desaturated at night. Symbology always stays on top of
 *  it — the picture darkens, the command graphics do not. */
export function drawTerrain(f: Frame, src: TerrainSources): boolean {
  const { ctx } = f
  const mpp = S.map!.CELL / TERRAIN_PX
  const showSat = src.satOn && src.sat != null
  ctx.imageSmoothingEnabled = showSat || f.view.ppm * mpp < 1
  if (f.night) ctx.filter = 'brightness(0.42) saturate(0.5) contrast(1.05)'
  if (showSat) {
    // the sat canvas covers exactly the frame window, whatever its pixel size
    ctx.drawImage(src.sat!, f.w2sX(0), f.w2sY(0), f.world * f.view.ppm, f.world * f.view.ppm)
    // past the base mosaic's own resolution, sharpen where the view IS — real
    // imagery only, since the terrain bake has nothing sharper to fetch
    const basePpm = src.sat!.width / f.world
    if (S.map!.sat && f.view.ppm > basePpm * 1.3) {
      const pad = 1.35
      const hw = (f.w / 2 / f.view.ppm) * pad, hh = (f.h / 2 / f.view.ppm) * pad
      src.kickPatch(
        Math.max(0, f.view.cx - hw), Math.max(0, f.view.cy - hh),
        Math.min(f.world, f.view.cx + hw), Math.min(f.world, f.view.cy + hh),
      )
    }
    if (src.patch && f.view.ppm > basePpm * 1.15) {
      const p = src.patch
      ctx.drawImage(p.cv, f.w2sX(p.x0), f.w2sY(p.y0),
        (p.x1 - p.x0) * f.view.ppm, (p.y1 - p.y0) * f.view.ppm)
    }
  } else {
    ctx.drawImage(src.sheet, f.w2sX(0), f.w2sY(0),
      src.sheet.width * mpp * f.view.ppm, src.sheet.height * mpp * f.view.ppm)
  }
  ctx.filter = 'none'

  // frame the map edge so the off-map backdrop reads as "outside the AO"
  ctx.strokeStyle = f.night ? 'rgba(120,150,180,0.35)' : 'rgba(40,55,70,0.55)'
  ctx.lineWidth = 2
  ctx.strokeRect(f.w2sX(0), f.w2sY(0), f.world * f.view.ppm, f.world * f.view.ppm)
  return showSat
}

/** THE CAMPAIGN COP: the enemy-held wash and the two forward lines. The control
 *  field recomputes on its own slow cadence, so drawing it is a scaled blit and
 *  a dashed contour — TWO traces like a real battle map, friendly blue and
 *  enemy red, with the uncontested ground showing as the gap between them. */
export function drawControlField(f: Frame): void {
  const cf = controlField(S)
  if (!cf) return
  const { ctx } = f
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.globalAlpha = f.night ? 0.85 : 0.7
  ctx.drawImage(cf.tint, f.w2sX(0), f.w2sY(0), f.world * f.view.ppm, f.world * f.view.ppm)
  ctx.restore()
  ctx.save()
  ctx.lineJoin = 'round'
  const trace = (paths: typeof cf.blue, color: string) => {
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(1.6, 2.6 * Math.min(1, f.view.ppm * 12))
    ctx.setLineDash([9, 6])
    ctx.beginPath()
    for (const p of paths) {
      ctx.moveTo(f.w2sX(p[0]!.x), f.w2sY(p[0]!.y))
      for (let i = 1; i < p.length; i++) ctx.lineTo(f.w2sX(p[i]!.x), f.w2sY(p[i]!.y))
    }
    ctx.stroke()
    ctx.setLineDash([])
  }
  trace(cf.red, f.night ? 'rgba(255,96,96,0.85)' : 'rgba(190,34,34,0.8)')
  trace(cf.blue, f.night ? 'rgba(96,160,255,0.85)' : 'rgba(30,90,190,0.8)')
  ctx.restore()
}
