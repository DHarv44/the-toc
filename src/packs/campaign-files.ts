// PACK CAMPAIGN FILES — glob discovery of campaign folders, exactly like
// maps (map-files.ts) and scenarios (scenario-files.ts): drop a campaign
// folder in and it exists; save a mission from the builder and discovery
// picks it up — no static import list to maintain.
//
// A campaign is src/packs/<pack>/campaigns/<id>/ holding campaign.json (the
// manifest), optional situation.json (the SITUATION — H-hour placements,
// OPORD Paragraph 1) and missions/*.json (mission scenarios, filename = id).
import type { CampaignManifest, CampaignSpec } from './types'
import type { ScenarioSpec } from '../scenario/types'

const MANIFESTS = import.meta.glob('./*/campaigns/*/campaign.json', {
  import: 'default', eager: true,
}) as Record<string, CampaignManifest>

const SITUATIONS = import.meta.glob('./*/campaigns/*/situation.json', {
  import: 'default', eager: true,
}) as Record<string, ScenarioSpec>

const MISSIONS = import.meta.glob('./*/campaigns/*/missions/*.json', {
  import: 'default', eager: true,
}) as Record<string, ScenarioSpec>

// './1cd/campaigns/iron-triangle/…' → ['1cd', 'iron-triangle']
const ids = (key: string): [string, string] => {
  const parts = key.replace(/^\.\//, '').split('/')
  return [parts[0]!, parts[2]!]
}

/** assemble one pack's campaigns from the globs, manifest order preserved
 *  where the manifest is listed in pack.json (callers sort by that) */
export function packCampaigns(packId: string): CampaignSpec[] {
  const out: CampaignSpec[] = []
  for (const [key, manifest] of Object.entries(MANIFESTS)) {
    const [p, campaignId] = ids(key)
    if (p !== packId) continue
    const missions: Record<string, ScenarioSpec> = {}
    for (const [mk, spec] of Object.entries(MISSIONS)) {
      const [mp, mc] = ids(mk)
      if (mp !== packId || mc !== campaignId) continue
      // filename is the id ('missions/lodgment.json' → 'lodgment'); a spec
      // carrying its own id keeps it (they should agree)
      const file = mk.split('/').pop()!.replace(/\.json$/, '')
      missions[spec.id ?? file] = spec
    }
    const situation = Object.entries(SITUATIONS)
      .find(([sk]) => { const [sp, sc] = ids(sk); return sp === packId && sc === campaignId })?.[1]
    out.push({ manifest, missions, ...(situation ? { situation } : {}) })
  }
  return out
}
