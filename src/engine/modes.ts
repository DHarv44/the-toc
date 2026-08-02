// Game modes. A mode owns the ending: it declares its win/lose check and the
// end-screen text; the shared end-of-match handling (freeze, modal, stats)
// lives in SimLoop/EndScreen and works for every mode. Modes 2 and 3 (Base
// Defense waves, Zone Capture) slot in here without touching the framework.
import type { GameState } from './GameState'
import type { UnitTypeKey } from '../domains/forces/catalog'
import { spawnScriptedBattlegroup } from '../domains/opfor/ai'
import { deployUnit } from '../domains/installations/orders'
import { radio, toast } from '../domains/comms/radio'
import { startCampaign, runCampaign } from './campaign'

export type ModeId = 'attack-defend' | 'base-defense' | 'king-of-the-hill' | 'campaign'
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

// --- Base Defense (waves) tuning -----------------------------------------
const WAVE_TARGET = 10          // assaults to survive for the win
const WAVE_FIRST_DELAY = 90     // seconds before wave 1 (time to dig in)
const WAVE_INTERMISSION = 75    // seconds between a repelled wave and the next

// Holding earns DIVISION PRIORITY, not money (no purchase economy): the force
// cap grows each wave held, refit clocks clear, and on some waves DIVISION
// MAIN pushes support unrequested during the staging period — it just shows
// up at the base with radio traffic. (Asset pushes — C-RAM, orbits — hook in
// here once the request service lands; see ASSET-REQUESTS.md / task #21.)
const WAVE_CAP_GROWTH = 2
const WAVE_PUSHES: Readonly<Record<number, readonly UnitTypeKey[]>> = {
  2: ['AT'],            // AT section against the coming combined arms
  4: ['ARM'],           // a tank platoon before the armor waves
  6: ['MED'],           // casualties are mounting — an aid detachment
  8: ['ARTY'],          // guns for the end game
}

// hand-tuned escalation: light probes → combined arms → armor with guns behind it
const WAVE_COMPS: ReadonlyArray<readonly UnitTypeKey[]> = [
  ['INF', 'INF'],                                     // 1
  ['INF', 'INF', 'SCT'],                              // 2
  ['MECH', 'INF', 'INF'],                             // 3
  ['MECH', 'MECH', 'SCT', 'INF'],                     // 4
  ['ARM', 'MECH', 'INF', 'INF'],                      // 5
  ['ARM', 'ARM', 'MECH', 'SCT'],                      // 6
  ['ARM', 'ARM', 'MECH', 'MOR', 'INF'],               // 7
  ['ARM', 'ARM', 'ARM', 'CAV', 'MECH'],               // 8
  ['ARM', 'ARM', 'ARM', 'CAV', 'MECH', 'MOR'],        // 9
  ['ARM', 'ARM', 'ARM', 'ARM', 'CAV', 'CAV', 'ARTY'], // 10
]

// --- King of the Hill tuning ----------------------------------------------
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

  'base-defense': {
    id: 'base-defense',
    label: 'BASE DEFENSE',
    sub: 'Survive escalating waves · hold and division releases more force',
    setup(S) {
      // no economy at all: division priority between waves is the reward
      // (supplyUpdate returns early while S.waves exists), and the OPFOR's own
      // economy-driven waves are off — the scripted schedule IS the opposition
      S.nextWave = Infinity
      S.enemySupplyLift = 0
      S.enemyResources = 0
      S.waves = {
        n: 1, phase: 'intermission', interT: WAVE_FIRST_DELAY,
        groupIds: [], survived: 0, target: WAVE_TARGET,
      }
    },
    update(S, dt) {
      const w = S.waves
      if (!w || w.survived >= w.target) return
      if (w.phase === 'intermission') {
        w.interT -= dt
        if (w.interT > 0) return
        const comp = WAVE_COMPS[Math.min(w.n, WAVE_COMPS.length) - 1]!
        const gid = spawnScriptedBattlegroup(comp, `WAVE ${w.n}`)
        if (gid == null) {
          // no hostile base left to launch from — the player cut the source;
          // nothing can ever threaten the base again, so the defense stands
          w.survived = w.target
          return
        }
        w.groupIds = [gid]
        w.phase = 'assault'
        radio('NET', 'contact', `WAVE ${w.n} INBOUND — ${comp.length} ELEMENTS`, undefined, undefined)
      } else {
        // repelled when every group of the wave is gone (destroyed or withdrawn home)
        if (S.enemyGroups.some(g => w.groupIds.includes(g.id))) return
        w.survived = w.n
        if (w.survived >= w.target) return // checkEnd takes it from here
        // division priority, not money: the pool grows and the refit clocks
        // clear — the staging period is for FIELDING, not shopping
        S.forceCap += WAVE_CAP_GROWTH
        S.fieldCooldown.friend = {}
        radio('NET', 'arrive', `WAVE ${w.n} REPELLED — DIVISION RELEASES FORCE, CAP ${S.forceCap}`, undefined, undefined)
        toast(`WAVE ${w.n} REPELLED — FORCE POOL ${S.forceCap}`)
        // some waves, DIVISION MAIN pushes support you never asked for — it
        // arrives at the base during staging with its own net traffic
        const push = WAVE_PUSHES[w.n]
        if (push) {
          const hq = S.structures.find(s => s.side === 'friend' && (s.kind === 'HQ' || s.kind === 'FOB'))
          if (hq) {
            push.forEach((k, i) => {
              const u = deployUnit(k, hq.x + 140 + i * 90, hq.y + 160, true)
              if (u) radio('NET', 'arrive', `DIVISION PUSH — ${u.label} ATTACHED TO THE DEFENSE, NO REQUEST NEEDED`, u.x, u.y)
            })
          }
        }
        w.n++
        w.phase = 'intermission'
        w.interT = WAVE_INTERMISSION
      }
    },
    // survive the schedule to win; lose the base network and it's over
    checkEnd(S) {
      const w = S.waves
      if (!w) return null
      if (w.survived >= w.target) return 'won'
      const hq = S.structures.some(s => s.side === 'friend' && s.kind === 'HQ')
      const fob = S.structures.some(s => s.side === 'friend' && s.kind === 'FOB')
      if (!hq && !fob) return 'lost'
      return null
    },
    endText: {
      won: {
        title: 'POSITION HELD',
        sub: 'Every assault repelled — relief forces arrive on your perimeter.',
      },
      lost: {
        title: 'BASE OVERRUN',
        sub: 'The defense collapsed. The position is lost.',
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

  // Campaign: one battalion's operation, a sequence of missions on ONE persistent
  // world. The mode owns only the endpoints — startCampaign builds the world +
  // starts mission 1, runCampaign advances objectives/missions each tick (soft
  // transitions, never through the match-end freeze), and checkEnd fires only for
  // the WHOLE campaign. All mission content lives in engine/campaign.ts.
  'campaign': {
    id: 'campaign',
    label: 'CAMPAIGN',
    sub: 'One battalion, one long operation — mission by mission',
    setup(S) { startCampaign(S) },
    update(S, dt) { runCampaign(S, dt) },
    checkEnd(S) {
      const c = S.campaign
      if (!c) return null
      if (c.complete) return 'won'
      // lose only if the battalion can no longer command or field: HQ gone and
      // no FOB to fall back on (the shared floor across modes)
      const hq = S.structures.some(s => s.side === 'friend' && s.kind === 'HQ')
      const fob = S.structures.some(s => s.side === 'friend' && s.kind === 'FOB')
      if (!hq && !fob) return 'lost'
      return null
    },
    endText: {
      won: {
        title: 'OPERATION COMPLETE',
        sub: 'Every mission carried — the battalion holds the ground it took.',
      },
      lost: {
        title: 'BATTALION COMBAT-INEFFECTIVE',
        sub: 'Command and the last fallback are gone. The operation is over.',
      },
    },
  },
}

export const MODE_ORDER: readonly ModeId[] = ['attack-defend', 'base-defense', 'king-of-the-hill']
export const DEFAULT_MODE: ModeId = 'attack-defend'
