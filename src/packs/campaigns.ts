// CAMPAIGN DISCOVERY — every installed pack's campaigns, resolved for the
// splash picker and the start path. A campaign binds its own ground: the
// manifest's `map` is 'packId/mapId' (cross-pack allowed, like scenarios) or
// a bare map id meaning the OWNING pack's map; null = ground not yet
// authored, listed but not startable. This module is the ONE place that
// resolution lives.
import type { CampaignSpec } from './types'
import { installedPacks, PACKS } from './index'
import { packMaps, type PackMapEntry } from './map-files'

export interface CampaignEntry {
  /** the pack that ships the campaign */
  packId: string
  packAbbr: string
  campaign: CampaignSpec
  /** the resolved ground — null when unauthored (manifest.map null) or the
   *  named map is not installed */
  map: PackMapEntry | null
}

/** resolve a manifest map ref against the owning pack */
function resolveMap(ownerPackId: string, ref: string | null): PackMapEntry | null {
  if (!ref) return null
  const [packId, mapId] = ref.includes('/')
    ? (ref.split('/') as [string, string])
    : [ownerPackId, ref]
  return packMaps(packId).find(m => m.mapId === mapId) ?? null
}

/** every campaign every installed pack ships, in pack → manifest order */
export function installedCampaigns(): CampaignEntry[] {
  const out: CampaignEntry[] = []
  for (const p of installedPacks()) {
    for (const c of PACKS[p.id]?.campaigns ?? []) {
      out.push({
        packId: p.id,
        packAbbr: p.abbr ?? p.id,
        campaign: c,
        map: resolveMap(p.id, c.manifest.map),
      })
    }
  }
  return out
}

export function campaignEntry(packId: string, campaignId: string): CampaignEntry | null {
  return installedCampaigns()
    .find(e => e.packId === packId && e.campaign.manifest.id === campaignId) ?? null
}
