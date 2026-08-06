// WHAT THE ARMED MODE IS ABOUT TO DO — the rings and reticles that only exist
// while the commander is holding something.
//
// CONSOLE.md step 6. Every pass here answers the same question in a different
// vocabulary: WHERE IS THIS ALLOWED, or WHERE WILL THIS REACH. Arm a drone and
// you see its control tether; arm a FOB and you see the deploy zones; call for
// fire and every tube on the map draws its range with its readiness on it.
//
// It is the one drawing group that is genuinely MODAL, which is why it lives
// beside the input layer rather than with the world: a pane with no input
// arms nothing and draws none of this.
import { S } from '../../engine/state'
import type { Drone, Unit } from '../../engine/GameState'
import { UNIT_TYPES } from '../../domains/forces/catalog'
import { DRONE_TYPES, type DroneType } from '../../domains/air/catalog'
import { STRUCTURES, type StructureType } from '../../domains/installations/catalog'
import type { Frame } from '../frame'

/** A dashed ring at a world radius, batched into one path by the caller. */
const ringAt = (f: Frame, x: number, y: number, rM: number) => {
  const r = rM * f.view.ppm
  f.ctx.moveTo(f.w2sX(x) + r, f.w2sY(y))
  f.ctx.arc(f.w2sX(x), f.w2sY(y), r, 0, Math.PI * 2)
}

/** STRIKE REACH: for any selected armed bird, where a lock could actually land,
 *  plus the reticle on a strike already in flight. */
export function drawStrikeAim(f: Frame, selDrones: Drone[]): void {
  const { ctx } = f
  for (const d of selDrones) {
    const spec = DRONE_TYPES[d.type]
    if (!spec?.weapons) continue
    ctx.strokeStyle = 'rgba(220,60,40,0.45)'
    ctx.setLineDash([8, 5])
    ctx.beginPath()
    ctx.arc(f.w2sX(d.x), f.w2sY(d.y), spec.weapons.range * f.view.ppm, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
  }
  for (const d of S.drones) {
    if (!d.strikeMark || S.t > d.strikeMark.until) continue
    const x = f.w2sX(d.strikeMark.x), y = f.w2sY(d.strikeMark.y)
    ctx.strokeStyle = 'rgba(255,58,40,0.9)'
    ctx.lineWidth = 1.6
    ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y)
    ctx.moveTo(x, y - 12); ctx.lineTo(x, y + 12)
    ctx.stroke()
  }
}

/** WHERE THIS IS ALLOWED TO GO. Deploy zones for an element, tether or control
 *  range for a bird, the siting radius for a structure, the reach for a bridge.
 *  All of them are the same idea and all of them are dashed, because a dashed
 *  ring reads as a RULE rather than as a thing on the ground. */
export function drawPlacement(f: Frame, mode: string, selUnits: Unit[]): void {
  const { ctx } = f

  if (mode.startsWith('deploy:DRONE:')) {
    const spec = (DRONE_TYPES as Record<string, DroneType | undefined>)[mode.slice(13)]
    if (spec?.src === 'tether') {
      ctx.strokeStyle = 'rgba(120,180,220,0.5)'
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      for (const s of S.structures) {
        if (s.side !== 'friend' || s.buildT > 0) continue
        if (s.kind !== 'FOB' && s.kind !== 'HQ') continue
        if (S.drones.some(d => d.tether === s.id)) continue
        ringAt(f, s.x, s.y, spec.tetherRange!)
      }
      ctx.stroke()
      ctx.setLineDash([])
    }
    if (spec?.src === 'field') {
      ctx.strokeStyle = 'rgba(120,180,220,0.5)'
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      for (const u of S.units) {
        if (u.side !== 'friend') continue
        ringAt(f, u.x, u.y, spec.ctrlRange!)
      }
      ctx.stroke()
      ctx.setLineDash([])
    }
    return
  }

  if (mode.startsWith('deploy:')) {
    ctx.strokeStyle = 'rgba(40,120,220,0.6)'
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    for (const s of S.structures) {
      if (s.side !== 'friend' || s.buildT > 0 || !s.deployZone) continue
      ringAt(f, s.x, s.y, s.deployZone)
    }
    ctx.stroke()
    ctx.setLineDash([])
    return
  }

  if (mode.startsWith('build:')) {
    const spec = (STRUCTURES as Record<string, StructureType | undefined>)[mode.slice(6)]
    if (!spec) return
    ctx.strokeStyle = 'rgba(120,180,90,0.55)'
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    for (const s of S.structures) {
      if (s.side !== 'friend') continue
      // an OP is the exception: it is sited off TROOPS, so a half-built base
      // still counts as a place to measure from
      if (spec.key !== 'OP' && s.buildT > 0) continue
      ringAt(f, s.x, s.y, spec.near)
    }
    if (spec.key === 'OP') {
      for (const u of S.units) {
        if (u.side !== 'friend') continue
        ringAt(f, u.x, u.y, spec.near)
      }
    }
    ctx.stroke()
    ctx.setLineDash([])
    return
  }

  if (mode === 'bridge') {
    const eng = selUnits.find(u => UNIT_TYPES[u.type].canBridge)
    if (!eng) return
    ctx.strokeStyle = 'rgba(200,150,50,0.6)'
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.arc(f.w2sX(eng.x), f.w2sY(eng.y), 700 * f.view.ppm, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
  }
}

/** THE CALL FOR FIRE PICTURE, while the mission is being placed: every friendly
 *  tube's range ring with its callsign and readiness on it — hot if it is the
 *  one selected, grey if it is still reloading — and a crosshair on the grid
 *  the commander is about to send. */
export function drawFireMissionAim(f: Frame, mx: number, my: number): void {
  const { ctx } = f
  ctx.setLineDash([8, 5])
  for (const u of S.units) {
    if (u.side !== 'friend') continue
    const ind = UNIT_TYPES[u.type].indirect
    if (!ind) continue
    const isSel = f.sel.has(u.id)
    const reloading = u.missionCooldown > 0
    ctx.strokeStyle = reloading ? 'rgba(120,120,120,0.4)'
      : isSel ? 'rgba(220,50,30,0.7)' : 'rgba(200,110,40,0.45)'
    ctx.lineWidth = isSel ? 2 : 1.2
    ctx.beginPath()
    ctx.arc(f.w2sX(u.x), f.w2sY(u.y), ind.range * f.view.ppm, 0, Math.PI * 2)
    ctx.stroke()
    ctx.font = '9px Consolas, monospace'
    ctx.fillStyle = reloading ? 'rgba(140,140,140,0.7)' : 'rgba(200,80,40,0.85)'
    ctx.textAlign = 'center'
    ctx.fillText(
      `${u.label} ${reloading ? 'RELOAD ' + Math.ceil(u.missionCooldown) + 'S' : 'RDY'}`,
      f.w2sX(u.x), f.w2sY(u.y) - ind.range * f.view.ppm - 4,
    )
    ctx.textAlign = 'left'
  }
  ctx.lineWidth = 1.5
  ctx.setLineDash([])
  ctx.strokeStyle = '#c22'
  ctx.beginPath()
  ctx.moveTo(mx - 12, my); ctx.lineTo(mx + 12, my)
  ctx.moveTo(mx, my - 12); ctx.lineTo(mx, my + 12)
  ctx.stroke()
}
