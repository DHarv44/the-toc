// QRF (task #30, reworked to garrison states): QRF is a DEDICATED duty on a
// GARRISONED element — the commander marks garrison slots at an HQ/FOB as
// that base's Quick Reaction Force (multiple allowed). The element sits in
// garrison flagged QRF; when the base takes IDF or comes under direct attack
// it FIELDS ITSELF and responds (SOP — design law 4: automation adds a seat,
// the commander still owns assignment and can re-task mid-response). When the
// fight goes quiet the responder returns to garrison and resumes the duty.
// Deploying a QRF element MANUALLY releases it from QRF (the UI warns).
//
// KNOWLEDGE HONESTY: the QRF responds to what the TOC actually knows.
// - A LIVE contact near the base (aerostat/drone/friendly eyes): move on it.
// - No track: counterfire radar gives a BEARING only (the shell's origin is
//   honestly derivable from its back-azimuth) — the QRF moves a bounded
//   distance along that azimuth and hunts with its own sensors from there.
// Deterministic: no rng, no hash rolls — pure geometry and state.
import { S } from '../../engine/state'
import type { OrgSlot, Structure } from '../../engine/GameState'
import { clampWorld, nearestLand } from '../../world/place'
import { orderMove } from '../forces/orders'
import { fieldSlot, orderReturnToGarrison } from '../installations/orders'
import { radio, toast } from '../comms/radio'
import { grid } from '../../lib/format'

const ALERT_R = 900          // IDF impact / hostile presence inside this = base attack
const TRACK_R = 2500         // live contacts inside this count as "the threat"
const BEARING_MOVE = 1200    // no track: bounded advance along the back-azimuth
const STAND_DOWN_S = 120     // quiet this long -> QRF returns to garrison
const REEVAL_S = 20          // per-base launch re-evaluation throttle

// the base a garrisoned slot is homed at (garrisonAt, defaulting to the CP)
export function qrfHomeBase(sl: OrgSlot): Structure | null {
  return S.structures.find(s => s.id === sl.garrisonAt && s.side === 'friend' && s.buildT <= 0)
    ?? S.structures.find(s => s.side === 'friend' && s.kind === 'HQ')
    ?? null
}

// The duty roster at one base: who is STANDING the QRF there, and who is in
// that garrison and could. The Command rail shows the first list flat and puts
// the second behind a drill — a base runs one or two elements on reaction duty,
// and listing the whole garrison as "candidates" buries that fact.
export function qrfRoster(structId: number): { standing: OrgSlot[]; candidates: OrgSlot[] } {
  const standing: OrgSlot[] = [], candidates: OrgSlot[] = []
  for (const sl of S.org?.slots ?? []) {
    if (!sl.tf || !sl.type || sl.unitId != null) continue
    if (qrfHomeBase(sl)?.id !== structId) continue
    if (!sl.soldiers.some(x => x.status === 'FIT')) continue
    ;(sl.qrf ? standing : candidates).push(sl)
  }
  return { standing, candidates }
}

// assignment order (palette toggle): a GARRISONED slot takes/leaves the duty
export function toggleQrf(slotId: string): void {
  const sl = S.org?.slots.find(s => s.id === slotId)
  if (!sl || !sl.type) return
  if (sl.unitId != null) return void toast('QRF IS A GARRISON DUTY — THE ELEMENT IS FIELDED')
  const st = qrfHomeBase(sl)
  if (!st) return void toast('NO FRIENDLY BASE TO STAND QRF AT')
  if (sl.qrf) {
    sl.qrf = false
    toast(`${sl.name.toUpperCase()} RELEASED FROM QRF — ${st.label}`)
    return
  }
  sl.qrf = true
  toast(`${sl.name.toUpperCase()} DEDICATED AS QRF — ${st.label}`)
  radio(sl.name.toUpperCase(), 'move', `QRF DUTY AT ${st.label} — STANDING BY IN GARRISON`, st.x, st.y)
}

// manual deployment of a QRF element releases the duty (callers warn first)
export function releaseQrf(sl: OrgSlot): void {
  if (!sl.qrf) return
  sl.qrf = false
  toast(`${sl.name.toUpperCase()} RELEASED FROM QRF — DEPLOYED`)
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
  // cheap gate: no QRF duty anywhere and nobody responding -> nothing to do
  // (golden-neutral: skirmish never assigns QRF)
  let any = false
  for (const sl of S.org?.slots ?? []) if (sl.qrf) { any = true; break }
  if (!any) for (const u of S.units) if (u.qrfOutT != null) { any = true; break }
  if (!any) return

  for (const st of S.structures) {
    if (st.side !== 'friend' || st.buildT > 0) continue
    // the duty roster: garrisoned QRF slots homed at this base…
    const standing = (S.org?.slots ?? []).filter(sl =>
      sl.qrf && sl.unitId == null && qrfHomeBase(sl)?.id === st.id
      && sl.soldiers.some(x => x.status === 'FIT'))
    // …and the responders already out its gate
    const active = S.units.filter(u => u.qrfHome === st.id && u.strength > 0)
    if (!standing.length && !active.length) continue
    if (S.t - (st.qrfT ?? -999) < REEVAL_S) continue
    const threat = threatFor(st)

    if (threat) {
      st.qrfT = S.t
      let launched = 0
      const p = nearestLand(S.map!, threat.x, threat.y)
      // launch the standing duty: the garrison FIELDS ITSELF and rolls
      for (const sl of standing) {
        const u = fieldSlot(sl.id, st.id, { qrfLaunch: true })
        if (!u) continue // cap/refit/phase lock — the duty holds, try next eval
        u.qrfHome = st.id
        u.qrfOutT = S.t
        u.weapons = 'free'
        u.roe = 'halt'
        orderMove(u.id, p.x, p.y)
        launched++
      }
      // re-vector responders that have gone idle onto the fresh threat
      for (const u of active) {
        if (u.qrfOutT == null) continue
        if (!u.path.length && !u.attackMove) orderMove(u.id, p.x, p.y)
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
      // stand-down: responders quiet long enough return to GARRISON — the
      // slot keeps its QRF flag, so the duty resumes at the wire
      for (const u of active) {
        if (u.qrfOutT == null) continue
        if (S.t - u.lastCombatT < STAND_DOWN_S || S.t - u.qrfOutT < STAND_DOWN_S) continue
        delete u.qrfOutT
        delete u.qrfHome
        radio(u.label, 'move', `QRF STANDING DOWN — RETURNING TO GARRISON AT ${st.label}`, u.x, u.y)
        orderReturnToGarrison(u.id, st.id)
      }
    }
  }
}
