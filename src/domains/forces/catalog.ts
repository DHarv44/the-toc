// Unit catalog — INTERFACES + REGISTRY (stage 2: the engine ships verbs, packs
// ship nouns). The engine defines what a unit type IS (this file's interfaces
// and behavior fields); the actual platform DATA lives in pack-land
// (packs/lib/*) and is installed into the UNIT_TYPES registry by
// packs/install.ts before anything spawns. Sim code keeps reading
// UNIT_TYPES[u.type] exactly as before.
//
// `soft` = fraction of the unit that is soft-skinned (drives which enemy DPS
// pool hurts it). Speeds in m/s (arcade-scaled), ranges/sight in meters. `cat`
// groups the deploy palette. `df` = radio direction-finding radius (SIG).
// `def` = defensive posture: time (s) to fully prepare, factor = damage taken
// multiplier when complete. MOVE_FACTORS live in world/mobility.ts — terrain
// cost is a world concept, not a unit one.
import type { Mobility, TerrainName } from '../../world/mobility'

// A capability group for the CALL UP drill. The engine only knows that types
// GROUP; which groups exist, and in what order, is pack content (pack.cats).
export type UnitCategory = string

// The 2525 glyph set stays ENGINE-side: the symbol renderer is a standard, not
// content. A pack picks a glyph per unit type; a genuinely new symbol is an
// engine addition (map/symbols.ts), added once for every pack to use.
export type UnitGlyph =
  | 'inf' | 'mech' | 'arm' | 'at' | 'sct' | 'cav'
  | 'mor' | 'arty' | 'eng' | 'sig' | 'log' | 'med'
  | 'unk' // intel contact of unidentified composition — drawn as a "?"

// registry keys are open strings — the active packs decide what exists
export type UnitTypeKey = string
export type CarriedUasKey = string   // must name a drone key in an installed pack

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
  /** ROUTE CLEARANCE capability: this element can sweep a NamedRoute, and
   *  neutralizes hazards within `radius` metres as it walks it. A pack noun —
   *  combat engineers today, a dedicated EOD platform whenever a pack ships
   *  one (domains/control/routes reads it, nothing else). */
  eod?: { radius: number }
  /** FORWARD MEDICAL AURA: same-side units inside `radius` receive wound care
   *  at `rate` (the aid-station verb, mobile). Pack noun on the medical
   *  platform; the engine only knows the effect. */
  aid?: { radius: number; rate: number }
  /** FIELD MAINTENANCE AURA: same-side units inside `radius` get DAMAGED vics
   *  field-repaired, one per `secsPerVic`. A field fix is PARTIAL — the vic
   *  returns mission-capable but flagged, and only real motorpool time clears
   *  it (domains/forces/casualties fieldRepairUpdate). */
  wrench?: { radius: number; secsPerVic: number }
  /** ROAD BUILDING: this element can be tasked to build a new road — it
   *  crawls the planned line at `speed` m/s, leaving real road behind it.
   *  Pack noun; domains/forces/roadworks runs the verb. */
  roadworks?: { speed: number }
}

// The registry: EMPTY until packs/install.ts populates it (which happens at
// pack-module load and again on every initGame). Mutated only by the installer.
export const UNIT_TYPES: Readonly<Record<string, UnitType>> = {}

// Damage taken multiplier when defending in cover — terrain physics, engine verb.
export const COVER_DEF: Record<TerrainName, number> = {
  field: 1.0, forest: 0.65, urban: 0.5, water: 1.0,
}
