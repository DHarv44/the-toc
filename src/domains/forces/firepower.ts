// Derived firepower (FORCE-MODEL.md, Phase 3): a unit's combat output computed
// from its LIVE roster — the alive shooters whose weapons still have ammo —
// instead of the catalog's hand-tuned dps pools. This is where the composition
// model becomes gameplay:
//  - casualties remove specific weapons (lose the Javelin teams, lose the
//    anti-armor punch; lose two Bradleys, lose their 25mm/TOW)
//  - consumable munitions deplete (AT rockets/missiles, cannon rounds) and a
//    winchester unit's small arms CANNOT kill armor
//  - mounted carrier units fight with their vehicles' weapon systems,
//    dismounted ones with their soldiers' — the old fireMul fudge is gone
// Exposure mirrors the element rules: mounted → vehicles, dismounted → foot
// soldiers, integral units → both. Crews serve their vics, not rifles.
import type { Unit } from '../../engine/GameState'
import { UNIT_TYPES } from './catalog'
import {
  AMMO, TROOP_KINDS, VEHICLES, WEAPONS,
  type AmmoKey, type WeaponKey,
} from './composition'
import { netRadio } from '../comms/radio'

export interface FirepowerConsumer { ammo: AmmoKey; rate: number } // rounds/sec while firing
export interface Firepower {
  dpsSoft: number
  dpsHard: number
  consumers: FirepowerConsumer[]
}

// What this unit can put on a target of the given softness right now.
// AT-class weapons only engage targets with a meaningful hard fraction —
// nobody volleys Javelins at a rifle squad.
export function unitFirepower(u: Unit, tgtSoft: number): Firepower {
  const type = UNIT_TYPES[u.type]
  const hardFrac = 1 - tgtSoft
  let soft = 0, hard = 0
  const cons = new Map<AmmoKey, number>()

  const fire = (wk: WeaponKey) => {
    const w = WEAPONS[wk]
    if (w.shotTime != null) {
      if ((u.stowage[w.ammo] ?? 0) <= 0) return                 // dry — weapon silent
      if (AMMO[w.ammo].cls === 'AT' && hardFrac < 0.1) return   // no missiles at pure soft
      cons.set(w.ammo, (cons.get(w.ammo) ?? 0) + 1 / w.shotTime)
    }
    soft += w.dpsSoft
    hard += w.dpsHard
  }

  const useVics = !type.carrier || u.mounted
  const useDis = !type.carrier || !u.mounted
  if (useVics) {
    for (const v of u.vehicles) {
      if (v.status !== 'OK') continue
      for (const wk of VEHICLES[v.type].weapons) fire(wk)
    }
  }
  if (useDis) {
    for (const s of u.soldiers) {
      if (s.status !== 'FIT' || s.vehId !== null) continue
      for (const wk of TROOP_KINDS[s.kind].weapons) fire(wk)
    }
  }
  return {
    dpsSoft: soft, dpsHard: hard,
    consumers: [...cons].map(([ammo, rate]) => ({ ammo, rate })),
  }
}

// Burn stowage for the weapons that fired this tick; call WINCHESTER on the
// net when a munition type runs dry (once — the flag clears on resupply).
export function consumeAmmo(u: Unit, consumers: FirepowerConsumer[], dt: number): void {
  for (const c of consumers) {
    const cur = u.stowage[c.ammo] ?? 0
    if (cur <= 0) continue
    const next = Math.max(0, cur - c.rate * dt)
    u.stowage[c.ammo] = next
    if (next <= 0 && !u.winch?.[c.ammo]) {
      ;(u.winch ??= {})[c.ammo] = true
      netRadio(u, 'request', `WINCHESTER ${AMMO[c.ammo].name.toUpperCase()} — RESUPPLY REQUIRED`, u.x, u.y)
    }
  }
}
