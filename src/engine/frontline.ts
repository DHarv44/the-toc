// Front line & territory control — the campaign's COP assessment layer.
//
// A coarse influence field over the map: friendly influence projects from the
// player's REAL units and installations; enemy influence projects from KNOWN
// intel (live/stale contacts, spotted structures) plus the campaign's authored
// phase line — higher's assessment that everything beyond the current phase of
// the operation is enemy-held. The zero contour of the field is the FLOT the
// map draws; the negative side is painted as enemy-controlled territory.
//
// It is deliberately an ASSESSMENT, not ground truth: fog-hidden enemies the
// battalion has never seen don't bend the trace — the authored baseline claims
// their ground wholesale, the way a real staff would shade the map red past
// the forward line, and clearing objectives rolls the baseline north.
import type { GameState } from './GameState'

const RES = 64            // control cells per side (200 m on a Large map)
const REFRESH = 4         // sim-seconds between recomputes (slow-moving layer)

export interface ControlField {
  res: number
  cellM: number                                      // meters per control cell
  ctl: Float32Array                                  // res² — >0 friendly, <0 enemy
  segs: Array<{ x0: number; y0: number; x1: number; y1: number }> // FLOT trace, world m
  tint: HTMLCanvasElement                            // res² enemy-territory wash
}

let cache: { t: number; mapRef: unknown; field: ControlField } | null = null

// influence kernels: units are soft bubbles, installations are firm anchors
const SIGMA_UNIT = 620, SIGMA_STRUCT = 900
const W_UNIT = 1.0, W_STRUCT = 2.2, W_CONTACT = 1.3

export function controlField(S: GameState): ControlField | null {
  const c = S.campaign
  if (!c || !S.map) return null
  if (cache && cache.mapRef === S.map && S.t >= cache.t && S.t - cache.t < REFRESH) return cache.field

  const WORLD = S.map.WORLD
  const cellM = WORLD / RES
  const ctl = new Float32Array(RES * RES)

  // 1. authored baseline: the phase line, ramped over ~1.6 km. +y is south
  // (friendly rear), so ground BELOW frontY is assessed friendly.
  const frontY = c.frontY
  for (let gy = 0; gy < RES; gy++) {
    const wy = (gy + 0.5) * cellM
    const base = Math.tanh((wy - frontY) / 800) * 1.1
    for (let gx = 0; gx < RES; gx++) ctl[gy * RES + gx] = base
  }

  // 2. real influence sources
  type Src = { x: number; y: number; w: number; s2: number }
  const srcs: Src[] = []
  for (const u of S.units) {
    if (u.strength <= 0) continue
    if (u.side === 'friend') srcs.push({ x: u.x, y: u.y, w: W_UNIT * (0.4 + 0.6 * u.strength / 100), s2: SIGMA_UNIT ** 2 })
    else if (!S.fogEnabled) srcs.push({ x: u.x, y: u.y, w: -W_UNIT * (0.4 + 0.6 * u.strength / 100), s2: SIGMA_UNIT ** 2 })
  }
  if (S.fogEnabled) {
    // enemy side of the ledger is INTEL: contacts persist at last-known pos
    for (const ct of S.contacts.values()) {
      if (ct.strength <= 0) continue
      srcs.push({ x: ct.x, y: ct.y, w: -W_CONTACT * (ct.live ? 1 : 0.6), s2: SIGMA_UNIT ** 2 })
    }
  }
  for (const st of S.structures) {
    if (st.side === 'friend') srcs.push({ x: st.x, y: st.y, w: W_STRUCT, s2: SIGMA_STRUCT ** 2 })
    else if (!S.fogEnabled || S.structContacts.has(st.id)) srcs.push({ x: st.x, y: st.y, w: -W_STRUCT, s2: SIGMA_STRUCT ** 2 })
  }
  const CUT2 = (3.2 * SIGMA_STRUCT) ** 2
  for (const s of srcs) {
    for (let gy = 0; gy < RES; gy++) {
      const dy = (gy + 0.5) * cellM - s.y
      for (let gx = 0; gx < RES; gx++) {
        const dx = (gx + 0.5) * cellM - s.x
        const d2 = dx * dx + dy * dy
        if (d2 > CUT2) continue
        ctl[gy * RES + gx] += s.w * Math.exp(-d2 / (2 * s.s2))
      }
    }
  }

  // 3. FLOT trace: marching squares on the zero contour
  const segs: ControlField['segs'] = []
  const at = (gx: number, gy: number) => ctl[gy * RES + gx]!
  const lerp = (a: number, b: number) => (a === b ? 0.5 : a / (a - b))
  for (let gy = 0; gy < RES - 1; gy++) {
    for (let gx = 0; gx < RES - 1; gx++) {
      const tl = at(gx, gy), tr = at(gx + 1, gy), br = at(gx + 1, gy + 1), bl = at(gx, gy + 1)
      const idx = (tl > 0 ? 8 : 0) | (tr > 0 ? 4 : 0) | (br > 0 ? 2 : 0) | (bl > 0 ? 1 : 0)
      if (idx === 0 || idx === 15) continue
      const x = (gx + 0.5) * cellM, y = (gy + 0.5) * cellM
      // edge midpoints, interpolated to the actual crossing
      const top = { x: x + lerp(tl, tr) * cellM, y }
      const bot = { x: x + lerp(bl, br) * cellM, y: y + cellM }
      const left = { x, y: y + lerp(tl, bl) * cellM }
      const right = { x: x + cellM, y: y + lerp(tr, br) * cellM }
      const put = (a: { x: number; y: number }, b: { x: number; y: number }) =>
        segs.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y })
      switch (idx) {
        case 1: case 14: put(left, bot); break
        case 2: case 13: put(bot, right); break
        case 3: case 12: put(left, right); break
        case 4: case 11: put(top, right); break
        case 5: put(left, top); put(bot, right); break
        case 6: case 9: put(top, bot); break
        case 7: case 8: put(left, top); break
        case 10: put(top, right); put(left, bot); break
      }
    }
  }

  // 4. enemy-territory wash, painted once per recompute at field resolution —
  // MapView scales it over the world rect with smoothing (soft edges for free)
  const tint = document.createElement('canvas')
  tint.width = tint.height = RES
  const tctx = tint.getContext('2d')!
  const img = tctx.createImageData(RES, RES)
  for (let i = 0; i < RES * RES; i++) {
    const v = ctl[i]!
    if (v >= 0) continue
    const a = Math.min(0.30, 0.10 + Math.min(1, -v) * 0.20)
    const o = i * 4
    img.data[o] = 205; img.data[o + 1] = 46; img.data[o + 2] = 46; img.data[o + 3] = a * 255
  }
  tctx.putImageData(img, 0, 0)

  const field: ControlField = { res: RES, cellM, ctl, segs, tint }
  cache = { t: S.t, mapRef: S.map, field }
  return field
}

// test/dev hook: drop the cache so the next call recomputes
export function invalidateControl(): void { cache = null }
