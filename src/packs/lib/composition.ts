// Shared pack-authoring library: US COMPOSITION DATA — ammo, weapon systems,
// troop kinds, vehicles, and unit templates. Moved VERBATIM from
// domains/forces/composition.ts (stage 2 — see lib/units.ts header): same
// keys, same order, same numbers; the domain module keeps the interfaces and
// the roster/stowage/derivation VERBS, and reads this data through the
// registries a pack installs.
import type {
  AmmoType, WeaponType, TroopKind, VehicleType, UnitComposition,
} from '../../domains/forces/composition'

// --- ammo ------------------------------------------------------------------

export const US_AMMO = {
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
  // aviation ordnance (Packs: the air cav ships with the division; airframes
  // aren't fieldable ground units yet, so these exist for identity/display)
  A_30MM: { key: 'A_30MM', name: '30mm chain gun', cls: 'CANNON' },
  M_HELLFIRE: { key: 'M_HELLFIRE', name: 'Hellfire missile', cls: 'AT' },
} as const satisfies Record<string, AmmoType>

// --- weapon systems --------------------------------------------------------

export const US_WEAPONS = {
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
  // aviation weapon systems (display/identity only until air units field)
  M230: { key: 'M230', name: 'M230 30mm', ammo: 'A_30MM', range: 1500, dpsSoft: 1.4, dpsHard: 0.5, load: 300 },
  HELLFIRE: { key: 'HELLFIRE', name: 'AGM-114 Hellfire', ammo: 'M_HELLFIRE', range: 8000, dpsSoft: 0.1, dpsHard: 1.6, load: 8 },
} as const satisfies Record<string, WeaponType>

// --- troop kinds -----------------------------------------------------------

export const US_TROOPS = {
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
  // division org kinds (Packs: staff sections + the air cav — garrison rosters
  // only for now, never fielded as ground shooters)
  STAFF: { key: 'STAFF', name: 'Staff', weapons: ['M4'] },
  PILOT: { key: 'PILOT', name: 'Aviator', weapons: ['M4'] },
  CREW_CHIEF: { key: 'CREW_CHIEF', name: 'Crew Chief', weapons: ['M4'] },
  MECHANIC: { key: 'MECHANIC', name: 'Mechanic', weapons: ['M4'] },
  // civilian contractors (FSRs on attached systems): noncombatants — no
  // weapon, no replacement pipeline, Defense of Freedom Medal when wounded
  CIV: { key: 'CIV', name: 'Contractor (FSR)', weapons: [] },
} as const satisfies Record<string, TroopKind>

// --- vehicle types ---------------------------------------------------------

export const US_VEHICLES = {
  HMMWV: { key: 'HMMWV', name: 'M1151 HMMWV', crew: 2, pax: 8, weapons: ['M2_50'], soft: 0.65, mob: 'wheeled', speed: 13 },
  STRYKER: { key: 'STRYKER', name: 'M1126 Stryker', crew: 2, pax: 9, weapons: ['M2_50'], soft: 0.45, mob: 'wheeled', speed: 14 },
  BRADLEY: { key: 'BRADLEY', name: 'M2 Bradley', crew: 3, pax: 6, weapons: ['M242', 'M240C', 'TOW'], soft: 0.5, mob: 'tracked', speed: 10 },
  ABRAMS: { key: 'ABRAMS', name: 'M1 Abrams', crew: 4, pax: 0, weapons: ['M256', 'M240C', 'M2_50'], soft: 0.12, mob: 'tracked', speed: 9 },
  CFV: { key: 'CFV', name: 'M3 Cav Fighting Vehicle', crew: 3, pax: 2, weapons: ['M242', 'M240C'], soft: 0.3, mob: 'tracked', speed: 11 },
  ESV: { key: 'ESV', name: 'M1132 Engineer Sqd Vehicle', crew: 2, pax: 8, weapons: ['M2_50'], soft: 0.6, mob: 'tracked', speed: 8 },
  SP155: { key: 'SP155', name: 'M109 Paladin', crew: 4, pax: 0, weapons: ['M109_155'], soft: 0.5, mob: 'tracked', speed: 7 },
  FMTV: { key: 'FMTV', name: 'FMTV cargo truck', crew: 2, pax: 0, weapons: [], soft: 1.0, mob: 'wheeled', speed: 12 },
  RETRANS: { key: 'RETRANS', name: 'Retrans truck', crew: 2, pax: 2, weapons: [], soft: 0.8, mob: 'wheeled', speed: 12 },
  // airframes (Packs: org inventory for the air cav brigade — crewed by PILOT/
  // CREW_CHIEF org personnel, not CREWMAN buildRoster crews; not fieldable yet)
  AH64: { key: 'AH64', name: 'AH-64E Apache', crew: 2, pax: 0, weapons: ['M230', 'HELLFIRE'], soft: 0.6, mob: 'wheeled', speed: 50 },
  UH60: { key: 'UH60', name: 'UH-60M Black Hawk', crew: 4, pax: 11, weapons: ['M240'], soft: 0.8, mob: 'wheeled', speed: 48 },
  CH47: { key: 'CH47', name: 'CH-47F Chinook', crew: 4, pax: 33, weapons: ['M240'], soft: 0.9, mob: 'wheeled', speed: 45 },
} as const satisfies Record<string, VehicleType>

// --- unit templates --------------------------------------------------------
// NOTE on order: dismount arrays are listed in CASUALTY ORDER. rosterSync
// partitions the dismounts over the troop elements in sequence and elements
// die front-first, so kinds listed first are lost first — riflemen up front,
// crew-served/AT specialists later, leaders and the medic last. This shapes
// how a platoon's capabilities degrade as it takes losses (Phase 3: derived
// firepower reads the survivors).

export const US_COMPS = {
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
  MED: {
    unit: 'MED',
    vehicles: [{ type: 'HMMWV', n: 2 }], // field-litter ambulances
    dismounts: [{ kind: 'MEDIC', n: 5 }, { kind: 'LEADER', n: 1 }],
  },
} as const satisfies Record<string, UnitComposition>
