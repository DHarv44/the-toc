// PACK SCENARIO FILES — discovery of THE one content object
// (SCENARIO-MODEL.md): every menu, the builder's LOAD panel and the runner
// are projections of this glob. Two disk forms, one loaded shape:
//
//   scenarios/<id>.json                       simple — everything in one file
//   scenarios/<id>/scenario.json              folder — type/map/situation …
//   scenarios/<id>/missions/NN-*.json         … + missions as FILES, filename
//                                             prefix = mainline order (copy a
//                                             mission between scenarios raw)
//
// Both assemble to the identical ScenarioSpec; nothing downstream knows the
// difference. Drop a file in and the scenario exists; delete it and it
// doesn't.
import type { MissionScript, ScenarioSpec } from '../scenario/types'

const FLAT = import.meta.glob('./*/scenarios/*.json', {
  import: 'default', eager: true,
}) as Record<string, ScenarioSpec>

const FOLDER = import.meta.glob('./*/scenarios/*/scenario.json', {
  import: 'default', eager: true,
}) as Record<string, ScenarioSpec>

const MISSIONS = import.meta.glob('./*/scenarios/*/missions/*.json', {
  import: 'default', eager: true,
}) as Record<string, MissionScript>

export interface PackScenarioEntry {
  /** the pack that ships the scenario (NOT necessarily the map's pack) */
  packId: string
  scenarioId: string
  name: string
  spec: ScenarioSpec
}

const ALL: PackScenarioEntry[] = (() => {
  const out: PackScenarioEntry[] = []
  for (const [k, spec] of Object.entries(FLAT)) {
    // './1cd/scenarios/hill-402.json' → '1cd', 'hill-402'
    const parts = k.replace(/^\.\//, '').split('/')
    const scenarioId = parts[2]!.replace(/\.json$/, '')
    out.push({ packId: parts[0]!, scenarioId, name: spec.name ?? scenarioId, spec })
  }
  for (const [k, base] of Object.entries(FOLDER)) {
    // './1cd/scenarios/iron-triangle/scenario.json' → '1cd', 'iron-triangle'
    const parts = k.replace(/^\.\//, '').split('/')
    const packId = parts[0]!, scenarioId = parts[2]!
    const missions = Object.entries(MISSIONS)
      .filter(([mk]) => {
        const mp = mk.replace(/^\.\//, '').split('/')
        return mp[0] === packId && mp[2] === scenarioId
      })
      .sort(([a], [b]) => a.localeCompare(b)) // NN- prefix IS the order
      .map(([, m]) => m)
    const spec: ScenarioSpec = {
      ...base,
      ...(missions.length || base.missions?.length
        ? { missions: [...(base.missions ?? []), ...missions] } : {}),
    }
    out.push({ packId, scenarioId, name: spec.name ?? scenarioId, spec })
  }
  return out.sort((a, b) =>
    a.packId.localeCompare(b.packId) || a.scenarioId.localeCompare(b.scenarioId))
})()

/** Every scenario every installed pack ships, or one pack's. */
export function packScenarios(packId?: string): PackScenarioEntry[] {
  return packId ? ALL.filter(s => s.packId === packId) : ALL
}

export function packScenario(packId: string, scenarioId: string): PackScenarioEntry | undefined {
  return ALL.find(s => s.packId === packId && s.scenarioId === scenarioId)
}
