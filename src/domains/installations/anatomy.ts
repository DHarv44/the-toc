// BASE ANATOMY (BASES.md): a base is not a point — it has a way OUT (the
// gate), facilities that SIT somewhere, and a wire with a shape. Everything
// here is derived geometry: computed lazily from the map on first ask,
// cached on the structure, riding the save. Author-placed overrides come
// later; when they do, they simply pre-fill what this derives.
import { S } from '../../engine/state'
import type { Structure } from '../../engine/GameState'
import { R_TRACK, T_URBAN, T_WATER, type Vec2 } from '../../world/WorldMap'
import type { Mobility } from '../../world/mobility'
import { clampWorld, nearestLand } from '../../world/place'
import { structureSpur } from '../../world/access'
import { roadSpot } from '../../world/pack/roadGraph'
import { FACILITIES } from './catalog'

// The GATE bearing: which way "out" is for a base — down its own access spur
// if it has one, toward the road that serves it otherwise, toward the map
// interior as a last resort. Facility layout, the footprint and the motor
// pool all orient on it, so a fielded vic is already pointed at the way onto
// the network.
export function gateward(st: Structure): number {
  const m = S.map!
  const spur = structureSpur(m, st.x, st.y)
  if (spur && spur.length >= 2) {
    const p = spur[Math.max(0, spur.length - 4)]!
    return Math.atan2(p.y - st.y, p.x - st.x)
  }
  const spot = roadSpot(m, st.x, st.y)
  if (spot && spot.dist < 450 && spot.pts.length >= 2) {
    const p = alongRoad(spot, spot.at)
    return Math.atan2(p.y - st.y, p.x - st.x)
  }
  return Math.atan2(m.WORLD / 2 - st.y, m.WORLD / 2 - st.x)
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

/** Where each facility SITS. Every facility is the base's own — it lives in
 *  st.facilities, gets a position inside the wire, and rolls up into the base
 *  symbol when the map zooms out. The default layout is spec-read, never
 *  name-read: the facility whose spec REPAIRS VEHICLES is the motor pool of
 *  this base, whatever the pack calls it, and it sits on the gate bearing so
 *  parked vics face the way out. Everything else rings the CP. */
export function facilityPoints(st: Structure): Record<string, { x: number; y: number }> {
  const m = S.map
  const fac = st.facilities ?? []
  if (!m || !fac.length) return st.facPts ?? {}
  const pts = (st.facPts ??= {})
  const missing = fac.filter(k => !pts[k])
  if (!missing.length) return pts
  const gate = gateward(st)
  let ring = 0
  for (const k of missing) {
    const spec = FACILITIES[k]
    const park = !!spec?.effects.repair
    const ang = park ? gate : gate + [2.2, -2.2, Math.PI, 1.1, -1.1][ring++ % 5]!
    const p = nearestLand(m, st.x + Math.cos(ang) * (park ? 95 : 70),
      st.y + Math.sin(ang) * (park ? 95 : 70))
    pts[k] = { x: p.x, y: p.y }
  }
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
 *  works on any map's elevation units), and a small deterministic per-base
 *  wobble (hashed from the structure id — same base, same shape,
 *  save-stable) keeps two bases on a parade ground from matching. Chaikin-
 *  rounded so it draws as curves. The GATE is the perimeter point on the
 *  gate bearing, where the access track leaves. This is the SHAPE of the
 *  base, not its reach: deploy zone and facility radii keep their
 *  point-and-radius semantics (BASES.md v1 call). */
export function footprintOf(st: Structure): { poly: Vec2[]; gate: Vec2 } {
  if (st.wire) return st.wire
  const m = S.map!
  const { GRID, CELL, terr, elev, road } = m
  const g = gateward(st)
  const [hl, hw] = st.kind === 'HQ' ? [165, 125]
    : st.kind === 'FOB' ? [140, 108]
      : st.kind === 'AFLD' ? [185, 120] : [60, 45]
  const N = 20
  const MIN_R = 45   // the CP itself is always inside its own wire
  const h = (i: number): number => {
    const s = Math.sin(st.id * 12.9898 + i * 78.233) * 43758.5453
    return s - Math.floor(s)
  }
  const at = (x: number, y: number): number => {
    const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL)
    return (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) ? -1 : gy * GRID + gx
  }
  const rawR: number[] = []
  const climb: number[] = []
  const step = CELL / 2
  for (let i = 0; i < N; i++) {
    const phi = (i / N) * Math.PI * 2
    const a = g + phi
    // ellipse radius at phi (local frame: 0 = out the gate) + the wobble
    const er = ((hl * hw) / Math.hypot(hw * Math.cos(phi), hl * Math.sin(phi)))
      * (i === 0 ? 1 : 0.85 + 0.3 * h(i))
    const ca = Math.cos(a), sa = Math.sin(a)
    let r = er
    let acc = 0
    let prevE = elev[Math.max(0, at(st.x, st.y))] ?? 0
    for (let d = 30; d <= er; d += step) {
      const idx = at(st.x + ca * d, st.y + sa * d)
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
  // neighbour blend, then one closed Chaikin pass: meander, not sawtooth
  const raw: Vec2[] = []
  for (let i = 0; i < N; i++) {
    const r = i === 0 ? rr[0]!
      : (rr[(i + N - 1) % N]! + rr[i]! * 2 + rr[(i + 1) % N]!) / 4
    const a = g + (i / N) * Math.PI * 2
    raw.push({ x: st.x + Math.cos(a) * r, y: st.y + Math.sin(a) * r })
  }
  const poly: Vec2[] = []
  for (let i = 0; i < N; i++) {
    const p = raw[i]!, q = raw[(i + 1) % N]!
    poly.push({ x: p.x * 0.75 + q.x * 0.25, y: p.y * 0.75 + q.y * 0.25 })
    poly.push({ x: p.x * 0.25 + q.x * 0.75, y: p.y * 0.25 + q.y * 0.75 })
  }
  st.wire = { poly, gate: { x: raw[0]!.x, y: raw[0]!.y } }
  return st.wire
}
