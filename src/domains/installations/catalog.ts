// Static installations. `deployZone` > 0 means units can be fielded within that
// radius once the structure is established. `near` = max distance from an
// existing friendly asset when placing.
// Ported verbatim from src/game/units.js (values unchanged).
export interface StructureType {
  key: string
  name: string
  abbr: string
  cost: number
  hp: number
  buildTime: number
  sight: number
  deployZone: number
  near: number
  income: number
  stock0?: number           // initial supply push; convoys sustain it after that
  launchesDrones?: boolean
}

const STRUCTURES_LITERAL = {
  OP: {
    key: 'OP', name: 'Observation Post', abbr: 'OP', cost: 150, hp: 150,
    buildTime: 25, sight: 1600, deployZone: 0, near: 2000, income: 0,
  },
  HQ: {
    key: 'HQ', name: 'Command Post', abbr: 'HQ', cost: 800, hp: 400,
    buildTime: 45, sight: 700, deployZone: 1200, near: 2500, income: 0,
  },
  FOB: {
    key: 'FOB', name: 'Forward Op Base', abbr: 'FOB', cost: 1000, hp: 500,
    buildTime: 60, sight: 700, deployZone: 1500, near: 2500, income: 0,
    stock0: 300, // initial supply push; convoys sustain it after that
  },
  AFLD: {
    key: 'AFLD', name: 'Airfield', abbr: 'AF', cost: 1200, hp: 400,
    buildTime: 60, sight: 700, deployZone: 800, near: 2500, income: 0, launchesDrones: true,
  },
} as const satisfies Record<string, StructureType>

export type StructureTypeKey = keyof typeof STRUCTURES_LITERAL

// --- facilities (P5, stage 2) -----------------------------------------------
// FUNCTIONAL base services described as EFFECT SPECS: the engine implements
// the VERBS (repair vics, treat wounded, intercept inbound rounds) and reads
// the parameters from whatever spec the active pack installed — it never
// knows a system's name. A pack ships its facility specs in
// pack.catalogs.facilities; asset-delivered systems (e.g. an intercept
// battery) arrive via the request pipeline, the rest are FOB build-outs.
export interface RepairEffect {
  secsPerVic: number // motorpool time to return one DAMAGED vic
  radius: number     // service radius around the installation (m)
}

export interface AidEffect {
  careRate: number   // care-seconds per second for LIGHT wounds (aid station)
  radius: number
}

// point defense: engages inbound rounds whose impact falls inside `radius`
export interface InterceptEffect {
  targets: readonly string[]  // ammo CLASSES it can engage ('INDIRECT', later 'ROCKET'…)
  radius: number
  pk: number         // per-round kill probability (deterministic hash roll)
  rof: number        // engagements per second — saturation is real
  sound?: { burstRof: number; burstLen: number; pitch: number } // audio synth params
}

export interface FacilityType {
  key: string
  name: string
  desc: string
  effects: {
    repair?: RepairEffect
    aid?: AidEffect
    intercept?: InterceptEffect
  }
}

export type FacilityKey = string
// registry: EMPTY until packs/install.ts populates it from the active packs
export const FACILITIES: Readonly<Record<string, FacilityType>> = {}
// the table viewed through the interface: sim code accesses specs by a generic
// key (STRUCTURES[s.kind]), which needs the optional fields visible on every member
export const STRUCTURES: Readonly<Record<StructureTypeKey, StructureType>> = STRUCTURES_LITERAL
