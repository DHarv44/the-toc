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

// --- facilities (P5) --------------------------------------------------------
// FUNCTIONAL base services, not decorations: each works on friendly units
// RESTING in radius (out of contact). The motorpool puts destroyed vehicles
// back in the fight; the aid station returns casualties to duty — both revive
// the unit's ELEMENTS, so derived firepower genuinely comes back. HQs carry
// the full set by default; FOBs buy them as build-outs (structures and
// facilities still cost supply — units don't).
export interface FacilityType {
  key: string
  name: string
  cost: number       // FOB build-out price (HQ has it organically)
  radius: number     // service radius around the installation (m)
  desc: string
}

const FACILITIES_LITERAL = {
  MOTORPOOL: {
    key: 'MOTORPOOL', name: 'Motorpool', cost: 400, radius: 450,
    desc: 'Repairs destroyed vehicles for units resting in radius',
  },
  AID: {
    key: 'AID', name: 'Aid Station', cost: 300, radius: 450,
    desc: 'Returns casualties to duty for units resting in radius',
  },
} as const satisfies Record<string, FacilityType>

export type FacilityKey = keyof typeof FACILITIES_LITERAL
export const FACILITIES: Readonly<Record<FacilityKey, FacilityType>> = FACILITIES_LITERAL
// the table viewed through the interface: sim code accesses specs by a generic
// key (STRUCTURES[s.kind]), which needs the optional fields visible on every member
export const STRUCTURES: Readonly<Record<StructureTypeKey, StructureType>> = STRUCTURES_LITERAL
