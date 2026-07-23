// Economy tick slice: discrete supply lifts netted against upkeep, both sides
// on the same clock. Ported verbatim from src/game/sim.js tick().
import { S } from '../../engine/state'
import { SUPPLY_INTERVAL, upkeepPerMin } from './economy'

// Supply arrives as discrete lifts rather than a continuously spinning counter: a
// resupply either landed or it didn't. Upkeep is netted off the same lift so the
// readout moves in one clean step instead of two fighting each other.
export function supplyUpdate(dt: number): void {
  // Base Defense (waves): the passive economy is OFF — no lifts, no upkeep.
  // You bank what you're given and spend deliberately; payouts come from the
  // wave scheduler when an assault is repelled.
  if (S.waves) return
  S.supplyT = (S.supplyT || 0) + dt
  while (S.supplyT >= SUPPLY_INTERVAL) {
    S.supplyT -= SUPPLY_INTERVAL
    const draw = Math.round(upkeepPerMin('friend') * SUPPLY_INTERVAL / 60)
    S.resources = Math.max(0, S.resources + (S.supplyLift || 0) - draw)
    // the OPFOR banks and pays on the same clock
    const eDraw = Math.round(upkeepPerMin('hostile') * SUPPLY_INTERVAL / 60)
    S.enemyResources = Math.max(0, S.enemyResources + (S.enemySupplyLift || 0) - eDraw)
  }
}
