// WHERE EVERYTHING IS GOING — routes, and the march table on them.
//
// CONSOLE.md step 6. Three tiers, and the tiering is the point: an unselected
// mover draws a FAINT trace so the sheet shows the scheme of manoeuvre without
// becoming a plate of spaghetti; a selected element draws a HIGH-VIS command
// graphic with cased line, arrowhead and numbered waypoints; and a selected
// TEAM additionally gets its march table.
//
// That is the Blue Force Tracker convention — the picture stays readable until
// you ask it a question, and then it answers in full.
import { S } from '../../engine/state'
import type { Drone, Unit } from '../../engine/GameState'
import { MARCH_INTERVAL, marchPlan } from '../../domains/movement/march'
import type { Frame } from '../frame'

/** COMMISSIONED MSRs — infrastructure, not intent, so they draw wider and
 *  dashier than any unit's route and carry their status in their colour. The
 *  status IS the readout: a TOC talks about its routes in exactly these two
 *  colours (domains/control/routes). */
export function drawMsrs(f: Frame): void {
  const { ctx } = f
  for (const r of S.msrs) {
    if (r.pts.length < 2) continue
    const col = r.status === 'green' ? 'rgba(74,196,116,0.9)' : 'rgba(230,84,68,0.92)'
    ctx.save()
    ctx.lineJoin = 'round'
    ctx.setLineDash([16, 9])
    for (const pass of [{ c: 'rgba(10,14,10,0.7)', w: 6 }, { c: col, w: 3 }]) {
      ctx.strokeStyle = pass.c
      ctx.lineWidth = pass.w
      ctx.beginPath()
      ctx.moveTo(f.w2sX(r.pts[0]!.x), f.w2sY(r.pts[0]!.y))
      for (let i = 1; i < r.pts.length; i++) ctx.lineTo(f.w2sX(r.pts[i]!.x), f.w2sY(r.pts[i]!.y))
      ctx.stroke()
    }
    ctx.setLineDash([])
    const mid = r.pts[Math.floor(r.pts.length / 2)]!
    const x = f.w2sX(mid.x), y = f.w2sY(mid.y)
    const label = `MSR ${r.name} · ${r.status.toUpperCase()}`
    ctx.font = '600 10px Inter, system-ui, sans-serif'
    ctx.textAlign = 'center'
    const w = ctx.measureText(label).width
    ctx.fillStyle = 'rgba(10,20,30,0.8)'
    ctx.fillRect(x - w / 2 - 5, y - 21, w + 10, 15)
    ctx.fillStyle = col
    ctx.fillText(label, x, y - 10)
    ctx.restore()
  }
}

/** Every friendly mover that is NOT selected: a thin line and a small arrow. */
export function drawAmbientRoutes(f: Frame): void {
  const { ctx } = f
  ctx.lineWidth = 1.2
  for (const u of S.units) {
    if (u.side !== 'friend' || !u.path.length || f.sel.has(u.id)) continue
    const hostile = u.attackId != null || u.attackMove
    ctx.strokeStyle = hostile
      ? (f.night ? 'rgba(255,110,90,0.35)' : 'rgba(200,50,30,0.32)')
      : (f.night ? 'rgba(110,170,255,0.3)' : 'rgba(30,90,190,0.28)')
    ctx.beginPath()
    ctx.moveTo(f.w2sX(u.x), f.w2sY(u.y))
    for (const p of u.path) ctx.lineTo(f.w2sX(p.x), f.w2sY(p.y))
    ctx.stroke()
    const a = u.path.length > 1 ? u.path[u.path.length - 2]! : { x: u.x, y: u.y }
    const b = u.path[u.path.length - 1]!
    const ang = Math.atan2(f.w2sY(b.y) - f.w2sY(a.y), f.w2sX(b.x) - f.w2sX(a.x))
    const bx = f.w2sX(b.x), by = f.w2sY(b.y)
    ctx.fillStyle = hostile
      ? (f.night ? 'rgba(255,110,90,0.45)' : 'rgba(200,50,30,0.42)')
      : (f.night ? 'rgba(110,170,255,0.4)' : 'rgba(30,90,190,0.38)')
    ctx.beginPath()
    ctx.moveTo(bx + Math.cos(ang) * 8, by + Math.sin(ang) * 8)
    ctx.lineTo(bx + Math.cos(ang + 2.6) * 6, by + Math.sin(ang + 2.6) * 6)
    ctx.lineTo(bx + Math.cos(ang - 2.6) * 6, by + Math.sin(ang - 2.6) * 6)
    ctx.closePath()
    ctx.fill()
  }
}

/** THE MARCH TABLE, ON THE ROUTE.
 *
 *  A column's route was a blue line and nothing else: no distance, no time, no
 *  depth. Those three numbers ARE a march order, and reading them meant opening
 *  a console — so the sheet could show you a route while telling you nothing
 *  about it.
 *
 *  Drawn for the SELECTED team only. This is detail you inspect, not clutter
 *  every column carries around. */
export function drawMarchTable(f: Frame): void {
  const { ctx } = f
  for (const t of S.teams) {
    if (!t.members.some(id => f.sel.has(id))) continue
    const plan = marchPlan(t.id)
    const mem = t.members
      .map(id => S.units.find(u => u.id === id))
      .filter((u): u is Unit => !!u && u.strength > 0 && u.path.length > 0)
    if (mem.length < 2) continue
    const rank = new Map((plan?.order ?? t.members).map((id, i) => [id, i]))
    const head = mem.slice().sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99))[0]!
    // distance still to run, and the pace the COLUMN can actually hold — the
    // slowest element's, because that is what a column moves at
    let togo = 0, px = head.x, py = head.y
    for (const p of head.path) { togo += Math.hypot(p.x - px, p.y - py); px = p.x; py = p.y }
    const pace = Math.min(...mem.map(u => u._spd || 0).filter(v => v > 0.2))
    const eta = isFinite(pace) && pace > 0 ? togo / pace : Infinity
    const gap = MARCH_INTERVAL[plan?.column ?? 'open']
    const depth = gap * Math.max(0, mem.length - 1)
    const rp = head.path[head.path.length - 1]!
    const hx = f.w2sX(head.x), hy = f.w2sY(head.y)
    const rx = f.w2sX(rp.x), ry = f.w2sY(rp.y)

    ctx.save()
    // SP where the head is now, RP at the objective — the two ends every march
    // table names
    ctx.strokeStyle = 'rgba(126,200,255,0.8)'
    ctx.lineWidth = 2
    for (const [mx, my] of [[hx, hy], [rx, ry]] as const) {
      ctx.beginPath(); ctx.arc(mx, my, 7, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.font = '600 9px Inter, system-ui, sans-serif'
    ctx.fillStyle = 'rgba(126,200,255,0.9)'
    ctx.textAlign = 'center'
    ctx.fillText('SP', hx, hy - 11)
    ctx.fillText('RP', rx, ry - 11)

    const km = togo >= 1000 ? `${(togo / 1000).toFixed(1)} KM` : `${Math.round(togo)} M`
    const mins = isFinite(eta) ? Math.round(eta / 60) : null
    const line = `${t.name} · ${km} TO RP · ${
      mins == null ? 'HALTED' : mins >= 60
        ? `ETA ${Math.floor(mins / 60)}H ${String(mins % 60).padStart(2, '0')}M`
        : `ETA ${mins} MIN`} · ${Math.round(depth)} M DEEP`
    ctx.font = '600 10px Inter, system-ui, sans-serif'
    const w = ctx.measureText(line).width
    ctx.fillStyle = 'rgba(10,20,30,0.78)'
    ctx.fillRect(rx - w / 2 - 6, ry + 12, w + 12, 15)
    ctx.strokeStyle = 'rgba(126,200,255,0.35)'
    ctx.lineWidth = 1
    ctx.strokeRect(rx - w / 2 - 6, ry + 12, w + 12, 15)
    ctx.fillStyle = 'rgba(190,225,255,0.95)'
    ctx.fillText(line, rx, ry + 23)
    ctx.restore()
  }
}

/** Unselected drones' flight legs — dimmer even than an unselected column's
 *  route, because an aircraft's track is the least of what a commander is
 *  reading the sheet for. */
export function drawAmbientDroneRoutes(f: Frame): void {
  const { ctx } = f
  for (const d of S.drones) {
    if (!d.route || !d.route.length || f.sel.has(d.id)) continue
    ctx.strokeStyle = 'rgba(74,208,192,0.25)'
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    ctx.moveTo(f.w2sX(d.x), f.w2sY(d.y))
    for (const p of d.route) ctx.lineTo(f.w2sX(p.x), f.w2sY(p.y))
    ctx.stroke()
    ctx.setLineDash([])
  }
}

/** The selected elements' routes: BFT-style high-vis command graphics — a cased
 *  line, red when the task is an attack, an arrowhead on the last leg and a
 *  numbered pip on every waypoint. */
export function drawSelectedRoutes(f: Frame, units: Unit[]): void {
  const { ctx } = f
  for (const u of units) {
    if (!u.path.length) continue
    const hostile = u.attackId != null || u.attackMove
    const pts = [{ x: u.x, y: u.y }, ...u.path]
    for (const pass of [
      { color: f.night ? 'rgba(44,10,10,0.95)' : 'rgba(40,8,8,0.85)', w: 5, skip: !hostile },
      { color: f.night ? 'rgba(10,24,44,0.95)' : 'rgba(8,20,40,0.85)', w: 5, skip: hostile },
      { color: hostile ? '#ff5844' : '#3f9dff', w: 2.2, skip: false },
    ].filter(p => !p.skip)) {
      ctx.strokeStyle = pass.color
      ctx.lineWidth = pass.w
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(f.w2sX(pts[0]!.x), f.w2sY(pts[0]!.y))
      for (let i = 1; i < pts.length; i++) ctx.lineTo(f.w2sX(pts[i]!.x), f.w2sY(pts[i]!.y))
      ctx.stroke()
    }
    const a = pts[pts.length - 2]!, b = pts[pts.length - 1]!
    const ang = Math.atan2(f.w2sY(b.y) - f.w2sY(a.y), f.w2sX(b.x) - f.w2sX(a.x))
    const bx = f.w2sX(b.x), by = f.w2sY(b.y)
    ctx.fillStyle = hostile ? '#ff5844' : '#3f9dff'
    ctx.strokeStyle = hostile ? 'rgba(40,8,8,0.9)' : 'rgba(8,20,40,0.9)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(bx + Math.cos(ang) * 13, by + Math.sin(ang) * 13)
    ctx.lineTo(bx + Math.cos(ang + 2.5) * 10, by + Math.sin(ang + 2.5) * 10)
    ctx.lineTo(bx + Math.cos(ang - 2.5) * 10, by + Math.sin(ang - 2.5) * 10)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    u.legs.forEach((leg, i) => {
      const x = f.w2sX(leg.x), y = f.w2sY(leg.y)
      ctx.beginPath()
      ctx.arc(x, y, 8, 0, Math.PI * 2)
      ctx.fillStyle = '#0d2a4d'
      ctx.fill()
      ctx.strokeStyle = '#6cb8ff'
      ctx.lineWidth = 1.6
      ctx.stroke()
      ctx.fillStyle = '#dceeff'
      ctx.font = 'bold 9px Consolas, monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(i + 1), x, y + 0.5)
      ctx.textBaseline = 'alphabetic'
      ctx.textAlign = 'left'
    })
  }
}

/** The selected drones' routes: straight flight legs and numbered pips. */
export function drawSelectedDroneRoutes(f: Frame, drones: Drone[]): void {
  const { ctx } = f
  for (const d of drones) {
    if (!d.route || !d.route.length) continue
    const pts = [{ x: d.x, y: d.y }, ...d.route]
    for (const pass of [
      { color: f.night ? 'rgba(10,34,34,0.95)' : 'rgba(8,30,30,0.8)', w: 4 },
      { color: '#4ad0c0', w: 1.8 },
    ]) {
      ctx.strokeStyle = pass.color
      ctx.lineWidth = pass.w
      ctx.setLineDash([7, 5])
      ctx.beginPath()
      ctx.moveTo(f.w2sX(pts[0]!.x), f.w2sY(pts[0]!.y))
      for (let i = 1; i < pts.length; i++) ctx.lineTo(f.w2sX(pts[i]!.x), f.w2sY(pts[i]!.y))
      ctx.stroke()
      ctx.setLineDash([])
    }
    d.route.forEach((wp, i) => {
      const x = f.w2sX(wp.x), y = f.w2sY(wp.y)
      ctx.beginPath()
      ctx.arc(x, y, 7.5, 0, Math.PI * 2)
      ctx.fillStyle = '#0d3a36'
      ctx.fill()
      ctx.strokeStyle = '#5ae0d0'
      ctx.lineWidth = 1.4
      ctx.stroke()
      ctx.fillStyle = '#d8fff8'
      ctx.font = 'bold 9px Consolas, monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(i + 1), x, y + 0.5)
      ctx.textBaseline = 'alphabetic'
      ctx.textAlign = 'left'
    })
  }
}
