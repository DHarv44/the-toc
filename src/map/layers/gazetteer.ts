// THE NAMES ON THE GROUND — the sim's own towns, and every other named place
// the pack's ground knows.
//
// Second layer out (CONSOLE.md step 6). Like the graticule it is pure drawing
// with no orders in it, which is what makes it safe to move early — but unlike
// the graticule it takes DATA as well as the frame: the gazetteer is baked once
// at mount from the ground file, so it is passed in rather than rebuilt per
// frame.
//
// A CHART DECLUTTERS ITSELF. Every label carries the zoom at which it earns its
// place — cities always, hamlets only up close — because a pack map knows tens
// of thousands of names and drawing them all is a grey smear, not a map.
import { S } from '../../engine/state'
import type { PlaceLabel } from '../packRender'
import type { Frame } from '../frame'

/** The sim's own towns: the handful the scenario cares about, drawn boldest
 *  because they are the ones the net will name. */
export function drawTowns(f: Frame): void {
  const { ctx } = f
  ctx.font = 'bold 10px Consolas, monospace'
  ctx.fillStyle = f.night ? 'rgba(160,195,225,0.8)' : 'rgba(40,40,45,0.85)'
  ctx.textAlign = 'center'
  for (const t of S.map!.towns) ctx.fillText(t.name, f.w2sX(t.x), f.w2sY(t.y) - 6)
}

/** Everything else the ground knows — gated by rank, culled to the pane, and
 *  styled by what the place IS: peaks get a spot mark, water goes italic blue,
 *  built-up places get weight by size. */
export function drawGazetteer(f: Frame, labels: PlaceLabel[] | null): void {
  if (!labels) return
  const { ctx } = f
  for (const p of labels) {
    if (f.view.ppm < p.minPpm) continue
    const x = f.w2sX(p.x), y = f.w2sY(p.y)
    // the cull box is generous sideways: a long name whose anchor is just off
    // the pane still has letters on it
    if (x < -80 || y < -20 || x > f.w + 80 || y > f.h + 20) continue
    if (p.kind === 'peak') {
      ctx.fillStyle = f.night ? 'rgba(170,150,120,0.5)' : 'rgba(96,72,44,0.7)'
      ctx.font = '9px Consolas, monospace'
      ctx.fillText('▲', x, y + 3)
      ctx.font = '8.5px Consolas, monospace'
      ctx.fillText(p.name, x, y - 5)
    } else if (p.kind === 'water') {
      ctx.fillStyle = f.night ? 'rgba(120,170,215,0.55)' : 'rgba(36,88,138,0.7)'
      ctx.font = 'italic 9px Consolas, monospace'
      ctx.fillText(p.name, x, y - 4)
    } else {
      const major = p.kind === 'city' || p.kind === 'town'
      ctx.fillStyle = f.night
        ? `rgba(160,195,225,${major ? 0.75 : 0.55})`
        : `rgba(40,40,45,${major ? 0.8 : 0.6})`
      ctx.font = `${major ? 'bold 10px' : '8.5px'} Consolas, monospace`
      ctx.fillText(p.name, x, y - 5)
    }
  }
  // the passes after this one inherit the context's font, and they were written
  // expecting the town face
  ctx.font = 'bold 10px Consolas, monospace'
}
