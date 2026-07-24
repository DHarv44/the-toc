// Commander decision layer, phase 1 (ROADMAP → Enemy AI → Decision Layer).
// A utility system, not machine learning: each action declares when it is
// available and scores itself 0..1 from a few weighted considerations; the
// best score above a floor is executed. THE IRON RULE: this layer only
// CHOOSES — execution goes through the same player-legal order functions the
// UI calls (fireMission / orderDefend). Nothing here is AI-only mechanics.
//
// Determinism: scoring is a pure function of S; the only rng is the decision
// cadence in ai.ts (drawn from S.rng in tick order) — golden-gated like all
// sim code. grp.lastDecision records every cycle's scores so the dev console
// can answer "why did it do that": __game.S.enemyGroups.map(g => g.lastDecision)
//
// Targeting reads ground truth for now, exactly like the rest of the OPFOR —
// when Symmetric Fog lands, pickTarget() swaps to the hostile contact picture
// and nothing else here changes.
import { S } from '../../engine/state'
import type { Battlegroup, Unit } from '../../engine/GameState'
import type { Vec2 } from '../../world/WorldMap'
import { UNIT_TYPES } from '../forces/catalog'
import { orderDefend, orderMove } from '../forces/orders'
import { fireMission } from '../fires/orders'

interface CmdCtx {
  grp: Battlegroup
  mem: Unit[]                          // living members
  main: Unit[]                         // main body (non-recon)
  cen: Vec2                            // main-body centroid
  guns: Unit[]                         // indirect-capable members off cooldown
  tgt: (Vec2 & { n: number }) | null   // densest player element inside the gun envelope
  defNearObj: number                   // player units defending near the objective
}

interface Consideration {
  name: string
  w: number
  eval(c: CmdCtx): number
}

interface CmdAction {
  id: string
  available(c: CmdCtx): boolean
  considerations: Consideration[]
  execute(c: CmdCtx): void
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

// hard availability gate, not a consideration: a commander does not drop
// rounds where his own people are (mirror of the friendly DANGER CLOSE rule)
function dangerClose(c: CmdCtx, at: Vec2): boolean {
  return c.mem.some(m => Math.hypot(m.x - at.x, m.y - at.y) < 320)
}

// densest player element reachable by the group's guns, biased toward the
// objective axis so fires support the fight the group is actually in
function pickTarget(guns: Unit[], grp: Battlegroup): (Vec2 & { n: number }) | null {
  const maxRange = Math.max(...guns.map(g => UNIT_TYPES[g.type].indirect!.range))
  let best: (Vec2 & { n: number }) | null = null
  let bs = -Infinity
  for (const p of S.units) {
    if (p.side !== 'friend' || p.strength <= 0) continue
    if (!guns.some(g => Math.hypot(p.x - g.x, p.y - g.y) <= maxRange)) continue
    const n = S.units.filter(q => q.side === 'friend' && q.strength > 0
      && Math.hypot(q.x - p.x, q.y - p.y) < 250).length
    const dAxis = grp.objective ? Math.hypot(p.x - grp.objective.x, p.y - grp.objective.y) : 0
    const s = n - dAxis / 4000
    if (s > bs) { bs = s; best = { x: p.x, y: p.y, n } }
  }
  return best
}

const ACTIONS: CmdAction[] = [
  {
    // fix + flank: against a defended objective, detach the fastest slice of
    // the main body on a wide hook while the rest press the axis — the same
    // two orderMove legs a player would click. One scheme per approach; a
    // moved objective or the flankers arriving clears it (see commanderDecide).
    id: 'FLANK',
    available: c => c.grp.phase === 'advance' && !!c.grp.objective && !c.grp.scheme
      && c.main.length >= 3 && c.defNearObj >= 1,
    considerations: [
      {
        // maneuver wants room: too close and it's just a charge, too far and
        // the detour dies of old age
        name: 'room', w: 1, eval: c => {
          const d = Math.hypot(c.cen.x - c.grp.objective!.x, c.cen.y - c.grp.objective!.y)
          return d < 900 || d > 3200 ? 0 : d < 1200 ? (d - 900) / 300 : d > 2500 ? (3200 - d) / 700 : 1
        },
      },
      { name: 'defenders', w: 1, eval: c => c.defNearObj / 3 },
      { name: 'strength', w: 0.5, eval: c => clamp01(c.mem.reduce((s, u) => s + u.strength, 0) / c.grp.initStr / 0.7) },
    ],
    execute: c => {
      const obj = c.grp.objective!
      // fastest movers make the hook; at least two stay to fix
      const sorted = [...c.main].sort((a, b) => UNIT_TYPES[b.type].speed - UNIT_TYPES[a.type].speed)
      const nFlank = Math.max(1, Math.min(3, Math.floor(c.main.length * 0.4)))
      const flankers = sorted.slice(0, nFlank)
      // hook goes left or right of the axis (deterministic S.rng draw)
      const side = S.rng!() < 0.5 ? 1 : -1
      const ax = obj.x - c.cen.x, ay = obj.y - c.cen.y
      const L = Math.hypot(ax, ay) || 1
      const px = (-ay / L) * side, py = (ax / L) * side
      const mx = c.cen.x + ax * 0.55 + px * 1200, my = c.cen.y + ay * 0.55 + py * 1200
      for (const u of flankers) {
        orderMove(u.id, mx, my, false, false, null, { crossCountry: true })
        orderMove(u.id, obj.x + px * 250, obj.y + py * 250, true, true, null, { crossCountry: true })
      }
      c.grp.scheme = 'flank'
      c.grp.flankIds = flankers.map(u => u.id)
    },
  },
  {
    // prep/suppress a spotted concentration with HE
    id: 'FIRE_HE',
    available: c => !!c.tgt && c.guns.length > 0 && !dangerClose(c, c.tgt!)
      && S.enemyResources > 150,
    considerations: [
      { name: 'density', w: 1, eval: c => c.tgt!.n / 3 },
      { name: 'spacing', w: 1, eval: c => clamp01((S.t - (c.grp.lastFiresT ?? -999)) / 60) },
      // prep fires support an imminent assault — don't drain the bank plinking
      // from max range while the main body is still half a map away
      { name: 'support', w: 1, eval: c => clamp01(1.4 - Math.hypot(c.cen.x - c.tgt!.x, c.cen.y - c.tgt!.y) / 2500) },
    ],
    execute: c => {
      const gun = c.guns.find(g =>
        Math.hypot(c.tgt!.x - g.x, c.tgt!.y - g.y) <= UNIT_TYPES[g.type].indirect!.range)
      if (!gun) return
      fireMission(gun.id, c.tgt!.x, c.tgt!.y, { shell: 'HE' })
      c.grp.lastFiresT = S.t
    },
  },
  {
    // screen the element that is TAKING FIRE: smoke on the line between the
    // hottest member and the fire it is reporting (units already record the
    // threat vector — u.threatX/threatY — for the break drill; the commander
    // reads the same report a real net would carry)
    id: 'SMOKE_SCREEN',
    available: c => c.guns.length > 0 && c.grp.phase === 'advance' && S.enemyResources > 100
      && c.mem.some(m => S.t - (m.underFireT ?? -999) < 8 && m.threatX != null),
    considerations: [
      {
        // how much of the group is being shot at right now
        name: 'heat', w: 1, eval: c => {
          const n = c.mem.filter(m => S.t - (m.underFireT ?? -999) < 8).length
          return n / Math.max(2, c.mem.length * 0.5)
        },
      },
      { name: 'spacing', w: 1, eval: c => clamp01((S.t - (c.grp.lastFiresT ?? -999)) / 40) },
    ],
    execute: c => {
      const um = c.mem
        .filter(m => S.t - (m.underFireT ?? -999) < 8 && m.threatX != null)
        .sort((a, b) => (b.underFireT ?? 0) - (a.underFireT ?? 0))[0]
      if (!um) return
      const dx = um.threatX! - um.x, dy = um.threatY! - um.y
      const L = Math.hypot(dx, dy) || 1
      const f = Math.max(0.35, Math.min(0.6, (L - 200) / L)) // between us and the guns, short of them
      const px = um.x + dx * f, py = um.y + dy * f
      const gun = c.guns.find(g =>
        Math.hypot(px - g.x, py - g.y) <= UNIT_TYPES[g.type].indirect!.range)
      if (!gun) return
      fireMission(gun.id, px, py, { shell: 'SMOKE', sheaf: 'AREA' })
      c.grp.lastFiresT = S.t
    },
  },
  {
    // ground taken and quiet → prepare it instead of idling in the open
    id: 'DIG_IN',
    available: c => c.grp.phase === 'advance' && !!c.grp.objective && !c.grp.digging
      && Math.hypot(c.cen.x - c.grp.objective.x, c.cen.y - c.grp.objective.y) < 350
      && !c.mem.some(m => m.targetId),
    considerations: [
      { name: 'calm', w: 1, eval: c => clamp01((S.t - Math.max(...c.mem.map(m => m.lastCombatT))) / 20) },
    ],
    execute: c => {
      // dig everyone already on the position (moving members included — they
      // are basically there); only latch the scheme once most of the group is
      // set, so stragglers get picked up by a later cycle
      const obj = c.grp.objective!
      let dug = 0
      for (const u of c.mem) {
        if (Math.hypot(u.x - obj.x, u.y - obj.y) < 450) { orderDefend(u.id, true); dug++ }
      }
      if (dug >= c.mem.length * 0.6) c.grp.digging = true
    },
  },
]

// one decision cycle for one battlegroup — called from enemyAI on the group's
// cadence. Scores every available action, executes the best above the floor.
export function commanderDecide(grp: Battlegroup, mem: Unit[]): void {
  // a flank scheme is spent once its element is destroyed or has finished the
  // hook — free the group to scheme again on the next approach
  if (grp.scheme === 'flank') {
    const flk = (grp.flankIds ?? []).map(id => mem.find(u => u.id === id)).filter((u): u is Unit => !!u)
    if (!flk.length || flk.every(u => !u.path.length)) { grp.scheme = null; grp.flankIds = [] }
  }
  const main = mem.filter(u => u.bgRole === 'main')
  const body = main.length ? main : mem
  let cx = 0, cy = 0
  for (const u of body) { cx += u.x; cy += u.y }
  const cen = { x: cx / body.length, y: cy / body.length }
  const guns = mem.filter(u => UNIT_TYPES[u.type].indirect && u.missionCooldown <= 0 && u.strength > 0)
  const obj = grp.objective
  const defNearObj = obj
    ? S.units.filter(p => p.side === 'friend' && p.strength > 0
      && Math.hypot(p.x - obj.x, p.y - obj.y) < 1200).length
    : 0
  const ctx: CmdCtx = {
    grp, mem, main: body, cen, guns,
    tgt: guns.length ? pickTarget(guns, grp) : null,
    defNearObj,
  }
  let best: CmdAction | null = null
  let bs = 0.3 // action floor: below this, doing nothing beats doing something
  const scores: Record<string, number> = {}
  for (const a of ACTIONS) {
    if (!a.available(ctx)) { scores[a.id] = 0; continue }
    let s = 1
    for (const k of a.considerations) s *= Math.pow(clamp01(k.eval(ctx)), k.w)
    scores[a.id] = s
    if (s > bs) { bs = s; best = a }
  }
  grp.lastDecision = { t: S.t, id: best ? best.id : 'NONE', scores }
  best?.execute(ctx)
}
