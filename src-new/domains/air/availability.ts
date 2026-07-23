// Airframe scarcity: concurrent caps and sortie turnaround. Ported verbatim
// from src/game/sim.js.
import { S } from '../../engine/state'
import type { Drone } from '../../engine/GameState'
import { DRONE_TYPES, type DroneTypeKey } from './catalog'

export interface AirAvailability {
  active: number
  max: number
  cooldown: number
  capped: boolean
  ready: boolean
}

// Availability of an airframe type: how many are up against its cap, and whether the
// type is still in turnaround from the last sortie. Used both to gate deployDrone and
// to render the palette, so the player sees the block before clicking rather than after.
export function airAvailability(typeKey: DroneTypeKey): AirAvailability {
  const spec = DRONE_TYPES[typeKey]
  const active = S.drones.reduce((n, d) => n + (d.type === typeKey ? 1 : 0), 0)
  const max = spec && spec.maxActive != null ? spec.maxActive : Infinity
  const until = S.airCooldown[typeKey] || 0
  const cooldown = Math.max(0, until - S.t)
  return { active, max, cooldown, capped: active >= max, ready: active < max && cooldown <= 0 }
}

// Stamp the turnaround clock when a sortie ends — RTB recovery, bingo, shootdown or
// crash all count. Called from every path that removes a drone from S.drones.
export function endSortie(d: Drone): void {
  const spec = DRONE_TYPES[d.type]
  if (spec && spec.cooldown) S.airCooldown[d.type] = S.t + spec.cooldown
}
