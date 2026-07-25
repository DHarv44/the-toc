// Economy tick slice: discrete supply lifts netted against upkeep, both sides
// on the same clock. Ported verbatim from src/game/sim.js tick().
import { S } from '../../engine/state'
import { SUPPLY_INTERVAL, upkeepPerMin } from './economy'

// Supply arrives as discrete lifts rather than a continuously spinning counter: a
// resupply either landed or it didn't. Upkeep is netted off the same lift so the
// readout moves in one clean step instead of two fighting each other.
export function supplyUpdate(dt: number): void {
  // The PLAYER has no point economy anymore — nothing is purchased
  // (ASSET-REQUESTS.md): capability comes from the force pool, physical
  // logistics and division requests. Only the OPFOR still banks and pays —
  // its internal economy is AI pacing, invisible to the player.
  if (S.waves) return // waves: the scripted schedule IS the opposition
  S.supplyT = (S.supplyT || 0) + dt
  while (S.supplyT >= SUPPLY_INTERVAL) {
    S.supplyT -= SUPPLY_INTERVAL
    const eDraw = Math.round(upkeepPerMin('hostile') * SUPPLY_INTERVAL / 60)
    S.enemyResources = Math.max(0, S.enemyResources + (S.enemySupplyLift || 0) - eDraw)
  }
}
