// The sub-element layer: each unit is a formation of individual vics/troops.
// The unit stays the command/movement/AI entity; elements are the SPATIAL and
// exposure layer — where each platform stands, which set is exposed in the
// current posture. Pure geometry/stat helpers only: damage, casualties and
// recovery live in casualties.ts (the roster is the source of truth, P2.5).
import type { Unit, UnitElement } from '../../engine/GameState'
import type { Vec2 } from '../../world/WorldMap'
import { UNIT_TYPES, type UnitType, type UnitTypeKey } from './catalog'

// Effective stats for a unit's current posture. Carrier types swap between
// mounted (vehicle mobility/protection, scaled firepower) and dismounted
// (base infantry stats). DEVIATION (flagged): the old sim cached the variants
// as _mtd/_dis fields ON the catalog object; here they live in a module cache
// so the catalog stays immutable data. Same inputs, same outputs.
const effCache = new Map<UnitTypeKey, { mtd: UnitType; dis: UnitType }>()
export function effStats(u: Unit): UnitType {
  const t = UNIT_TYPES[u.type]
  if (!t.carrier) return t
  let v = effCache.get(u.type)
  if (!v) {
    const c = t.carrier
    v = {
      mtd: {
        ...t, mob: c.mob, speed: c.speed, soft: c.soft,
        sight: t.sight * 0.85, dpsSoft: t.dpsSoft * c.fireMul, dpsHard: t.dpsHard * c.fireMul,
      },
      dis: { ...t },
    }
    effCache.set(u.type, v)
  }
  return u.mounted ? v.mtd : v.dis
}

// damage taken multiplier for a prepared defender
export function postureFactor(t: Unit): number {
  if (t.posture !== 'dig' || !t.digT) return 1
  const def = UNIT_TYPES[t.type].def
  if (!def) return 1
  return 1 - (1 - def.factor) * t.digT
}

function bgOffset(n: number, seed: number): { fwd: number; lat: number } {
  const row = Math.ceil(n / 2)
  const side = n === 0 ? 0 : (n % 2 === 1 ? -1 : 1)
  return { fwd: -row * 28 - (seed % 7), lat: side * (22 + row * 14) + ((seed * 13) % 9) - 4 }
}

export function initElements(u: Unit): void {
  const type = UNIT_TYPES[u.type]
  const seed = u.formSeed | 0
  const els: UnitElement[] = []
  const nVeh = type.carrier ? type.carrier.veh : type.veh
  for (let n = 0; n < nVeh; n++) {
    const o = bgOffset(n, (seed * 10 + n) | 0)
    els.push({ ox: o.fwd, oy: o.lat, kind: 'veh', alive: true })
  }
  const nTrp = type.troops > 0 ? Math.max(1, Math.round(type.troops / 4)) : 0
  for (let n = 0; n < nTrp; n++) {
    const o = bgOffset(n + 1, (seed * 17 + n * 3) | 0)
    els.push({ ox: o.fwd * 0.5, oy: o.lat * 0.7, kind: 'troop', alive: true })
  }
  if (!els.length) els.push({ ox: 0, oy: 0, kind: 'troop', alive: true })
  u.elements = els
}

// world position of an element given the unit's heading
export function elemWorld(u: Unit, el: UnitElement): Vec2 {
  const s = Math.sin(u.heading), c = Math.cos(u.heading)
  return { x: u.x + c * el.ox - s * el.oy, y: u.y + s * el.ox + c * el.oy }
}

// which elements are "exposed": carrier units show vics when mounted, troops when
// dismounted; integral units (recon/armor/guns) always show their full set.
export function elemExposed(u: Unit, el: UnitElement): boolean {
  const type = UNIT_TYPES[u.type]
  if (!type.carrier) return true
  return u.mounted ? el.kind === 'veh' : el.kind === 'troop'
}

export function exposedList(u: Unit): UnitElement[] {
  return u.elements.filter(el => elemExposed(u, el))
}
