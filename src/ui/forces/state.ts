// WHAT A GROUPING IS DOING, IN THE TWO WORDS A COMMANDER SCANS FOR.
//
// The same question is asked in four places — the task org bar, the march list,
// the team station's header and now the station TAB — and it was answered by
// three separate copies of the same ladder. Three copies of a status rule is
// how a team reads MOVING on the tab and HALTED in the header.
//
// The ladder is an order of precedence, not a set of states: contact beats
// movement, movement beats posture, and posture beats nothing happening. That
// is the order a TOC reads them in.
import type { Unit } from '../../engine/GameState'
import { marchMoving } from '../../domains/movement/march'

export interface GroupState { text: string; tone: string }

export const TONE = {
  contact: '#ff9e6a',
  moving: '#8fb0c8',
  firm: '#7ec87e',
  hold: '#6d7f90',
  warn: '#e0b34e',
} as const

/** `gid` is the team's id when the grouping IS a team — a column counts as
 *  moving while any part of it is still closing, which is not the same as
 *  "some unit has a path". */
export function groupState(units: Unit[], gid?: number): GroupState {
  if (units.some(u => u.targetId || u.breaking)) return { text: 'CONTACT', tone: TONE.contact }
  const moving = gid != null ? marchMoving(gid) : units.some(u => u.path.length)
  if (moving) return { text: 'MOVING', tone: TONE.moving }
  if (units.some(u => u.posture === 'dig')) return { text: 'FIRM', tone: TONE.firm }
  return { text: 'HOLD', tone: TONE.hold }
}

/** Mean strength, rounded — the number every roll-up shows. */
export const groupStrength = (units: Unit[]): number =>
  units.length ? Math.round(units.reduce((n, u) => n + u.strength, 0) / units.length) : 0

/** The colour a strength reads in: fine, worn, or hurt. */
export const strengthTone = (str: number): string =>
  str >= 85 ? '#6d8296' : str >= 60 ? '#c9a24a' : '#e07a6a'
