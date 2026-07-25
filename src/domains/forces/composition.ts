// The force composition model (FORCE-MODEL.md) — INTERFACES + REGISTRIES +
// VERBS (stage 2: the engine ships verbs, packs ship nouns). What an ammo
// type / weapon system / troop kind / vehicle / unit template IS lives here;
// the actual US (and later OPFOR) DATA lives in packs/lib/* and is installed
// into these registries by packs/install.ts. buildRoster / stowage / the
// aggregate derivations are the verbs that read them.
import type { Mobility } from '../../world/mobility'
// type-only, and GameState's composition imports are type-only too — no runtime cycle
import type { Soldier, UnitVehicle } from '../../engine/GameState'
import { UNIT_TYPES, type UnitTypeKey } from './catalog'

// --- ammo ------------------------------------------------------------------
// Ammo types exist for STOWAGE + RESUPPLY identity: vehicles/soldiers stow
// rounds per ammo type and every weapon draws from that pool (a Bradley's coax
// and a tank's loader MG both draw 7.62 link). Terminal effect lives on the
// weapon (the weapon system includes its round's lethality).

export type AmmoClass = 'SMALL' | 'AT' | 'CANNON' | 'INDIRECT'

export interface AmmoType {
  key: string
  name: string
  cls: AmmoClass
}

export type AmmoKey = string
export const AMMO: Readonly<Record<string, AmmoType>> = {}

// --- weapon systems --------------------------------------------------------
// dps values are per-shooter sustained contributions on the existing arcade
// scale (they sum to a unit's dpsSoft/dpsHard). `load` = basic load carried
// per shooter/mount of this weapon, in rounds of its ammo type. `shotTime` =
// seconds per round in sustained engagement, for AMMO CONSUMPTION; weapons
// without it (small arms) don't deplete — their loads are effectively
// bottomless at engagement timescales (small-arms logistics is a later item).

export interface WeaponType {
  key: string
  name: string
  ammo: AmmoKey
  range: number
  dpsSoft: number
  dpsHard: number
  load: number
  shotTime?: number
}

export type WeaponKey = string
export const WEAPONS: Readonly<Record<string, WeaponType>> = {}

// --- troop kinds -----------------------------------------------------------

export interface TroopKind {
  key: string
  name: string
  weapons: readonly WeaponKey[]
}

export type TroopKindKey = string
export const TROOP_KINDS: Readonly<Record<string, TroopKind>> = {}

// --- vehicle types ---------------------------------------------------------
// `crew` staffs the vehicle (CREWMAN soldiers); `pax` is dismount seating.
// Multiple weapon systems per vic; each draws from the vic's stowage.

export interface VehicleType {
  key: string
  name: string
  crew: number
  pax: number
  weapons: readonly WeaponKey[]
  soft: number
  mob: Mobility
  speed: number
}

export type VehicleKey = string
export const VEHICLES: Readonly<Record<string, VehicleType>> = {}

// --- unit templates --------------------------------------------------------
// What each catalog unit type is composed of. `dismounts` are the fighting
// troops OUTSIDE vehicle crews (crews derive from VehicleType.crew).
// Doctrine numbers (sight, def, cost, glyph, indirect, logi...) stay on the
// UnitType — this table only carries the veh/troops make-up.
//
// NOTE on order: dismount arrays are listed in CASUALTY ORDER (see
// packs/lib/composition.ts) — that convention is part of the CONTRACT a pack's
// comp data signs up to, because elements die front-first.

export interface UnitComposition {
  unit: UnitTypeKey
  vehicles: readonly { type: VehicleKey; n: number }[]
  dismounts: readonly { kind: TroopKindKey; n: number }[]
}

export const COMPOSITIONS: Readonly<Record<string, UnitComposition>> = {}

// installer hook: caches derived from catalog data must die with the data
export function clearCompositionCaches(): void {
  stowMaxCache.clear()
}

// --- runtime roster construction -------------------------------------------
// Build a unit's actual soldiers/vehicles from its composition. Deterministic
// and rng-free (golden-neutral): fixed template order, sequential unit-local
// ids. Crews are CREWMAN soldiers assigned to their vehicle; dismounts ride
// with vehId null.
export function buildRoster(key: UnitTypeKey): { soldiers: Soldier[]; vehicles: UnitVehicle[] } {
  const c = COMPOSITIONS[key]
  if (!c) throw new Error(`no composition installed for unit type '${key}' — pack catalog incomplete`)
  const soldiers: Soldier[] = []
  const vehicles: UnitVehicle[] = []
  let sid = 1, vid = 1
  for (const { type, n } of c.vehicles) {
    const spec = VEHICLES[type]
    for (let i = 0; i < n; i++) {
      const v: UnitVehicle = { id: vid++, type, status: 'OK' }
      vehicles.push(v)
      for (let k = 0; k < spec.crew; k++) {
        soldiers.push({ id: sid++, kind: 'CREWMAN', status: 'FIT', vehId: v.id })
      }
    }
  }
  for (const { kind, n } of c.dismounts) {
    for (let i = 0; i < n; i++) soldiers.push({ id: sid++, kind, status: 'FIT', vehId: null })
  }
  return { soldiers, vehicles }
}

// --- munitions stowage ------------------------------------------------------
// A unit's basic load of CONSUMABLE munitions (weapons with a shotTime — AT
// rockets/missiles and cannon rounds), pooled per ammo type at unit level:
// the platoon cross-loads, so the pool is the honest granularity. Small-arms
// loads are tracked per-weapon `load` but not consumed (bottomless for now);
// INDIRECT rounds live on the existing Unit.ammo / fireMission system.
export type Stowage = Partial<Record<AmmoKey, number>>

export function initialStowage(key: UnitTypeKey): Stowage {
  const c = COMPOSITIONS[key]
  const stow: Stowage = {}
  if (!c) return stow
  const add = (wk: WeaponKey, n: number) => {
    const w = WEAPONS[wk]
    if (w.shotTime == null) return
    stow[w.ammo] = (stow[w.ammo] ?? 0) + w.load * n
  }
  for (const { type, n } of c.vehicles) for (const wk of VEHICLES[type].weapons) add(wk, n)
  for (const { kind, n } of c.dismounts) for (const wk of TROOP_KINDS[kind].weapons) add(wk, n)
  return stow
}

// full-basic-load reference for resupply (immutable — do NOT mutate)
const stowMaxCache = new Map<UnitTypeKey, Stowage>()
export function stowageMax(key: UnitTypeKey): Stowage {
  let s = stowMaxCache.get(key)
  if (!s) { s = initialStowage(key); stowMaxCache.set(key, s) }
  return s
}

// --- derivation ------------------------------------------------------------
// Aggregate stats computed FROM composition, for comparison against the
// hand-tuned catalog values (and any future retune audits).

export interface DerivedAggregates {
  unit: UnitTypeKey
  veh: number
  crews: number
  dismounts: number
  pax: number               // everyone: crews + dismounts
  // dismounted fighting power (soldier weapons only — crews fight via vics)
  disSoft: number
  disHard: number
  // mounted fighting power (vehicle weapon systems)
  mtdSoft: number
  mtdHard: number
  // total anti-armor rounds carried (AT-class ammo across the whole unit)
  atRounds: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function deriveAggregates(key: UnitTypeKey): DerivedAggregates {
  const c = COMPOSITIONS[key]
  let veh = 0, crews = 0, dismounts = 0
  let disSoft = 0, disHard = 0, mtdSoft = 0, mtdHard = 0, atRounds = 0

  for (const { type, n } of c.vehicles) {
    const v = VEHICLES[type]
    veh += n
    crews += v.crew * n
    for (const wk of v.weapons) {
      const w = WEAPONS[wk]
      mtdSoft += w.dpsSoft * n
      mtdHard += w.dpsHard * n
      if (AMMO[w.ammo].cls === 'AT') atRounds += w.load * n
    }
  }
  for (const { kind, n } of c.dismounts) {
    dismounts += n
    for (const wk of TROOP_KINDS[kind].weapons) {
      const w = WEAPONS[wk]
      disSoft += w.dpsSoft * n
      disHard += w.dpsHard * n
      if (AMMO[w.ammo].cls === 'AT') atRounds += w.load * n
    }
  }
  return {
    unit: key, veh, crews, dismounts, pax: crews + dismounts,
    disSoft: r2(disSoft), disHard: r2(disHard),
    mtdSoft: r2(mtdSoft), mtdHard: r2(mtdHard),
    atRounds,
  }
}

// side-by-side comparison row against the hand-tuned catalog (for the Phase 1
// report and any future retune audits)
export interface ComparisonRow {
  unit: UnitTypeKey
  derived: DerivedAggregates
  catalog: {
    veh: number; troops: number
    dpsSoft: number; dpsHard: number
    mtdSoft: number | null; mtdHard: number | null   // via carrier fireMul, if any
  }
}

export function compareAll(): ComparisonRow[] {
  return Object.keys(COMPOSITIONS).map((key) => {
    const t = UNIT_TYPES[key]
    return {
      unit: key,
      derived: deriveAggregates(key),
      catalog: {
        veh: t.carrier ? t.carrier.veh : t.veh,
        troops: t.troops,
        dpsSoft: t.dpsSoft, dpsHard: t.dpsHard,
        mtdSoft: t.carrier ? r2(t.dpsSoft * t.carrier.fireMul) : null,
        mtdHard: t.carrier ? r2(t.dpsHard * t.carrier.fireMul) : null,
      },
    }
  })
}
