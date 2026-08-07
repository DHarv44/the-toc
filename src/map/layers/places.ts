// PLACES AND THE THINGS BUILT ON THEM — the objective, the bridges, higher's
// command post, the scenario's authored graphics, every installation, and the
// wrecks and smoke left behind.
//
// CONSOLE.md step 6. What ties these together is that none of them MOVE. They
// are the sheet's furniture: a commander reads them to orient, not to command.
// Drawn under the symbology, over the ground.
import { S } from '../../engine/state'
import { STRUCTURES, FACILITIES } from '../../domains/installations/catalog'
import { facilityPoints, footprintOf, poolPad } from '../../domains/installations/anatomy'
import { markOf, patchOf } from '../../packs/orgquery'
import { playerPack } from '../../packs'
import { drawPlace, drawStructure, drawFacility } from '../symbols'
import type { Frame } from '../frame'

/** KING OF THE HILL: the control zone tinted by whoever holds it, with both
 *  clocks over it. The tint is the answer to "whose is it"; the clocks are the
 *  answer to "for how much longer does that matter". */
export function drawHill(f: Frame): void {
  if (!S.hill) return
  const { ctx } = f
  const h = S.hill
  const hx = f.w2sX(h.x), hy = f.w2sY(h.y), hr = h.r * f.view.ppm
  const col = h.holder === 'friend' ? '63,157,255'
    : h.holder === 'hostile' ? '255,88,68' : '200,200,200'
  ctx.beginPath()
  ctx.arc(hx, hy, hr, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(${col},0.08)`
  ctx.fill()
  ctx.setLineDash([9, 6])
  ctx.strokeStyle = `rgba(${col},0.75)`
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.setLineDash([])
  const mmss = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  ctx.font = 'bold 10px Consolas, monospace'
  ctx.textAlign = 'center'
  ctx.fillStyle = `rgba(${col},0.95)`
  ctx.fillText(
    `OBJ ${h.holder === 'friend' ? '— HELD' : h.holder === 'hostile' ? '— ENEMY HELD' : '— CONTESTED'}`,
    hx, hy - hr - 18)
  ctx.font = '9px Consolas, monospace'
  ctx.fillStyle = f.night ? 'rgba(160,200,235,0.9)' : 'rgba(30,40,60,0.85)'
  ctx.fillText(`FRND ${mmss(h.holdFriend)} / ${mmss(h.target)} · ENY ${mmss(h.holdHostile)}`,
    hx, hy - hr - 6)
  ctx.textAlign = 'left'
}

/** Pontoon bridges laid by the engineers — drawn as the terrain cells they
 *  actually are, because that is what they change. */
export function drawPontoons(f: Frame): void {
  if (!S.pontoons.length) return
  const { ctx } = f
  const { GRID, CELL } = S.map!
  for (const i of S.pontoons) {
    const gx = i % GRID, gy = (i / GRID) | 0
    const x = f.w2sX(gx * CELL), y = f.w2sY(gy * CELL)
    const sz = CELL * f.view.ppm
    ctx.fillStyle = '#b8a67e'
    ctx.fillRect(x, y, sz, sz)
    ctx.strokeStyle = '#26221c'
    ctx.lineWidth = 1
    ctx.strokeRect(x - 1, y - 1, sz + 2, sz + 2)
  }
}

/** DIVISION MAIN, the scenario's authored graphics, and every installation.
 *
 *  Higher's command post is inert — deep rear, it does nothing, it is simply
 *  there, which is exactly what a division main is to a battalion. The authored
 *  places are the same operational graphic the builder drew, dimmed, under the
 *  symbols where a graphic belongs. */
export function drawStructures(f: Frame): void {
  const { ctx } = f
  if (S.campaign?.divHq) {
    const d = S.campaign.divHq
    drawStructure(ctx, f.w2sX(d.x), f.w2sY(d.y), {
      side: 'friend', kind: 'HQ', label: 'DIV MAIN · 1CD',
      building: false, progress: 1, hpFrac: 1,
    })
  }
  if (S.scenarioPlaces) {
    for (const [name, p] of S.scenarioPlaces) {
      drawPlace(ctx, f.w2sX(p.x), f.w2sY(p.y), {
        name, dim: true,
        ...(p.r != null ? { rPx: p.r * f.view.ppm } : {}),
      })
    }
  }
  for (const s of S.structures) {
    if (s.side === 'hostile' && S.fogEnabled && !S.structContacts.has(s.id)) continue
    drawStructure(ctx, f.w2sX(s.x), f.w2sY(s.y), {
      side: s.side, kind: s.kind,
      label: s.side === 'friend' && s.kind === 'FOB'
        ? `${s.label} · S:${Math.floor(s.stock || 0)}`
        : s.label,
      building: s.buildT > 0,
      progress: s.buildT > 0 ? 1 - s.buildT / STRUCTURES[s.kind].buildTime : 1,
      hpFrac: s.hp / s.maxHp,
      // a division main and your own CP are the same box until the size marker
      // says otherwise — mark anything that is not yours
      echelon: s.side === 'friend' && s.formation && s.formation !== S.chair
        ? markOf(playerPack(), s.formation) : undefined,
      patch: s.side === 'friend' && s.formation && s.formation !== S.chair
        ? patchOf(playerPack(), s.formation) : undefined,
    })
  }
  // BASE ANATOMY: zoomed in close enough that a ~150 m offset is legible, a
  // friendly base shows its facilities as their own plates at their real
  // positions — the motor pool is a PLACE, and it is where the vehicles are.
  // Below that zoom they roll up into the base symbol, the team convention.
  const anatomyPx = 150 * f.view.ppm
  if (anatomyPx >= 24) {
    for (const s of S.structures) {
      if (s.side !== 'friend' || s.buildT > 0) continue
      // THE WIRE first, under the plates: the compound is GROUND, not
      // symbology — graded earth inside the fence, shaded the way the urban
      // blocks are (a quiet dark wash with a firm edge, lifted at night per
      // the debris rule), the gate marked on the bearing everything leaves by
      if (s.kind !== 'OP') {
        const w = footprintOf(s)
        ctx.save()
        ctx.beginPath()
        w.poly.forEach((p, i) => {
          const sx = f.w2sX(p.x), sy = f.w2sY(p.y)
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy)
        })
        ctx.closePath()
        ctx.fillStyle = f.night ? 'rgba(200,205,210,0.10)' : 'rgba(88,86,80,0.28)'
        ctx.fill()
        ctx.strokeStyle = f.night ? 'rgba(180,200,220,0.4)' : 'rgba(62,60,54,0.5)'
        ctx.lineWidth = 1.3
        ctx.stroke()
        // the gate: a solid post pair astride the opening
        const gx = f.w2sX(w.gate.x), gy = f.w2sY(w.gate.y)
        const ang = Math.atan2(w.gate.y - s.y, w.gate.x - s.x) + Math.PI / 2
        const px = Math.cos(ang) * 5, py = Math.sin(ang) * 5
        ctx.strokeStyle = f.night ? 'rgba(180,225,255,0.95)' : 'rgba(25,50,80,0.9)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(gx + px - py * 0.6, gy + py + px * 0.6)
        ctx.lineTo(gx + px + py * 0.6, gy + py - px * 0.6)
        ctx.moveTo(gx - px - py * 0.6, gy - py + px * 0.6)
        ctx.lineTo(gx - px + py * 0.6, gy - py - px * 0.6)
        ctx.stroke()
        ctx.restore()
      }
      if (!s.facilities?.length) continue
      // THE HARDSTAND: a parking apron with painted stalls under the motor
      // pool, so the lot reads as a place even when it stands empty — and a
      // parked row of vics reads as PARKED, not as a huddle in the dirt
      const pad = poolPad(s)
      if (pad) {
        const fx = Math.cos(pad.ang), fy = Math.sin(pad.ang)
        const ppm = f.view.ppm
        const cx = f.w2sX(pad.x), cy = f.w2sY(pad.y)
        // pad frame: ±44 m across the stalls, ±38 m along the gate axis
        const ax = 38 * ppm, aw = 44 * ppm
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(Math.atan2(fy, fx))
        ctx.fillStyle = f.night ? 'rgba(210,215,220,0.09)' : 'rgba(70,70,66,0.30)'
        ctx.fillRect(-ax, -aw, ax * 2, aw * 2)
        ctx.strokeStyle = f.night ? 'rgba(190,205,220,0.35)' : 'rgba(50,50,46,0.45)'
        ctx.lineWidth = 1
        ctx.strokeRect(-ax, -aw, ax * 2, aw * 2)
        // painted stall lines: five separators for the four columns, running
        // down the gate axis (slots sit at ±10 m, ±30 m across)
        ctx.beginPath()
        for (let c = -2; c <= 2; c++) {
          const off = c * 20 * ppm
          ctx.moveTo(-ax * 0.85, off)
          ctx.lineTo(ax * 0.85, off)
        }
        ctx.strokeStyle = f.night ? 'rgba(190,205,220,0.22)' : 'rgba(200,200,190,0.35)'
        ctx.stroke()
        ctx.restore()
      }
      const pts = facilityPoints(s)
      for (const k of s.facilities) {
        const p = pts[k]
        const spec = FACILITIES[k]
        if (!p || !spec) continue
        drawFacility(ctx, f.w2sX(p.x), f.w2sY(p.y), {
          name: spec.name, effects: spec.effects, label: anatomyPx >= 48,
        })
      }
    }
  }
}

/** What the fight leaves on the ground: wrecks for six minutes, and smoke
 *  that grows, holds and fades. Both are time-based, which is why they live
 *  here and not with the symbology — they are the sheet remembering.
 *  (Wreck life was 90 s and read as the battlefield tidying itself up —
 *  quadrupled 2026-08-06, and it is the recovery loop's prerequisite: a site
 *  that vanishes can't be recovered.) */
export function drawDebris(f: Frame): void {
  const { ctx } = f
  ctx.strokeStyle = f.night ? 'rgba(180,170,160,0.5)' : 'rgba(60,55,50,0.55)'
  ctx.lineWidth = 1.5
  for (const wk of S.wrecks) {
    const age = S.t - wk.t
    if (age > 360) continue
    const x = f.w2sX(wk.x), y = f.w2sY(wk.y)
    ctx.globalAlpha = Math.max(0.15, 1 - age / 360)
    ctx.beginPath()
    ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5)
    ctx.moveTo(x - 5, y + 5); ctx.lineTo(x + 5, y - 5)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  for (const sm of S.smoke) {
    const age = S.t - sm.t
    const fade = Math.min(1, Math.max(0, (75 - age) / 15))   // fade out over the last 15 s
    const grow = Math.min(1, 0.4 + age / 8)
    const x = f.w2sX(sm.x), y = f.w2sY(sm.y)
    const r = sm.r * grow * f.view.ppm
    const grad = ctx.createRadialGradient(x, y, r * 0.2, x, y, r)
    grad.addColorStop(0, `rgba(200,200,205,${0.5 * fade})`)
    grad.addColorStop(1, 'rgba(170,170,178,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
}
