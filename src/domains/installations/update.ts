// Installations tick slices: construction, garrison reconstitution, integrity
// reports, and structure deaths (with win/lose and tethered-aerostat teardown).
// Ported verbatim from src/game/sim.js tick().
import { S } from '../../engine/state'
import { healUnit } from '../forces/elements'
import { endSortie } from '../economy/economy'
import { radio, toast } from '../comms/radio'

// structures: construction, then garrison reconstitution — units resting at a
// FOB/HQ regain strength; a garrisoned site slowly repairs itself
export function constructionUpdate(dt: number): void {
  for (const s of S.structures) {
    if (s.buildT > 0) s.buildT = Math.max(0, s.buildT - dt)
  }

  for (const s of S.structures) {
    if (s.buildT > 0 || (s.kind !== 'FOB' && s.kind !== 'HQ')) continue
    let garrisoned = false
    for (const u of S.units) {
      if (u.side !== s.side) continue
      if (Math.hypot(u.x - s.x, u.y - s.y) > 450) continue
      garrisoned = true
      if (u.strength > 0 && u.strength < 100 && !u.targetId && S.t - u.lastCombatT > 15) {
        const before = u.strength
        healUnit(u, 0.8 * dt, 100, true) // reconstitution brings replacements — revive lost vics
        u.strMark = Math.max(u.strMark, u.strength)
        if (before < 100 && u.strength >= 100 && u.side === 'friend') {
          radio(u.label, 'arrive', 'RECONSTITUTED — FULL STRENGTH', u.x, u.y)
        }
      }
    }
    if (garrisoned && s.hp > 0 && s.hp < s.maxHp) {
      s.hp = Math.min(s.maxHp, s.hp + 0.4 * dt)
      if (s.strMark != null) s.strMark = Math.max(s.strMark, s.hp / s.maxHp)
    }
  }
}

// integrity reports on the friendly net
export function structReports(): void {
  for (const s of S.structures) {
    if (s.side !== 'friend') continue
    if (s.strMark == null) s.strMark = 1
    const frac = s.hp / s.maxHp
    for (const th of [0.75, 0.5, 0.25]) {
      if (frac <= th && s.strMark > th) {
        radio(s.label, 'struct', `UNDER ATTACK — INTEGRITY ${Math.max(0, Math.round(frac * 100))}%`, s.x, s.y)
        break
      }
    }
    s.strMark = Math.min(s.strMark, frac)
  }
}

// deaths: structures (units died first — the frozen order matters).
// Win/lose is NOT decided here any more: the active game mode's checkEnd runs
// right after this phase in SimLoop, so each mode owns its own ending.
export function structureDeaths(): void {
  for (let i = S.structures.length - 1; i >= 0; i--) {
    const s = S.structures[i]!
    if (s.hp <= 0) {
      S.wrecks.push({ x: s.x, y: s.y, side: s.side, type: s.kind, t: S.t })
      S.structContacts.delete(s.id)
      S.structures.splice(i, 1)
      toast(s.label + ' DESTROYED')
      // any aerostat tethered here goes down with the site
      for (let k = S.drones.length - 1; k >= 0; k--) {
        if (S.drones[k]!.tether === s.id) {
          radio(S.drones[k]!.label, 'loss', `AEROSTAT LOST WITH ${s.label}`, s.x, s.y)
          endSortie(S.drones[k]!)
          S.drones.splice(k, 1)
        }
      }
    }
  }
  while (S.wrecks.length > 60) S.wrecks.shift()
}
