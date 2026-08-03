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
import type { EchelonDef, FormationNode, Pack } from './types'
import { chairRung, isPlayableBn, walkFormation } from './types'
import { buildDivisionOrg } from './org'

/** A rung's NAME in this army — 'BRIGADE', 'REGIMENT', 'BROOD'. The top
 *  formation is rung -1 and always the pack itself; everything below is an
 *  index into Formation.echelons. A rung the pack did not name reads as its
 *  depth rather than as somebody else's word for it. */
export type Echelon = string

/** A rung's NAME in this army — 'BRIGADE', 'REGIMENT', 'BROOD'. Rung -1 is the
 *  top formation, which is the pack itself. A rung the pack did not name reads
 *  as its depth rather than as somebody else's word for it. */
const rungDef = (pack: Pack, rung: number): EchelonDef | undefined =>
  rung < 0 ? pack.formation?.top : pack.formation?.echelons?.[rung]

export const echelonAt = (pack: Pack, rung: number): Echelon =>
  rungDef(pack, rung)?.name ?? (rung < 0 ? 'FORMATION' : `RUNG ${rung + 1}`)

/** The 2525 SIZE MARKER a formation at this rung wears — 'XX', 'III', 'II'.
 *  Undefined = this army does not mark size, which is a legitimate thing for a
 *  force with no echelons to say. */
export const echelonMark = (pack: Pack, rung: number): string | undefined =>
  rungDef(pack, rung)?.mark

export interface FormationRef {
  /** the designation entities carry: '1CD' | '3ABCT' | '2-8 CAV' */
  desig: string
  /** depth below the top formation; -1 IS the top formation */
  rung: number
  echelon: Echelon
  /** parent designation */
  parent?: string
  /** display label for pickers: '2-8 CAV · 2ABCT' */
  label: string
  /** chair rung only: may a player take this command (the pack's declaration) */
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

/** THE ELEMENT THAT OWNS A SLOT — the last rung of its lineage ('A CO', 'HHC').
 *  What a call-up row groups under and what `tfCos` names. */
export const ownerOf = (sl: OrgSlot): string => sl.path[sl.path.length - 1] ?? sl.cmd

/** Every formation an entity may belong to, top formation first and then the
 *  whole tree in the pack's own declaration order, however deep it goes. */
export function formationOptions(pack: Pack): FormationRef[] {
  const f = pack.formation
  const div = divisionDesig(pack)
  const out: FormationRef[] = [{
    desig: div, rung: -1, echelon: echelonAt(pack, -1), label: `${div} · ${pack.name ?? div}`,
  }]
  if (!f) return out
  for (const w of walkFormation(f)) {
    out.push({
      desig: w.node.desig, rung: w.rung, echelon: echelonAt(pack, w.rung),
      parent: w.parent ?? div,
      label: w.node.nick ? `${w.node.desig} · ${w.node.nick}` : `${w.node.desig} · ${w.parent ?? div}`,
      ...(w.rung === chairRung(f) ? { playable: isPlayableBn(f, w.node.desig) } : {}),
    })
  }
  return out
}

// THE ORG TREE — division → brigades → battalions, in the pack's own order,
// with the ATTACHMENTS pseudo-brigade last. ONE definition of the hierarchy:
// the S1 console's DIVISION view and the builder's formation picker are two
// renderings of this, never two walks of the same data.
export interface OrgTreeNode {
  /** stable expand/select key: 'div' | 'f:1ABCT' | 'f:2-8 CAV' */
  key: string
  /** the designation an entity carries */
  desig: string
  /** depth below the top formation; -1 IS the top formation */
  rung: number
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
    key: 'div', desig: div, rung: -1, echelon: echelonAt(pack, -1),
    label: pack.name || div, nick: pack.nick, children: [],
  }
  if (!f) return root
  // the declared tree, however deep — a brigade over battalions, a regiment
  // over companies, a hive over broods, or nothing at all under a flat force
  const build = (nodes: FormationNode[], rung: number): OrgTreeNode[] =>
    nodes.map(n => ({
      key: `f:${n.desig}`, desig: n.desig, rung, echelon: echelonAt(pack, rung),
      label: n.desig, ...(n.nick ? { nick: n.nick } : {}),
      children: build(n.under ?? [], rung + 1),
    }))
  root.children = build(f.under, 0)

  // attachments: formations that exist only because something is task-organized
  // in from them. Their donor rides the badge; organic-but-attached shows none.
  const att = (org?.slots ?? []).filter(sl => sl.path[0] === 'ATT')
  if (att.length) {
    const bns = [...new Set(att.map(sl => sl.cmd))]
    root.children.push({
      key: 'f:ATT', desig: 'ATT', rung: 0, echelon: echelonAt(pack, 0), label: 'ATTACHMENTS',
      children: bns.map(bn => {
        const from = att.find(sl => sl.cmd === bn)?.from
        return {
          key: `f:${bn}`, desig: bn, rung: 1, echelon: echelonAt(pack, 1), label: bn,
          ...(from && from !== bn ? { donor: from } : {}),
          children: [],
        }
      }),
    })
  }
  return root
}

/** The CHAIR RUNG only — the formations a UNIT can belong to (slots live at
 *  the rung a commander commands: a battalion, an MI company, a brood). */
export const battalionOptions = (pack: Pack): FormationRef[] =>
  formationOptions(pack).filter(o => o.rung === chairRung(pack.formation))

/** Every battalion a player may command — the skirmish chair picker's source. */
export const playableFormations = (pack: Pack): FormationRef[] =>
  battalionOptions(pack).filter(o => o.playable)

/** The pack's default chair. */
export const defaultPlayerFormation = (pack: Pack): string =>
  pack.formation?.chair ?? divisionDesig(pack)

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
  return walkFormation(f).find(w => w.node.desig === desig)?.node.patch
}

/** A battalion's REGIMENTAL COAT OF ARMS art file (BnPlan.arms) — the other
 *  half of a unit's heraldry, and a different file from its DUI. */
export function armsOf(pack: Pack, desig: string | undefined): string | undefined {
  if (!desig) return undefined
  return walkFormation(pack.formation).find(w => w.node.desig === desig)?.node.arms
}

/** The rung a designation sits at; -1 is the top formation, undefined if the
 *  pack does not ship it. */
export const rungOf = (pack: Pack, desig: string | undefined): number | undefined =>
  desig ? formationOptions(pack).find(o => o.desig === desig)?.rung : undefined

/** A FORMATION'S SIZE MARKER, by designation — what a map symbol wears above
 *  the frame for whoever owns it. */
export function markOf(pack: Pack, desig: string | undefined): string | undefined {
  const rung = rungOf(pack, desig)
  return rung == null ? undefined : echelonMark(pack, rung)
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
  const rung = rungOf(pack, formation)
  if (rung == null) return undefined
  // the top formation runs a MAIN, and so does anything above the chair; at or
  // below the chair's own rung a headquarters is a command post
  if (rung < 0) return 'DIV MAIN'
  return rung < chairRung(pack.formation) ? `${formation} MAIN` : `${formation} CP`
}

/** How many platoons of `type` the formation actually owns — the authoring
 *  budget ("MECH · 4/6"). A brigade counts its battalions'; the division
 *  counts everything. Zero means the formation has no such element, and the
 *  builder should not let an author invent one. */
export function slotBudget(pack: Pack, formation: string, type: UnitTypeKey): number {
  const org = orgFor(pack)
  if (!org) return 0
  const div = divisionDesig(pack)
  // a formation owns everything BELOW it too — the path answers at any rung,
  // so a brigade counts its battalions' and the top formation counts all of it
  return org.slots.filter(sl =>
    sl.type === type && (formation === div || sl.path.includes(formation)),
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
    sl.type && (formation === div || sl.path.includes(formation)))
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
  return [...new Set(org.slots.filter(sl => sl.type === type).map(sl => sl.cmd))]
}
