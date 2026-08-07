// ESCORT — one element guards another, wherever it goes.
//
// The case that forced it: a LOG platoon on supply runs drives the same MSR
// all day with nothing but its own door guns, and the only way to protect it
// was to hand-shepherd an infantry platoon leg by leg. An escort is a standing
// duty instead: TRAIL THE WARD. The escort keeps station behind whoever it is
// guarding, re-pathing as the ward moves, halting when it halts — and when
// contact comes it fights with its own drills and ROE like any other element,
// which is the entire point of it being there.
//
// The duty is DELIBERATELY dumb about what the ward is doing. It does not know
// about convoy phases or route status; it knows where the ward is and stays
// with it. That is what makes it compose: escort a convoy truck, a recovery
// element driving out, an engineer sweeping a route — same verb.
//
// Any manual order to the escort RELEASES the duty (a commander who orders an
// escort somewhere else has re-tasked it, and a silent snap-back to the ward
// would fight them for the unit).
import { S } from '../../engine/state'
import type { Unit } from '../../engine/GameState'
import { findPath } from '../../world/pathfinding'
import { effStats } from './elements'
import { radio } from '../comms/radio'

/** metres behind the ward the escort keeps station */
const TRAIL = 140
/** slack before the escort bothers to move/re-path */
const SLACK = 200

export function orderEscort(escortIds: number[], wardId: number): void {
  const ward = S.units.find(x => x.id === wardId)
  if (!ward || ward.strength <= 0) return
  for (const id of escortIds) {
    if (id === wardId) continue
    const u = S.units.find(x => x.id === id)
    if (!u || u.side !== ward.side || u.strength <= 0) continue
    // an escort is a fresh tasking: whatever it was doing ends here
    u.escortId = wardId
    u.convoy = null
    u.attackId = null; u.attackMove = false
    u.groupId = null; u.colIdx = null; u.leadId = null; u.colS = undefined
    u.heldRoute = null; u.resumeDest = undefined
    if (u.side === 'friend') {
      radio(u.label, 'move', `TAKING ESCORT ON ${ward.label}`, u.x, u.y)
    }
  }
}

export function releaseEscort(unitId: number): void {
  const u = S.units.find(x => x.id === unitId)
  if (!u || u.escortId == null) return
  u.escortId = null
  if (u.side === 'friend') radio(u.label, 'move', 'RELEASED FROM ESCORT', u.x, u.y)
}

/** The station the escort wants: trailing the ward, off its heading. */
function station(ward: Unit): { x: number; y: number } {
  return {
    x: ward.x - Math.cos(ward.heading) * TRAIL,
    y: ward.y - Math.sin(ward.heading) * TRAIL,
  }
}

export function escortUpdate(): void {
  for (const u of S.units) {
    if (u.escortId == null || u.strength <= 0) continue
    const ward = S.units.find(x => x.id === u.escortId)
    if (!ward || ward.strength <= 0) {
      u.escortId = null
      if (u.side === 'friend') radio(u.label, 'move', 'WARD LOST — HOLDING POSITION', u.x, u.y)
      continue
    }
    // in a fight or mid-drill, the drills own the unit; the duty resumes after
    if (u.targetId != null || u.breaking) continue
    const st = station(ward)
    const d = Math.hypot(u.x - st.x, u.y - st.y)
    if (d <= SLACK) {
      // on station: stand where you are while the ward stands
      if (!ward.path.length && u.path.length) { u.path = []; u.legs = [] }
      continue
    }
    // off station: re-path if there is no route or the route has gone stale
    const end = u.path.length ? u.path[u.path.length - 1]! : null
    if (!end || Math.hypot(end.x - st.x, end.y - st.y) > SLACK) {
      const p = S.map ? findPath(S.map, u.x, u.y, st.x, st.y, effStats(u).mob, 'fastest') : null
      if (p) {
        u.path = p
        u.legs = [{ x: st.x, y: st.y, n: p.length }]
        u.state = 'moving'
      }
    }
  }
}
