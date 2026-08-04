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

export interface ColumnOrder {
  spd: number     // ordered speed before this unit's own terrain is applied
  wait: boolean   // stopped for the tail — go firm rather than idle in the open
}

// Gains in metres, keyed to the gap a follower holds. STRAGGLE_GAP is kept as
// the hard stop so the distance at which a column gives up on its tail is still
// the one number it always was.
// How much faster than the column's pace a unit may run to close a gap. The
// margin is its exact reciprocal so that a formed column asks for no correction
// at all and runs at the pace itself — see HEADROOM in ./station.ts for why
// getting this wrong taxes every move in the game.
const HEADROOM = 1.25

const OPTS = {
  minGap: COLUMN_GAP * 0.45,
  laneWidth: COLUMN_GAP,
  deadband: COLUMN_GAP * 0.22,
  easeLag: COLUMN_GAP,
  stopLag: STRAGGLE_GAP,
  resumeLag: COLUMN_GAP * 1.1,
  paceMargin: 1 / HEADROOM,
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
    const dist = new Map<number, number>()
    for (const u of list) dist.set(u.id, -remaining(u))
    // WITH NO ORDER OF MARCH, the column sorts itself by progress every tick.
    // Fixing an order used to be unworkable for the reason that sort exists:
    // at the moment a move is issued every unit is bunched at the start with
    // indistinguishable positions, the order then drifts as the faster ones
    // pull ahead, and "the vic ahead" ends up pointing at one that is actually
    // behind — so the front runs free while the rear waits on it.
    //
    // WITH ONE, that no longer happens, because ./follow keeps sequence across
    // lanes at a commanded clearance: a member ordered ahead that has bogged is
    // caught up to rather than passed. Which is the difference between a column
    // and a queue — if the lead vic bogs, the column waits on it instead of
    // quietly reorganising itself around the casualty.
    const plan = marchPlan(gid)
    if (plan) list = inMarchOrder(gid, list)
    else list.sort((a, b) => dist.get(b.id)! - dist.get(a.id)!)
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
      const fighting = !!u.targetId || u.breaking
      // AND SO DOES ONE THAT HAS NOT MADE THE START POINT. `dist` is remaining
      // distance along a unit's OWN path, which is only a shared coordinate
      // once everybody is on the same route — until then it also carries the
      // leg each unit is still driving to reach it, and those differ by a
      // kilometre or more on broken ground.
      //
      // Read as lag, that difference stopped the column dead. The lead's route
      // was 7.1 km and the followers' were 8.1–8.5, so they registered as
      // 1.4 km behind before anybody had moved; the lead went to `holding` and
      // sat at the start line for a hundred seconds while they burned the
      // difference off. It was waiting for a tail that was never behind it.
      //
      // A platoon moving to the SP is FORMING UP, which is not straggling.
      const forming = u.colRouteN != null && u.path.length > u.colRouteN
      movers[i] = {
        id: u.id,
        dist: dist.get(u.id)!,
        spd: u._spd,
        // the ceiling has to know about the walkers too, or a platoon short of
        // lift never registers as a straggler — it just quietly fails to keep up
        maxSpd: ((st.speed * liftFactor(u)) / (isFinite(f) ? f : 3)) * HEADROOM,
        out: fighting || forming || !u.path.length,
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
  return out
}
