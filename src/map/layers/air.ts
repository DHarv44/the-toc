// WHAT IS OVERHEAD, AND WHAT HAS LANDED — the drones with their orbits, locks
// and overwatch tethers, and the impact rings from called fire missions.
//
// CONSOLE.md step 6.
//
// ROUNDS IN FLIGHT ARE DELIBERATELY NOT HERE. This is a Blue Force Tracker, not
// a gun camera: it plots what the NETWORK reports, and individual cannon rounds
// are not reported. Only a called-for-fire mission is a reported event, so only
// its impacts land on the sheet — tracers and gun strikes belong to the UAS
// feed, which is the one place the player sees actual ground truth.
import { S } from '../../engine/state'
import { DRONE_TYPES } from '../../domains/air/catalog'
import { drawDroneIcon } from '../symbols'
import type { Frame } from '../frame'

/** Fire-mission impacts: an expanding ring that fades over four seconds — long
 *  enough to notice from across the sheet, short enough not to become terrain. */
export function drawImpacts(f: Frame): void {
  const { ctx } = f
  for (const im of S.impacts) {
    if (im.gun) continue
    const age = S.t - im.t
    if (age > 4) continue
    ctx.strokeStyle = `rgba(200,80,30,${1 - age / 4})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(f.w2sX(im.x), f.w2sY(im.y), 4 + age * 10 * f.view.ppm * 30, 0, Math.PI * 2)
    ctx.stroke()
  }
}

/** THE AIR PICTURE: orbit ring, sensor footprint, the lock diamond, the
 *  overwatch tether to whoever the bird is covering, and the aircraft itself
 *  pointed the way it is actually flying. */
export function drawDrones(f: Frame, feedIds: Set<number>): void {
  const { ctx } = f
  for (const d of S.drones) {
    const spec = DRONE_TYPES[d.type]
    const sel = feedIds.has(d.id) || f.sel.has(d.id)
    if (d.state === 'onstation') {
      ctx.setLineDash([4, 4])
      // a tethered aerostat holds a fixed point — no orbit ring, just its arc
      if (spec.src !== 'tether') {
        ctx.strokeStyle = sel ? 'rgba(255,215,80,0.6)' : 'rgba(60,140,220,0.4)'
        ctx.beginPath()
        ctx.arc(f.w2sX(d.tx), f.w2sY(d.ty),
          spec.orbitR * (d.orbitMul || 1) * f.view.ppm, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.strokeStyle = 'rgba(60,140,220,0.18)'
      ctx.beginPath()
      ctx.arc(f.w2sX(d.tx), f.w2sY(d.ty),
        spec.sight * (d.sightMul || 1) * f.view.ppm, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }
    if (d.lock) {
      const lx = f.w2sX(d.lock.x), ly = f.w2sY(d.lock.y)
      ctx.strokeStyle = 'rgba(255,170,60,0.85)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(lx, ly - 7); ctx.lineTo(lx + 7, ly); ctx.lineTo(lx, ly + 7); ctx.lineTo(lx - 7, ly)
      ctx.closePath()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(lx, ly - 3); ctx.lineTo(lx, ly + 3)
      ctx.moveTo(lx - 3, ly); ctx.lineTo(lx + 3, ly)
      ctx.stroke()
    }
    if (d.followId) {
      const fu = S.units.find(x => x.id === d.followId)
      if (fu) {
        ctx.strokeStyle = 'rgba(90,200,170,0.5)'
        ctx.setLineDash([3, 5])
        ctx.beginPath()
        ctx.moveTo(f.w2sX(d.x), f.w2sY(d.y))
        ctx.lineTo(f.w2sX(fu.x), f.w2sY(fu.y))
        ctx.stroke()
        ctx.setLineDash([])
      }
    }
    const hdg = (d.state === 'transit' || d.state === 'rtb' || d.state === 'striking')
      ? Math.atan2((d.state === 'rtb' ? d.oy : d.state === 'striking' ? d.sy! : d.ty) - d.y,
                   (d.state === 'rtb' ? d.ox : d.state === 'striking' ? d.sx! : d.tx) - d.x)
      // nose points along the tangent; gunships turn the other way (left-hand orbit)
      : d.angle + (spec.gunship ? -Math.PI / 2 : Math.PI / 2)
    drawDroneIcon(ctx, f.w2sX(d.x), f.w2sY(d.y), hdg, d.label, sel, d.type)
  }
}
