// Pack registry. The player's pack is fixed to 1CD and the hostile side runs
// the placeholder OPFOR pack (P4 replaces it with the real faction); skirmish
// faction selection plugs in here later — a pack is a pack regardless of which
// side or fiction it belongs to.
import type { Pack } from './types'
import { PACK_1CD } from './1cd'
import { PACK_OPFOR } from './opfor'
import { installPacks } from './install'

export { lineageFor } from './types'
export type { Pack } from './types'
export { activePack, installedPacks } from './install'

export const PACKS: Record<string, Pack> = {
  [PACK_1CD.id]: PACK_1CD,
  [PACK_OPFOR.id]: PACK_OPFOR,
}

// the default lineup: player pack FIRST (fixes registry iteration order —
// golden-relevant), then the OPFOR
const DEFAULT_PACKS = [PACK_1CD, PACK_OPFOR]

export function playerPack(): Pack {
  return PACK_1CD
}

// (Re)install the active lineup into the engine registries. initGame calls
// this; the module-load call below covers any pre-init reads (menu screens).
export function installActivePacks(): void {
  installPacks(DEFAULT_PACKS)
}

installActivePacks()
