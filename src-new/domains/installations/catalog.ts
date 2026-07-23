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

export const STRUCTURES = {
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

export type StructureTypeKey = keyof typeof STRUCTURES
