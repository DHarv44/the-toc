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
import type { MarchColumnType, MarchPlan, Unit } from '../../engine/GameState'

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
): MarchPlan {
  const existing = marchPlan(gid)
  const plan: MarchPlan = { gid, order: [...order], column }
  if (existing) Object.assign(existing, plan)
  else S.march.push(plan)
  return existing ?? plan
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
