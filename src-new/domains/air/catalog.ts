// UAS catalog. `src: 'airfield'` launches from an active airfield; `src: 'field'`
// is hand-launched by the friendly unit nearest the orbit point (within ctrlRange);
// `src: 'tether'` is moored at a FOB/HQ (1 per site): persistent high stare, cannot move.
// `endurance` = seconds ON STATION before mandatory RTB (transit time is free).
// `maxActive` = how many of this airframe may be airborne at once (omit = unlimited).
// `cooldown` = seconds the type is unavailable after a sortie ends (RTB, loss, or
// bingo), i.e. turnaround and rearm. Scarcity is structural, not just economic — the
// stronger the platform, the fewer of them and the longer the wait.
// Ported verbatim from src/game/units.js (values unchanged).
import type { CarriedUasKey } from '../forces/catalog'

export type DroneSrc = 'airfield' | 'field' | 'tether'

// air-to-ground missile load (VIPER)
export interface DroneWeapons {
  ammo: number
  range: number
  dmg: number
  blast: number
  flight: number
}

export interface KamikazeSpec {
  dmg: number
  blast: number
}

// AC-130 gun suite. Guns fire ballistic rounds: `disp` = dispersion sigma (m) at
// the target — area weapons, not pinpoint; `muzzleV` sets time-of-flight so the
// circling aircraft must lead. `blast` = small lethal radius; `flash` scales the
// impact. `burst` = [min,max] rounds per burst, `gap` = seconds between bursts.
// Ranges are generous so a wide, high orbit still reaches the target.
export interface GunshipGun {
  name: string
  short: string
  kind: 'gun'
  rof: number       // rounds/sec
  dmg: number
  blast: number
  disp: number
  muzzleV: number
  flash: number
  range: number
  burst: readonly [number, number]
  gap: number
  ap: number
  ammo: number
}

// the 105mm is fired manually round-by-round like a UAV munition
export interface GunshipHowitzer {
  name: string
  short: string
  kind: 'howitzer'
  dmg: number
  blast: number
  range: number
  flight: number
  ammo: number
}

export type GunshipWeapon = GunshipGun | GunshipHowitzer

export interface GunshipSpec {
  order: readonly string[]
  weapons: Record<string, GunshipWeapon>
}

export interface DroneType {
  key: string
  name: string
  abbr: string
  src: DroneSrc
  cost: number
  speed: number
  alt: number
  sight: number
  endurance: number         // Infinity for the tethered aerostat
  orbitR: number
  maxActive?: number
  cooldown?: number
  ctrlRange?: number        // field-launched: max distance from controlling unit
  tetherRange?: number      // tethered: max mooring distance from the FOB/HQ
  weapons?: DroneWeapons
  kamikaze?: KamikazeSpec
  gunship?: GunshipSpec
}

const DRONE_TYPES_LITERAL = {
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

export type DroneTypeKey = keyof typeof DRONE_TYPES_LITERAL
// the table viewed through the interface: sim code accesses specs by a generic
// key (DRONE_TYPES[d.type]), which needs the optional fields visible on every member
export const DRONE_TYPES: Readonly<Record<DroneTypeKey, DroneType>> = DRONE_TYPES_LITERAL

// compile-time check: every UAS a ground unit can carry is a real drone type
type _AssertCarriedKeysExist = CarriedUasKey extends DroneTypeKey ? true : never
const _carriedKeysExist: _AssertCarriedKeysExist = true
void _carriedKeysExist
