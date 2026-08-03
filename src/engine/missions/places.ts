// Spatial resolver for pack mission content (src/PACK-MISSIONS.md): place
// refs name the campaign's gazetteer (map towns/features), campaign anchors
// (strongpoint), or builtin anchors — the engine never hardcodes a place.
// Plain refs resolve RAW (no land snapping) — effects snap per spawn position,
// exactly like the code they replaced. A `toward`+`range` standoff clamps and
// snaps once (the old reinforceFrom).
import type { GameState } from '../GameState'
import type { PlaceRef, AnchorQuery } from '../../packs/types'
import type { Vec2 } from '../../world/WorldMap'
import { nearestLand, clampWorld } from '../../world/place'

function named(S: GameState, name: string): Vec2 {
  const m = S.map!
  if (name === 'player-hq') return { x: m.fob.x, y: m.fob.y }
  if (name === 'enemy-base') return { x: m.enemyBase.x, y: m.enemyBase.y }
  // the applied scenario's AUTHORED gazetteer (builder places) — checked
  // before campaign anchors so a scenario can re-anchor a name like
  // 'strongpoint' on new ground
  const sp = S.scenarioPlaces?.get(name)
  if (sp) return { x: sp.x, y: sp.y }
  const a = S.campaign
  if (a?.anchors && name in a.anchors) {
    const p = a.anchors[name]!
    return { x: p.x, y: p.y }
  }
  if (a && name === 'strongpoint') return { x: a.strongpoint.x, y: a.strongpoint.y }
  const t = m.towns.find(t => t.name === name)
  if (t) return { x: t.x, y: t.y }
  const f = m.features.find(f => f.name === name)
  if (f) return { x: f.x, y: f.y }
  throw new Error(`mission place '${name}' is not on this campaign's map`)
}

export function resolvePlace(S: GameState, ref: PlaceRef): Vec2 {
  if (typeof ref === 'string') return named(S, ref)
  let p = named(S, ref.place)
  if (ref.toward != null && ref.range != null) {
    const t = named(S, ref.toward)
    const dx = t.x - p.x, dy = t.y - p.y, L = Math.hypot(dx, dy) || 1
    p = nearestLand(S.map!,
      clampWorld(S.map, p.x + (dx / L) * ref.range),
      clampWorld(S.map, p.y + (dy / L) * ref.range))
  }
  if (ref.offsetX || ref.offsetY) p = { x: p.x + (ref.offsetX ?? 0), y: p.y + (ref.offsetY ?? 0) }
  return p
}

// Campaign anchors: named points resolved ONCE at campaign start, stored on
// CampaignState. 'town-nearest' is the old pickAnchorTown, generalized.
export function resolveAnchor(S: GameState, q: AnchorQuery): Vec2 {
  switch (q.query) {
    case 'town-nearest': {
      const to = named(S, q.to)
      let best: Vec2 | null = null, bd = Infinity
      for (const t of S.map!.towns) {
        const d = Math.hypot(t.x - to.x, t.y - to.y)
        if (d < bd) { bd = d; best = { x: t.x, y: t.y } }
      }
      // fallback: a point a third of the way toward the enemy base
      if (!best) {
        const eb = S.map!.enemyBase
        best = nearestLand(S.map!, to.x + (eb.x - to.x) * 0.33, to.y + (eb.y - to.y) * 0.33)
      }
      return best
    }
  }
}
