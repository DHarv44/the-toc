// THE GRATICULE — the 1 km grid, its labels, and the 100 m sub-grid.
//
// FIRST LAYER OUT OF THE MONOLITH (CONSOLE.md step 6), and chosen because it is
// the least entangled pass in the file: it reads the frame and the world's
// size, and nothing else. If the Frame contract is wrong, this is where it
// shows up cheapest.
//
// The grid is what makes the sheet a MAP rather than a picture — every grid
// reference the net calls is read off these lines, so they are drawn under the
// symbology and over the ground, and they do not fade with the overlay dimmer.
import type { Frame } from '../frame'

/** The 100 m lines, drawn UNDER the kilometre grid and only once the view is
 *  close enough for them to mean something — at five kilometres across the
 *  pane, a hundred-metre mesh is grey noise, not a reference. */
export function drawSubGrid(f: Frame): void {
  if (f.w / f.view.ppm > 5000) return
  const { ctx } = f
  const x0 = Math.max(0, f.s2wX(0)), x1 = Math.min(f.world, f.s2wX(f.w))
  const y0 = Math.max(0, f.s2wY(0)), y1 = Math.min(f.world, f.s2wY(f.h))
  ctx.strokeStyle = f.night ? 'rgba(140,180,220,0.06)' : 'rgba(30,40,60,0.09)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let m = Math.ceil(x0 / 100) * 100; m <= x1; m += 100) {
    if (m % 1000 === 0) continue      // the km lines are drawn bolder, below
    ctx.moveTo(f.w2sX(m), f.w2sY(y0)); ctx.lineTo(f.w2sX(m), f.w2sY(y1))
  }
  for (let m = Math.ceil(y0 / 100) * 100; m <= y1; m += 100) {
    if (m % 1000 === 0) continue
    ctx.moveTo(f.w2sX(x0), f.w2sY(m)); ctx.lineTo(f.w2sX(x1), f.w2sY(m))
  }
  ctx.stroke()
}

/** The kilometre grid and its edge labels. The labels are pinned to the pane's
 *  edges rather than to the lines, which is how a map sheet is read: you run
 *  your eye along the margin, not into the middle of the picture. */
export function drawGrid(f: Frame): void {
  const { ctx } = f
  ctx.strokeStyle = f.night ? 'rgba(140,180,220,0.14)' : 'rgba(30,40,60,0.18)'
  ctx.lineWidth = 1
  ctx.font = '9px Consolas, monospace'
  ctx.fillStyle = f.night ? 'rgba(150,190,230,0.5)' : 'rgba(30,40,60,0.5)'
  ctx.beginPath()
  for (let m = 0; m <= f.world; m += 1000) {
    ctx.moveTo(f.w2sX(m), f.w2sY(0)); ctx.lineTo(f.w2sX(m), f.w2sY(f.world))
    ctx.moveTo(f.w2sX(0), f.w2sY(m)); ctx.lineTo(f.w2sX(f.world), f.w2sY(m))
  }
  ctx.stroke()
  // below this the numbers collide with each other and stop being readable
  if (f.view.ppm <= 0.03) return
  for (let m = 0; m < f.world; m += 1000) {
    ctx.fillText(String(m / 1000).padStart(2, '0'), f.w2sX(m) + 3, 12)
    ctx.fillText(String(m / 1000).padStart(2, '0'), 4, f.w2sY(m) + 10)
  }
}
