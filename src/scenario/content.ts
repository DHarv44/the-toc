// SCRIPT PLACE WALKER — every place NAME a mission script references, for
// the PORT re-anchor pass: names the target ground's gazetteer can't resolve
// become staged places the author drags into position.
import type { MissionScript } from './types'

// keys whose STRING values are place names anywhere in the script vocabulary
// (PlaceRef fields, `toward` standoffs, anchor/query targets)
const PLACE_KEYS = new Set(['place', 'at', 'near', 'toward', 'to', 'anchor'])

// non-places riding the same keys: builtin anchors the engine always
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

/** every place NAME the missions' scripts reference */
export function referencedPlaces(missions: MissionScript[]): string[] {
  const out = new Set<string>()
  for (const m of missions) {
    walk(m.objectives ?? null, out)
    walk(m.triggers ?? null, out)
    walk(m.tutorial ?? null, out)
  }
  return [...out]
}

/** Is this a name the engine resolves without the author authoring it? */
export const isBuiltinPlace = (name: string): boolean => BUILTIN.has(name)

// Deep-rewrite one place NAME everywhere a script refers to it. Renaming an
// authored place would otherwise leave every objective zone, spawn anchor and
// OPFOR objective pointing at a name that no longer exists — so the rename
// carries the references with it, which is the only behaviour that is ever
// what the author meant.
function rewrite<T>(v: T, from: string, to: string): T {
  if (Array.isArray(v)) return v.map(x => rewrite(x, from, to)) as unknown as T
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) {
      out[k] = PLACE_KEYS.has(k) && val === from ? to : rewrite(val, from, to)
    }
    return out as T
  }
  return v
}

/** every script reference to `from` becomes `to` (objectives, triggers, tutorial) */
export const renamePlaceRefs = (missions: MissionScript[], from: string, to: string): MissionScript[] =>
  from === to ? missions : missions.map(m => rewrite(m, from, to))
