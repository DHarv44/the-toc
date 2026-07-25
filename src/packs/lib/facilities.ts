// Shared pack-authoring library: US BASE FACILITIES as effect specs. The
// engine runs the verbs (repair/aid/intercept); these are the parameters.
// Rates moved from the engine's previous hard-coded values (motorpool 90 s
// per vic, aid care 1.0, radius 450) — behavior unchanged.
import type { FacilityType } from '../../domains/installations/catalog'

export const US_FACILITIES = {
  MOTORPOOL: {
    key: 'MOTORPOOL', name: 'Motorpool',
    desc: 'Repairs damaged vehicles for units resting in radius',
    effects: { repair: { secsPerVic: 90, radius: 450 } },
  },
  AID: {
    key: 'AID', name: 'Aid Station',
    desc: 'Returns casualties to duty for units resting in radius',
    effects: { aid: { careRate: 1.0, radius: 450 } },
  },
  CRAM: {
    // counter-rocket/artillery/mortar: never organic, never a build-out — a
    // division-request asset delivers the section that mans it. The engine
    // only sees "intercepts INDIRECT-class rounds at these parameters".
    key: 'CRAM', name: 'C-RAM Battery',
    desc: 'Intercepts incoming artillery and mortar rounds over the base',
    effects: {
      intercept: {
        targets: ['INDIRECT'], radius: 700, pk: 0.7, rof: 1.5,
        sound: { burstRof: 75, burstLen: 1.1, pitch: 0.8 },
      },
    },
  },
} as const satisfies Record<string, FacilityType>
