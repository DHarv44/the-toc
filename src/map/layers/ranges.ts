// ROLE-BASED RANGE OVERLAYS — what my guns can service, what my sensors can
// see, and how far the thing I am holding can shoot.
//
// CONSOLE.md step 6. Three toggles, three questions, and they are deliberately
// not the same shape:
//
//   FIRES  every indirect shooter's max-range ring, LABELLED. This is the
//          call-for-fire picture: the commander sees at a glance what ground
//          his guns can service, without selecting anything.
//   SNSR   collection coverage — recon sight, SIG direction-finding, and every
//          bird's sensor footprint.
//   WPN    direct-fire range of the SELECTED units only. A focus aid, not
//          wall-to-wall clutter; the per-unit tray toggle latches the same ring
//          for one element while it stays selected.
//
// Drawn under the symbols, at the commander's own intensity dial.
import { S } from '../../engine/state'
import { UNIT_TYPES } from '../../domains/forces/catalog'
import { DRONE_TYPES } from '../../domains/air/catalog'
import type { Frame } from '../frame'

export interface RangeToggles {
  fires: boolean
  snsr: boolean
  wpn: boolean
  /** per-unit latched rings, from the tray's RANGE button */
  per: Record<number, true>
}

export function drawRanges(f: Frame, ov: RangeToggles): void {
  const { ctx } = f
  ctx.save()
  ctx.globalAlpha = f.alpha          // the commander's intensity dial
  const ring = (px: number, py: number, rM: number,
    stroke: string, fill: string, dash: number[], w = 2) => {
    const rr = rM * f.view.ppm
    ctx.beginPath()
    ctx.arc(px, py, rr, 0, Math.PI * 2)
    if (fill) { ctx.fillStyle = fill; ctx.fill() }
    ctx.setLineDash(dash)
    ctx.strokeStyle = stroke
    ctx.lineWidth = w
    ctx.stroke()
    ctx.setLineDash([])
    return rr
  }

  for (const u of S.units) {
    if (u.side !== 'friend' || u.strength <= 0) continue
    const type = UNIT_TYPES[u.type]
    const px = f.w2sX(u.x), py = f.w2sY(u.y)
    if (ov.fires && type.indirect) {
      const rr = ring(px, py, type.indirect.range, '#ff6e46', 'rgba(232,82,60,0.10)', [12, 7], 3)
      // the label only earns its place once the ring is big enough to own it
      if (rr > 46) {
        ctx.font = 'bold 11px Consolas, monospace'
        ctx.textAlign = 'center'
        ctx.fillStyle = '#ffa078'
        ctx.fillText(`${u.label} · ${(type.indirect.range / 1000).toFixed(1)} KM`, px, py - rr - 6)
      }
    }
    if (ov.snsr) {
      if (type.cat === 'RECON') ring(px, py, type.sight, '#6ee6c3', 'rgba(110,220,190,0.07)', [4, 5], 2.2)
      if (type.df) ring(px, py, type.df, '#c896fa', '', [2, 6], 2.2)
    }
    if (type.range && f.sel.has(u.id) && (ov.wpn || ov.per[u.id])) {
      ring(px, py, type.range,
        ov.per[u.id] ? '#ffd75a' : '#6eb4ff', 'rgba(90,160,240,0.10)', [5, 4], 2.6)
    }
  }

  if (ov.snsr) {
    for (const d of S.drones) {
      if (d.state === 'rtb') continue
      ring(f.w2sX(d.x), f.w2sY(d.y), DRONE_TYPES[d.type].sight,
        '#6ee6c3', 'rgba(110,220,190,0.05)', [3, 6], 1.8)
    }
  }
  ctx.restore()
}
