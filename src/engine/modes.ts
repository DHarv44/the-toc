// Game modes. A mode owns the ending: it declares its win/lose check and the
// end-screen text; the shared end-of-match handling (freeze, modal, stats)
// lives in SimLoop/EndScreen and works for every mode. Modes 2 and 3 (Base
// Defense waves, Zone Capture) slot in here without touching the framework.
import type { GameState } from './GameState'

export type ModeId = 'attack-defend' | 'king-of-the-hill'
export type Outcome = 'won' | 'lost'

export interface ModeSpec {
  id: ModeId
  label: string
  sub: string
  // one-time scenario shaping, called at the end of initGame (after the map,
  // bases and starting forces exist)
  setup?(S: GameState): void
  // per-tick mode logic, called in the frozen order right before checkEnd
  update?(S: GameState, dt: number): void
  // null while the match is still on; called once per tick after deaths resolve
  checkEnd(S: GameState): Outcome | null
  endText: Record<Outcome, { title: string; sub: string }>
}

// seconds of accumulated, uncontested control of the hill needed to win
const HILL_HOLD_TARGET = 360
const HILL_RADIUS = 350

// The hill picker: the highest passable cell in the central third of the map —
// the dominant terrain feature both sides can reach and neither starts on.
function pickHill(S: GameState): { x: number; y: number } {
  const m = S.map!
  const lo = Math.floor(m.GRID * 0.33), hi = Math.ceil(m.GRID * 0.67)
  let best = -Infinity, bx = m.WORLD / 2, by = m.WORLD / 2
  for (let gy = lo; gy < hi; gy++) {
    for (let gx = lo; gx < hi; gx++) {
      const i = gy * m.GRID + gx
      if (m.terr[i] === 3) continue // not in a lake
      const e = m.elev[i]!
      if (e > best) { best = e; bx = (gx + 0.5) * m.CELL; by = (gy + 0.5) * m.CELL }
    }
  }
  return { x: bx, y: by }
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

  'king-of-the-hill': {
    id: 'king-of-the-hill',
    label: 'KING OF THE HILL',
    sub: 'One objective · hold the high ground to run out the clock',
    setup(S) {
      const p = pickHill(S)
      S.hill = {
        x: p.x, y: p.y, r: HILL_RADIUS,
        holder: null, holdFriend: 0, holdHostile: 0,
        target: HILL_HOLD_TARGET,
      }
    },
    // control by presence: your clock runs only while you hold the zone
    // uncontested; contested or empty runs nobody's
    update(S, dt) {
      const h = S.hill
      if (!h) return
      let friend = false, hostile = false
      for (const u of S.units) {
        if (u.strength <= 0) continue
        if (Math.hypot(u.x - h.x, u.y - h.y) > h.r) continue
        if (u.side === 'friend') friend = true
        else hostile = true
        if (friend && hostile) break
      }
      h.holder = friend && !hostile ? 'friend' : hostile && !friend ? 'hostile' : null
      if (h.holder === 'friend') h.holdFriend += dt
      else if (h.holder === 'hostile') h.holdHostile += dt
    },
    // the clock decides — plus the A&D structure-wipe defeat, because with no
    // HQ and no FOB you can't field and the match is already unwinnable
    checkEnd(S) {
      const h = S.hill
      if (!h) return null
      if (h.holdFriend >= h.target) return 'won'
      if (h.holdHostile >= h.target) return 'lost'
      const hq = S.structures.some(s => s.side === 'friend' && s.kind === 'HQ')
      const fob = S.structures.some(s => s.side === 'friend' && s.kind === 'FOB')
      if (!hq && !fob) return 'lost'
      return null
    },
    endText: {
      won: {
        title: 'OBJECTIVE HELD',
        sub: 'The high ground is yours — control clock complete.',
      },
      lost: {
        title: 'HILL LOST',
        sub: 'The enemy ran out the clock on the high ground.',
      },
    },
  },
}

export const MODE_ORDER: readonly ModeId[] = ['attack-defend', 'king-of-the-hill']
export const DEFAULT_MODE: ModeId = 'attack-defend'
