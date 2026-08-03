// ORG QUERIES — what the SCENARIO BUILDER needs to know about a pack's real
// division (HANDOFF task-org phase 1). The pack already ships the whole
// formation: every brigade, battalion, company and platoon slot, every soldier
// named (packs/org.ts buildDivisionOrg). This module only ASKS that structure
// questions — it never re-derives org shape, so a pack that renames a brigade
// or adds a battalion flows through untouched.
//
// The vocabulary the builder speaks: a FORMATION DESIGNATION at any echelon
// ('1CD' the division, '3ABCT' a brigade, '2-8 CAV' a battalion). Units draw
// slots from a BATTALION (that is where fieldable platoons live); structures
// may belong to any echelon (DIV MAIN is the division's, a FOB may be a
// sister brigade's).
import type { DivOrg, OrgSlot } from '../engine/GameState'
import type { UnitTypeKey } from '../domains/forces/catalog'
import type { Pack } from './types'
import { isPlayableBn } from './types'
import { buildDivisionOrg } from './org'

export type Echelon = 'division' | 'brigade' | 'battalion'

export interface FormationRef {
  /** the designation entities carry: '1CD' | '3ABCT' | '2-8 CAV' */
  desig: string
  echelon: Echelon
  /** parent designation (brigade for a battalion, division for a brigade) */
  parent?: string
  /** display label for pickers: '2-8 CAV · 2ABCT' */
  label: string
  /** battalions only: may a player take this command (pack's own declaration) */
  playable?: boolean
}

// Building the division is deterministic and rng-free but not free — memoize
// per pack so the builder can ask budget questions every render.
const orgCache = new Map<string, DivOrg | null>()

/** The pack's division, built once and cached. The builder counts against
 *  this; the SIM builds its own (the live org is mutable state). */
export function orgFor(pack: Pack): DivOrg | null {
  const key = pack.id
  if (!orgCache.has(key)) orgCache.set(key, buildDivisionOrg(pack))
  return orgCache.get(key) ?? null
}

/** The DIVISION's own designation — a pack's abbr is its formation name. */
export const divisionDesig = (pack: Pack): string => pack.abbr || pack.id.toUpperCase()

/** Every formation an entity may belong to, division → brigades →
 *  battalions, in the pack's own order. */
export function formationOptions(pack: Pack): FormationRef[] {
  const f = pack.formation
  const div = divisionDesig(pack)
  const out: FormationRef[] = [{ desig: div, echelon: 'division', label: `${div} · DIVISION` }]
  if (!f) return out
  for (const bde of f.bdes) {
    out.push({
      desig: bde.desig, echelon: 'brigade', parent: div,
      label: bde.nick ? `${bde.desig} · ${bde.nick}` : bde.desig,
    })
    for (const bn of bde.bns) {
      out.push({
        desig: bn.desig, echelon: 'battalion', parent: bde.desig,
        label: `${bn.desig} · ${bde.desig}`,
        playable: isPlayableBn(f, bn.desig),
      })
    }
  }
  return out
}

// THE ORG TREE — division → brigades → battalions, in the pack's own order,
// with the ATTACHMENTS pseudo-brigade last. ONE definition of the hierarchy:
// the S1 console's DIVISION view and the builder's formation picker are two
// renderings of this, never two walks of the same data.
export interface OrgTreeNode {
  /** stable expand/select key: 'div' | 'bde:1ABCT' | 'bn:2-8 CAV' */
  key: string
  /** the designation an entity carries */
  desig: string
  echelon: Echelon
  /** display text ('ATTACHMENTS' for the attachment group) */
  label: string
  /** formation nickname — 'IRONHORSE' */
  nick?: string
  /** donor formation for an attached battalion — the ATT badge ('2ID') */
  donor?: string
  children: OrgTreeNode[]
}

/** The pack's formation as a tree. `org` supplies the attachments (they are
 *  materialized from pack.attached, not declared in the brigade plan). */
export function orgTree(pack: Pack, org: DivOrg | null = orgFor(pack)): OrgTreeNode {
  const f = pack.formation
  const div = divisionDesig(pack)
  const root: OrgTreeNode = {
    key: 'div', desig: div, echelon: 'division',
    label: pack.name || div, nick: pack.nick, children: [],
  }
  if (!f) return root
  for (const bde of f.bdes) {
    root.children.push({
      key: `bde:${bde.desig}`, desig: bde.desig, echelon: 'brigade',
      label: bde.desig, nick: bde.nick,
      children: bde.bns.map(bn => ({
        key: `bn:${bn.desig}`, desig: bn.desig, echelon: 'battalion',
        label: bn.desig, children: [],
      })),
    })
  }
  // attachments: battalions that exist only because something is task-organized
  // in from them. Their donor rides the badge; organic-but-attached shows none.
  const att = (org?.slots ?? []).filter(sl => sl.bde === 'ATT')
  if (att.length) {
    const bns = [...new Set(att.map(sl => sl.bn))]
    root.children.push({
      key: 'bde:ATT', desig: 'ATT', echelon: 'brigade', label: 'ATTACHMENTS',
      children: bns.map(bn => {
        const from = att.find(sl => sl.bn === bn)?.from
        return {
          key: `bn:${bn}`, desig: bn, echelon: 'battalion', label: bn,
          ...(from && from !== bn ? { donor: from } : {}),
          children: [],
        }
      }),
    })
  }
  return root
}

/** Battalions only — the formations a UNIT can belong to (slots live there). */
export const battalionOptions = (pack: Pack): FormationRef[] =>
  formationOptions(pack).filter(o => o.echelon === 'battalion')

/** Every battalion a player may command — the skirmish chair picker's source. */
export const playableFormations = (pack: Pack): FormationRef[] =>
  battalionOptions(pack).filter(o => o.playable)

/** The pack's default chair (its own playerBn). */
export const defaultPlayerFormation = (pack: Pack): string =>
  pack.formation?.playerBn ?? divisionDesig(pack)

/** Does this designation name a formation this pack ships? */
export const isFormation = (pack: Pack, desig: string): boolean =>
  formationOptions(pack).some(o => o.desig === desig)

/** A formation's INSIGNIA ART FILE, from its own entry in the formation plan
 *  (Formation.patch / BdePlan.patch / BnPlan.patch). Undefined = no art
 *  shipped, and the caller falls back to the 2525 echelon marker. */
export function patchOf(pack: Pack, desig: string | undefined): string | undefined {
  const f = pack.formation
  if (!desig || !f) return undefined
  if (desig === divisionDesig(pack)) return f.patch
  for (const bde of f.bdes) {
    if (bde.desig === desig) return bde.patch
    const bn = bde.bns.find(b => b.desig === desig)
    if (bn) return bn.patch
  }
  return undefined
}

/** WHAT ECHELON a designation is. This — not a separate structure kind — is
 *  what tells a division main from a brigade headquarters from a battalion
 *  command post: a command post is a command post, and whose it is decides
 *  what it is. Undefined for a designation the pack does not ship. */
export const echelonOf = (pack: Pack, desig: string | undefined): Echelon | undefined =>
  desig ? formationOptions(pack).find(o => o.desig === desig)?.echelon : undefined

/** The name an installation takes when the author does not give it one —
 *  DIV MAIN, 1ABCT MAIN, and nothing for your own (the scenario names that). */
export function defaultStructureLabel(
  pack: Pack, kind: string, formation: string | undefined, playerBn: string,
): string | undefined {
  if (kind !== 'HQ' || !formation || formation === playerBn) return undefined
  const ech = echelonOf(pack, formation)
  if (ech === 'division') return 'DIV MAIN'
  if (ech === 'brigade') return `${formation} MAIN`
  return `${formation} CP`
}

/** How many platoons of `type` the formation actually owns — the authoring
 *  budget ("MECH · 4/6"). A brigade counts its battalions'; the division
 *  counts everything. Zero means the formation has no such element, and the
 *  builder should not let an author invent one. */
export function slotBudget(pack: Pack, formation: string, type: UnitTypeKey): number {
  const org = orgFor(pack)
  if (!org) return 0
  const div = divisionDesig(pack)
  return org.slots.filter(sl =>
    sl.type === type && (formation === div || sl.bn === formation || sl.bde === formation),
  ).length
}

/** Every fieldable slot a formation owns, at any echelon (battalion desig or
 *  brigade desig; the division owns everything). The garrison a scenario
 *  author is drawing from. */
export function formationSlots(pack: Pack, formation: string): OrgSlot[] {
  const org = orgFor(pack)
  if (!org) return []
  const div = divisionDesig(pack)
  return org.slots.filter(sl =>
    sl.type && (formation === div || sl.bn === formation || sl.bde === formation))
}

/** The formation's garrison grouped by CAPABILITY — the same question the
 *  CALL UP flyout asks ("what kills that tank?"), asked at authoring time.
 *  Each group carries its real elements so the picker can brief ELM and STR
 *  exactly as the rails do. */
export interface CapabilityGroup {
  cat: string
  slots: OrgSlot[]
  /** the unit types inside, in catalog order */
  types: UnitTypeKey[]
}
export function capabilityGroups(pack: Pack, formation: string): CapabilityGroup[] {
  const units = pack.catalogs.units as Record<string, { cat?: string }>
  const out = new Map<string, CapabilityGroup>()
  for (const sl of formationSlots(pack, formation)) {
    const type = sl.type as UnitTypeKey
    const cat = units[type]?.cat ?? 'OTHER'
    const g = out.get(cat) ?? { cat, slots: [], types: [] }
    g.slots.push(sl)
    if (!g.types.includes(type)) g.types.push(type)
    out.set(cat, g)
  }
  return [...out.values()]
}

/** The formations that can actually field `type` — used to steer the author
 *  toward a real owner when the current selection has none. */
export function formationsWith(pack: Pack, type: UnitTypeKey): string[] {
  const org = orgFor(pack)
  if (!org) return []
  return [...new Set(org.slots.filter(sl => sl.type === type).map(sl => sl.bn))]
}
