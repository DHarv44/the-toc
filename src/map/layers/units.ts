// THE SYMBOLOGY — the blue force, the enemy picture, and the task organization
// drawn at the echelon the commander is actually working at.
//
// CONSOLE.md step 6. This is the layer the whole map exists to carry; everything
// under it is context and everything over it is input.
import { S } from '../../engine/state'
import type { Unit } from '../../engine/GameState'
import { UNIT_TYPES } from '../../domains/forces/catalog'
import { marchPlan } from '../../domains/movement/march'
import { drawUnitSymbol } from '../symbols'
import type { Frame } from '../frame'

/** IN CONTACT: 0 when clear, snapping to 1 on each shot fired and decaying, so
 *  a symbol's ring STROBES with its own gunfire and settles to a steady low red
 *  while it is engaged but not shooting. The eye finds a blinking thing before
 *  it finds a coloured thing, which is the point. */
export const contactLevel = (u: Unit): number => {
  if (u.strength <= 0) return 0
  const engaged = S.t - Math.max(u.lastCombatT ?? -99, u.underFireT ?? -99) < 3
  if (!engaged) return 0
  const since = u.lastFiredT == null ? 99 : S.t - u.lastFiredT
  return since < 0.35 ? 1 - since / 0.35 : 0.12
}

/** DUSTWUN sites: a downed platoon's last known point, drawn dim like a stale
 *  contact — status is unknown until somebody secures the ground. */
export function drawDustwun(f: Frame): void {
  for (const site of S.downed) {
    if (site.side !== 'friend') continue
    const age = Math.floor((S.t - site.t) / 60)
    drawUnitSymbol(f.ctx, f.w2sX(site.x), f.w2sY(site.y), {
      side: 'friend', glyph: UNIT_TYPES[site.type].glyph, stale: true,
      label: `${site.label} DUSTWUN ${age}M`, showStrength: false,
    })
  }
}

/** THE TASK ORGANIZATION, ON THE SHEET, AT THE RIGHT ECHELON.
 *
 *  Five platoons in one place drew five overlapping icons and five labels on
 *  top of each other, which is unreadable and is also the wrong answer: a
 *  battalion commander looking at a company team wants to see A COMPANY TEAM.
 *  So a team ROLLS UP into one symbol — the base element's branch under a
 *  company echelon bar, carrying the team's name, aggregate strength and count.
 *
 *  It EXPANDS when you select it, or when the column is strung far enough apart
 *  on screen that the elements are legibly separate. That is the BFT convention
 *  and the RTS one at once: the icon you command at, the detail you inspect at.
 *
 *  Returns the ids now represented by a rolled-up symbol, so the element pass
 *  can skip them. */
export function drawTeams(f: Frame): Set<number> {
  const { ctx } = f
  const rolled = new Set<number>()
  for (const t of S.teams) {
    const mem = t.members
      .map(id => S.units.find(u => u.id === id))
      .filter((u): u is Unit => !!u && u.strength > 0)
    if (mem.length < 2) continue
    const plan = marchPlan(t.id)
    const rank = new Map((plan?.order ?? t.members).map((id, i) => [id, i]))
    const line = mem.slice().sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99))
    const head = line[0]!, tail = line[line.length - 1]!
    const picked = mem.some(u => f.sel.has(u.id))
    // how far apart the column actually is ON SCREEN — a team strung over two
    // kilometres of road at high zoom is not one icon, it is a column
    const spreadPx = Math.hypot(
      f.w2sX(head.x) - f.w2sX(tail.x), f.w2sY(head.y) - f.w2sY(tail.y))
    const expand = picked || spreadPx > 110

    // AN ELEMENT ON A DIFFERENT DRILL FROM ITS TEAM IS THE EXCEPTION A TOC
    // EXISTS TO NOTICE, and the map is where the commander is looking. It rides
    // the team plate as a mark rather than waiting in a console.
    const split = new Set(mem.map(u => u.roe)).size > 1
      || (!!plan?.roe && mem.some(u => u.roe !== plan.roe))

    ctx.save()
    // THE TIE THROUGH THE COLUMN, in march order, under everything.
    //
    // This was 1 px at 20% alpha, which is to say invisible: a team could be
    // formed, named and given a commander and the sheet looked exactly as it
    // had before. The task organization is the most important structure on this
    // map and it was the faintest thing drawn on it. A grouping the player made
    // is worth as much ink as a road.
    ctx.strokeStyle = picked ? 'rgba(255,214,126,0.75)'
      : expand ? 'rgba(126,200,255,0.5)' : 'rgba(126,200,255,0.34)'
    ctx.lineWidth = picked ? 2.2 : 1.6
    ctx.setLineDash(picked ? [] : [6, 4])
    ctx.beginPath()
    line.forEach((u, i) => {
      const sx = f.w2sX(u.x), sy = f.w2sY(u.y)
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy)
    })
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()

    if (expand) {
      // THE NAME RIDES THE HEAD OF THE COLUMN, on a plate. Bare text at 78%
      // alpha over hillshade and roads is unreadable exactly where the map is
      // busiest, which is where the units are — so it gets a background, like
      // every label on a real overlay.
      const hx = f.w2sX(head.x), hy = f.w2sY(head.y) - 30
      ctx.save()
      ctx.font = '600 10px Inter, system-ui, sans-serif'
      ctx.textAlign = 'left'
      const label = `${t.name} ×${mem.length}`
      const tw = ctx.measureText(label).width
      const pad = 5, dot = split ? 9 : 0
      const bw = tw + pad * 2 + dot, bx = hx - bw / 2
      ctx.fillStyle = picked ? 'rgba(46,38,14,0.92)' : 'rgba(10,20,30,0.82)'
      ctx.strokeStyle = picked ? 'rgba(255,214,126,0.9)' : 'rgba(126,200,255,0.45)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.rect(bx, hy - 8, bw, 14)
      ctx.fill(); ctx.stroke()
      ctx.fillStyle = picked ? '#ffd67e' : 'rgba(160,215,255,0.95)'
      ctx.fillText(label, bx + pad, hy + 2)
      if (split) {
        ctx.fillStyle = '#e0b34e'
        ctx.beginPath()
        ctx.arc(bx + bw - pad - 1, hy - 1, 2.6, 0, Math.PI * 2)
        ctx.fill()
      }
      // the trail is the element everyone else goes firm for
      ctx.strokeStyle = picked ? 'rgba(255,214,126,0.6)' : 'rgba(126,200,255,0.45)'
      ctx.beginPath()
      ctx.arc(f.w2sX(tail.x), f.w2sY(tail.y), 13, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
      continue
    }

    // ROLLED UP. One symbol, at the head of the column where the commander is,
    // wearing the BASE element's branch — a team is named for and built around
    // a company, and is drawn as that company with whatever is cross-attached
    // to it. Strength is the aggregate.
    for (const u of mem) rolled.add(u.id)
    const base = mem.find(u => u.id === t.baseId) ?? head
    const str = mem.reduce((n, u) => n + u.strength, 0) / mem.length
    drawUnitSymbol(ctx, f.w2sX(head.x), f.w2sY(head.y), {
      side: 'friend', glyph: UNIT_TYPES[base.type].glyph, echelon: 'co',
      label: `${t.name} ×${mem.length}`,
      strength: str, selected: picked,
      contact: Math.max(...mem.map(contactLevel)),
    })
    if (split) {
      ctx.save()
      ctx.fillStyle = '#e0b34e'
      ctx.beginPath()
      ctx.arc(f.w2sX(head.x) + 15, f.w2sY(head.y) - 13, 2.8, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }
  return rolled
}

/** The blue force — always shown, because that is what blue force tracking IS —
 *  except the elements a team's rolled-up symbol is currently standing for. */
export function drawFriendlies(f: Frame, rolled: Set<number>): void {
  for (const u of S.units) {
    if (u.side !== 'friend' || rolled.has(u.id)) continue
    const type = UNIT_TYPES[u.type]
    drawUnitSymbol(f.ctx, f.w2sX(u.x), f.w2sY(u.y), {
      side: 'friend', glyph: type.glyph, label: `${u.label} ${type.abbr}`,
      strength: u.strength, selected: f.sel.has(u.id),
      dug: u.posture === 'dig' ? u.digT : 0, contact: contactLevel(u),
    })
  }
}

/** THE ENEMY PICTURE. Through fog it is CONTACTS — what the network has been
 *  told, decaying to a last-known point; with fog off it is ground truth. The
 *  difference is the whole intelligence model, so it is drawn from two
 *  different sources rather than one source with a flag. */
export function drawHostiles(f: Frame): void {
  if (S.fogEnabled) {
    for (const [, c] of S.contacts) {
      const type = UNIT_TYPES[c.type]
      const age = S.t - c.lastSeen
      // intel-seeded contacts of unidentified composition draw as a "?" —
      // scouts turn them into typed tracks by actually spotting them
      drawUnitSymbol(f.ctx, f.w2sX(c.x), f.w2sY(c.y), {
        side: 'hostile', glyph: c.unknown ? 'unk' : type.glyph, stale: !c.live,
        label: c.unknown ? 'UNK' : c.live ? type.abbr : `LKP ${Math.floor(age / 60)}M`,
        strength: c.strength ?? 100,
      })
    }
    return
  }
  for (const u of S.units) {
    if (u.side !== 'hostile') continue
    const type = UNIT_TYPES[u.type]
    drawUnitSymbol(f.ctx, f.w2sX(u.x), f.w2sY(u.y), {
      side: 'hostile', glyph: type.glyph, label: `${u.label} ${type.abbr}`,
      strength: u.strength, contact: contactLevel(u),
    })
  }
}

/** A pulsing diamond on anything under DELIBERATE attack — the difference
 *  between "shooting at what is in front of it" and "I told it to kill that". */
export function drawTargeted(f: Frame): void {
  const { ctx } = f
  const targeted = new Set<number>()
  for (const u of S.units) {
    if (u.side === 'friend' && u.attackId != null) targeted.add(u.attackId)
  }
  for (const id of targeted) {
    const e = S.units.find(x => x.id === id)
    if (!e) continue
    const c = S.contacts.get(id)
    const pos = (!S.fogEnabled || (c && c.live)) ? e : c
    if (!pos) continue
    const tx = f.w2sX(pos.x), ty = f.w2sY(pos.y)
    const pulse = 20 + Math.sin(S.t * 4) * 3
    ctx.strokeStyle = 'rgba(255,70,50,0.85)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(tx, ty - pulse); ctx.lineTo(tx + pulse, ty)
    ctx.lineTo(tx, ty + pulse); ctx.lineTo(tx - pulse, ty)
    ctx.closePath()
    ctx.stroke()
  }
}
