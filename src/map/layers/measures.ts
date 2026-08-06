// CONTROL MEASURES — the one thing the commander puts on the sheet that is
// neither a unit nor an order: coordination, written down.
//
// Fourth layer out (CONSOLE.md step 6). Drawn UNDER the units and OVER the
// terrain, in the conventional way: a phase line is a plain line with its name
// at BOTH ends, because a staff reads it from whichever side they are on; a
// checkpoint is a small triangle; an objective is a labelled blob.
//
// NOTHING HERE IS DECORATIVE. A measure an element has crossed dims, so the
// sheet shows the operation's PROGRESS and not just its plan.
import { S } from '../../engine/state'
import type { Frame } from '../frame'

// dark under-stroke that keeps a graphic legible over the tan sheet — the
// command-route casing convention, applied to the commander's own pen
const CASING = 'rgba(12,18,14,0.7)'

/** Stroke the current path CASED: dark wide pass under the colour pass. The
 *  callers build a path and call this instead of ctx.stroke(). */
function cased(ctx: CanvasRenderingContext2D, w: number): void {
  const col = ctx.strokeStyle
  ctx.strokeStyle = CASING
  ctx.lineWidth = w + 2.4
  ctx.stroke()
  ctx.strokeStyle = col
  ctx.lineWidth = w
  ctx.stroke()
}

export function drawMeasures(f: Frame): void {
  const { ctx } = f
  for (const m of S.measures) {
    // a boundary never "completes" — it divides ground, it is not progress
    const done = m.kind !== 'boundary' && m.crossed.length > 0
    ctx.save()
    ctx.lineJoin = 'round'
    // THE PEN THE COMMANDER DREW IT WITH wins over the kind's default; a
    // completed (crossed) graphic still dims, whatever colour it was.
    const base = m.color ?? (m.kind === 'boundary' ? 'rgba(215,170,70,0.95)' : 'rgba(64,196,128,0.95)')
    ctx.strokeStyle = done && !m.color ? 'rgba(120,170,140,0.55)' : base
    ctx.fillStyle = ctx.strokeStyle
    const wgt = m.weight ?? 2.6
    ctx.lineWidth = wgt
    ctx.font = '600 10px Inter, system-ui, sans-serif'
    ctx.textAlign = 'center'
    const label = m.kind === 'phaseline' ? `PL ${m.name}`
      : m.kind === 'checkpoint' ? `CP ${m.name}`
        : m.kind === 'arrow' ? `AXIS ${m.name}`
          : m.kind === 'poi' ? `POI ${m.name}` : m.name

    if (m.kind === 'arrow' && m.pts.length > 1) {
      // AXIS OF ADVANCE — a shaft with an open arrowhead, the label riding the
      // shaft. The commander talking to the sheet: no crossings, no dimming.
      const a = m.pts[0]!, b = m.pts[1]!
      const ax = f.w2sX(a.x), ay = f.w2sY(a.y), bx = f.w2sX(b.x), by = f.w2sY(b.y)
      const ang = Math.atan2(by - ay, bx - ax)
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by)
      cased(ctx, wgt + 0.6)
      const head = 12 + wgt * 2
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(bx, by)
        ctx.lineTo(bx - Math.cos(ang - s * 0.44) * head, by - Math.sin(ang - s * 0.44) * head)
        cased(ctx, wgt + 0.6)
      }
      // label along the shaft, upright whichever way the axis points
      const mx = (ax + bx) / 2, my = (ay + by) / 2
      ctx.save()
      ctx.translate(mx, my)
      ctx.rotate(Math.abs(ang) > Math.PI / 2 ? ang + Math.PI : ang)
      ctx.fillText(label, 0, -6)
      ctx.restore()
      ctx.restore()
      continue
    }

    if (m.kind === 'poi' && m.pts.length) {
      // POINT OF INTEREST — a small diamond with a centre dot: a place the
      // commander wants eyes drawn to, nothing the sim acts on.
      const p = m.pts[0]!
      const px = f.w2sX(p.x), py = f.w2sY(p.y)
      ctx.beginPath()
      ctx.moveTo(px, py - 8); ctx.lineTo(px + 8, py); ctx.lineTo(px, py + 8); ctx.lineTo(px - 8, py)
      ctx.closePath()
      cased(ctx, wgt)
      ctx.beginPath(); ctx.arc(px, py, 1.6, 0, Math.PI * 2); ctx.fill()
      ctx.fillText(label, px, py - 13)
      ctx.restore()
      continue
    }

    if (m.kind === 'boundary' && m.pts.length > 1) {
      // A BOUNDARY IS LABELLED BY WHOSE GROUND LIES EITHER SIDE OF IT — that IS
      // the graphic. A line with a name on it would be a phase line; what a
      // staff reads off a boundary is "us here, them there", so the team names
      // go out to their own side of the line.
      const a = m.pts[0]!, b = m.pts[1]!
      const ax = f.w2sX(a.x), ay = f.w2sY(a.y), bx = f.w2sX(b.x), by = f.w2sY(b.y)
      ctx.setLineDash([14, 7])
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by)
      cased(ctx, Math.max(wgt, 2.6))
      ctx.setLineDash([])
      // Offsets are worked out in WORLD space and converted, not measured on the
      // screen: the sign that names a sector comes from the world geometry, and
      // screen Y runs the other way — doing it in pixels puts each team's name
      // on the far side of its own boundary.
      const wdx = b.x - a.x, wdy = b.y - a.y
      const wl = Math.hypot(wdx, wdy) || 1
      const wnx = -wdy / wl, wny = wdx / wl
      const wmx = (a.x + b.x) / 2, wmy = (a.y + b.y) / 2
      const nSide = Math.sign(wdx * (wmy + wny - a.y) - wdy * (wmx + wnx - a.x))
      const off = 26 / f.view.ppm
      for (const [id, s] of [[m.owners?.neg ?? null, -1], [m.owners?.pos ?? null, 1]] as const) {
        const t = id == null ? null : S.teams.find(x => x.id === id)
        const dir = s === nSide ? 1 : -1
        ctx.fillText(t?.name ?? 'UNASSIGNED',
          f.w2sX(wmx + wnx * off * dir), f.w2sY(wmy + wny * off * dir) + 3)
      }
      ctx.restore()
      continue
    }

    if (m.kind === 'phaseline' && m.pts.length > 1) {
      const a = m.pts[0]!, b = m.pts[1]!
      const ax = f.w2sX(a.x), ay = f.w2sY(a.y), bx = f.w2sX(b.x), by = f.w2sY(b.y)
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by)
      cased(ctx, wgt)
      // tick the ends so a phase line is not mistaken for a route
      const ang = Math.atan2(by - ay, bx - ax) + Math.PI / 2
      for (const [ex, ey] of [[ax, ay], [bx, by]] as const) {
        ctx.beginPath()
        ctx.moveTo(ex - Math.cos(ang) * 7, ey - Math.sin(ang) * 7)
        ctx.lineTo(ex + Math.cos(ang) * 7, ey + Math.sin(ang) * 7)
        cased(ctx, wgt)
      }
      ctx.fillText(label, ax, ay - 11)
      ctx.fillText(label, bx, by - 11)
    } else if (m.pts.length) {
      const p = m.pts[0]!
      const px = f.w2sX(p.x), py = f.w2sY(p.y)
      if (m.kind === 'checkpoint') {
        ctx.beginPath()
        ctx.moveTo(px, py - 9); ctx.lineTo(px + 8, py + 6); ctx.lineTo(px - 8, py + 6)
        ctx.closePath()
        cased(ctx, wgt)
      } else {
        ctx.beginPath(); ctx.arc(px, py, 14, 0, Math.PI * 2)
        cased(ctx, wgt)
      }
      ctx.fillText(label, px, py - 14)
    }
    ctx.restore()
  }
}
