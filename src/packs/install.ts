// Pack installer (stage 2): pours the active packs' catalogs into the engine
// registries. The engine ships the registries EMPTY; nothing spawns before
// this runs (packs/index.ts installs the defaults at module load, and initGame
// installs again — idempotent — so future pack selection just changes the
// list).
//
// Merge rule: identical object references under the same key are fine (packs
// compose from the shared library in packs/lib/, so the OPFOR pack re-listing
// a US platform is a no-op); a CONFLICTING redefinition throws — two packs may
// not disagree about what a key means. Install order = pack list order, which
// fixes registry iteration order (golden-relevant: keep the player pack
// first).
import type { Pack } from './types'
import { UNIT_TYPES, type UnitType } from '../domains/forces/catalog'
import {
  AMMO, WEAPONS, EXPENDABLES, TROOP_KINDS, VEHICLES, COMPOSITIONS, clearCompositionCaches,
  type AmmoType, type WeaponType, type ExpendableType, type TroopKind, type VehicleType,
  type UnitComposition,
} from '../domains/forces/composition'
import { DRONE_TYPES, type DroneType } from '../domains/air/catalog'
import { FACILITIES, type FacilityType } from '../domains/installations/catalog'

// the registries are exported Readonly for consumers; the installer is the one
// writer and holds the mutable view
type Mut<T> = Record<string, T>
const mUnits = UNIT_TYPES as Mut<UnitType>
const mAmmo = AMMO as Mut<AmmoType>
const mWeapons = WEAPONS as Mut<WeaponType>
const mExpend = EXPENDABLES as Mut<ExpendableType>
const mTroops = TROOP_KINDS as Mut<TroopKind>
const mVehicles = VEHICLES as Mut<VehicleType>
const mComps = COMPOSITIONS as Mut<UnitComposition>
const mDrones = DRONE_TYPES as Mut<DroneType>
const mFacilities = FACILITIES as Mut<FacilityType>

function wipe(reg: Mut<unknown>): void {
  for (const k of Object.keys(reg)) delete reg[k]
}

function merge<T>(reg: Mut<T>, table: Record<string, T> | undefined, what: string, packId: string): void {
  if (!table) return
  for (const [k, v] of Object.entries(table)) {
    const cur = reg[k]
    if (cur !== undefined && cur !== v) {
      throw new Error(`pack '${packId}' redefines ${what}.${k} — catalogs must share library entries or use new keys`)
    }
    reg[k] = v
  }
}

// WHO IS FIGHTING FOR WHOM this game. A pack is an ARMY; BLUEFOR and OPFOR are
// roles a scenario hands out, and the same army can be either in two different
// scenarios (or both, in a civil war). So the assignment lives HERE, with the
// installed lineup, and never as a property of the pack.
export type Side = 'friend' | 'hostile'
export type Lineup = Record<Side, Pack>

// the currently installed lineup (readable via activePack), and the packs
// whose catalogs are in the engine registries
let lineup: Lineup | null = null
let loaded: readonly Pack[] = []

export function activePack(side: Side): Pack | null {
  return lineup?.[side] ?? null
}

/** the packs whose catalogs are loaded, in install order */
export function installedPacks(): readonly Pack[] {
  return loaded
}

/** Install a lineup, loading EVERY known army's catalogs — not just the two
 *  that are fighting. Whose platforms exist and who is at war are different
 *  questions: a content browser needs to build any army's org, and a pack
 *  whose compositions were absent from the registry could not be inspected at
 *  all. Catalog keys are content-namespaced and a genuine collision still
 *  throws, so loading everything costs nothing but the merge.
 *
 *  The FRIEND pack installs first, which fixes registry iteration order
 *  (golden-relevant); the rest follow in discovery order. */
export function installLineup(next: Lineup, all: readonly Pack[] = []): void {
  lineup = next
  loaded = [...new Set([next.friend, next.hostile, ...all])]
  installPacks(loaded)
}

function installPacks(packs: readonly Pack[]): void {
  for (const reg of [mUnits, mAmmo, mWeapons, mExpend, mTroops, mVehicles, mComps, mDrones, mFacilities]) wipe(reg)
  clearCompositionCaches()
  for (const p of packs) {
    const c = p.catalogs
    merge(mUnits, c.units, 'units', p.id)
    merge(mAmmo, c.ammo, 'ammo', p.id)
    merge(mWeapons, c.weapons, 'weapons', p.id)
    merge(mExpend, c.expendables, 'expendables', p.id)
    merge(mTroops, c.troops, 'troops', p.id)
    merge(mVehicles, c.vehicles, 'vehicles', p.id)
    merge(mComps, c.comps, 'comps', p.id)
    merge(mDrones, c.drones, 'drones', p.id)
    merge(mFacilities, c.facilities, 'facilities', p.id)
  }
}
