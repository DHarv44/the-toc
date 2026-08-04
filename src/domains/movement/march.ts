// THE ORDER OF MARCH — a column's sequence, authored instead of emergent.
//
// Until now a move group had no order at all. ./column.ts re-sorted its members
// by progress along the route EVERY TICK, so whoever happened to be furthest
// along WAS the lead. Its comment explains why it had to: fix the order at
// issue time and a unit that falls behind leaves "the vic ahead" pointing at
// one that is actually behind, so the front runs free while the rear waits on
// it. That objection was correct — against a solver that only kept station
// inside a lane.
//
// It is no longer correct. ./follow.ts now keeps SEQUENCE across lanes at a
// commanded clearance, so a member that is ordered ahead but has bogged is
// CAUGHT UP TO rather than passed, and the ones behind it hold their interval.
// Which is what an order of march is: if the lead vic bogs, the column waits
// on it; it does not quietly reorganise itself around the casualty.
//
// A MARCH UNIT IS A MOVEMENT ORGANIZATION, NOT A COMMAND ONE. The platoon
// stays atomic for command, fires, casualties and reporting; the column owns
// only the sequence and the interval. Doctrine keeps sub-elements coherent
// inside a march unit rather than interleaving individual vehicles from
// different platoons, and so does this: the order is over MEMBERS, and each
// member's own vics stay under their own commander.
import { S } from '../../engine/state'
import type {
  MarchColumnType, MarchPlan, Roe, Unit, WeaponsControl,
} from '../../engine/GameState'

// Metres between vehicles. The interval is a real tactical choice and each
// setting buys one thing at another's expense:
//
//   close          control and road space; a single fire mission reaches more
//                  than one vic. Night, limited visibility, built-up ground.
//   open           dispersion against artillery and air; the column stretches
//                  and control gets harder. The default for a tactical march.
//   infiltration   dispersion to the point of not looking like a column at all.
//                  Slow, and the column has almost no mutual support.
export const MARCH_INTERVAL: Record<MarchColumnType, number> = {
  close: 30,
  open: 100,
  infiltration: 260,
}

export const marchPlan = (gid: number): MarchPlan | undefined =>
  S.march.find(p => p.gid === gid)

/** Write (or replace) a group's order of march. `order` is unit ids, front
 *  first — the lead vehicle is the first vic of the first member. */
export function setMarchOrder(
  gid: number, order: number[], column: MarchColumnType = 'open',
  extra: Partial<Pick<MarchPlan, 'roe' | 'weapons' | 'name'>> = {},
): MarchPlan {
  const existing = marchPlan(gid)
  const plan: MarchPlan = { gid, order: [...order], column, ...extra }
  if (existing) Object.assign(existing, plan)
  else S.march.push(plan)
  const live = existing ?? plan
  issue(live)
  return live
}

/** Push the order down onto the members. This happens ONCE, when the order is
 *  given — it is not re-asserted every tick, because a drill that overrides it
 *  is the element exercising judgement the order cannot anticipate, and a plan
 *  that stamped itself back on every frame would silently delete that. */
export function issue(plan: MarchPlan): void {
  for (const id of plan.order) {
    const u = S.units.find(x => x.id === id)
    if (!u || u.strength <= 0) continue
    if (plan.roe) u.roe = plan.roe
    if (plan.weapons) u.weapons = plan.weapons
  }
}

/** ORDERED vs ACTUAL, per member. The interesting rows are the ones where the
 *  two disagree: that is the difference between the order the commander gave
 *  and the report they are getting, and it is the whole reason this is a board
 *  you watch rather than a form you fill in. */
export interface MarchState {
  unitId: number
  index: number              // place in the order of march, 0 = lead
  roe: Roe
  weapons: WeaponsControl
  /** metres behind the station this member's place in the order asks for */
  lag: number
  driftedRoe: boolean
  driftedWeapons: boolean
  /** off the road, fighting, or broken down — not station-keeping at all */
  detached: boolean
}

export function marchState(gid: number): MarchState[] {
  const plan = marchPlan(gid)
  if (!plan) return []
  // IS THE COLUMN UNDER WAY? A halted element is only "not in column" if the
  // column is going somewhere without it. Sitting at the SP with the order in
  // hand and nobody moving is not a straggler — it is a column at the SP, and
  // reporting the whole march as detached the moment it stops is exactly the
  // kind of false alarm that teaches a commander to ignore the board.
  const moving = plan.order.some(id => {
    const u = S.units.find(x => x.id === id)
    return !!u && u.strength > 0 && u.path.length > 0
  })
  const out: MarchState[] = []
  plan.order.forEach((id, i) => {
    const u = S.units.find(x => x.id === id)
    if (!u || u.strength <= 0) return
    out.push({
      unitId: id,
      index: i,
      roe: u.roe,
      weapons: u.weapons,
      lag: 0,                 // filled from the solver's own reading below
      driftedRoe: !!plan.roe && u.roe !== plan.roe,
      driftedWeapons: !!plan.weapons && u.weapons !== plan.weapons,
      detached: !!u.targetId || !!u.breaking || (moving && !u.path.length),
    })
  })
  return out
}

/** Is this column actually rolling? The board reads differently at the SP. */
export function marchMoving(gid: number): boolean {
  const plan = marchPlan(gid)
  if (!plan) return false
  return plan.order.some(id => {
    const u = S.units.find(x => x.id === id)
    return !!u && u.strength > 0 && u.path.length > 0
  })
}

export function clearMarchOrder(gid: number): void {
  const i = S.march.findIndex(p => p.gid === gid)
  if (i >= 0) S.march.splice(i, 1)
}

/** The members of `gid` in MARCH ORDER. Anything the plan does not name falls
 *  in behind, in whatever order it is already in — a unit that joins a moving
 *  column takes station at the tail rather than being refused or silently
 *  inserted somewhere the commander did not put it. */
export function inMarchOrder(gid: number, members: Unit[]): Unit[] {
  const plan = marchPlan(gid)
  if (!plan) return members
  const rank = new Map(plan.order.map((id, i) => [id, i]))
  return members.slice().sort((a, b) =>
    (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity))
}

/** Drop plans whose group has gone. */
export function marchSweep(live: Set<number>): void {
  for (let i = S.march.length - 1; i >= 0; i--) {
    if (!live.has(S.march[i]!.gid)) S.march.splice(i, 1)
  }
}
