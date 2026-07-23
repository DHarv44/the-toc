// Game modes. A mode owns the ending: it declares its win/lose check and the
// end-screen text; the shared end-of-match handling (freeze, modal, stats)
// lives in SimLoop/EndScreen and works for every mode. Modes 2 and 3 (Base
// Defense waves, Zone Capture) slot in here without touching the framework.
import type { GameState } from './GameState'

export type ModeId = 'attack-defend'
export type Outcome = 'won' | 'lost'

export interface ModeSpec {
  id: ModeId
  label: string
  sub: string
  // null while the match is still on; called once per tick after deaths resolve
  checkEnd(S: GameState): Outcome | null
  endText: Record<Outcome, { title: string; sub: string }>
}

export const MODES: Record<ModeId, ModeSpec> = {
  'attack-defend': {
    id: 'attack-defend',
    label: 'ATTACK & DEFEND',
    sub: 'Destroy the enemy command post · keep yours alive',
    // Win: the hostile command post is gone. Lose: yours is gone with no FOB
    // left to convert (a FOB on the board is a fallback, not a defeat).
    checkEnd(S) {
      if (!S.map) return null
      if (!S.structures.some(s => s.side === 'hostile' && s.kind === 'HQ')) return 'won'
      const hq = S.structures.some(s => s.side === 'friend' && s.kind === 'HQ')
      const fob = S.structures.some(s => s.side === 'friend' && s.kind === 'FOB')
      if (!hq && !fob) return 'lost'
      return null
    },
    endText: {
      won: {
        title: 'OBJECTIVE SECURED',
        sub: 'Enemy command post destroyed — the sector is yours.',
      },
      lost: {
        title: 'COMMAND POST LOST',
        sub: 'No fallback remained. The operation is over.',
      },
    },
  },
}

export const MODE_ORDER: readonly ModeId[] = ['attack-defend']
export const DEFAULT_MODE: ModeId = 'attack-defend'
