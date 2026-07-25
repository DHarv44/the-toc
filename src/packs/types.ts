// Faction "Packs" — a formation as CONTENT: which unit types it fields
// organically, what's attached from elsewhere, and how its units are designated.
// Packs reference the shared base catalogs (weapons/vehicles/ammo are physics
// and live once); a pack is organization + identity on top. The same schema
// serves the player's division, fictional campaign OPFOR, and (later) real
// armies selectable in skirmish.
//
// Stage 2 (2026-07-25): a pack is SELF-CONTAINED content — it ships its own
// platform catalogs (units/vehicles/weapons/ammo/troops/comps/drones) composed
// from the shared library in packs/lib/ (or entirely its own tables), plus its
// name pools. The engine defines the interfaces and behaviors; packs/install.ts
// pours the active packs' data into the engine registries at init. One pack can
// change the entire game.
import type { UnitType, UnitTypeKey } from '../domains/forces/catalog'
import type {
  AmmoType, WeaponType, TroopKind, VehicleType, UnitComposition,
} from '../domains/forces/composition'
import type { DroneType } from '../domains/air/catalog'

// how a unit type's parent element is designated inside its battalion:
//  - 'plt'  — numbered platoon in a lettered company ("1st PLT, A CO, 2-8 CAV")
//  - 'btry' — lettered battery ("A BTRY, 1-82 FA")
//  - 'hhc'  — a named specialty platoon in HHC ("SCT PLT, HHC, 2-8 CAV")
export type LineageStyle = 'plt' | 'btry' | 'hhc'

export interface OrganicSlot {
  bn: string              // parent battalion designation, e.g. '2-8 CAV'
  style?: LineageStyle    // default 'plt'
  hhcName?: string        // the specialty platoon's name for style 'hhc'
}

export interface AttachedSlot extends OrganicSlot {
  from: string            // donor formation, e.g. '2ID' — shown as the ATT tag
}

// --- full-division formation ------------------------------------------------
// The pack ships the ENTIRE division as data: brigades → battalions, each
// battalion expanded to companies/platoon slots by its kind's template
// (packs/org.ts). `tfCos` lists the companies allocated to the player's task
// force (fieldable, garrisoned in theater); the player battalion contributes
// everything. Skirmish later opens the whole tree; campaign stays on playerBn.
export type BnKind =
  | 'CAB' | 'ARMOR' | 'RECON' | 'FA' | 'BEB' | 'BSB' | 'SIG'   // ground
  | 'ARB' | 'AHB' | 'GSAB' | 'ASB'                              // air cav
  | 'CSSB' | 'HHBN' | 'HHB-DIVARTY' | 'STB'                     // support/staff

export interface BnPlan {
  desig: string           // '2-8 CAV'
  kind: BnKind
  tfCos?: string[]        // companies allocated to the TF ('A CO'…); playerBn = all
}

export interface BdePlan {
  desig: string           // '1ABCT'
  nick?: string           // 'IRONHORSE'
  bns: BnPlan[]
}

export interface Formation {
  playerBn: string        // the battalion the player commands ('2-8 CAV')
  bdes: BdePlan[]
}

// Everything the pack's formations are made of. Tables usually reference the
// shared library (packs/lib/*) — identical object references across packs are
// fine (the installer merges by identity); CONFLICTING redefinitions of a key
// throw at install. A total-conversion pack ships tables of its own.
export interface PackCatalogs {
  units: Record<string, UnitType>
  ammo: Record<string, AmmoType>
  weapons: Record<string, WeaponType>
  troops: Record<string, TroopKind>
  vehicles: Record<string, VehicleType>
  comps: Record<string, UnitComposition>
  drones?: Record<string, DroneType>
}

// Name pools the engine draws from when generating this pack's personnel.
// FRAMEWORK mode: ship pools, the engine expands deterministically. A pack
// that ships none falls back to the neutral default (packs/personnel.ts).
export interface NamePools {
  first: readonly string[]
  last: readonly string[]
}

// EXPLICIT mode: pin real people onto generated billets. Key format is
// '<org slot path>/<billet pos>' (e.g. '2-8 CAV/HHC/STAFF/S1 — Personnel');
// anything not pinned falls through to generation. This is how a pack ships a
// real roster without giving up procedural fill for the rest.
export type PeoplePins = Record<string, { name?: string; rank?: string }>

export interface Pack {
  id: string
  name: string            // '1st Cavalry Division'
  abbr: string            // '1CD'
  side: 'friend' | 'hostile'
  catalogs: PackCatalogs  // the platforms this pack's world is made of
  names?: NamePools       // personnel name generation inputs
  people?: PeoplePins     // explicit roster pins (override generation)
  patch?: string          // shoulder-sleeve insignia id — rendered by ui/insignia (keeps pack data JSON-able)
  rankStyle?: string      // rank-insignia style id ('us' chevrons/bars; other armies bring their own)
  // every unit type the game offers is either organic to the formation or an
  // attachment from a donor; a type in neither map simply isn't fielded by
  // this pack (not enforced in P1 — the palette still offers everything)
  organic: Partial<Record<UnitTypeKey, OrganicSlot>>
  attached: Partial<Record<UnitTypeKey, AttachedSlot>>
  formation?: Formation   // the whole division (org materializes from this)
  // regimental mottos by battalion designation — real lineage heraldry
  // (rendered on the S1 battalion header's coat of arms)
  mottos?: Record<string, string>
  // battalion nicknames (battalion-specific, unlike regimental mottos)
  nicks?: Record<string, string>
}

const ORD = ['1st', '2nd', '3rd', '4th'] as const
const CO = ['A', 'B', 'C', 'D'] as const

// The nth fielded unit of a type → its formal lineage line. Deterministic and
// rng-free (a plain counter drives n), so fielding order alone decides slots.
export function lineageFor(pack: Pack, type: UnitTypeKey, n: number): { text: string; from: string | null } {
  const slot = pack.organic[type] ?? pack.attached[type]
  if (!slot) return { text: pack.abbr, from: null }
  const from = 'from' in slot ? (slot as AttachedSlot).from : null
  const style = slot.style ?? 'plt'
  let elem: string
  if (style === 'btry') {
    elem = `${CO[n % CO.length]} BTRY`
  } else if (style === 'hhc') {
    const nth = Math.floor(n)
    elem = `${slot.hhcName ?? 'SCT PLT'}${nth > 0 ? ` (${nth + 1})` : ''}, HHC`
  } else {
    elem = `${ORD[n % 3]} PLT, ${CO[Math.floor(n / 3) % CO.length]} CO`
  }
  return { text: `${elem}, ${slot.bn}`, from }
}
