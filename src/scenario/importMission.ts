// MISSION IMPORT — pull a campaign mission's script into the builder and list
// what needs RE-ANCHORING. A mission authored on dead ground (or another map)
// carries its logic verbatim — objectives, triggers, brief, tutorial — but its
// place NAMES may not exist on the target map. The import walks every place
// reference in the vocabulary and reports the names the map can't resolve;
// the builder turns each into an authored place the author drags into
// position. Logic transfers; geography is re-authored. (SCENARIO-BUILDER.md)
import type { ScenarioSpec } from './types'
import { installedPacks, PACKS } from '../packs'

export interface MissionEntry {
  packId: string
  campaignId: string
  missionId: string
  /** '1CD · IRON TRIANGLE · LODGMENT' */
  label: string
  spec: ScenarioSpec
}

/** every campaign mission every installed pack ships */
export function campaignMissions(): MissionEntry[] {
  const out: MissionEntry[] = []
  for (const p of installedPacks()) {
    for (const c of PACKS[p.id]?.campaigns ?? []) {
      for (const [missionId, spec] of Object.entries(c.missions)) {
        out.push({
          packId: p.id, campaignId: c.manifest.id, missionId,
          label: `${p.abbr ?? p.id} · ${c.manifest.name} · ${spec.name}`,
          spec,
        })
      }
    }
  }
  return out
}

// keys whose STRING values are place names anywhere in the vocabulary
// (PlaceRef fields, `toward` standoffs, anchor/query targets)
const PLACE_KEYS = new Set(['place', 'at', 'near', 'toward', 'to', 'anchor'])

// non-places that ride the same keys: builtin anchors the engine always
// resolves, plus the radio 'ctx'/'spawned' point tags
const BUILTIN = new Set(['player-hq', 'enemy-base', 'div-hq', 'spawned', 'ctx'])

function walk(v: unknown, out: Set<string>): void {
  if (Array.isArray(v)) { for (const x of v) walk(x, out); return }
  if (v && typeof v === 'object') {
    for (const [k, val] of Object.entries(v)) {
      if (PLACE_KEYS.has(k) && typeof val === 'string' && !BUILTIN.has(val)) out.add(val)
      else walk(val, out)
    }
  }
}

/** every place NAME the mission's script references */
export function referencedPlaces(spec: ScenarioSpec): string[] {
  const out = new Set<string>()
  walk(spec.objectives, out)
  walk(spec.triggers, out)
  walk(spec.tutorial ?? null, out)
  return [...out]
}
