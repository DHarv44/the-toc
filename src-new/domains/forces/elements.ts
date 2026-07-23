// The sub-element layer: each unit is a formation of individual vics/troops.
// The unit stays the command/movement/AI entity; elements let precision fires
// hit specific platforms and each destroyed vic leave its own wreck/explosion.
// Ported verbatim from src/game/sim.js.
import { S } from '../../engine/state'
import type { Unit, UnitElement, ShellKind } from '../../engine/GameState'
import type { Vec2 } from '../../world/WorldMap'
import { T_FOREST, T_URBAN } from '../../world/WorldMap'
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

export function killElement(u: Unit, el: UnitElement): void {
  if (!el.alive) return
  el.alive = false
  if (el.kind === 'veh') {
    const w = elemWorld(u, el)
    S.wrecks.push({ x: w.x, y: w.y, side: u.side, type: u.type, t: S.t })
    while (S.wrecks.length > 140) S.wrecks.shift()
  }
}

// keep the exposed element count in step with the unit's strength: kill front-most
// vics as it drops (attrition), revive rear-most only when told to (reinforcement).
export function syncElements(u: Unit, allowRevive = false): void {
  const exp = exposedList(u)
  if (!exp.length) return
  if (u.strength <= 0) { for (const el of exp) killElement(u, el); return }
  const target = Math.max(1, Math.round(u.strength / 100 * exp.length))
  let aliveN = exp.reduce((n, el) => n + (el.alive ? 1 : 0), 0)
  while (aliveN > target) {
    const el = exp.find(e => e.alive)
    if (!el) break
    killElement(u, el); aliveN--
  }
  if (allowRevive) {
    while (aliveN < target) {
      let el: UnitElement | null = null
      for (let i = exp.length - 1; i >= 0; i--) if (!exp[i]!.alive) { el = exp[i]!; break }
      if (!el) break
      el.alive = true; aliveN++
    }
  }
}

// precision/blast fires resolve against individual elements by distance, so a
// direct hit kills the vic you aimed at; sub-lethal splash chips aggregate strength.
export function precisionBlast(
  u: Unit, ix: number, iy: number, blast: number, dmg: number,
  shell?: ShellKind, apMul = 1,
): void {
  const type = UNIT_TYPES[u.type]
  const icm = shell === 'ICM'
  const armorFactor = icm ? type.soft * 0.55 + (1 - type.soft) * 1.0 : type.soft * 1.0 + (1 - type.soft) * 0.45
  const map = S.map!
  const terr = map.terr[map.cellAt(u.x, u.y)]
  const cover = terr === T_URBAN ? 0.65 : terr === T_FOREST ? 0.85 : 1
  const post = postureFactor(u)
  const exp = exposedList(u)
  if (!exp.length) return
  let killed = 0, residual = 0
  for (const el of exp) {
    if (!el.alive) continue
    const w = elemWorld(u, el)
    const dEl = Math.hypot(w.x - ix, w.y - iy)
    // exposed foot mobiles catch fragmentation over a wider radius (anti-personnel splash)
    const elBlast = el.kind === 'troop' ? blast * apMul : blast
    if (dEl >= elBlast) continue
    const lethality = dmg * (1 - dEl / elBlast) * armorFactor * cover * post * (S.damageMul ?? 1)
    if (lethality >= 18) { killElement(u, el); killed++ }
    else residual += lethality
  }
  if (killed) u.strength = Math.max(0, u.strength - killed / exp.length * 100)
  if (residual) u.strength = Math.max(0, u.strength - residual * 0.12)
}

export function healUnit(u: Unit, points: number, cap: number, revive: boolean): void {
  if (points <= 0 || u.strength >= cap) return
  u.strength = Math.min(cap, u.strength + points)
  if (revive) syncElements(u, true)
}
