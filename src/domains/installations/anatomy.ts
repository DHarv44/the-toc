// BASE ANATOMY (BASES.md): a base is not a point — it has a way OUT (the
// gate), facilities that SIT somewhere, and a wire with a shape. Everything
// here is derived geometry. The *At functions are PURE — map + position in,
// geometry out — so the scenario builder previews with the SAME code the
// game derives with at H-hour (the planAccessTrack rule: one implementation,
// preview and reality cannot disagree). The Structure-facing wrappers add
// the lazy caching: computed on first ask, cached on the structure, riding
// the save. Author-placed overrides come later; when they do, they simply
// pre-fill what this derives.
import { S } from '../../engine/state'
import type { Structure, Side } from '../../engine/GameState'
import {
  R_TRACK, T_URBAN, T_WATER, type Vec2, type WorldMap,
} from '../../world/WorldMap'
import type { Mobility } from '../../world/mobility'
import { clampWorld, nearestLand } from '../../world/place'
import { structureSpur } from '../../world/access'
import { roadSpot } from '../../world/pack/roadGraph'
import { FACILITIES } from './catalog'
import type { StructureTypeKey } from './catalog'

// What a base is BORN with. An HQ stands up with its organic services —
// motorpool, aid station, the works; FOBs start bare and build out. One
// source for addStructure AND the builder preview. (Content-in-engine debt:
// the organic set should come from the pack — HARDCODE-AUDIT #18's family.)
export function organicFacilities(side: Side, kind: StructureTypeKey): string[] {
  return side === 'friend' && kind === 'HQ' ? ['MOTORPOOL', 'AID'] : []
}

// The GATE bearing: which way "out" is for a base — down its own access spur
// if it has one (or the PLANNED track the builder computed), toward the road
// that serves it otherwise, toward the map interior as a last resort.
// Facility layout, the footprint and the motor pool all orient on it, so a
// fielded vic is already pointed at the way onto the network.
export function gatewardAt(
  map: WorldMap, x: number, y: number, plan?: Vec2[] | null,
): number {
  const spur = plan ?? structureSpur(map, x, y)
  if (spur && spur.length >= 2) {
    const p = spur[Math.max(0, spur.length - 4)]!
    return Math.atan2(p.y - y, p.x - x)
  }
  const spot = roadSpot(map, x, y)
  if (spot && spot.dist < 450 && spot.pts.length >= 2) {
    const p = alongRoad(spot, spot.at)
    return Math.atan2(p.y - y, p.x - x)
  }
  return Math.atan2(map.WORLD / 2 - y, map.WORLD / 2 - x)
}

export function gateward(st: Structure): number {
  return gatewardAt(S.map!, st.x, st.y)
}

// arc position s on a roadSpot polyline -> point + unit tangent
export function alongRoad(
  spot: { pts: Vec2[]; cum: number[]; at: number },
  s: number,
): { x: number; y: number; tx: number; ty: number } {
  let seg = 1
  while (seg < spot.cum.length - 1 && spot.cum[seg]! < s) seg++
  const a = spot.pts[seg - 1]!, b = spot.pts[seg]!
  const segLen = spot.cum[seg]! - spot.cum[seg - 1]!
  const t = segLen > 0 ? (s - spot.cum[seg - 1]!) / segLen : 0
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
  return {
    x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
    tx: (b.x - a.x) / L, ty: (b.y - a.y) / L,
  }
}

/** THE WIRE'S TARGET SIZE by structure kind, in half-extents (m, along the
 *  gate axis × across it) — one source for the footprint, the facility
 *  layout and the anatomy zoom gate. The HQ is the game's main base and
 *  draws the biggest ground compound (commander's call 2026-08-07); a FOB
 *  is the smaller forward foothold; an airfield needs its strip; an OP is
 *  a hole in the ground with a radio. */
export function kindExtents(kind: StructureTypeKey): readonly [number, number] {
  return kind === 'AFLD' ? [640, 400]
    : kind === 'HQ' ? [500, 380]
      : kind === 'FOB' ? [320, 240] : [90, 65]
}

/** Where each facility SITS. The default layout is spec-read, never
 *  name-read: the facility whose spec REPAIRS VEHICLES is the motor pool of
 *  this base, whatever the pack calls it, and it sits on the gate bearing so
 *  parked vics face the way out. Everything else rings the CP. Distances
 *  scale with the kind's wire so a big base spreads its anatomy instead of
 *  huddling it at the flagpole. */
export function layoutFacilitiesAt(
  map: WorldMap, x: number, y: number, fac: readonly string[], gate: number,
  kind: StructureTypeKey,
): Record<string, Vec2> {
  const [hl] = kindExtents(kind)
  const pts: Record<string, Vec2> = {}
  let ring = 0
  for (const k of fac) {
    const spec = FACILITIES[k]
    const park = !!spec?.effects.repair
    const ang = park ? gate : gate + [2.2, -2.2, Math.PI, 1.1, -1.1][ring++ % 5]!
    const r = park ? hl * 0.55 : hl * 0.42
    const p = nearestLand(map, x + Math.cos(ang) * r, y + Math.sin(ang) * r)
    pts[k] = { x: p.x, y: p.y }
  }
  return pts
}

/** The Structure wrapper: lazy, cached on st.facPts, rides the save. Every
 *  facility is the base's own — it lives in st.facilities, gets a position
 *  inside the wire, and rolls up into the base symbol at distance. */
export function facilityPoints(st: Structure): Record<string, { x: number; y: number }> {
  const m = S.map
  const fac = st.facilities ?? []
  if (!m || !fac.length) return st.facPts ?? {}
  const pts = (st.facPts ??= {})
  const missing = fac.filter(k => !pts[k])
  if (!missing.length) return pts
  Object.assign(pts, layoutFacilitiesAt(m, st.x, st.y, missing, gateward(st), st.kind))
  return pts
}

// The motor pool HARDSTAND: rows of parked vehicles beside the repair-effect
// facility, inside the wire, faced out the gate. Null when the base runs no
// such facility.
export function poolSlot(st: Structure, mob: Mobility, k: number): Vec2 | null {
  const m = S.map!
  const key = (st.facilities ?? []).find(f => FACILITIES[f]?.effects.repair)
  if (!key) return null
  const fp = facilityPoints(st)[key]
  if (!fp) return null
  const g = gateward(st)
  const fx = Math.cos(g), fy = Math.sin(g)
  const col = (k % 4) - 1.5, row = Math.floor(k / 4) % 3
  const x = clampWorld(S.map, fp.x - fy * col * 20 + fx * (row * 24 - 24))
  const y = clampWorld(S.map, fp.y + fx * col * 20 + fy * (row * 24 - 24))
  return isFinite(m.moveFactor(x, y, mob)) ? { x, y } : null
}

/** THE WIRE: the base's footprint polygon and its gate. Auto-proposed and
 *  ORGANIC — a compound's perimeter follows what the ground allows, so each
 *  of N rays out of the anchor MARCHES THE ACTUAL MAP and stops where the
 *  terrain says stop: at water, at a built-up block, and AT a real road
 *  (the fence snaps to the road it sits beside — the base's own dirt spur
 *  doesn't count, or the gate ray would die at its own driveway). The
 *  steepest rays pull in relative to the flattest (self-normalised, so it
 *  works on any map's elevation units), and a small deterministic wobble
 *  seeded from the QUANTIZED POSITION — not the id — so the builder preview
 *  and the H-hour structure propose the identical shape. Chaikin-rounded so
 *  it draws as curves. The GATE is the perimeter point on the gate bearing,
 *  where the access track leaves. This is the SHAPE of the base, not its
 *  reach: deploy zone and facility radii keep point-and-radius semantics
 *  (BASES.md v1 call). */
export function footprintAt(
  map: WorldMap, x: number, y: number, kind: StructureTypeKey, gate: number,
): { poly: Vec2[]; gate: Vec2 } {
  const { GRID, CELL, terr, elev, road } = map
  const [hl, hw] = kindExtents(kind)
  const N = 12       // corner posts — a wall is built in straight runs
  const MIN_R = 60   // the CP itself is always inside its own wire
  const seed = Math.round(x / 10) * 73856093 ^ Math.round(y / 10) * 19349663
  const h = (i: number): number => {
    const s = Math.sin(seed * 0.0001 + i * 78.233) * 43758.5453
    return s - Math.floor(s)
  }
  const at = (px: number, py: number): number => {
    const gx = Math.floor(px / CELL), gy = Math.floor(py / CELL)
    return (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) ? -1 : gy * GRID + gx
  }
  const rawR: number[] = []
  const climb: number[] = []
  const step = CELL / 2
  for (let i = 0; i < N; i++) {
    const phi = (i / N) * Math.PI * 2
    const a = gate + phi
    // ellipse radius at phi (local frame: 0 = out the gate) + the wobble
    const er = ((hl * hw) / Math.hypot(hw * Math.cos(phi), hl * Math.sin(phi)))
      * (i === 0 ? 1 : 0.85 + 0.3 * h(i))
    const ca = Math.cos(a), sa = Math.sin(a)
    let r = er
    let acc = 0
    let prevE = elev[Math.max(0, at(x, y))] ?? 0
    for (let d = 30; d <= er; d += step) {
      const idx = at(x + ca * d, y + sa * d)
      if (idx < 0) { r = d - step; break }
      const t = terr[idx]!
      // the fence stops AT water, built-up blocks, and real roads (the
      // spur's R_TRACK raster is the base's own and doesn't bound it)
      if (t === T_WATER || t === T_URBAN || road[idx]! > R_TRACK) {
        r = d - step * 0.5
        break
      }
      acc += Math.abs(elev[idx]! - prevE)
      prevE = elev[idx]!
    }
    rawR.push(Math.max(MIN_R, r))
    climb.push(acc)
  }
  // contour hugging: the steepest rays pull in relative to the flattest —
  // normalised against this base's own spread, so elevation units don't matter
  const mn = Math.min(...climb), mx = Math.max(...climb)
  const rr = rawR.map((r, i) => {
    if (i === 0 || mx <= mn) return r  // the gate ray keeps its reach
    return Math.max(MIN_R, r * (1 - 0.3 * ((climb[i]! - mn) / (mx - mn))))
  })
  // corner posts, joined by STRAIGHT runs — engineers build a wall in
  // straight sections between corners the terrain dictated; no smoothing,
  // organic comes from where the corners LANDED, geometric from the runs
  const raw: Vec2[] = []
  for (let i = 0; i < N; i++) {
    const r = i === 0 ? rr[0]!
      : (rr[(i + N - 1) % N]! + rr[i]! * 2 + rr[(i + 1) % N]!) / 4
    const a = gate + (i / N) * Math.PI * 2
    raw.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r })
  }
  // merge near-collinear corners so three posts on one line become one run
  const poly: Vec2[] = raw.filter((p, i) => {
    const a = raw[(i + N - 1) % N]!, b = raw[(i + 1) % N]!
    const cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
    return i === 0 || Math.abs(cross / len) > 8  // >8 m off the chord = a real corner
  })
  return { poly, gate: { x: raw[0]!.x, y: raw[0]!.y } }
}

/** The Structure wrapper: lazy, cached on st.wire, rides the save. */
export function footprintOf(st: Structure): { poly: Vec2[]; gate: Vec2 } {
  if (st.wire) return st.wire
  st.wire = footprintAt(S.map!, st.x, st.y, st.kind, gateward(st))
  return st.wire
}
