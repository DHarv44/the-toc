// Unit catalog. `soft` = fraction of the unit that is soft-skinned (drives which
// enemy DPS pool hurts it). Speeds in m/s (arcade-scaled), ranges/sight in meters.
// `cat` groups the deploy palette. `df` = radio direction-finding radius (SIG).
// `def` = defensive posture: time (s) to fully prepare, factor = damage taken
// multiplier when complete (infantry digs deep; armor goes hull-down fast).
// Ported verbatim from src/game/units.js (values unchanged). MOVE_FACTORS moved
// to world/mobility.ts — terrain cost is a world concept, not a unit one.
import type { Mobility, TerrainName } from '../../world/mobility'

export type UnitCategory = 'MANEUVER' | 'RECON' | 'FIRES' | 'SUPPORT'
export type UnitGlyph =
  | 'inf' | 'mech' | 'arm' | 'at' | 'sct' | 'cav'
  | 'mor' | 'arty' | 'eng' | 'sig' | 'log'

// UAS types a unit hand-launches from the field. Kept as a literal union here
// (rather than importing the air catalog) so forces stays upstream of air in the
// dependency order; air/catalog.ts statically asserts these are real drone keys.
export type CarriedUasKey = 'RAVEN' | 'SWITCHBLADE'

// Carrier-equipped infantry: the mounted posture (vehicle mobility/protection,
// fireMul scales infantry firepower while mounted). Base stats are DISMOUNTED.
export interface CarrierSpec {
  name: string
  mob: Mobility
  speed: number
  veh: number
  soft: number
  fireMul: number
}

export interface DefensePosture {
  time: number      // seconds to fully prepare
  factor: number    // damage taken multiplier when complete
  name: string      // readout label, e.g. 'HULL-DOWN'
}

export interface IndirectSpec {
  range: number
  salvo: number
  dmg: number
  cooldown: number
  flight: number
  load: number      // basic load: rounds carried before needing resupply
  scatter: number
  blast: number
}

export interface LogiSpec {
  capacity: number
  loadTime: number
}

export interface UnitType {
  key: string
  name: string
  abbr: string
  cat: UnitCategory
  mob: Mobility
  speed: number
  sight: number
  range: number
  dpsSoft: number
  dpsHard: number
  soft: number
  cost: number
  veh: number
  troops: number
  glyph: UnitGlyph
  def: DefensePosture
  carries?: readonly CarriedUasKey[]
  carrier?: CarrierSpec
  indirect?: IndirectSpec
  canBridge?: boolean
  df?: number
  logi?: LogiSpec
}

const UNIT_TYPES_LITERAL = {
  INF: {
    key: 'INF', name: 'Rifle Platoon', abbr: 'IN', cat: 'MANEUVER', mob: 'foot', speed: 3.2,
    sight: 800, range: 550, dpsSoft: 3.4, dpsHard: 1.5, soft: 1.0,
    cost: 100, veh: 0, troops: 32, glyph: 'inf', carries: ['RAVEN'],
    carrier: { name: 'HMMWV', mob: 'wheeled', speed: 13, veh: 4, soft: 0.65, fireMul: 0.5 },
    def: { time: 90, factor: 0.45, name: 'FIGHTING POSITIONS' },
  },
  STRY: {
    key: 'STRY', name: 'Stryker Rifle Plt', abbr: 'SB', cat: 'MANEUVER', mob: 'foot', speed: 3.2,
    sight: 850, range: 600, dpsSoft: 3.8, dpsHard: 1.8, soft: 0.9,
    cost: 300, veh: 0, troops: 36, glyph: 'mech', carries: ['RAVEN'],
    carrier: { name: 'Stryker', mob: 'wheeled', speed: 14, veh: 4, soft: 0.45, fireMul: 0.8 },
    def: { time: 90, factor: 0.6, name: 'HULL DEFILADE' },
  },
  MECH: {
    key: 'MECH', name: 'Mech Inf Platoon', abbr: 'MI', cat: 'MANEUVER', mob: 'foot', speed: 3.2,
    sight: 900, range: 900, dpsSoft: 4.6, dpsHard: 2.4, soft: 0.8,
    cost: 250, veh: 0, troops: 24, glyph: 'mech', carries: ['RAVEN'],
    carrier: { name: 'IFV', mob: 'tracked', speed: 10, veh: 4, soft: 0.5, fireMul: 1.0 },
    def: { time: 90, factor: 0.6, name: 'HULL DEFILADE' },
  },
  ARM: {
    key: 'ARM', name: 'Tank Platoon', abbr: 'AR', cat: 'MANEUVER', mob: 'tracked', speed: 9,
    sight: 1000, range: 1600, dpsSoft: 3.6, dpsHard: 5.5, soft: 0.12,
    cost: 400, veh: 4, troops: 0, glyph: 'arm',
    def: { time: 60, factor: 0.65, name: 'HULL-DOWN' },
  },
  AT: {
    key: 'AT', name: 'ATGM Team', abbr: 'AT', cat: 'MANEUVER', mob: 'foot', speed: 3.0,
    sight: 1000, range: 2000, dpsSoft: 0.6, dpsHard: 4.6, soft: 1.0,
    cost: 200, veh: 0, troops: 8, glyph: 'at', carries: ['SWITCHBLADE'],
    def: { time: 75, factor: 0.45, name: 'CONCEALED POSITIONS' },
  },
  SCT: {
    key: 'SCT', name: 'Scout Section', abbr: 'SC', cat: 'RECON', mob: 'wheeled', speed: 16,
    sight: 1900, range: 450, dpsSoft: 1.6, dpsHard: 0.5, soft: 0.7,
    cost: 150, veh: 3, troops: 6, glyph: 'sct', carries: ['RAVEN', 'SWITCHBLADE'],
    def: { time: 45, factor: 0.7, name: 'HASTY POSITIONS' },
  },
  CAV: {
    key: 'CAV', name: 'Armd Recon Troop', abbr: 'CV', cat: 'RECON', mob: 'tracked', speed: 11,
    sight: 1500, range: 1200, dpsSoft: 3.0, dpsHard: 2.6, soft: 0.3,
    cost: 300, veh: 4, troops: 6, glyph: 'cav', carries: ['RAVEN', 'SWITCHBLADE'],
    def: { time: 60, factor: 0.65, name: 'HULL-DOWN' },
  },
  MOR: {
    key: 'MOR', name: 'Mortar Section', abbr: 'MO', cat: 'FIRES', mob: 'foot', speed: 3.0,
    sight: 600, range: 300, dpsSoft: 1.4, dpsHard: 0.4, soft: 0.9,
    cost: 250, veh: 0, troops: 9, glyph: 'mor',
    indirect: { range: 3000, salvo: 4, dmg: 14, cooldown: 20, flight: 8, load: 48, scatter: 45, blast: 90 },
    def: { time: 75, factor: 0.5, name: 'GUN PITS' },
  },
  ARTY: {
    key: 'ARTY', name: 'SP Howitzer Bty', abbr: 'FA', cat: 'FIRES', mob: 'tracked', speed: 7,
    sight: 500, range: 400, dpsSoft: 1.0, dpsHard: 0.4, soft: 0.5,
    cost: 500, veh: 3, troops: 0, glyph: 'arty',
    indirect: { range: 6500, salvo: 6, dmg: 22, cooldown: 35, flight: 14, load: 48, scatter: 70, blast: 130 },
    def: { time: 80, factor: 0.55, name: 'EMPLACED W/ REVETMENTS' },
  },
  ENG: {
    key: 'ENG', name: 'Engineer Platoon', abbr: 'EN', cat: 'SUPPORT', mob: 'tracked', speed: 8,
    sight: 700, range: 450, dpsSoft: 2.2, dpsHard: 1.0, soft: 0.6,
    cost: 300, veh: 3, troops: 16, glyph: 'eng', canBridge: true,
    def: { time: 45, factor: 0.5, name: 'PREPARED POSITIONS' },
  },
  SIG: {
    key: 'SIG', name: 'Signal Platoon', abbr: 'SG', cat: 'SUPPORT', mob: 'wheeled', speed: 12,
    sight: 800, range: 300, dpsSoft: 1.0, dpsHard: 0.3, soft: 0.8,
    cost: 250, veh: 2, troops: 8, glyph: 'sig', df: 3500,
    def: { time: 60, factor: 0.7, name: 'DUG-IN RETRANS SITE' },
  },
  LOG: {
    key: 'LOG', name: 'Logistics Platoon', abbr: 'LG', cat: 'SUPPORT', mob: 'wheeled', speed: 12,
    sight: 600, range: 250, dpsSoft: 0.8, dpsHard: 0.2, soft: 1.0,
    cost: 200, veh: 5, troops: 8, glyph: 'log', logi: { capacity: 400, loadTime: 12 },
    def: { time: 45, factor: 0.75, name: 'DISPERSED & COVERED' },
  },
} as const satisfies Record<string, UnitType>

export type UnitTypeKey = keyof typeof UNIT_TYPES_LITERAL
// the table viewed through the interface: sim code accesses specs by a generic
// key (UNIT_TYPES[u.type]), which needs the optional fields visible on every member
export const UNIT_TYPES: Readonly<Record<UnitTypeKey, UnitType>> = UNIT_TYPES_LITERAL

// Damage taken multiplier when defending in cover.
export const COVER_DEF: Record<TerrainName, number> = {
  field: 1.0, forest: 0.65, urban: 0.5, water: 1.0,
}
