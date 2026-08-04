// STATION KEEPING between units — the platoons of a company column.
//
// Same solver as the vics inside a platoon (./follow), one echelon up. What
// changes is the odometer. Units in a move group do NOT share a polyline: the
// lead unit paths once and each follower runs its own short join leg onto the
// head of that route (orders.ts, orderGroupMove), so there is no common arc
// length to measure against.
//
// What they DO share is an objective. So the odometer is distance-to-go,
// negated: dist = -remaining. It is monotonic while a unit is driving a fixed
// route, it is zero at the objective, and it is directly comparable across
// members whatever route each took to get there — which is all `lag` ever
// needed. A follower's slot at -i * COLUMN_GAP means "be one gap further from
// the objective than the vic ahead", which is exactly a column.
//
// This REPLACES the hand-rolled group pacing that used to live in the movement
// tick: a slowest-member speed cap, a column order recomputed from waypoints
// remaining, a straggler halt, and a cap-release so a trailing unit could close.
// Two behaviours change on purpose:
//
//   - A bogged member no longer silently slows everyone. The old cap was the
//     slowest REAL speed, so one platoon in a swamp pegged every platoon on
//     clean ground to swamp pace, and because the cap moved with it the
//     straggler never registered as a straggler — nothing was ever reported and
//     nobody waited, they all just crawled. Now the pace is what the slowest
//     platform could do on the ground the COLUMN is on, and each unit's own
//     terrain is applied to its achieved speed afterwards. The bogged platoon
//     falls under that pace, shows up as lag, and gets waited for.
//
//   - The halt is graduated. It used to be a cliff: past STRAGGLE_GAP everyone
//     forward of the break stopped dead. Now the leader eases from easeLag and
//     only stops outright at stopLag, with hysteresis on the way out, so a
//     column breathes instead of stuttering at the threshold.
import { S } from '../../engine/state'
import type { Unit } from '../../engine/GameState'
import { effStats } from '../forces/elements'
import { liftFactor } from '../forces/loadplan'
import { COLUMN_GAP, STRAGGLE_GAP } from '../forces/orders'
import { followTheLeader, type Mover, type Slot } from './follow'
import { MARCH_INTERVAL, inMarchOrder, marchPlan, marchSweep } from './march'
import { routeLength, routeOf, routeSweep } from './route'

export interface ColumnOrder {
  spd: number     // ordered speed before this unit's own terrain is applied
  wait: boolean   // stopped for the tail — go firm rather than idle in the open
}

// PACE MARGIN — how much of the slowest member's speed the column runs at, and
// therefore how much is left over for anyone behind to close with.
//
// This used to hand the solver a fictional ceiling of speed × 1.25 and set the
// margin to its reciprocal, on the theory that the two cancel. They do inside
// the solver. They do not survive it: the movement tick caps every unit at its
// REAL terrain speed (forces/update), so the headroom was granted and then
// deleted at the point of application, and a lagging member was ordered to
// close at a speed it was never allowed to drive. Nothing could ever catch up,
// which is precisely what "they leave the slow ones behind" looks like.
//
// The ceiling handed in is now the real one and the margin is a plain fraction,
// so the 15% is actually there to close with.
const PACE_MARGIN = 0.85

const OPTS = {
  minGap: COLUMN_GAP * 0.45,
  laneWidth: COLUMN_GAP,
  deadband: COLUMN_GAP * 0.22,
  easeLag: COLUMN_GAP,
  stopLag: STRAGGLE_GAP,
  resumeLag: COLUMN_GAP * 1.1,
  paceMargin: PACE_MARGIN,
  catchUpGain: 0.9,
}

// stop hysteresis, per move group — the leader stutters on and off at the
// threshold without it
const holding = new Map<number, boolean>()

// Route length still to run. Monotonic while the route holds; a unit whose
// route is re-issued mid-march is dropped from the solve that tick anyway.
function remaining(u: Unit): number {
  let r = 0, px = u.x, py = u.y
  for (const p of u.path) { r += Math.hypot(p.x - px, p.y - py); px = p.x; py = p.y }
  return r
}

export function solveColumns(dt: number): Map<number, ColumnOrder> {
  const out = new Map<number, ColumnOrder>()
  const groups = new Map<number, Unit[]>()
  for (const u of S.units) {
    if (u.groupId == null || u.strength <= 0) continue
    let g = groups.get(u.groupId)
    if (!g) { g = []; groups.set(u.groupId, g) }
    g.push(u)
  }
  for (const [gid, raw] of groups) {
    let list = raw
    if (list.length < 2) { holding.delete(gid); continue }
    // THE ODOMETER: how far along the COLUMN'S route this member has got,
    // measured as the shared route's length minus the distance it still has to
    // drive. One number, one curve, comparable across every member.
    //
    //   on the route at arc s   remaining is the route's own tail  → reads s
    //   still driving to it     remaining carries the join leg too → reads the
    //                           arc it will enter at, MINUS how far it still
    //                           has to go to get there. Genuinely behind, by
    //                           exactly the right amount.
    //
    // That second line is the part every previous attempt got wrong. Measuring
    // by projection put a member that was six hundred metres away and driving a
    // detour at the arc length it was closest to — a fiction — so it had to be
    // thrown out of the solve to stop it lying, and a column that throws a
    // member out is a column that drives off without it. Which is exactly the
    // complaint: the slow ones get left.
    //
    // The old code was `-remaining(u)` and was nearly right. Its flaw was that
    // each member had its OWN route with its own total length, so the readings
    // had different origins. One shared route gives them a common one.
    const route = routeOf(gid)
    const total = route ? routeLength(route) : 0
    const dist = new Map<number, number>()
    for (const u of list) {
      const d = route ? total - remaining(u) : -remaining(u)
      dist.set(u.id, d)
      u.colS = d
    }

    // THE ORDER OF MARCH IS THE ORDER OF MARCH. Index 0 is the lead and stays
    // the lead: that is the solver's contract ("array order is slot order") and
    // it is the whole point of writing an order down. This used to re-sort by
    // who was furthest along every tick, which meant the designated lead lost
    // the front of its own column to whichever platoon had the better run.
    const plan = marchPlan(gid)
    if (plan) list = inMarchOrder(gid, list)
    else if (route) {
      const rank = new Map(route.order.map((id, i) => [id, i]))
      list = list.slice().sort((a, b) =>
        (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity))
    } else list.sort((a, b) => dist.get(b.id)! - dist.get(a.id)!)
    const gap = plan ? MARCH_INTERVAL[plan.column] : COLUMN_GAP

    // The ceiling every member is reckoned against is what it could do ON THE
    // GROUND THE COLUMN IS ON — its own nominal speed over the lead unit's
    // terrain. That is the pair of properties this needs and neither is
    // negotiable: a column on tarmac runs at road pace rather than being pegged
    // to some cross-country nominal, and a unit that strays into a wadi finds
    // its real speed under the ceiling, falls behind, and gets waited for.
    // Reckoning against each unit's OWN terrain gives up the second half — the
    // bogged unit's ceiling drops with it, so it never registers as a straggler
    // and instead silently drags everyone on clean ground down to its pace.
    const lead = list[0]!
    const movers: Mover[] = new Array(list.length)
    const slots: Slot[] = new Array(list.length)
    for (let i = 0; i < list.length; i++) {
      const u = list[i]!
      u.colIdx = i
      const st = effStats(u)
      const f = S.map!.moveFactor(lead.x, lead.y, st.mob)
      // A unit in contact is not station-keeping, it is fighting — and a unit
      // breaking contact is running a detour that would make its distance-to-go
      // jump. Both leave the solve; the column stops waiting on them and the
      // drills take over.
      // NOTHING ELSE IS EXCLUDED. A member still driving to the route is not a
      // special case any more — the odometer already reads it as behind by the
      // distance it has left to cover, so the column simply waits for it, which
      // is what a column is for.
      const fighting = !!u.targetId || u.breaking
      movers[i] = {
        id: u.id,
        dist: dist.get(u.id)!,
        spd: u._spd,
        // The REAL ceiling. It is capped again at the point of application
        // (forces/update) by this unit's own terrain, so handing in anything
        // larger than the truth here just gets deleted there — which is what
        // used to happen to every catch-up order the solver ever issued.
        // The lift factor belongs in it: a platoon with more people than seats
        // has genuinely lost the speed, and the column has to see that as lag
        // rather than quietly matching it.
        maxSpd: (st.speed * liftFactor(u)) / (isFinite(f) ? f : 3),
        out: fighting || !u.path.length,
      }
      slots[i] = { along: -i * gap, lat: 0, face: 0 }
    }

    const r = followTheLeader({
      movers, slots, dt, holding: holding.get(gid),
      // THE ORDER IS ONLY AS REAL AS THE CLEARANCE THAT ENFORCES IT. With
      // sequenceGap at 0 the cross-lane cap does not bite until the gap is
      // nearly closed, by which point a closing member cannot brake inside its
      // own decel limit and goes straight past (see ./follow). A column that
      // was given an order holds it at its own interval.
      opts: plan ? { ...OPTS, sequenceGap: gap, minGap: gap * 0.45 } : OPTS,
    })
    holding.set(gid, r.holding)
    for (let i = 0; i < list.length; i++) {
      const o = r.orders[i]
      if (!o) continue
      out.set(list[i]!.id, { spd: o.spd, wait: o.status === 'stopped' })
    }
  }
  // groups that no longer exist
  for (const gid of holding.keys()) if (!groups.has(gid)) holding.delete(gid)
  marchSweep(new Set(groups.keys()))
  routeSweep(new Set(groups.keys()))
  return out
}
