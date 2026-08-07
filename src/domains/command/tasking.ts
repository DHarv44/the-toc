// TEAM TASKING (TASKING.md): a team is given an OBJECTIVE and a TASK, the
// commander presses EXECUTE, and the team routes itself there and does it.
// The task fixes the SCHEME — the phases below — and the utility kernel
// chooses within them (its own mortars, for now). Everything issues through
// the same player-legal orders the UI calls (the iron rule, enforced by the
// withTaskingIssue guard), every drill keeps running, and a manual order to
// a member detaches that element while the tasking continues with the rest.
//
// v1 vocabulary: SEIZE (approach in march order → assault known defenders →
// consolidate → auto-chain DEFEND in place) and DEFEND (move, dig, hold).
// SCREEN / ESCORT / RECON land with the station block.
//
// Knowledge honesty: the commander acts on the friendly CONTACT picture,
// not ground truth — an objective with no known defenders is approached as
// empty, and the drills handle the surprise, exactly as they would for a
// player-ordered column.
import { S } from '../../engine/state'
import type { Tasking, TaskKind, Team, Unit } from '../../engine/GameState'
import type { Vec2 } from '../../world/WorldMap'
import { grid } from '../../lib/format'
import { UNIT_TYPES } from '../forces/catalog'
import {
  orderDefend, orderGroupAttack, orderGroupMove, orderHold, orderMove,
} from '../forces/orders'
import { fireMission } from '../fires/orders'
import { radio, toast } from '../comms/radio'
import { type UtilityAction, clamp01, decideBest } from './utility'
import { withTaskingIssue } from './hooks'

const ARRIVE_R = 300       // within objective radius + this = at the objective
const KNOWN_R = 500        // known hostiles inside obj.r + this defend it
const FIGHT_R = 800        // contact this far short of the objective still IS the objective's fight
const FAIL_FRAC = 0.5      // team strength below this fraction of EXECUTE strength = break off (call 8)

const teamOfTasking = (tk: Tasking): Team | undefined =>
  S.teams.find(t => t.id === tk.teamId)

/** the members still ON the tasking: alive, in the team, not detached */
function effectives(tk: Tasking): Unit[] {
  const team = teamOfTasking(tk)
  if (!team) return []
  return team.members
    .map(id => S.units.find(u => u.id === id))
    .filter((u): u is Unit => !!u && u.strength > 0 && !tk.detached.includes(u.id))
}

/** hostiles the FRIENDLY side actually knows about near a point */
function knownHostilesNear(p: Vec2, r: number): Unit[] {
  return S.units.filter(h => h.side === 'hostile' && h.strength > 0
    && Math.hypot(h.x - p.x, h.y - p.y) < r
    && (!S.fogEnabled || S.contacts.get(h.id)?.live))
}

const centroid = (list: Unit[]): Vec2 => {
  let x = 0, y = 0
  for (const u of list) { x += u.x; y += u.y }
  return { x: x / list.length, y: y / list.length }
}

/** EXECUTE. Replaces any live tasking the team already has. */
export function orderTasking(
  teamId: number, task: TaskKind, x: number, y: number, r = 300,
): Tasking | null {
  const team = S.teams.find(t => t.id === teamId)
  if (!team) return null
  if (task !== 'SEIZE' && task !== 'DEFEND') {
    toast(`${task} IS NOT IMPLEMENTED YET`)
    return null
  }
  S.taskings = S.taskings.filter(t => t.teamId !== teamId)
  const tk: Tasking = {
    id: S.counters.nextId++, teamId, task,
    obj: { x, y, r }, state: 'moving',
    initStr: 0, detached: [], phaseT: S.t,
  }
  const mem = (() => { S.taskings.push(tk); const m = effectives(tk); return m })()
  if (!mem.length) { S.taskings = S.taskings.filter(t => t !== tk); return null }
  tk.initStr = mem.reduce((s, u) => s + u.strength, 0)
  approach(tk, mem)
  radio(team.name, 'move',
    `TASKING — ${task} OBJ GRID ${grid(x, y)}, ${mem.length} ELEMENTS EXECUTING`, x, y)
  return tk
}

/** STOP: the tasking is cancelled; the team holds where it stands. */
export function stopTasking(teamId: number): void {
  const tk = S.taskings.find(t => t.teamId === teamId
    && (t.state === 'moving' || t.state === 'actions'))
  if (!tk) return
  const team = teamOfTasking(tk)
  const mem = effectives(tk)
  withTaskingIssue(() => { for (const u of mem) orderHold(u.id) })
  S.taskings = S.taskings.filter(t => t !== tk)
  if (team) radio(team.name, 'move', 'TASKING CANCELLED — HOLDING', mem[0]?.x ?? 0, mem[0]?.y ?? 0)
}

/** The approach leg: a column onto the objective, adopting a GREEN named
 *  route when one genuinely serves the axis (call 7). A RED route that
 *  would have served is refused OUT LOUD — route status gates maneuver the
 *  same way it gates convoys. */
function approach(tk: Tasking, mem: Unit[]): void {
  const cen = centroid(mem)
  tk.via = null
  let redNamed: string | null = null
  for (const r of S.msrs) {
    const p = r.pts[0]!, q = r.pts[r.pts.length - 1]!
    // orient: entry = nearer end to the team, exit = the other
    const [entry, exit] = Math.hypot(p.x - cen.x, p.y - cen.y) <= Math.hypot(q.x - cen.x, q.y - cen.y)
      ? [p, q] : [q, p]
    const serves = Math.hypot(entry.x - cen.x, entry.y - cen.y) < 1500
      && Math.hypot(exit.x - tk.obj.x, exit.y - tk.obj.y) < 1500
      // the route must actually shorten the war, not be a scenic detour
      && Math.hypot(exit.x - tk.obj.x, exit.y - tk.obj.y) < Math.hypot(cen.x - tk.obj.x, cen.y - tk.obj.y)
    if (!serves) continue
    if (r.status !== 'green') { redNamed = r.name; continue }
    tk.via = { x: exit.x, y: exit.y }
    break
  }
  const team = teamOfTasking(tk)
  if (!tk.via && redNamed && team) {
    radio(team.name, 'move', `MSR ${redNamed} IS RED — MOVING CROSS-COUNTRY`, cen.x, cen.y)
  }
  const dest = tk.via ?? tk.obj
  withTaskingIssue(() => {
    orderGroupMove(mem.map(u => u.id), dest.x, dest.y, false, tk.task === 'SEIZE', tk.teamId)
  })
}

/** Consolidate ON the objective: near elements dig, far ones close first. */
function consolidate(tk: Tasking, mem: Unit[]): void {
  withTaskingIssue(() => {
    for (const u of mem) {
      if (Math.hypot(u.x - tk.obj.x, u.y - tk.obj.y) < tk.obj.r + ARRIVE_R) {
        orderDefend(u.id, true)
      } else {
        orderMove(u.id, tk.obj.x, tk.obj.y, false, false, null)
      }
    }
  })
}

// --- the commander's in-phase choices (utility kernel) ----------------------

interface TkCtx {
  tk: Tasking
  mem: Unit[]
  cen: Vec2
  guns: Unit[]
  tgt: (Vec2 & { n: number }) | null
}

// the densest KNOWN hostile cluster this team's tubes can reach, biased to
// the objective axis — the same shape the OPFOR commander shoots by
function pickTeamTarget(guns: Unit[], tk: Tasking): (Vec2 & { n: number }) | null {
  const maxRange = Math.max(...guns.map(g => UNIT_TYPES[g.type].indirect!.range))
  let best: (Vec2 & { n: number }) | null = null
  let bs = -Infinity
  for (const h of knownHostilesNear(tk.obj, 6000)) {
    if (!guns.some(g => Math.hypot(h.x - g.x, h.y - g.y) <= maxRange)) continue
    const n = knownHostilesNear(h, 250).length
    const s = n - Math.hypot(h.x - tk.obj.x, h.y - tk.obj.y) / 4000
    if (s > bs) { bs = s; best = { x: h.x, y: h.y, n } }
  }
  return best
}

const TK_ACTIONS: UtilityAction<TkCtx>[] = [
  {
    // FIX AND FLANK — the OPFOR commander's own scheme, pointed our way:
    // against a defended objective, the fastest slice of the team hooks wide
    // onto the position's FLANK while the rest press the axis. Fortifications
    // face a threat now (elements.postureFactor), so the hook is not
    // theater — the works protect half as much from the side and nothing
    // from behind. Two orderMove legs a player could have clicked.
    id: 'FLANK',
    available: c => c.tk.task === 'SEIZE' && c.tk.state === 'actions'
      && !(c.tk.flankIds ?? []).length && c.mem.length >= 3
      && knownHostilesNear(c.tk.obj, c.tk.obj.r + KNOWN_R + FIGHT_R).length >= 1
      && (() => {
        const d = Math.hypot(c.cen.x - c.tk.obj.x, c.cen.y - c.tk.obj.y)
        return d > 500 && d < 3200
      })(),
    considerations: [
      { name: 'defenders', w: 1, eval: c => knownHostilesNear(c.tk.obj, c.tk.obj.r + KNOWN_R + FIGHT_R).length / 2 },
      { name: 'strength', w: 0.5, eval: c => clamp01(c.mem.reduce((s, u) => s + u.strength, 0) / c.tk.initStr / 0.7) },
    ],
    execute: c => {
      const obj = c.tk.obj
      const sorted = [...c.mem].sort((a, b) => UNIT_TYPES[b.type].speed - UNIT_TYPES[a.type].speed)
      const nFlank = Math.max(1, Math.min(2, Math.floor(c.mem.length * 0.4)))
      const flankers = sorted.slice(0, nFlank)
      const side = S.rng!() < 0.5 ? 1 : -1
      const ax = obj.x - c.cen.x, ay = obj.y - c.cen.y
      const L = Math.hypot(ax, ay) || 1
      const px = (-ay / L) * side, py = (ax / L) * side
      const mx = c.cen.x + ax * 0.55 + px * 1200, my = c.cen.y + ay * 0.55 + py * 1200
      withTaskingIssue(() => {
        for (const u of flankers) {
          orderMove(u.id, mx, my, false, false, null)
          orderMove(u.id, obj.x + px * 250, obj.y + py * 250, true, true, null)
        }
      })
      c.tk.flankIds = flankers.map(u => u.id)
      const team = teamOfTasking(c.tk)
      if (team) radio(team.name, 'move', `${flankers.length} ELEMENT${flankers.length > 1 ? 'S' : ''} HOOKING ONTO THE FLANK`, obj.x, obj.y)
    },
  },
  {
    // the team's OWN tubes prep the objective — utility-gated (call 2), with
    // the same danger-close bar and a rolled refire window so friendly prep
    // has no countable rhythm either
    id: 'FIRE_OWN_MORTARS',
    available: c => c.guns.length > 0 && !!c.tgt
      && S.t >= (c.tk.nextFiresT ?? -Infinity)
      && !c.mem.some(m => Math.hypot(m.x - c.tgt!.x, m.y - c.tgt!.y) < 320),
    considerations: [
      { name: 'density', w: 1, eval: c => c.tgt!.n / 3 },
      { name: 'support', w: 1, eval: c => clamp01(1.4 - Math.hypot(c.cen.x - c.tgt!.x, c.cen.y - c.tgt!.y) / 2500) },
      { name: 'ammo', w: 0.5, eval: c => clamp01(Math.max(...c.guns.map(g => g.ammo ?? 0)) / 24) },
    ],
    execute: c => {
      const gun = c.guns.find(g =>
        Math.hypot(c.tgt!.x - g.x, c.tgt!.y - g.y) <= UNIT_TYPES[g.type].indirect!.range)
      if (!gun) return
      withTaskingIssue(() => fireMission(gun.id, c.tgt!.x, c.tgt!.y, { shell: 'HE' }))
      c.tk.nextFiresT = S.t + 60 + S.rng!() * 120
    },
  },
]

// --- the tick ---------------------------------------------------------------

export function taskingUpdate(_dt: number): void {
  if (!S.taskings.length) return
  for (const tk of S.taskings) {
    if (tk.state !== 'moving' && tk.state !== 'actions') continue
    const team = teamOfTasking(tk)
    const mem = effectives(tk)
    if (!team || !mem.length) {
      tk.state = 'failed'
      if (team) radio(team.name, 'loss', 'TASKING FAILED — NO EFFECTIVES REMAIN', tk.obj.x, tk.obj.y)
      continue
    }
    // the failure threshold (call 8): break off, dig in where they stand,
    // and say so — anything short of this reads as still-fighting
    const str = mem.reduce((s, u) => s + u.strength, 0)
    if (tk.initStr > 0 && str < tk.initStr * FAIL_FRAC) {
      tk.state = 'failed'
      withTaskingIssue(() => { for (const u of mem) orderDefend(u.id, true) })
      radio(team.name, 'loss',
        `TASKING FAILED — STRENGTH ${Math.round((str / tk.initStr) * 100)}%, BREAKING OFF`,
        mem[0]!.x, mem[0]!.y)
      continue
    }
    // the commander thinks on a cadence, not every frame
    if (S.t < (tk.nextDecT ?? 0)) continue
    tk.nextDecT = S.t + 4 + S.rng!() * 3
    const cen = centroid(mem)

    if (tk.state === 'moving') {
      // the GREEN-route waypoint is spent once the head of the column reaches it
      if (tk.via && Math.hypot(cen.x - tk.via.x, cen.y - tk.via.y) < 450) {
        tk.via = null
        withTaskingIssue(() => {
          orderGroupMove(mem.map(u => u.id), tk.obj.x, tk.obj.y, false, tk.task === 'SEIZE', tk.teamId)
        })
      }
      const arrived = mem.some(u =>
        Math.hypot(u.x - tk.obj.x, u.y - tk.obj.y) < tk.obj.r + ARRIVE_R)
      // contact SHORT of the objective is still the objective's fight — the
      // drills halt the column where the shooting starts, and a commander
      // who keeps waiting for "arrival" watches his lead platoon fight
      // alone. The assault begins at the fight, not at the grid.
      const inContact = tk.task === 'SEIZE'
        && mem.some(m => S.t - m.lastCombatT < 10)
        && Math.hypot(cen.x - tk.obj.x, cen.y - tk.obj.y) < tk.obj.r + 2200
      if (arrived || inContact) {
        const defenders = knownHostilesNear(tk.obj, tk.obj.r + KNOWN_R + FIGHT_R)
        if (tk.task === 'SEIZE' && defenders.length) {
          tk.state = 'actions'
          tk.phaseT = S.t
          const tgt = defenders.sort((a, b) =>
            Math.hypot(a.x - cen.x, a.y - cen.y) - Math.hypot(b.x - cen.x, b.y - cen.y))[0]!
          withTaskingIssue(() => orderGroupAttack(mem.map(u => u.id), tgt.id, tk.teamId))
          radio(team.name, 'contact', arrived
            ? `AT THE OBJECTIVE — ASSAULTING, ${defenders.length} KNOWN`
            : `IN CONTACT SHORT OF THE OBJECTIVE — ASSAULTING, ${defenders.length} KNOWN`,
            tk.obj.x, tk.obj.y)
        } else if (arrived) {
          finish(tk, team, mem)
        }
      }
    } else {
      // actions on: SEIZE clears what it knows about, then consolidates
      if (tk.task === 'SEIZE') {
        // a spent hook frees the commander to scheme again (mirrors the
        // OPFOR): flankers dead or arrived → the ids clear, and the next
        // formation attack pulls them in from wherever they now stand
        if (tk.flankIds?.length) {
          const flk = tk.flankIds
            .map(id => mem.find(u => u.id === id))
            .filter((u): u is Unit => !!u)
          if (!flk.length || flk.every(u => !u.path.length)) tk.flankIds = []
        }
        const defenders = knownHostilesNear(tk.obj, tk.obj.r + KNOWN_R + FIGHT_R)
        const hooking = (tk.flankIds ?? []).some(id => {
          const f = mem.find(u => u.id === id)
          return f && f.path.length > 0
        })
        if (!defenders.length) {
          finish(tk, team, mem)
        } else if (hooking) {
          // the base of fire holds the axis while the hook swings — do not
          // re-column the team mid-maneuver
        } else if (!mem.some(u => u.attackId != null)) {
          // current target died (the drill holds the team) — next one
          const tgt = defenders.sort((a, b) =>
            Math.hypot(a.x - cen.x, a.y - cen.y) - Math.hypot(b.x - cen.x, b.y - cen.y))[0]!
          withTaskingIssue(() => orderGroupAttack(mem.map(u => u.id), tgt.id, tk.teamId))
        }
      }
      // DEFEND holds: the drills fight, the dug stay dug; nothing to steer
    }

    // in-phase choices, recorded like every commander's (why-did-it-do-that)
    const guns = mem.filter(u => UNIT_TYPES[u.type].indirect && u.missionCooldown <= 0
      && (u.ammo ?? 0) >= 1)
    const ctx: TkCtx = {
      tk, mem, cen, guns,
      tgt: guns.length ? pickTeamTarget(guns, tk) : null,
    }
    const { best, scores } = decideBest(TK_ACTIONS, ctx)
    tk.lastDecision = { t: S.t, id: best ? best.id : 'NONE', scores }
    best?.execute(ctx)
  }
}

/** The objective is ours (or was empty): consolidate, report, and — for a
 *  SEIZE — chain straight into DEFEND in place (call 4). */
function finish(tk: Tasking, team: Team, mem: Unit[]): void {
  consolidate(tk, mem)
  if (tk.task === 'SEIZE') {
    tk.state = 'done'
    radio(team.name, 'arrive', `OBJECTIVE SEIZED — CONSOLIDATING, GRID ${grid(tk.obj.x, tk.obj.y)}`, tk.obj.x, tk.obj.y)
    const next: Tasking = {
      id: S.counters.nextId++, teamId: tk.teamId, task: 'DEFEND',
      obj: { ...tk.obj }, state: 'actions',
      initStr: mem.reduce((s, u) => s + u.strength, 0),
      detached: [...tk.detached], chained: true, phaseT: S.t,
    }
    S.taskings = S.taskings.filter(t => t !== tk)
    S.taskings.push(next)
  } else {
    tk.state = 'actions'
    tk.phaseT = S.t
    radio(team.name, 'arrive', `DEFENSE ESTABLISHED — GRID ${grid(tk.obj.x, tk.obj.y)}`, tk.obj.x, tk.obj.y)
  }
}
