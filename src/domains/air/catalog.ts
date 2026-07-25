// UAS catalog — INTERFACES + REGISTRY (stage 2: the engine ships verbs, packs
// ship nouns). Platform DATA lives in packs/lib/drones.ts and is installed
// into DRONE_TYPES by packs/install.ts.
//
// `src: 'airfield'` launches from an active airfield; `src: 'field'` is
// hand-launched by the friendly unit nearest the orbit point (within
// ctrlRange); `src: 'tether'` is moored at a FOB/HQ (1 per site): persistent
// high stare, cannot move. `endurance` = seconds ON STATION before mandatory
// RTB (transit time is free). `maxActive` = how many of this airframe may be
// airborne at once (omit = unlimited). `cooldown` = seconds the type is
// unavailable after a sortie ends (RTB, loss, or bingo), i.e. turnaround and
// rearm. Scarcity is structural, not just economic.

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

export type DroneTypeKey = string

// The registry: EMPTY until packs/install.ts populates it. A unit type's
// `carries` list must name keys that exist here once packs are installed.
export const DRONE_TYPES: Readonly<Record<string, DroneType>> = {}
