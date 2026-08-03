// Awards & decorations — the VERBS. What a decoration is called, what its
// ribbon looks like and which one answers a given criterion are the pack's
// (Pack.awards); this file only knows that something EARNS one and how to put
// it on a soldier.
//
// Today's criteria are the casualty ones: a wound or a death earns the wound
// decoration, awarded by the SYSTEM at casualty time rather than rolled. Valor
// awards (deliberate criteria: kills under fire, holding under odds, rescue
// recoveries) layer on later — see ROADMAP → medals.
import type { Soldier } from '../engine/GameState'
import type { AwardCriterion, AwardDef } from './types'
import { activePack } from './install'

export type AwardKey = string
export type { AwardDef as Award }

const table = (side: 'friend' | 'hostile'): Record<string, AwardDef> =>
  activePack(side)?.awards ?? {}

/** One decoration, for rendering (name, abbr, ribbon). */
export const awardDef = (key: AwardKey, side: 'friend' | 'hostile' = 'friend'): AwardDef | undefined =>
  table(side)[key]

/** WHICH decoration this army gives for a criterion. Absent = this army does
 *  not decorate that, which is a legitimate thing for a pack to say. */
export const awardFor = (on: AwardCriterion, side: 'friend' | 'hostile' = 'friend'): AwardKey | undefined =>
  Object.values(table(side)).find(a => a.on === on)?.key

// idempotent: one entry per award type. A second Purple Heart would need oak
// leaf clusters, which is a display question this does not answer yet.
export function grantAward(s: Soldier, key: AwardKey | undefined): void {
  if (!key) return
  const list = (s.awards ??= [])
  if (!list.includes(key)) list.push(key)
}
