// THE UTILITY KERNEL — the one decision engine every commander in the game
// runs, extracted UNCHANGED from opfor/decide.ts (phase 1) so the OPFOR and
// the friendly tasking commander are the same machine pointed two ways
// (TASKING.md call 5). An action declares when it is available and scores
// itself 0..1 from weighted considerations — multiplicative, weight as
// exponent, so any single zero consideration kills the action; the best
// score above the floor executes.
//
// THE IRON RULE travels with the kernel: a decision layer only CHOOSES —
// execution goes through the same player-legal order functions the UI
// calls. Nothing built on this may be AI-only mechanics.
//
// Determinism: scoring must be a pure function of S; any randomness is the
// CALLER's, drawn from S.rng at its decision cadence. Callers record the
// returned score sheet so the dev console can always answer "why did it do
// that."
export interface Consideration<C> {
  name: string
  w: number
  eval(c: C): number
}

export interface UtilityAction<C> {
  id: string
  available(c: C): boolean
  considerations: Consideration<C>[]
  execute(c: C): void
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Score every available action; the best above `floor` wins ("below the
 *  floor, doing nothing beats doing something"). Returns the winner and the
 *  full score sheet. The caller executes — it may want to record first. */
export function decideBest<C>(
  actions: readonly UtilityAction<C>[], ctx: C, floor = 0.3,
): { best: UtilityAction<C> | null; scores: Record<string, number> } {
  let best: UtilityAction<C> | null = null
  let bs = floor
  const scores: Record<string, number> = {}
  for (const a of actions) {
    if (!a.available(ctx)) { scores[a.id] = 0; continue }
    let s = 1
    for (const k of a.considerations) s *= Math.pow(clamp01(k.eval(ctx)), k.w)
    scores[a.id] = s
    if (s > bs) { bs = s; best = a }
  }
  return { best, scores }
}
