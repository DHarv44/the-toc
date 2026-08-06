// Small helpers shared by the map-column overlays (ui/HUD) and the right-click
// menus (ui/menus). They live here rather than in either one because both need
// them and HUD renders the menus — importing back the other way would make a
// cycle out of two functions.
import { S } from '../engine/state'
import type { Unit } from '../engine/GameState'
import { UNIT_TYPES, COVER_DEF } from '../domains/forces/catalog'

/** The live map view object, shared with MapView via window.__view. Mutations
 *  take effect on the next frame. */
export const winView = () =>
  (window as unknown as { __view?: { cx: number; cy: number; ppm: number } }).__view

/** Combined protection readout for a unit: terrain cover × posture. */
export function protectionInfo(u: Unit) {
  const terr = S.map!.terrNameAt(u.x, u.y)
  const cover = terr === 'forest' || terr === 'urban'
  const coverMul = cover ? COVER_DEF[terr] : 1
  const def = UNIT_TYPES[u.type].def
  const digMul = (u.posture === 'dig' && u.digT && def) ? 1 - (1 - def.factor) * u.digT : 1
  const total = Math.round((1 - coverMul * digMul) * 100)
  const concealed = cover || (u.posture === 'dig' && u.digT > 0)
  return { terr, cover, total, concealed }
}
