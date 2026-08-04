// THE GHOST LAYER — the mission, on the map.
//
// This is the gap that mattered. The sheet drew the SITUATION and nothing
// else, so the half of the document that decides whether a mission is any
// good — where the counterattack comes from, how big the objective is, which
// way the enemy is pushed — existed only as text in a form. The builder even
// grew a ◎ button beside every place field to go and LOOK at ground the tool
// was refusing to draw on.
//
// In Eden a trigger is an object on the map with an area you can drag. That is
// the whole reason to have a map editor rather than a JSON editor. So: every
// script verb that names a place resolves to a position here, and the sheet
// draws it — dimmed, dashed, ghostly, because none of it exists at H-hour.
//
// This module knows the VOCABULARY (which verbs have positions and what they
// mean); the canvas knows how to draw SHAPES. Neither knows the other, so a
// new engine verb needs a case here and no canvas work at all.
import type { WorldMap } from '../../world/WorldMap'
import type { MissionScript, ScenarioSide } from '../../scenario/types'
import type { Entity, Sel } from '../../scenario/edit'
import { refPlaceName } from './scriptFields'

export type Ghost =
  /** an objective's area, or a spawn's spread */
  | { k: 'zone'; x: number; y: number; r: number; label: string; sel: Sel; on: boolean }
  /** troops that arrive later — drawn as the symbols they will become */
  | { k: 'force'; x: number; y: number; side: ScenarioSide; units: string[]; label: string; sel: Sel; on: boolean }
  /** a front line: spans the world at one northing */
  | { k: 'line'; y: number; label: string; sel: Sel; on: boolean }
  /** where the OPFOR is told to go */
  | { k: 'push'; x: number; y: number; label: string; sel: Sel; on: boolean }
  /** a column's entry edge and where it heads */
  | { k: 'axis'; x: number; y: number; edge: string; label: string; sel: Sel; on: boolean }

/** Resolve a script place ref to world metres, the same three sources the
 *  autocomplete offers: the scenario's own gazetteer, the map's real one
 *  (OSM towns and features), then the two builtin anchors. Null when the ref
 *  names nothing — which is exactly the case the outline flags. */
export function resolvePlace(
  ref: unknown, entities: Entity[], map: WorldMap,
): { x: number; y: number; r?: number } | null {
  const name = refPlaceName(ref)
  if (!name) return null
  const base = named(name, entities, map)
  if (!base) return null
  if (typeof ref === 'string') return base

  // A PlaceRef is not just a name: `toward`+`range` is a STANDOFF (spawn 1300m
  // from the objective on the bearing to the enemy base) and offsets are a
  // nudge. Drawing the ghost at the bare place would put the counterattack on
  // top of the thing it is attacking — the opposite of what the script says.
  // Same arithmetic as engine/missions/places.ts, minus the terrain snap: the
  // ghost shows the INTENT, the sim decides the exact patch of dirt.
  const r = ref as { toward?: string; range?: number; offsetX?: number; offsetY?: number }
  let p = { ...base }
  if (r.toward != null && r.range != null) {
    const t = named(r.toward, entities, map)
    if (t) {
      const dx = t.x - p.x, dy = t.y - p.y, L = Math.hypot(dx, dy) || 1
      p = { ...p, x: p.x + (dx / L) * r.range, y: p.y + (dy / L) * r.range }
    }
  }
  if (r.offsetX || r.offsetY) {
    p = { ...p, x: p.x + (r.offsetX ?? 0), y: p.y + (r.offsetY ?? 0) }
  }
  return p
}

/** the three sources a name can come from, in the order the engine tries them */
function named(
  name: string, entities: Entity[], map: WorldMap,
): { x: number; y: number; r?: number } | null {
  const authored = entities.find(e => e.ent === 'place' && e.name === name)
  if (authored && authored.ent === 'place') {
    return { x: authored.x, y: authored.y, ...(authored.r != null ? { r: authored.r } : {}) }
  }
  const town = map.towns.find(t => t.name === name)
  if (town) return { x: town.x, y: town.y }
  const feat = map.features.find(f => f.name === name)
  if (feat) return { x: feat.x, y: feat.y }
  if (name === 'player-hq') return { x: map.fob.x, y: map.fob.y }
  if (name === 'enemy-base') return { x: map.enemyBase.x, y: map.enemyBase.y }
  return null
}

/** Everything spatial in one mission. `sel` is the node each ghost belongs to,
 *  so clicking a ghost selects the objective or effect that put it there and
 *  selecting one in the outline lights it up on the map. */
export function missionGhosts(
  mission: MissionScript | undefined, m: number,
  entities: Entity[], map: WorldMap, sel: Sel | null,
): Ghost[] {
  if (!mission) return []
  const out: Ghost[] = []
  const isOn = (s: Sel) => JSON.stringify(s) === JSON.stringify(sel)

  ;(mission.objectives ?? []).forEach((o, i) => {
    const node: Sel = { k: 'objective', m, i }
    if (!('zone' in o) || !o.zone) return
    const p = resolvePlace(o.zone.place, entities, map)
    if (!p) return
    out.push({
      k: 'zone', x: p.x, y: p.y,
      // the objective's own radius wins; the authored place's is the fallback
      r: o.zone.r ?? p.r ?? 400,
      label: `${String(i + 1).padStart(2, '0')} ${o.label || o.id}`,
      sel: node, on: isOn(node),
    })
  })

  ;(mission.triggers ?? []).forEach((t, i) => {
    t.do.forEach((e, j) => {
      const node: Sel = { k: 'effect', m, i, j }
      const on = isOn(node) || isOn({ k: 'trigger', m, i })
      switch (e.kind) {
        case 'spawn-garrison':
        case 'place-force':
        case 'spawn-group': {
          const p = resolvePlace(e.at, entities, map)
          if (!p) return
          out.push({
            k: 'force', x: p.x, y: p.y, side: 'hostile', units: e.units ?? [],
            label: e.kind === 'spawn-group' && e.tag ? `${e.tag}` : t.id,
            sel: node, on,
          })
          return
        }
        case 'front-line': {
          const p = resolvePlace(e.place, entities, map)
          if (!p) return
          out.push({
            k: 'line', y: p.y + (e.offsetY ?? 0), label: `FLOT · ${t.id}`, sel: node, on,
          })
          return
        }
        case 'opfor-objective': {
          const p = resolvePlace(e.place, entities, map)
          if (!p) return
          out.push({ k: 'push', x: p.x, y: p.y, label: `OPFOR → ${t.id}`, sel: node, on })
          return
        }
        case 'deploy-column': {
          const p = resolvePlace(e.moveTo?.anchor, entities, map)
          if (!p) return
          out.push({
            k: 'axis', x: p.x, y: p.y, edge: e.edge ?? 'south',
            label: `${e.units?.join(' ') || 'COLUMN'} · ${t.id}`, sel: node, on,
          })
          return
        }
        default:
          return
      }
    })
  })

  // TEACHING CUES. A tutorial anchor that names ground is drawn like anything
  // else in the script — select a lesson and see where it points. The computed
  // anchors (attack-pos, screen-marker, force-box…) are worked out from the
  // running world and are deliberately NOT guessed at here: a preview that
  // invents a position is worse than no preview, because the author will trust
  // it. Those say so in the inspector instead.
  ;(mission.tutorial?.steps ?? []).forEach((st, s) => {
    ;(st.hints ?? []).forEach((h, i) => {
      const a = h.anchor
      if (!a) return
      const node: Sel = { k: 'tutHint', m, s, h: i }
      const on = isOn(node) || isOn({ k: 'tutStep', m, s })
      const label = `${String(s + 1).padStart(2, '0')} ${st.id}`
      if (a.kind === 'point' || a.kind === 'box') {
        const p = resolvePlace(a.place, entities, map)
        if (!p) return
        out.push({
          k: 'zone', x: p.x, y: p.y,
          r: a.kind === 'box' ? a.r : (p.r ?? 200),
          label, sel: node, on,
        })
      } else if (a.kind === 'pan-to') {
        const p = resolvePlace(a.place, entities, map)
        if (!p) return
        out.push({ k: 'push', x: p.x, y: p.y, label: `PAN · ${label}`, sel: node, on })
      }
    })
  })
  return out
}
