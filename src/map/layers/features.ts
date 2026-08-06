// NAMED TERRAIN AND INFRASTRUCTURE — the reference marks, and the sheet's
// credit line.
//
// Third layer out (CONSOLE.md step 6). Hills read as spot elevations, rivers go
// italic blue, and authored infrastructure gets a glyph: these are PLACES, not
// assets — you cannot task a dam — so they are drawn fainter than the towns and
// they carry no symbology. They exist because an order says "north of the rail
// bridge" and the commander has to be able to find the rail bridge.
//
// Everything here is gated on being zoomed in past the point where the labels
// would collide, which is the same rule the gazetteer uses and for the same
// reason: a map that draws every name at every scale is a map with no names on
// it at all.
import { S } from '../../engine/state'
import type { Frame } from '../frame'

// distinctive single characters until there is real icon art
const INFRA_GLYPH: Record<string, string> = {
  dam: '▓', power: '⚡', rail: '▤', depot: '◫', comm: '📡', ford: '≈', camp: '⛺',
}

export function drawFeatures(f: Frame): void {
  if (f.view.ppm <= 0.03) return
  const { ctx } = f
  for (const ft of S.map!.features) {
    const fx = f.w2sX(ft.x), fy = f.w2sY(ft.y)
    if (ft.kind === 'hill') {
      ctx.fillStyle = f.night ? 'rgba(170,150,120,0.55)' : 'rgba(96,72,44,0.75)'
      ctx.font = '9px Consolas, monospace'
      ctx.fillText('▲', fx, fy + 3)
      ctx.font = '8.5px Consolas, monospace'
      ctx.fillText(ft.name, fx, fy - 6)
    } else if (ft.kind === 'river') {
      ctx.fillStyle = f.night ? 'rgba(120,170,215,0.6)' : 'rgba(36,88,138,0.8)'
      ctx.font = 'italic 9px Consolas, monospace'
      ctx.fillText(ft.name, fx, fy - 5)
    } else {
      ctx.fillStyle = f.night ? 'rgba(190,180,150,0.7)' : 'rgba(70,60,40,0.85)'
      ctx.font = '10px Consolas, monospace'
      ctx.fillText(INFRA_GLYPH[ft.kind] ?? '■', fx, fy + 3)
      ctx.font = '8.5px Consolas, monospace'
      ctx.fillText(ft.name, fx, fy - 7)
    }
  }
}

/** THE DATA CREDIT, printed on the sheet the way a real map carries it. The
 *  ODbL requires the attribution be SHOWN, and the map is the place where that
 *  is true — not a settings page nobody opens. Esri's line joins it only when
 *  its pixels are actually on the sheet. */
export function drawCredit(f: Frame, attribution: string | null, sat: boolean, imagery: string): void {
  if (!attribution) return
  const { ctx } = f
  ctx.save()
  ctx.font = '8px Consolas, monospace'
  ctx.textAlign = 'right'
  ctx.fillStyle = f.night ? 'rgba(150,170,190,0.45)'
    : sat ? 'rgba(210,220,230,0.6)' : 'rgba(40,50,60,0.5)'
  ctx.fillText(sat && S.map!.sat ? `${attribution}  ·  ${imagery}` : attribution, f.w - 8, f.h - 6)
  ctx.restore()
}
