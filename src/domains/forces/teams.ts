// TASK ORGANIZATION — the other half of what an S3 does.
//
// A battalion does not fight the way it is organized on paper. It CROSS-ATTACHES:
// a tank platoon goes to the infantry company, an infantry platoon comes back
// the other way, the engineers are parcelled out, and the resulting grouping is
// named and given a commander. That grouping is a TEAM, and the whole document
// is the task organization. It is the first annex of every order ever written
// because everything downstream depends on who is under whom.
//
// WHAT WAS THERE BEFORE. `groupId` — a move-group id, minted fresh by every
// group move order and nulled the moment any element was given its own. It is
// a movement artifact, not an organization, and it showed: a "battle group" in
// the FORCES rail evaporated when you tasked one of its platoons somewhere, and
// the order of march written against it (domains/movement/march) went with it,
// because the plan is keyed on a gid that no longer existed.
//
// So a Team OWNS a gid, drawn from the same counter and held for life. March
// plans, the column solver and the S3 board all key on it exactly as before —
// none of that code changed. It simply stopped being thrown away.
//
// WHAT A TEAM IS NOT. It is not a new echelon. The platoon is still the thing
// that moves, fights, takes casualties and reports; a Team is a line on a task
// organization, which is to say a decision about who answers to whom. It also
// does not touch `underPlayerCommand` — that is about whether the BATTALION
// owns an element at all (domains/forces/command), a different and higher
// question that a team of the player's own platoons cannot change.
import { S } from '../../engine/state'
import type { Soldier, Team, Unit } from '../../engine/GameState'
import { seniorOf, rankW } from '../../packs/ranks'
import { radio } from '../comms/radio'
import { underPlayerCommand } from './command'
import { marchPlan, setMarchOrder } from '../movement/march'

export const teams = (): Team[] => S.teams
export const teamById = (id: number): Team | undefined => S.teams.find(t => t.id === id)

/** The team an element belongs to. Membership is the team's list, not a field
 *  on the unit: a unit carries `groupId` for the column it is marching in, and
 *  conflating "who I answer to" with "who I am driving behind" is exactly the
 *  mistake this module exists to undo. */
export const teamOf = (u: Unit | number): Team | undefined => {
  const id = typeof u === 'number' ? u : u.id
  return S.teams.find(t => t.members.includes(id))
}

/** Live members, in task-organization order. */
export const teamUnits = (t: Team): Unit[] =>
  t.members
    .map(id => S.units.find(u => u.id === id))
    .filter((u): u is Unit => !!u && u.strength > 0)

// --- naming ------------------------------------------------------------------

// A COMPANY TEAM IS NAMED FOR THE COMPANY THAT FORMS ITS CORE — Team Bravo is
// B Company with pieces swapped in and out. So the name derives from the base
// element and needs no new pack vocabulary: the callsign pool the army already
// uses for its elements ('ECHO-5') supplies the word.
//
// It is fixed at formation and does NOT follow the commander afterwards. If
// Echo's platoon leader is killed and Fox's takes the team, it is still Team
// Echo — re-designating a grouping mid-fight is how radio traffic gets people
// killed, and the mismatch between the name and who is answering for it is a
// fact worth being able to see.
const stem = (label: string): string => label.split('-')[0] ?? label

function uniqueName(base: string): string {
  if (!S.teams.some(t => t.name === base)) return base
  for (let n = 2; n < 99; n++) {
    const cand = `${base} ${n}`
    if (!S.teams.some(t => t.name === cand)) return cand
  }
  return base
}

// --- forming ------------------------------------------------------------------

/** Form a team. The BASE is the element it is named for and built around —
 *  the first one given, unless the caller names another.
 *
 *  An element can only be in one task organization at a time, which is not a
 *  simplification: dual command is the thing task organization exists to
 *  prevent. Joining a new team leaves the old one. */
export function formTeam(unitIds: number[], baseId?: number): Team | null {
  const units = unitIds
    .map(id => S.units.find(u => u.id === id))
    .filter((u): u is Unit => !!u && u.strength > 0 && underPlayerCommand(u))
  if (!units.length) return null
  const base = units.find(u => u.id === baseId) ?? units[0]!
  for (const u of units) leaveTeam(u.id, true)
  const t: Team = {
    id: S.counters.groupSeq++,          // the gid, held for life
    name: uniqueName(`TEAM ${stem(base.label)}`),
    baseId: base.id,
    cdrId: null,
    members: units.map(u => u.id),
    formedT: S.t,
  }
  S.teams.push(t)
  // A TEAM HAS AN ORDER OF MARCH FROM THE MOMENT IT EXISTS. The base element
  // leads and the rest fall in behind it in the order they were task organized,
  // because a grouping with no order is not a column — it is four platoons
  // going the same way, which is what this looked like before. The commander
  // can rewrite it in the S3; they should not have to write it to get a column.
  setMarchOrder(t.id, t.members, 'open')
  const cdr = teamCdr(t)
  t.cdrSoldier = cdr?.soldier?.id
  radio(t.name, 'move', `TASK ORGANIZED — ${units.length} ELEMENTS, ${
    cdr ? `${cdr.soldier?.rank ?? ''} ${cdr.soldier?.name ?? cdr.unit.label} COMMANDING` : 'NO COMMANDER'
  }`.replace(/\s+/g, ' '), base.x, base.y)
  return t
}

export function joinTeam(teamId: number, unitId: number): boolean {
  const t = teamById(teamId)
  const u = S.units.find(x => x.id === unitId)
  if (!t || !u || !underPlayerCommand(u)) return false
  if (t.members.includes(unitId)) return true
  leaveTeam(unitId, true)
  t.members.push(unitId)
  // a unit joining a formed column falls in at the TAIL of the order of march,
  // which is where a joiner actually goes — not wherever a solver would put it
  const p = marchPlan(t.id)
  setMarchOrder(t.id, [...(p?.order.filter(id => t.members.includes(id)) ?? []), unitId],
    p?.column ?? 'open', {
      ...(p?.roe ? { roe: p.roe } : {}),
      ...(p?.weapons ? { weapons: p.weapons } : {}),
      ...(p?.disabled ? { disabled: p.disabled } : {}),
    })
  radio(t.name, 'move', `${u.label} ATTACHED`, u.x, u.y)
  return true
}

/** THE ONE TASK-ORGANIZE VERB.
 *
 *  The map needs to do this without the player looking away from it — task
 *  organizing is a decision you make with units under the cursor, and making
 *  the commander drop their eyes to a button rail to do it is how a grouping
 *  never gets formed at all. But a hotkey that re-derived "what should this
 *  selection become" would be a second rule beside the tray's, and two rules
 *  for one decision drift.
 *
 *  So the rule lives here, once, and reads the selection the way a commander
 *  would: loose elements become a team; loose elements alongside exactly one
 *  existing team join it; anything else is already organized and says so. */
export function taskOrganize(unitIds: number[]):
{ kind: 'formed' | 'joined' | 'none'; team?: Team; n: number } {
  const units = unitIds
    .map(id => S.units.find(u => u.id === id))
    .filter((u): u is Unit => !!u && u.strength > 0 && underPlayerCommand(u))
  if (!units.length) return { kind: 'none', n: 0 }
  const free = units.filter(u => !teamOf(u))
  const named = [...new Set(units.map(u => teamOf(u)?.id).filter((v): v is number => v != null))]
  if (named.length === 1 && free.length) {
    const t = teamById(named[0]!)
    if (t) {
      for (const u of free) joinTeam(t.id, u.id)
      return { kind: 'joined', team: t, n: free.length }
    }
  }
  if (!named.length && free.length >= 2) {
    const t = formTeam(free.map(u => u.id))
    if (t) return { kind: 'formed', team: t, n: free.length }
  }
  return { kind: 'none', n: units.length }
}

/** Detach an element. `quiet` for internal moves (joining another team) where
 *  the net call would be noise — the attachment call says it already. */
export function leaveTeam(unitId: number, quiet = false): void {
  const t = teamOf(unitId)
  if (!t) return
  t.members = t.members.filter(id => id !== unitId)
  if (t.cdrId === unitId) t.cdrId = null
  const u = S.units.find(x => x.id === unitId)
  if (u && u.groupId === t.id) { u.groupId = null; u.colIdx = null; u.leadId = null }
  if (!quiet && u) radio(t.name, 'move', `${u.label} DETACHED`, u.x, u.y)
  if (!t.members.length) disbandTeam(t.id)
}

export function disbandTeam(teamId: number): void {
  const i = S.teams.findIndex(t => t.id === teamId)
  if (i < 0) return
  const t = S.teams[i]!
  for (const id of t.members) {
    const u = S.units.find(x => x.id === id)
    if (u && u.groupId === t.id) { u.groupId = null; u.colIdx = null; u.leadId = null }
  }
  S.teams.splice(i, 1)
  // the order of march belonged to the team, not to whatever drives past next
  const m = S.march.findIndex(p => p.gid === teamId)
  if (m >= 0) S.march.splice(m, 1)
}

export function renameTeam(teamId: number, name: string): void {
  const t = teamById(teamId)
  const clean = name.trim().toUpperCase().slice(0, 24)
  if (!t || !clean || clean === t.name) return
  t.name = uniqueName(clean)
}

// --- command ------------------------------------------------------------------

export interface TeamCdr {
  unit: Unit
  soldier: Soldier | undefined
  /** the commander is standing in because the designated element cannot */
  acting: boolean
}

/** WHO ANSWERS FOR THE TEAM.
 *
 *  Derived, every time it is asked, which is what makes succession free and
 *  correct: there is no scheduled hand-over to run and no stale pointer to a
 *  dead officer. If the designated element still has a fit leader, it commands.
 *  Otherwise the senior fit leader anywhere in the team does — and that is not
 *  a fallback, it is what actually happens the instant the commander goes down. */
export function teamCdr(t: Team): TeamCdr | null {
  const live = teamUnits(t)
  if (!live.length) return null
  const leaderOf = (u: Unit) => seniorOf(u.soldiers, true)
  const designated = live.find(u => u.id === (t.cdrId ?? t.baseId))
  const desig = designated ? leaderOf(designated) : undefined
  if (designated && desig) return { unit: designated, soldier: desig, acting: false }
  let best: Unit | undefined
  let bestS: Soldier | undefined
  for (const u of live) {
    const s = leaderOf(u)
    if (!s) continue
    if (!bestS || rankW(s.rank) > rankW(bestS.rank)) { best = u; bestS = s }
  }
  if (!best) return null
  return { unit: best, soldier: bestS, acting: true }
}

/** Hand command to a named element. Passing null returns it to the base (or,
 *  if the base cannot, to whoever is senior). */
export function designateCdr(teamId: number, unitId: number | null): void {
  const t = teamById(teamId)
  if (!t) return
  if (unitId != null && !t.members.includes(unitId)) return
  t.cdrId = unitId
  const cdr = teamCdr(t)
  t.cdrSoldier = cdr?.soldier?.id
  if (cdr) {
    radio(t.name, 'move',
      `${cdr.soldier?.rank ?? ''} ${cdr.soldier?.name ?? cdr.unit.label} HAS THE TEAM`.replace(/\s+/g, ' '),
      cdr.unit.x, cdr.unit.y)
  }
}

/** Is this element from somewhere other than the team's base? That is what
 *  CROSS-ATTACHED means and it is the whole reason a task organization is
 *  written down — a platoon fighting for a company that is not its own. */
export function isCrossAttached(t: Team, u: Unit): boolean {
  const base = S.units.find(x => x.id === t.baseId)
  if (!base || u.id === base.id) return false
  if (!u.lineage || !base.lineage) return false
  return owner(u.lineage) !== owner(base.lineage)
}

/** WHO OWNS THIS ELEMENT — its lineage with its own designation stripped off:
 *  '1st PLT, A CO, 1-506 IN' → 'A CO, 1-506 IN'.
 *
 *  The whole tail, not just the next rung up. Three platoons can all be 1st PLT
 *  of an A CO and belong to three different battalions, which is precisely the
 *  case a task organization exists to record — comparing one rung reported them
 *  as the same company and found no cross-attachment anywhere, ever. The engine
 *  does not know what a company or a battalion is; it knows the pack writes the
 *  element first and its chain of ownership after, which is all this needs. */
export const owner = (lineage: string): string => {
  const i = lineage.indexOf(',')
  return (i < 0 ? lineage : lineage.slice(i + 1)).trim()
}

// --- the tick ------------------------------------------------------------------

/** Drop dead teams, and NOTICE when command has changed hands.
 *
 *  Succession is not modelled as an event because it is not one — the next
 *  senior is in charge from the instant the last one stops being. What the TOC
 *  gets is the report, which is the only part that was ever a separate thing. */
export function teamSweep(): void {
  for (let i = S.teams.length - 1; i >= 0; i--) {
    const t = S.teams[i]!
    t.members = t.members.filter(id => {
      const u = S.units.find(x => x.id === id)
      return !!u && u.strength > 0
    })
    if (!t.members.length) { disbandTeam(t.id); continue }
    const cdr = teamCdr(t)
    const now = cdr?.soldier?.id
    if (now !== t.cdrSoldier) {
      const had = t.cdrSoldier != null
      t.cdrSoldier = now
      if (had && cdr) {
        radio(t.name, 'damage',
          `${cdr.soldier?.rank ?? ''} ${cdr.soldier?.name ?? cdr.unit.label} HAS THE TEAM — ${
            cdr.unit.label} ASSUMING COMMAND`.replace(/\s+/g, ' '),
          cdr.unit.x, cdr.unit.y)
      }
    }
  }
}
