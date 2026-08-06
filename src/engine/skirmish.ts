// SKIRMISH — a MATCH, not a war. The lobby (ui/skirmish/Lobby) builds a
// SkirmishSetup; this module turns one into a running game.
//
// The two rules the design settled (ROADMAP → Skirmish Lobby):
//
//   THE LOBBY PICKS WHAT, THE SCENARIO DECIDES WHERE. Nothing is drag-placed
//   in a lobby — the player's picks become the TASK-FORCE MARKING on the org
//   (which slots CALL UP can draw), and the force is fielded from the HQ at
//   H-hour like any other game. The OPFOR's composition flows through the
//   mode's own setup, exactly as its defaults do.
//
//   DIFFICULTY IS AN OVERALL PRESET LIMITING THE BUDGETS. The preset sets both
//   sides' caps — the asymmetry IS the difficulty. (Later the same preset
//   drives AI weight tables and damageMul; today damageMul already rides the
//   difficulty it names.)
//
// The setup document is deliberately multiplayer-shaped: each side is a list
// of TEAM SLOTS, one per commanding player/CPU. Today exactly one slot per
// side exists (you vs the OPFOR commander); a lobby with more slots is the
// same document with more entries, which is what makes multiplayer a
// transport problem instead of a redesign.
import { S } from './state'
import { initGame } from './scenario'
import type { ModeId } from './modes'
import type { DifficultyKey } from '../domains/economy/difficulty'
import type { DivOrg } from './GameState'
import type { UnitTypeKey } from '../domains/forces/catalog'
import type { WorldMap } from '../world/WorldMap'
import type { Pack } from '../packs/types'
import { buildDivisionOrg } from '../packs/org'
import { playerPack } from '../packs'

// --- the setup document ------------------------------------------------------

export interface SkirmishSlotPick {
  controller: 'player' | 'cpu'
  pack: string               // pack id
  chair?: string             // the battalion this slot commands (player slots)
  /** picked lobby-group keys (see lobbyGroups) — the slot's task organization */
  force: string[]
}

/** What the SCENARIO dropdown picked: a pre-built ruleset that adapts to any
 *  map, or an authored Eden battle (which brings its own map and sides). */
export type SkirmishScenarioSel =
  | { kind: 'mode'; mode: ModeId }
  | { kind: 'authored'; ref: string }    // 'packId/scenarioId'

export interface SkirmishSetup {
  map: string                // 'packId/mapId'
  scenario: SkirmishScenarioSel
  difficulty: DifficultyKey
  sides: { friend: SkirmishSlotPick[]; hostile: SkirmishSlotPick[] }
}

// --- budgets -----------------------------------------------------------------
// Priced in the same points as UnitType.cost (a rifle platoon is ~100, armor
// ~400). The asymmetry is the difficulty; the numbers are playtest-tunable.
// The OPFOR cap is phase 2 (its column becomes editable) — today it is shown
// in the lobby and the OPFOR commander builds under its usual economy.
export const LOBBY_BUDGETS: Record<DifficultyKey, { player: number; opfor: number }> = {
  recruit: { player: 6000, opfor: 2600 },
  regular: { player: 4600, opfor: 4600 },
  veteran: { player: 3800, opfor: 6000 },
  elite: { player: 3000, opfor: 7500 },
}

// --- the pickable force ------------------------------------------------------
// The lobby does not sell UNITS, it sells TASK ORGANIZATION: groups of real
// org slots (a company's platoons, an attachment slice) drawn from the pack's
// own ORBAT. A group's key is its slots' shared path, which is stable across
// rebuilds of the same pack + chair.

export interface LobbyGroup {
  key: string                // '1ABCT/2-8 CAV/A CO'
  name: string               // 'A CO'
  parent: string             // '2-8 CAV'
  branch: string             // top rung, for tree grouping ('1ABCT', 'ATT')
  from?: string              // donor formation — this slice is an ATTACHMENT
  organic: boolean           // the chair's own element
  defaultOn: boolean         // in the default task organization for this chair
  cost: number
  slotCount: number
  units: string              // '3× RFL · 1× MGS'
}

const unitCost = (pack: Pack, type: UnitTypeKey): number =>
  (pack.catalogs?.units?.[type] as { cost?: number } | undefined)?.cost ?? 200

const unitAbbr = (pack: Pack, type: UnitTypeKey): string =>
  (pack.catalogs?.units?.[type] as { abbr?: string } | undefined)?.abbr ?? type

/** Every task-organizable group this pack + chair offers, in ORBAT order. */
export function lobbyGroups(pack: Pack, chair: string): LobbyGroup[] {
  const org = buildDivisionOrg(pack, chair)
  if (!org) return []
  const out = new Map<string, LobbyGroup & { types: Map<UnitTypeKey, number> }>()
  for (const sl of org.slots) {
    if (!sl.type) continue
    const key = sl.path.join('/')
    let g = out.get(key)
    if (!g) {
      g = {
        key,
        name: sl.path[sl.path.length - 1] ?? key,
        parent: sl.path[sl.path.length - 2] ?? '',
        branch: sl.path[0] ?? '',
        ...(sl.from ? { from: sl.from } : {}),
        organic: !sl.from,
        defaultOn: false,
        cost: 0, slotCount: 0, units: '',
        types: new Map(),
      }
      out.set(key, g)
    }
    g.cost += unitCost(pack, sl.type)
    g.slotCount++
    g.types.set(sl.type, (g.types.get(sl.type) ?? 0) + 1)
    if (sl.tf) g.defaultOn = true
  }
  return [...out.values()].map(({ types, ...g }) => ({
    ...g,
    units: [...types.entries()].map(([t, n]) => `${n}× ${unitAbbr(pack, t)}`).join(' · '),
  }))
}

/** The chair's default task organization — what the force column opens with.
 *  ORGANIC only, deliberately: the pack's default cross-attachments (tfCos,
 *  attached slices) priced the default org over every budget but RECRUIT's.
 *  Your battalion is yours; attachments are what the budget is FOR. */
export const defaultForce = (groups: LobbyGroup[]): string[] =>
  groups.filter(g => g.defaultOn && g.organic).map(g => g.key)

/** Re-mark the org from the lobby's picks: a typed slot is task-force exactly
 *  when its group was taken. This is the whole mechanism — CALL UP already
 *  fields from tf slots, so the picks ARE the H-hour allocations. */
export function applyForcePicks(org: DivOrg, picked: readonly string[]): void {
  const set = new Set(picked)
  for (const sl of org.slots) {
    if (sl.type) sl.tf = set.has(sl.path.join('/'))
  }
}

// --- init --------------------------------------------------------------------

/** Start a mode-ruleset skirmish from a lobby setup. (An authored-scenario
 *  pick goes through initScenarioGame instead — the App routes it.) */
export function initSkirmish(map: WorldMap, setup: SkirmishSetup, seed: number): void {
  if (setup.scenario.kind !== 'mode') throw new Error('authored scenarios start via initScenarioGame')
  const friend = setup.sides.friend[0]
  const hostile = setup.sides.hostile[0]
  if (!friend || !hostile) throw new Error('a skirmish needs one slot per side')
  initGame(map, seed, setup.difficulty, setup.scenario.mode, friend.chair,
    { friend: friend.pack, hostile: hostile.pack })
  // The difficulty table's starter arc is dead here — the lobby's picks are
  // the force. Clear the auto-placed friendlies and re-issue the org (their
  // fielding burned slots), then mark it from the picks.
  S.units = S.units.filter(u => u.side !== 'friend')
  S.org = buildDivisionOrg(playerPack(), S.chair)
  if (S.org) applyForcePicks(S.org, friend.force)
}
