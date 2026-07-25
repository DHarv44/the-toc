// The force composition model (FORCE-MODEL.md, Phase 1): what every unit is
// MADE OF — vehicles, troops, weapon systems, ammo — as typed, immutable
// catalog templates. Same idiom as UNIT_TYPES (literal tables + `satisfies` +
// literal-union keys); composition over inheritance, no entity classes.
//
// Phase 1 is ADDITIVE and golden-neutral: nothing in the sim imports this yet.
// `deriveAggregates` computes the old hand-tuned aggregate stats (dps pools,
// element counts) from composition so the two models can be compared before
// runtime rosters (Phase 2) and derived combat (Phase 3) switch over.
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

const AMMO_LITERAL = {
  A_556: { key: 'A_556', name: '5.56mm ball/link', cls: 'SMALL' },
  A_762: { key: 'A_762', name: '7.62mm link', cls: 'SMALL' },
  A_50: { key: 'A_50', name: '.50 BMG link', cls: 'SMALL' },
  R_AT4: { key: 'R_AT4', name: 'AT4 84mm rocket', cls: 'AT' },
  M_JAVELIN: { key: 'M_JAVELIN', name: 'Javelin missile', cls: 'AT' },
  M_TOW: { key: 'M_TOW', name: 'TOW missile', cls: 'AT' },
  A_25MM: { key: 'A_25MM', name: '25mm HE/AP mix', cls: 'CANNON' },
  A_120MM: { key: 'A_120MM', name: '120mm sabot/MPAT mix', cls: 'CANNON' },
  MORT_81: { key: 'MORT_81', name: '81mm mortar', cls: 'INDIRECT' },
  HOW_155: { key: 'HOW_155', name: '155mm howitzer', cls: 'INDIRECT' },
} as const satisfies Record<string, AmmoType>

export type AmmoKey = keyof typeof AMMO_LITERAL
export const AMMO: Readonly<Record<AmmoKey, AmmoType>> = AMMO_LITERAL

// --- weapon systems --------------------------------------------------------
// dps values are per-shooter sustained contributions on the existing arcade
// scale (they sum to a unit's dpsSoft/dpsHard). `load` = basic load carried
// per shooter/mount of this weapon, in rounds of its ammo type. `shotTime` =
// seconds per round in sustained engagement, for AMMO CONSUMPTION (Phase 3);
// weapons without it (small arms) don't deplete — their loads are effectively
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

const WEAPONS_LITERAL = {
  M4: { key: 'M4', name: 'M4 carbine', ammo: 'A_556', range: 400, dpsSoft: 0.05, dpsHard: 0, load: 210 },
  M249: { key: 'M249', name: 'M249 SAW', ammo: 'A_556', range: 600, dpsSoft: 0.25, dpsHard: 0.01, load: 600 },
  M240: { key: 'M240', name: 'M240 MG', ammo: 'A_762', range: 800, dpsSoft: 0.3, dpsHard: 0.02, load: 600 },
  M240C: { key: 'M240C', name: 'M240 coax', ammo: 'A_762', range: 800, dpsSoft: 0.5, dpsHard: 0.02, load: 800 },
  M2_50: { key: 'M2_50', name: 'M2 .50cal', ammo: 'A_50', range: 1200, dpsSoft: 0.45, dpsHard: 0.17, load: 400 },
  AT4: { key: 'AT4', name: 'AT4 (disposable)', ammo: 'R_AT4', range: 300, dpsSoft: 0.02, dpsHard: 0.125, load: 1, shotTime: 12 },
  JAVELIN: { key: 'JAVELIN', name: 'Javelin CLU', ammo: 'M_JAVELIN', range: 2000, dpsSoft: 0.02, dpsHard: 0.5, load: 3, shotTime: 25 },
  TOW: { key: 'TOW', name: 'TOW launcher', ammo: 'M_TOW', range: 2500, dpsSoft: 0.02, dpsHard: 1.1, load: 8, shotTime: 20 },
  M242: { key: 'M242', name: 'M242 25mm', ammo: 'A_25MM', range: 900, dpsSoft: 1.15, dpsHard: 0.35, load: 300, shotTime: 0.5 },
  M256: { key: 'M256', name: 'M256 120mm', ammo: 'A_120MM', range: 1600, dpsSoft: 0.4, dpsHard: 1.375, load: 40, shotTime: 8 },
  // indirect tubes: dps here is DIRECT-LAY defensive fire only (the catalog's
  // dpsSoft for MOR/ARTY); the fire-mission system stays on IndirectSpec
  M252: { key: 'M252', name: 'M252 81mm mortar', ammo: 'MORT_81', range: 3000, dpsSoft: 0.12, dpsHard: 0.05, load: 24 },
  M109_155: { key: 'M109_155', name: 'M109 155mm', ammo: 'HOW_155', range: 6500, dpsSoft: 0.33, dpsHard: 0.13, load: 16 },
} as const satisfies Record<string, WeaponType>

export type WeaponKey = keyof typeof WEAPONS_LITERAL
export const WEAPONS: Readonly<Record<WeaponKey, WeaponType>> = WEAPONS_LITERAL

// --- troop kinds -----------------------------------------------------------

export interface TroopKind {
  key: string
  name: string
  weapons: readonly WeaponKey[]
}

const TROOPS_LITERAL = {
  LEADER: { key: 'LEADER', name: 'Leader', weapons: ['M4'] },
  RIFLEMAN: { key: 'RIFLEMAN', name: 'Rifleman', weapons: ['M4'] },
  RIFLEMAN_AT: { key: 'RIFLEMAN_AT', name: 'Rifleman (AT4)', weapons: ['M4', 'AT4'] },
  AUTO_RIFLEMAN: { key: 'AUTO_RIFLEMAN', name: 'Automatic Rifleman', weapons: ['M249'] },
  MG_GUNNER: { key: 'MG_GUNNER', name: 'Machine Gunner', weapons: ['M240'] },
  AT_GUNNER: { key: 'AT_GUNNER', name: 'AT Gunner (Javelin)', weapons: ['M4', 'JAVELIN'] },
  ATGM_GUNNER: { key: 'ATGM_GUNNER', name: 'ATGM Gunner (TOW)', weapons: ['M4', 'TOW'] },
  MORTARMAN: { key: 'MORTARMAN', name: 'Mortarman', weapons: ['M4', 'M252'] },
  SCOUT: { key: 'SCOUT', name: 'Scout', weapons: ['M4'] },
  SAPPER: { key: 'SAPPER', name: 'Sapper', weapons: ['M4'] },
  SIGNALLER: { key: 'SIGNALLER', name: 'Signaller', weapons: ['M4'] },
  MEDIC: { key: 'MEDIC', name: 'Medic', weapons: ['M4'] },
  CREWMAN: { key: 'CREWMAN', name: 'Crewman', weapons: ['M4'] },
} as const satisfies Record<string, TroopKind>

export type TroopKindKey = keyof typeof TROOPS_LITERAL
export const TROOP_KINDS: Readonly<Record<TroopKindKey, TroopKind>> = TROOPS_LITERAL

// --- vehicle types ---------------------------------------------------------
// `crew` staffs the vehicle (CREWMAN soldiers, Phase 2); `pax` is dismount
// seating. Multiple weapon systems per vic; each draws from the vic's stowage.

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

const VEHICLES_LITERAL = {
  HMMWV: { key: 'HMMWV', name: 'M1151 HMMWV', crew: 2, pax: 8, weapons: ['M2_50'], soft: 0.65, mob: 'wheeled', speed: 13 },
  STRYKER: { key: 'STRYKER', name: 'M1126 Stryker', crew: 2, pax: 9, weapons: ['M2_50'], soft: 0.45, mob: 'wheeled', speed: 14 },
  BRADLEY: { key: 'BRADLEY', name: 'M2 Bradley', crew: 3, pax: 6, weapons: ['M242', 'M240C', 'TOW'], soft: 0.5, mob: 'tracked', speed: 10 },
  ABRAMS: { key: 'ABRAMS', name: 'M1 Abrams', crew: 4, pax: 0, weapons: ['M256', 'M240C', 'M2_50'], soft: 0.12, mob: 'tracked', speed: 9 },
  CFV: { key: 'CFV', name: 'M3 Cav Fighting Vehicle', crew: 3, pax: 2, weapons: ['M242', 'M240C'], soft: 0.3, mob: 'tracked', speed: 11 },
  ESV: { key: 'ESV', name: 'M1132 Engineer Sqd Vehicle', crew: 2, pax: 8, weapons: ['M2_50'], soft: 0.6, mob: 'tracked', speed: 8 },
  SP155: { key: 'SP155', name: 'M109 Paladin', crew: 4, pax: 0, weapons: ['M109_155'], soft: 0.5, mob: 'tracked', speed: 7 },
  FMTV: { key: 'FMTV', name: 'FMTV cargo truck', crew: 2, pax: 0, weapons: [], soft: 1.0, mob: 'wheeled', speed: 12 },
  RETRANS: { key: 'RETRANS', name: 'Retrans truck', crew: 2, pax: 2, weapons: [], soft: 0.8, mob: 'wheeled', speed: 12 },
} as const satisfies Record<string, VehicleType>

export type VehicleKey = keyof typeof VEHICLES_LITERAL
export const VEHICLES: Readonly<Record<VehicleKey, VehicleType>> = VEHICLES_LITERAL

// --- unit templates --------------------------------------------------------
// What each catalog unit type is composed of. `dismounts` are the fighting
// troops OUTSIDE vehicle crews (crews derive from VehicleType.crew).
// Doctrine numbers (sight, def, cost, glyph, indirect, logi...) stay on the
// existing UnitType — this table only replaces the veh/troops/dps aggregates.

export interface UnitComposition {
  unit: UnitTypeKey
  vehicles: readonly { type: VehicleKey; n: number }[]
  dismounts: readonly { kind: TroopKindKey; n: number }[]
}

// NOTE on order: dismount arrays are listed in CASUALTY ORDER. rosterSync
// partitions the dismounts over the troop elements in sequence and elements
// die front-first, so kinds listed first are lost first — riflemen up front,
// crew-served/AT specialists later, leaders and the medic last. This shapes
// how a platoon's capabilities degrade as it takes losses (Phase 3: derived
// firepower reads the survivors).
const COMPOSITIONS_LITERAL = {
  // NOTE on LEADER counts (Packs P2): leaders carry the same M4 as riflemen, so
  // trading RIFLEMAN slots for LEADER slots changes NOTHING in the combat model
  // (same headcount, same weapons, same stowage) — it only gives the billet
  // system real squad leaders: 3 SLs + PSG + PL for a rifle platoon.
  INF: {
    unit: 'INF',
    vehicles: [{ type: 'HMMWV', n: 4 }],
    dismounts: [
      { kind: 'RIFLEMAN', n: 12 }, { kind: 'RIFLEMAN_AT', n: 4 },
      { kind: 'AUTO_RIFLEMAN', n: 6 }, { kind: 'MG_GUNNER', n: 2 }, { kind: 'AT_GUNNER', n: 2 },
      { kind: 'MEDIC', n: 1 }, { kind: 'LEADER', n: 5 },
    ],
  },
  STRY: {
    unit: 'STRY',
    vehicles: [{ type: 'STRYKER', n: 4 }],
    dismounts: [
      { kind: 'RIFLEMAN', n: 14 }, { kind: 'RIFLEMAN_AT', n: 6 },
      { kind: 'AUTO_RIFLEMAN', n: 6 }, { kind: 'MG_GUNNER', n: 2 }, { kind: 'AT_GUNNER', n: 2 },
      { kind: 'MEDIC', n: 1 }, { kind: 'LEADER', n: 5 },
    ],
  },
  MECH: {
    unit: 'MECH',
    vehicles: [{ type: 'BRADLEY', n: 4 }],
    dismounts: [
      { kind: 'RIFLEMAN', n: 6 }, { kind: 'RIFLEMAN_AT', n: 4 },
      { kind: 'AUTO_RIFLEMAN', n: 4 }, { kind: 'MG_GUNNER', n: 2 }, { kind: 'AT_GUNNER', n: 3 },
      { kind: 'MEDIC', n: 1 }, { kind: 'LEADER', n: 4 },
    ],
  },
  ARM: {
    unit: 'ARM',
    vehicles: [{ type: 'ABRAMS', n: 4 }],
    dismounts: [],
  },
  AT: {
    unit: 'AT',
    vehicles: [],
    dismounts: [
      { kind: 'RIFLEMAN', n: 3 }, { kind: 'ATGM_GUNNER', n: 4 }, { kind: 'LEADER', n: 1 },
    ],
  },
  SCT: {
    unit: 'SCT',
    vehicles: [{ type: 'HMMWV', n: 3 }],
    dismounts: [], // catalog "troops 6" is the crews (3×2), rendered dismounted
  },
  CAV: {
    unit: 'CAV',
    vehicles: [{ type: 'CFV', n: 4 }],
    dismounts: [{ kind: 'SCOUT', n: 6 }],
  },
  MOR: {
    unit: 'MOR',
    vehicles: [],
    dismounts: [{ kind: 'MORTARMAN', n: 8 }, { kind: 'LEADER', n: 1 }],
  },
  ARTY: {
    unit: 'ARTY',
    vehicles: [{ type: 'SP155', n: 3 }],
    dismounts: [],
  },
  ENG: {
    unit: 'ENG',
    vehicles: [{ type: 'ESV', n: 3 }],
    dismounts: [
      { kind: 'SAPPER', n: 8 }, { kind: 'RIFLEMAN_AT', n: 4 }, { kind: 'LEADER', n: 4 },
    ],
  },
  SIG: {
    unit: 'SIG',
    vehicles: [{ type: 'RETRANS', n: 2 }],
    dismounts: [{ kind: 'SIGNALLER', n: 7 }, { kind: 'LEADER', n: 1 }],
  },
  LOG: {
    unit: 'LOG',
    vehicles: [{ type: 'FMTV', n: 5 }],
    dismounts: [], // catalog "troops 8" ≈ the truck crews (5×2), see FORCE-MODEL.md
  },
} as const satisfies Record<UnitTypeKey, UnitComposition>

export const COMPOSITIONS: Readonly<Record<UnitTypeKey, UnitComposition>> = COMPOSITIONS_LITERAL

// --- runtime roster construction (Phase 2) ---------------------------------
// Build a unit's actual soldiers/vehicles from its composition. Deterministic
// and rng-free (golden-neutral): fixed template order, sequential unit-local
// ids. Crews are CREWMAN soldiers assigned to their vehicle; dismounts ride
// with vehId null. Names/bios attach in Phase 4; per-soldier ammo in Phase 3.
export function buildRoster(key: UnitTypeKey): { soldiers: Soldier[]; vehicles: UnitVehicle[] } {
  const c = COMPOSITIONS[key]
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

// --- munitions stowage (Phase 3) -------------------------------------------
// A unit's basic load of CONSUMABLE munitions (weapons with a shotTime — AT
// rockets/missiles and cannon rounds), pooled per ammo type at unit level:
// the platoon cross-loads, so the pool is the honest granularity. Small-arms
// loads are tracked per-weapon `load` but not consumed (bottomless for now);
// INDIRECT rounds live on the existing Unit.ammo / fireMission system.
export type Stowage = Partial<Record<AmmoKey, number>>

export function initialStowage(key: UnitTypeKey): Stowage {
  const c = COMPOSITIONS[key]
  const stow: Stowage = {}
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
// hand-tuned catalog values (Phase 1) and eventually to replace them (Phase 3).

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
  return (Object.keys(COMPOSITIONS) as UnitTypeKey[]).map((key) => {
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
