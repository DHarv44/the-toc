// Shared pack-authoring library: US UAS / AIR PLATFORMS. Moved VERBATIM from
// domains/air/catalog.ts (stage 2 — see lib/units.ts header): same keys, same
// order, same numbers. The domain module keeps the interfaces and the flight/
// gunship VERBS; a pack installs tables like this one.
import type { DroneType } from '../../domains/air/catalog'

export const US_DRONES = {
  SHADOW: {
    key: 'SHADOW', name: 'RQ-7 Shadow', abbr: 'SHD', src: 'airfield', cost: 350,
    speed: 45, alt: 550, sight: 1500, endurance: 600, orbitR: 420,
    maxActive: 3, cooldown: 120,
  },
  SENTINEL: {
    key: 'SENTINEL', name: 'RQ-4 Sentinel', abbr: 'SEN', src: 'airfield', cost: 650,
    speed: 55, alt: 1250, sight: 2600, endurance: 1200, orbitR: 700,
    maxActive: 2, cooldown: 240,
  },
  VIPER: {
    key: 'VIPER', name: 'MQ-1 Viper', abbr: 'VPR', src: 'airfield', cost: 900,
    speed: 42, alt: 650, sight: 1500, endurance: 720, orbitR: 450,
    weapons: { ammo: 2, range: 2200, dmg: 55, blast: 70, flight: 7 },
    maxActive: 2, cooldown: 300,
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
    // the outlier: persistent area fire over a whole grid square. One at a time, and a
    // 15-minute turnaround, so committing it is a decision rather than a habit.
    maxActive: 1, cooldown: 900,
    gunship: {
      order: ['GAU12', 'BOFORS', 'M102'],
      weapons: {
        GAU12:  { name: '25mm GAU-12', short: '25mm', kind: 'gun', rof: 16, dmg: 54, blast: 14, disp: 11, muzzleV: 1030, flash: 1.0, range: 3800, burst: [3, 7], gap: 2.0, ap: 2.4, ammo: 250 },
        BOFORS: { name: '40mm Bofors', short: '40mm', kind: 'gun', rof: 2.4, dmg: 76, blast: 24, disp: 8, muzzleV: 1005, flash: 1.7, range: 4000, burst: [2, 4], gap: 2.8, ap: 1.8, ammo: 50 },
        M102:   { name: '105mm M102', short: '105mm', kind: 'howitzer', dmg: 72, blast: 130, range: 4200, flight: 3, ammo: 5 },
      },
    },
  },
} as const satisfies Record<string, DroneType>
