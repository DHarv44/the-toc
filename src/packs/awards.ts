// Awards & decorations framework (Packs). Starts small and honest: the Purple
// Heart lands automatically on every wound and posthumously on every KIA —
// awarded by the SYSTEM at casualty time, not RNG'd. Valor awards (deliberate
// criteria: kills under fire, holding under odds, rescue recoveries) layer on
// later — see ROADMAP → medals.
import type { Soldier } from '../engine/GameState'

export interface Award {
  key: string
  name: string
  abbr: string
  ribbon: readonly string[]  // ribbon stripe colors, left → right (ui/insignia renders)
}

const AWARDS_LITERAL = {
  PURPLE_HEART: {
    key: 'PURPLE_HEART', name: 'Purple Heart', abbr: 'PH',
    ribbon: ['#ffffff', '#5b2c83', '#5b2c83', '#5b2c83', '#ffffff'],
  },
  // the contractor's equivalent (real rule): civilians wounded in the line of
  // duty receive the Defense of Freedom Medal, NOT the Purple Heart
  DEFENSE_OF_FREEDOM: {
    key: 'DEFENSE_OF_FREEDOM', name: 'Defense of Freedom Medal', abbr: 'DoF',
    ribbon: ['#a6252f', '#ffffff', '#1e3a6e', '#ffffff', '#a6252f'],
  },
  // deliberate-criteria valor awards come later; keys reserved so saves stay stable
  ARCOM_V: {
    key: 'ARCOM_V', name: 'Army Commendation Medal w/ Valor', abbr: 'ARCOM-V',
    ribbon: ['#4d7a4d', '#ffffff', '#4d7a4d', '#ffffff', '#4d7a4d'],
  },
  BSM_V: {
    key: 'BSM_V', name: 'Bronze Star Medal w/ Valor', abbr: 'BSM-V',
    ribbon: ['#7a1f1f', '#ffffff', '#274060', '#ffffff', '#7a1f1f'],
  },
} as const satisfies Record<string, Award>

export type AwardKey = keyof typeof AWARDS_LITERAL
export const AWARDS: Readonly<Record<AwardKey, Award>> = AWARDS_LITERAL

// idempotent: one Purple Heart entry per wounding event would need oak-leaf
// clusters — v1 keeps a single entry per award type
export function grantAward(s: Soldier, key: AwardKey): void {
  const list = (s.awards ??= [])
  if (!list.includes(key)) list.push(key)
}
