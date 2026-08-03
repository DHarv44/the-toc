// CONTENT CATALOG — every authorable file every installed pack ships, across
// its homes (vocabulary settled 2026-08-02): SCENARIO (standalone playable
// setup), SITUATION (a campaign's H-hour placement), MISSION (a mainline
// operation). EVENT joins with the S4 pool. One ScenarioSpec format for all —
// the catalog is what lets content FLOAT: the builder opens anything from
// here, ports anything into the current workspace, and saves to any home.
import type { ScenarioSpec } from './types'
import { packScenarios } from '../packs/scenario-files'
import { installedCampaigns } from '../packs/campaigns'

export type ContentSource =
  | { kind: 'scenario'; packId: string; id: string }
  | { kind: 'situation'; packId: string; campaignId: string }
  | { kind: 'mission'; packId: string; campaignId: string; id: string }

export interface ContentRef {
  /** stable select value ('scenario:1cd/river-delay', 'mission:1cd/iron-triangle/lodgment') */
  key: string
  label: string
  /** select group header */
  group: string
  spec: ScenarioSpec
  source: ContentSource
  /** the ground this content belongs to ('packId/mapId') — null while its
   *  campaign has no bound map */
  mapRef: string | null
}

export function contentCatalog(): ContentRef[] {
  const out: ContentRef[] = []
  for (const s of packScenarios()) {
    out.push({
      key: `scenario:${s.packId}/${s.scenarioId}`,
      label: `${s.packId.toUpperCase()} · ${s.name}`,
      group: 'SCENARIOS',
      spec: s.spec,
      source: { kind: 'scenario', packId: s.packId, id: s.scenarioId },
      mapRef: s.spec.map ?? null,
    })
  }
  for (const e of installedCampaigns()) {
    const cid = e.campaign.manifest.id
    const group = `CAMPAIGN · ${e.campaign.manifest.name}`
    const mapRef = e.map ? `${e.map.packId}/${e.map.mapId}` : null
    if (e.campaign.situation) {
      out.push({
        key: `situation:${e.packId}/${cid}`,
        label: 'SITUATION — H-HOUR PLACEMENT',
        group,
        spec: e.campaign.situation,
        source: { kind: 'situation', packId: e.packId, campaignId: cid },
        mapRef,
      })
    }
    for (const [mid, spec] of Object.entries(e.campaign.missions)) {
      out.push({
        key: `mission:${e.packId}/${cid}/${mid}`,
        label: `MISSION · ${spec.name}`,
        group,
        spec,
        source: { kind: 'mission', packId: e.packId, campaignId: cid, id: mid },
        mapRef,
      })
    }
  }
  return out
}

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

/** every place NAME a spec's script references — what a PORT must re-anchor
 *  when the target ground can't resolve them */
export function referencedPlaces(spec: ScenarioSpec): string[] {
  const out = new Set<string>()
  walk(spec.objectives ?? null, out)
  walk(spec.triggers ?? null, out)
  walk(spec.tutorial ?? null, out)
  return [...out]
}
