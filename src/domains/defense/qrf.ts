// QRF (task #30): the commander assigns GARRISONED units at an HQ/FOB as the
// base's Quick Reaction Force. When the base takes IDF or comes under direct
// attack, the QRF launches ITSELF (SOP — design law 4: automation adds a
// seat, the commander still owns assignment and can re-task mid-response).
//
// KNOWLEDGE HONESTY: the QRF responds to what the TOC actually knows.
// - A LIVE contact near the base (aerostat/drone/friendly eyes): move on it.
// - No track: counterfire radar gives a BEARING only (the shell's origin is
//   honestly derivable from its back-azimuth) — the QRF moves a bounded
//   distance along that azimuth and hunts with its own sensors from there.
// Deterministic: no rng, no hash rolls — pure geometry and state.
import { S } from '../../engine/state'
import type { Structure, Unit } from '../../engine/GameState'
import { clampWorld, nearestLand } from '../../world/place'
import { orderMove } from '../forces/orders'
import { radio, toast } from '../comms/radio'
import { grid } from '../../lib/format'

const GARRISON_R = 450       // must be resting this close to the base to assign
const ALERT_R = 900          // IDF impact / hostile presence inside this = base attack
const TRACK_R = 2500         // live contacts inside this count as "the threat"
const BEARING_MOVE = 1200    // no track: bounded advance along the back-azimuth
const STAND_DOWN_S = 120     // quiet this long -> QRF returns to garrison
const REEVAL_S = 20          // per-base launch re-evaluation throttle

function baseOf(u: Unit): Structure | null {
  if (u.qrfHome == null) return null
  return S.structures.find(s => s.id === u.qrfHome && s.side === 'friend') ?? null
}

// assignment order (palette toggle): only a unit GARRISONED at an HQ/FOB
export function toggleQrf(unitId: number): void {
  const u = S.units.find(x => x.id === unitId && x.side === 'friend')
  if (!u) return
  if (u.qrfHome != null) {
    const st = baseOf(u)
    delete u.qrfHome
    delete u.qrfOutT
    toast(`${u.label} RELEASED FROM QRF${st ? ` — ${st.label}` : ''}`)
    return
  }
  const st = S.structures.find(s => s.side === 'friend' && s.buildT <= 0
    && (s.kind === 'HQ' || s.kind === 'FOB') && Math.hypot(s.x - u.x, s.y - u.y) <= GARRISON_R)
  if (!st) return void toast('QRF ASSIGNMENT REQUIRES A UNIT GARRISONED AT AN HQ/FOB')
  u.qrfHome = st.id
  toast(`${u.label} ASSIGNED TO QRF — ${st.label}`)
  radio(u.label, 'move', `QRF ASSIGNED AT ${st.label} — STANDING BY`, u.x, u.y)
}

// the threat picture for one base: where should a launching QRF go?
// returns null when the base is not under attack
function threatFor(st: Structure): { x: number; y: number; tracked: boolean } | null {
  // direct attack: a live hostile inside the alert radius IS the answer
  for (const h of S.units) {
    if (h.side !== 'hostile' || h.strength <= 0) continue
    if (Math.hypot(h.x - st.x, h.y - st.y) <= ALERT_R) return { x: h.x, y: h.y, tracked: true }
  }
  // IDF inbound/impacting on the base: origin known only as a back-azimuth
  for (const sh of S.shells) {
    if (sh.side !== 'hostile') continue
    if (Math.hypot(sh.x - st.x, sh.y - st.y) > ALERT_R) continue
    // a LIVE track near the base beats the bearing (sensors hold the shooter)
    for (const [, c] of S.contacts) {
      if (!c.live) continue
      if (Math.hypot(c.x - st.x, c.y - st.y) <= TRACK_R) return { x: c.x, y: c.y, tracked: true }
    }
    // bearing only: bounded move along the azimuth toward the firing point
    const dx = sh.fromX - st.x, dy = sh.fromY - st.y
    const L = Math.hypot(dx, dy) || 1
    const r = Math.min(BEARING_MOVE, L * 0.6)
    return {
      x: clampWorld(S.map, st.x + (dx / L) * r),
      y: clampWorld(S.map, st.y + (dy / L) * r),
      tracked: false,
    }
  }
  return null
}

export function qrfUpdate(_dt: number): void {
  // cheap gate: no QRF assignments anywhere -> nothing to do (golden-neutral)
  let any = false
  for (const u of S.units) if (u.qrfHome != null) { any = true; break }
  if (!any) return

  for (const st of S.structures) {
    if (st.side !== 'friend' || st.buildT > 0) continue
    const qrf = S.units.filter(u => u.qrfHome === st.id && u.strength > 0)
    if (!qrf.length) continue
    if (S.t - (st.qrfT ?? -999) < REEVAL_S) continue
    const threat = threatFor(st)

    if (threat) {
      st.qrfT = S.t
      let launched = 0
      for (const u of qrf) {
        if (u.qrfOutT != null) continue // already responding
        u.qrfOutT = S.t
        u.weapons = 'free'
        u.roe = 'halt'
        const p = nearestLand(S.map!, threat.x, threat.y)
        orderMove(u.id, p.x, p.y)
        launched++
      }
      if (launched) {
        radio('NET', 'contact',
          `${st.label} UNDER ATTACK — QRF LAUNCHING, ${threat.tracked
            ? `TARGET TRACKED GRID ${grid(threat.x, threat.y)}`
            : `NO TRACK, MOVING ON THE BEARING TO ${grid(threat.x, threat.y)}`}`,
          st.x, st.y)
        toast(`QRF LAUNCHING — ${st.label}`)
      }
    } else {
      // stand-down: responders quiet long enough walk back to the wire
      for (const u of qrf) {
        if (u.qrfOutT == null) continue
        if (S.t - u.lastCombatT < STAND_DOWN_S || S.t - u.qrfOutT < STAND_DOWN_S) continue
        delete u.qrfOutT
        const p = nearestLand(S.map!, st.x + 180, st.y + 180)
        orderMove(u.id, p.x, p.y)
        radio(u.label, 'move', `QRF STANDING DOWN — RETURNING TO ${st.label}`, u.x, u.y)
      }
    }
  }
}
