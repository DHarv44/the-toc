// The tasking engine issues orders through the SAME player-legal functions
// the UI calls (the iron rule) — which means orders.ts cannot tell the
// commander's calls from the player's by looking at the caller. This guard
// is how it tells: the engine raises the flag around its own issuance, and
// the manual-order detach hook no-ops while it is up.
//
// Deliberately tiny and cycle-free: orders.ts imports THIS; the tasking
// engine imports orders. Nothing here imports either.
import { S } from '../../engine/state'
import type { Unit } from '../../engine/GameState'
import { netRadio } from '../comms/radio'

let issuing = false

/** Run `fn` as the tasking commander: orders it issues do not detach. */
export function withTaskingIssue<T>(fn: () => T): T {
  issuing = true
  try { return fn() } finally { issuing = false }
}

/** A MANUAL order to a member of a tasked team detaches that element from
 *  the tasking; the tasking continues with the rest (TASKING.md call 3 —
 *  the escort/roadworks convention: the player grabbing the stick is never
 *  refused, and never silent). Called from orderMove/orderAttack/orderHold. */
export function taskingDetach(u: Unit): void {
  if (issuing || u.side !== 'friend') return
  for (const tk of S.taskings) {
    if (tk.state !== 'moving' && tk.state !== 'actions') continue
    const team = S.teams.find(t => t.id === tk.teamId)
    if (!team || !team.members.includes(u.id) || tk.detached.includes(u.id)) continue
    tk.detached.push(u.id)
    netRadio(u, 'move', `${u.label} DETACHED FROM TASKING — UNDER DIRECT ORDERS`, u.x, u.y)
  }
}
