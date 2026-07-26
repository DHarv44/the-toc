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
import { COLUMN_GAP, STRAGGLE_GAP } from '../forces/orders'
import { followTheLeader, type Mover, type Slot } from './follow'

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
  for (const [gid, list] of groups) {
    if (list.length < 2) { holding.delete(gid); continue }
    // Column order is recomputed EVERY tick from progress along the route.
    // Fixing it when the move is issued does not survive contact with reality:
    // at that moment every unit is bunched at the start with indistinguishable
    // positions, and the order then drifts as the faster ones pull ahead —
    // leaving "the vic ahead" pointing at one that is actually behind, so the
    // front runs free while the rear waits on it.
    const dist = new Map<number, number>()
    for (const u of list) dist.set(u.id, -remaining(u))
    list.sort((a, b) => dist.get(b.id)! - dist.get(a.id)!)

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
      movers[i] = {
        id: u.id,
        dist: dist.get(u.id)!,
        spd: u._spd,
        maxSpd: (st.speed / (isFinite(f) ? f : 3)) * HEADROOM,
        out: fighting || !u.path.length,
      }
      slots[i] = { along: -i * COLUMN_GAP, lat: 0, face: 0 }
    }

    const r = followTheLeader({
      movers, slots, dt, holding: holding.get(gid), opts: OPTS,
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
  return out
}
