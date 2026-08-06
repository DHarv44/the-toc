// WHAT THE POINTER IS DOING — the formation-spread preview, the marquee, and
// the grid readout under the cursor.
//
// CONSOLE.md step 6. The last layer, and the only one that draws INPUT rather
// than the world: everything here exists for the duration of a gesture. A
// read-only pane (the team station) mounts none of it, which is most of what
// "read-only" means.
//
// These take screen coordinates, not world ones, because that is what a gesture
// is measured in.
import { S } from '../../engine/state'
import type { Frame } from '../frame'

/** FORMATION SPREAD: drag out a line and the selection lands along it, one pip
 *  per element. Red when the order is an attack, because the same gesture means
 *  two different things and the colour is the only warning. */
export function drawSpreadPreview(
  f: Frame, drag: { x0: number; y0: number; x1: number; y1: number } | null,
  n: number, attack: boolean,
): void {
  if (!drag) return
  const { ctx } = f
  const count = Math.max(1, n)
  ctx.strokeStyle = attack ? 'rgba(255,88,68,0.85)' : 'rgba(63,157,255,0.85)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(drag.x0, drag.y0)
  ctx.lineTo(drag.x1, drag.y1)
  ctx.stroke()
  ctx.fillStyle = attack ? 'rgba(255,88,68,0.9)' : 'rgba(63,157,255,0.9)'
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0.5
    ctx.beginPath()
    ctx.arc(drag.x0 + (drag.x1 - drag.x0) * t, drag.y0 + (drag.y1 - drag.y0) * t, 4, 0, Math.PI * 2)
    ctx.fill()
  }
}

export function drawMarquee(
  f: Frame, m: { x0: number; y0: number; x1: number; y1: number } | null,
): void {
  if (!m) return
  const { ctx } = f
  const x = Math.min(m.x0, m.x1), y = Math.min(m.y0, m.y1)
  const w = Math.abs(m.x1 - m.x0), h = Math.abs(m.y1 - m.y0)
  ctx.fillStyle = 'rgba(80,160,255,0.12)'
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = 'rgba(110,190,255,0.85)'
  ctx.lineWidth = 1.2
  ctx.setLineDash([5, 3])
  ctx.strokeRect(x, y, w, h)
  ctx.setLineDash([])
}

/** THE GRID UNDER THE CURSOR, and what the ground there is. Six figures is how
 *  a grid reference is actually passed on a net, so that is what this reads
 *  out — not decimal metres. */
export function drawCursorReadout(f: Frame, mx: number, my: number): void {
  const wx = f.s2wX(mx), wy = f.s2wY(my)
  if (wx < 0 || wy < 0 || wx >= f.world || wy >= f.world) return
  const { ctx } = f
  ctx.font = '10px Consolas, monospace'
  ctx.fillStyle = f.night ? 'rgba(160,200,235,0.85)' : 'rgba(20,30,40,0.75)'
  ctx.fillText(
    `${String(Math.floor(wx / 100)).padStart(3, '0')} ${String(Math.floor(wy / 100)).padStart(3, '0')}  `
    + S.map!.terrNameAt(wx, wy).toUpperCase(),
    mx + 14, my + 22,
  )
}
