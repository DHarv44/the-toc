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
import type { DivOrg } from '../engine/GameState'
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

/** The formations that can actually field `type` — used to steer the author
 *  toward a real owner when the current selection has none. */
export function formationsWith(pack: Pack, type: UnitTypeKey): string[] {
  const org = orgFor(pack)
  if (!org) return []
  return [...new Set(org.slots.filter(sl => sl.type === type).map(sl => sl.bn))]
}
