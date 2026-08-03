// Ranks — the VERBS. WHAT an army's ranks are called, what order they run in
// and what insignia they wear are the pack's (Pack.ranks, junior first, order
// IS seniority); this file only knows that one soldier can be SENIOR to
// another, and that the senior one answers for the element.
//
// This lives under packs/ rather than in the insignia renderer because
// seniority is not a drawing concern: the org asks who commands a formation
// long before anything is on screen.
import type { Soldier } from '../engine/GameState'
import type { Pack, RankDef } from './types'
import { playerPack } from './index'

/** A rank's entry in its army's ladder. */
export const rankDef = (rank?: string, pack: Pack = playerPack()): RankDef | undefined =>
  rank ? pack.ranks?.find(r => r.key === rank) : undefined

/** SENIORITY — the rank's place in its army's ladder, junior first. Unknown
 *  ranks answer -1 so they sort BELOW the most junior soldier rather than
 *  silently landing wherever a missing table put them. */
export const rankW = (rank?: string, pack: Pack = playerPack()): number =>
  rank ? (pack.ranks?.findIndex(r => r.key === rank) ?? -1) : -1

/** WHO ANSWERS FOR A GROUP OF PEOPLE: the senior soldier in it and, among
 *  equal ranks, the one listed LAST. A roster is built in casualty order —
 *  leaders last, so the last one standing is the leader — which makes the
 *  final soldier of a rank the one the rest fall in front of. No army has to
 *  tell us the job title of the person in charge for this to hold.
 *
 *  `fit` restricts to soldiers still in the fight: an element whose leader is
 *  down is answered for by the next senior, which is the whole point of
 *  writing a roster in that order. */
export function seniorOf(soldiers: Soldier[], fit = false): Soldier | undefined {
  const pool = fit ? soldiers.filter(s => s.status === 'FIT') : soldiers
  let best: Soldier | undefined
  for (const s of pool) if (!best || rankW(s.rank) >= rankW(best.rank)) best = s
  return best
}
