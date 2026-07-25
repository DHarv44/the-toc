// Faction "Packs" — a formation as CONTENT: which unit types it fields
// organically, what's attached from elsewhere, and how its units are designated.
// Packs reference the shared base catalogs (weapons/vehicles/ammo are physics
// and live once); a pack is organization + identity on top. The same schema
// serves the player's division, fictional campaign OPFOR, and (later) real
// armies selectable in skirmish.
//
// P1 scope: organization + lineage only — zero combat/stat changes. Billets,
// ranks, names and the replacement pipeline layer onto this in later phases.
import type { UnitTypeKey } from '../domains/forces/catalog'

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

export interface Pack {
  id: string
  name: string            // '1st Cavalry Division'
  abbr: string            // '1CD'
  side: 'friend' | 'hostile'
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
