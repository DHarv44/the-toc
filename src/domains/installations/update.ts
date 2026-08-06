// Installations tick slices: construction, garrison reconstitution, integrity
// reports, and structure deaths (with win/lose and tethered-aerostat teardown).
// Ported verbatim from src/game/sim.js tick().
import { S } from '../../engine/state'
import type { Structure } from '../../engine/GameState'
import { FACILITIES, type AidEffect, type RepairEffect } from './catalog'
import { medicalUpdate, repairUpdate } from '../forces/casualties'
import { endSortie } from '../economy/economy'
import { radio, toast } from '../comms/radio'

// An AID facility is tentage — it treats nobody without medics (v2): either
// the battalion MED PLT still garrisoned at the HQ (the aid station's default
// home), or a fielded MED detachment physically at the base. Enemy bases keep
// their implicit full set — their economy is the lever.
function medPresent(s: Structure): boolean {
  if (s.side !== 'friend') return true
  if (S.units.some(u => u.side === 'friend' && u.type === 'MED' && u.strength > 0
    && Math.hypot(u.x - s.x, u.y - s.y) < 450)) return true
  return s.kind === 'HQ' && !!S.org?.slots.some(sl => sl.tf && sl.type === 'MED'
    && sl.unitId == null && sl.soldiers.some(x => x.status === 'FIT'))
}

// structures: construction, then garrison reconstitution (P2.5, honest):
// a manned AID station returns LIGHT wounds to duty, a MOTORPOOL repairs
// DAMAGED vics. Nothing resurrects — replacements are P3's job.
export function constructionUpdate(dt: number): void {
  for (const s of S.structures) {
    if (s.buildT > 0) s.buildT = Math.max(0, s.buildT - dt)
  }

  // RETURN TO GARRISON arrivals: a unit that reached its base stands down —
  // off the map, back into its org slot, garrisoned AT that base (roster is
  // shared by reference, so nothing is lost). This is how FOBs gain garrisons.
  for (let i = S.units.length - 1; i >= 0; i--) {
    const u = S.units[i]!
    if (u.rtgBase == null || u.side !== 'friend' || u.strength <= 0) continue
    const st = S.structures.find(s => s.id === u.rtgBase && s.side === 'friend')
    if (!st) { u.rtgBase = null; continue } // base lost while driving — carry on fielded
    if (Math.hypot(u.x - st.x, u.y - st.y) > 300 || u.path.length) continue
    const sl = S.org?.slots.find(x => x.unitId === u.id)
    if (sl) {
      sl.unitId = null
      sl.garrisonAt = st.id
      radio(u.label, 'arrive', `IN GARRISON AT ${st.label} — STANDING DOWN`, st.x, st.y)
    }
    S.units.splice(i, 1)
  }

  for (const s of S.structures) {
    if (s.buildT > 0 || (s.kind !== 'FOB' && s.kind !== 'HQ')) continue
    // the engine runs the VERBS; the parameters come from the installed
    // facility SPECS (pack data) — rates and radii are never hard-coded here
    const fac = s.side === 'friend' ? (s.facilities ?? []) : ['MOTORPOOL', 'AID']
    let aid: AidEffect | null = null
    let rep: RepairEffect | null = null
    for (const k of fac) {
      const fx = FACILITIES[k]?.effects
      if (fx?.aid && !aid) aid = fx.aid
      if (fx?.repair && !rep) rep = fx.repair
    }
    if (aid && !medPresent(s)) aid = null
    let garrisoned = false
    for (const u of S.units) {
      if (u.side !== s.side) continue
      const d = Math.hypot(u.x - s.x, u.y - s.y)
      if (d > 450) continue
      garrisoned = true
      if (u.strength > 0 && !u.targetId && S.t - u.lastCombatT > 15) {
        const before = u.strength
        if (aid && d <= aid.radius) medicalUpdate(u, dt, aid.careRate)
        if (rep && d <= rep.radius) repairUpdate(u, dt, rep.secsPerVic)
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
  while (S.wrecks.length > 240) S.wrecks.shift()
}
