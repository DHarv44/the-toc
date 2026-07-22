// Unit catalog. `soft` = fraction of the unit that is soft-skinned (drives which
// enemy DPS pool hurts it). Speeds in m/s (arcade-scaled), ranges/sight in meters.
// `cat` groups the deploy palette. `df` = radio direction-finding radius (SIG).
// `def` = defensive posture: time (s) to fully prepare, factor = damage taken
// multiplier when complete (infantry digs deep; armor goes hull-down fast).
export const UNIT_TYPES = {
  // Carrier-equipped infantry: `carrier` gives the mounted posture (vehicle
  // mobility/protection, fireMul scales infantry firepower while mounted).
  // Base stats are the DISMOUNTED posture. Units auto-dismount in contact.
  INF: {
    key: 'INF', name: 'Rifle Platoon', abbr: 'IN', cat: 'MANEUVER', mob: 'foot', speed: 3.2,
    sight: 800, range: 550, dpsSoft: 3.4, dpsHard: 1.5, soft: 1.0,
    cost: 100, veh: 0, troops: 32, glyph: 'inf',
    carrier: { name: 'HMMWV', mob: 'wheeled', speed: 13, veh: 4, soft: 0.65, fireMul: 0.5 },
    def: { time: 90, factor: 0.45, name: 'FIGHTING POSITIONS' },
  },
  STRY: {
    key: 'STRY', name: 'Stryker Rifle Plt', abbr: 'SB', cat: 'MANEUVER', mob: 'foot', speed: 3.2,
    sight: 850, range: 600, dpsSoft: 3.8, dpsHard: 1.8, soft: 0.9,
    cost: 300, veh: 0, troops: 36, glyph: 'mech',
    carrier: { name: 'Stryker', mob: 'wheeled', speed: 14, veh: 4, soft: 0.45, fireMul: 0.8 },
    def: { time: 90, factor: 0.6, name: 'HULL DEFILADE' },
  },
  MECH: {
    key: 'MECH', name: 'Mech Inf Platoon', abbr: 'MI', cat: 'MANEUVER', mob: 'foot', speed: 3.2,
    sight: 900, range: 900, dpsSoft: 4.6, dpsHard: 2.4, soft: 0.8,
    cost: 250, veh: 0, troops: 24, glyph: 'mech',
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
    cost: 200, veh: 0, troops: 8, glyph: 'at',
    def: { time: 75, factor: 0.45, name: 'CONCEALED POSITIONS' },
  },
  SCT: {
    key: 'SCT', name: 'Scout Section', abbr: 'SC', cat: 'RECON', mob: 'wheeled', speed: 16,
    sight: 1900, range: 450, dpsSoft: 1.6, dpsHard: 0.5, soft: 0.7,
    cost: 150, veh: 3, troops: 6, glyph: 'sct',
    def: { time: 45, factor: 0.7, name: 'HASTY POSITIONS' },
  },
  CAV: {
    key: 'CAV', name: 'Armd Recon Troop', abbr: 'CV', cat: 'RECON', mob: 'tracked', speed: 11,
    sight: 1500, range: 1200, dpsSoft: 3.0, dpsHard: 2.6, soft: 0.3,
    cost: 300, veh: 4, troops: 6, glyph: 'cav',
    def: { time: 60, factor: 0.65, name: 'HULL-DOWN' },
  },
  MOR: {
    key: 'MOR', name: 'Mortar Section', abbr: 'MO', cat: 'FIRES', mob: 'foot', speed: 3.0,
    sight: 600, range: 300, dpsSoft: 1.4, dpsHard: 0.4, soft: 0.9,
    cost: 250, veh: 0, troops: 9, glyph: 'mor',
    indirect: { range: 3000, salvo: 4, dmg: 14, cooldown: 20, flight: 8, scatter: 45, blast: 90 },
    def: { time: 75, factor: 0.5, name: 'GUN PITS' },
  },
  ARTY: {
    key: 'ARTY', name: 'SP Howitzer Bty', abbr: 'FA', cat: 'FIRES', mob: 'tracked', speed: 7,
    sight: 500, range: 400, dpsSoft: 1.0, dpsHard: 0.4, soft: 0.5,
    cost: 500, veh: 3, troops: 0, glyph: 'arty',
    indirect: { range: 6500, salvo: 6, dmg: 22, cooldown: 35, flight: 14, scatter: 70, blast: 130 },
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
}

// Static installations. `deployZone` > 0 means units can be fielded within that
// radius once the structure is established. `near` = max distance from an
// existing friendly asset when placing.
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
}

// UAS catalog. `src: 'airfield'` launches from an active airfield; `src: 'field'`
// is hand-launched by the friendly unit nearest the orbit point (within ctrlRange).
// `endurance` = seconds ON STATION before mandatory RTB (transit time is free).
export const DRONE_TYPES = {
  SHADOW: {
    key: 'SHADOW', name: 'RQ-7 Shadow', abbr: 'SHD', src: 'airfield', cost: 350,
    speed: 45, alt: 550, sight: 1500, endurance: 600, orbitR: 420,
  },
  SENTINEL: {
    key: 'SENTINEL', name: 'RQ-4 Sentinel', abbr: 'SEN', src: 'airfield', cost: 650,
    speed: 55, alt: 1250, sight: 2600, endurance: 1200, orbitR: 700,
  },
  VIPER: {
    key: 'VIPER', name: 'MQ-1 Viper', abbr: 'VPR', src: 'airfield', cost: 900,
    speed: 42, alt: 650, sight: 1500, endurance: 720, orbitR: 450,
    weapons: { ammo: 2, range: 2200, dmg: 55, blast: 70, flight: 7 },
  },
  RAVEN: {
    key: 'RAVEN', name: 'RQ-11 Raven', abbr: 'RVN', src: 'field', cost: 75,
    speed: 18, alt: 200, sight: 800, endurance: 300, orbitR: 150, ctrlRange: 3000,
  },
  SWITCHBLADE: {
    key: 'SWITCHBLADE', name: 'Switchblade LM', abbr: 'SWB', src: 'field', cost: 150,
    speed: 32, alt: 250, sight: 600, endurance: 240, orbitR: 120, ctrlRange: 4000,
    kamikaze: { dmg: 50, blast: 85 },
  },
  // tethered at a FOB/HQ (1 per site): persistent high stare, cannot move
  AEROSTAT: {
    key: 'AEROSTAT', name: 'PTDS Aerostat', abbr: 'BLN', src: 'tether', cost: 600,
    speed: 0, alt: 950, sight: 2400, endurance: Infinity, orbitR: 50, tetherRange: 500,
  },
  // AC-130 gunship: orbits on-station with a three-gun suite. The player selects the
  // active weapon (only one fires at a time). Guns run a fire mode (will/designated/
  // hold); the 105mm is fired manually round-by-round like a UAV munition.
  // `rof` = rounds/sec, `spread` = aim scatter (m), `ammo` = rounds carried.
  SPECTRE: {
    key: 'SPECTRE', name: 'AC-130 Spectre', abbr: 'SPC', src: 'airfield', cost: 1500,
    speed: 36, alt: 1100, sight: 2000, endurance: 900, orbitR: 850,
    gunship: {
      order: ['GAU12', 'BOFORS', 'M102'],
      // guns fire ballistic rounds: `disp` = dispersion sigma (m) at the target — these
      // are area weapons, not pinpoint; `muzzleV` sets time-of-flight so the circling
      // aircraft must lead. `blast` = small lethal radius; `flash` scales the impact.
      // `burst` = [min,max] rounds per burst, `gap` = seconds between bursts. Ranges are
      // generous so a wide, high orbit still reaches the target.
      weapons: {
        GAU12:  { name: '25mm GAU-12', short: '25mm', kind: 'gun', rof: 16, dmg: 54, blast: 14, disp: 11, muzzleV: 1030, flash: 1.0, range: 3800, burst: [3, 7], gap: 2.0, ap: 2.4, ammo: 500 },
        BOFORS: { name: '40mm Bofors', short: '40mm', kind: 'gun', rof: 2.4, dmg: 76, blast: 24, disp: 8, muzzleV: 1005, flash: 1.7, range: 4000, burst: [2, 4], gap: 2.8, ap: 1.8, ammo: 100 },
        M102:   { name: '105mm M102', short: '105mm', kind: 'howitzer', dmg: 72, blast: 130, range: 4200, flight: 3, ammo: 10 },
      },
    },
  },
}

// Terrain movement factors: effective speed = base speed / factor.
export const MOVE_FACTORS = {
  foot:    { field: 1.0,  forest: 1.25, urban: 1.0,  water: Infinity, road: 0.85 },
  wheeled: { field: 1.7,  forest: 5.0,  urban: 1.25, water: Infinity, road: 0.55 },
  tracked: { field: 1.15, forest: 2.6,  urban: 1.35, water: Infinity, road: 0.7  },
}

// Damage taken multiplier when defending in cover.
export const COVER_DEF = { field: 1.0, forest: 0.65, urban: 0.5, water: 1.0 }
