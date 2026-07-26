// Installation QUERIES — read-only questions the UI (and other domains) ask
// about bases and the services they provide. Orders live in orders.ts, the
// tick lives in update.ts; this is the read side.
import { S } from '../../engine/state'
import type { Structure, Unit } from '../../engine/GameState'
import { FACILITIES, type RepairEffect } from './catalog'

// The repair service a base actually provides, from its INSTALLED facilities
// (pack data — never hard-coded here). Enemy bases carry the implicit set.
export function repairSpecOf(s: Structure): RepairEffect | null {
  if (s.buildT > 0 || (s.kind !== 'FOB' && s.kind !== 'HQ')) return null
  const fac = s.side === 'friend' ? (s.facilities ?? []) : ['MOTORPOOL', 'AID']
  for (const k of fac) {
    const rep = FACILITIES[k]?.effects?.repair
    if (rep) return rep
  }
  return null
}

// Is this unit's motorpool actually being WORKED right now, and by whom?
//
// The distinction is the whole point of a maintenance board: a damaged vehicle
// sitting at a base with a motorpool is IN MAINTENANCE and has a clock on it;
// the same vehicle broken down forward is DEADLINED and nothing is happening
// to it until somebody drags it back. Same rule the tick runs (installations/
// update.ts) — that loop is structure-major for the tick's sake, this is the
// unit-major read of it.
export function repairSiteOf(u: Unit): { site: Structure; spec: RepairEffect } | null {
  if (u.strength <= 0 || u.targetId || S.t - u.lastCombatT <= 15) return null
  for (const s of S.structures) {
    if (s.side !== u.side) continue
    const spec = repairSpecOf(s)
    if (!spec) continue
    const d = Math.hypot(u.x - s.x, u.y - s.y)
    if (d <= 450 && d <= spec.radius) return { site: s, spec }
  }
  return null
}
