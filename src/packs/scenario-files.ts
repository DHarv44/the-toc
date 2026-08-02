// PACK SCENARIO FILES — the authored battles a pack ships.
//
// A scenario is a folder under src/packs/<id>/scenarios/<scenarioId>/ holding
// scenario.json (SCENARIO-BUILDER.md). Discovery is import.meta.glob over the
// pack folders, exactly like maps (map-files.ts) and models: drop a folder in
// and the scenario exists, delete it and it doesn't.
import type { ScenarioSpec } from '../scenario/types'

const FILES = import.meta.glob('./*/scenarios/*/scenario.json', {
  import: 'default', eager: true,
}) as Record<string, ScenarioSpec>

export interface PackScenarioEntry {
  /** the pack that ships the scenario (NOT necessarily the map's pack) */
  packId: string
  scenarioId: string
  name: string
  spec: ScenarioSpec
}

const ALL: PackScenarioEntry[] = Object.entries(FILES)
  .map(([k, spec]) => {
    // './1cd/scenarios/river-delay/scenario.json' → '1cd', 'river-delay'
    const parts = k.replace(/^\.\//, '').split('/')
    const packId = parts[0]!, scenarioId = parts[2]!
    return { packId, scenarioId, name: spec.name ?? scenarioId, spec }
  })
  .sort((a, b) => a.packId.localeCompare(b.packId) || a.scenarioId.localeCompare(b.scenarioId))

/** Every scenario every installed pack ships, or one pack's. */
export function packScenarios(packId?: string): PackScenarioEntry[] {
  return packId ? ALL.filter(s => s.packId === packId) : ALL
}

export function packScenario(packId: string, scenarioId: string): PackScenarioEntry | undefined {
  return ALL.find(s => s.packId === packId && s.scenarioId === scenarioId)
}
