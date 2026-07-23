// Per-vic target designation resolution, shared by drone orders and the gunship.
// Ported verbatim from src/game/sim.js.
import { S } from '../../engine/state'
import type { TargetRef } from '../../engine/GameState'
import type { Vec2 } from '../../world/WorldMap'
import { elemWorld } from '../forces/elements'

// resolve a target descriptor to a live element's world position (null if dead/gone)
export function targetPoint(t: TargetRef): Vec2 | null {
  const u = S.units.find(x => x.id === t.unitId && x.strength > 0)
  if (!u || !u.elements) return null
  const el = u.elements[t.ei]
  if (!el || !el.alive) return null
  return elemWorld(u, el)
}
