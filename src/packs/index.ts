// Pack registry. The player's pack is fixed to 1CD for now; skirmish faction
// selection (including real enemy armies) plugs in here later — a pack is a
// pack regardless of which side or fiction it belongs to.
import type { Pack } from './types'
import { PACK_1CD } from './1cd'

export { lineageFor } from './types'
export type { Pack } from './types'

export const PACKS: Record<string, Pack> = {
  [PACK_1CD.id]: PACK_1CD,
}

export function playerPack(): Pack {
  return PACK_1CD
}
