// Supply economy and force-cap bookkeeping. Ported verbatim from src/game/sim.js.
// Lifts land every SUPPLY_INTERVAL seconds in whole multiples of 10, so the
// counter steps rather than spins. Upkeep is a fixed share of a unit's purchase
// cost per minute: a unit costs roughly UPKEEP_DIVISOR minutes of its own price
// to keep in the field, which is what stops a standing army from accumulating
// for free.
import { S } from '../../engine/state'
import type { Side, Drone } from '../../engine/GameState'
import { UNIT_TYPES, type UnitTypeKey } from '../forces/catalog'
import { DRONE_TYPES, type DroneTypeKey } from '../air/catalog'
import { fieldCooldownFor } from './difficulty'

export const SUPPLY_INTERVAL = 3
export const UPKEEP_DIVISOR = 12

// running upkeep of a side's units, in supply per minute
export function upkeepPerMin(side: Side = 'friend'): number {
  let n = 0
  for (const u of S.units) {
    if (u.side !== side || u.strength <= 0) continue
    // hostile garrisons are locally sustained and pre-positioned — only manoeuvre
    // battlegroups draw on the OPFOR's mobile supply, so a static defence doesn't
    // starve its ability to ever attack
    if (side === 'hostile' && u.bgGroup == null) continue
    n += (UNIT_TYPES[u.type]?.cost || 0) / UPKEEP_DIVISOR
  }
  return n
}

// what a battlegroup template costs to field, from its members' own prices
export function templateCost(comp: readonly UnitTypeKey[]): number {
  return comp.reduce((n, t) => n + (UNIT_TYPES[t]?.cost || 0), 0)
}

// Ground force headroom for a side. Hostile garrisons don't count — they're the map's
// furniture, not the OPFOR's manoeuvre force, and counting them would cap the attack
// out of existence on a town-heavy map.
export function forceCount(side: Side = 'friend'): number {
  let n = 0
  for (const u of S.units) {
    if (u.side !== side || u.strength <= 0) continue
    if (side === 'hostile' && u.bgGroup == null) continue
    n++
  }
  return n
}

export function forceCap(side: Side = 'friend'): number {
  return side === 'hostile' ? (S.enemyForceCap || 0) : (S.forceCap || 0)
}

export interface UnitAvailability {
  used: number
  max: number
  cooldown: number
  capped: boolean
  ready: boolean
}

// Availability of a ground unit type: force headroom plus its per-type cooldown. Mirrors
// airAvailability, so the palette can grey a row before it's clicked either way.
export function unitAvailability(typeKey: UnitTypeKey, side: Side = 'friend'): UnitAvailability {
  const cd = (S.fieldCooldown[side] || {})[typeKey] || 0
  const cooldown = Math.max(0, cd - S.t)
  const used = forceCount(side), max = forceCap(side)
  return { used, max, cooldown, capped: used >= max, ready: used < max && cooldown <= 0 }
}

export function stampFieldCooldown(typeKey: UnitTypeKey, side: Side): void {
  const perSide = S.fieldCooldown[side] || (S.fieldCooldown[side] = {})
  perSide[typeKey] = S.t + fieldCooldownFor(UNIT_TYPES[typeKey]?.cost || 0)
}

// gross supply per minute before upkeep
export function incomePerMin(): number {
  return (S.supplyLift || 0) * (60 / SUPPLY_INTERVAL)
}

// --- airframe scarcity (moved here from air/ so installation teardown can stamp
// turnaround without importing the air domain — this is the airframe half of the
// same fielding economy as unitAvailability/stampFieldCooldown above) ----------

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
