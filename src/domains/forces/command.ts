// COMMAND — who the player may order.
//
// The rule (settled 2026-08-02): COMMAND DERIVES FROM TASK ORGANIZATION.
// There is no player/AI flag on a unit. A friendly platoon is yours when it
// belongs to the battalion you command, or when the scenario task-organized
// it to you (ATTACHED — the same concept the pack already uses for the
// engineers). Everything else friendly on the map belongs to a sister
// formation: you see it, it fights, you do not order it.
//
// Phase 1 behaviour for those neighbours is deliberate and small: they are
// simply not selectable and not in your FORCES rail, so they hold where the
// scenario placed them and defend themselves through the normal combat
// update. Making them MANEUVER is the friendly-commander AI (phase 2) — this
// module is the seam that work will plug into.
import { S } from '../../engine/state'
import type { Unit } from '../../engine/GameState'

/** Is this unit the player's to order? */
export function underPlayerCommand(u: Unit): boolean {
  if (u.side !== 'friend') return false
  if (!u.bn) return true                 // unauthored ownership = the player's own
  if (u.attached) return true            // task-organized to this command
  return u.bn === S.playerBn
}

/** A friendly unit the player does NOT command — a sister formation's. */
export const isAlliedAi = (u: Unit): boolean =>
  u.side === 'friend' && !underPlayerCommand(u)

/** Every unit the player commands (the FORCES rail's force, the selectable set). */
export const playerUnits = (): Unit[] => S.units.filter(underPlayerCommand)

/** Does the player command this installation? A sister brigade's FOB is on
 *  your map and on your side; its garrison is not yours to field. */
export function commandsStructure(st: { side: string; formation?: string }): boolean {
  if (st.side !== 'friend') return false
  if (!st.formation) return true
  return st.formation === S.playerBn
}
