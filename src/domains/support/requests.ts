// THE SUPPORT SPINE — units request UP, the commander decides, approved
// requests become REAL THINGS ON THE MAP.
//
// One typed queue for every lane there will ever be: the 9-line MEDEVAC
// today, CAS and vehicle recovery next, call for fire when it lands. The
// request lifecycle is the same in every lane — raised → approved | denied →
// executing → complete | aborted — and the commander's decision surface
// (ui/RequestsBlock) renders the queue without knowing what any lane means.
//
// THE MEDEVAC LANE, and what it changed. Evac-category wounded used to vanish
// into `s.evac = true` the moment they were hit — the bird was an abstraction.
// Now they HOLD on the roster: a unit with evac cases raises its own 9-line,
// and until an actual airframe lifts them they deteriorate on the golden-hour
// clock — unless a medic STABILIZES them, which is what the forward-care aura
// is FOR. The bird is a real entity: it launches from the CP, flies out,
// STANDS OFF a hot LZ (and aborts if it stays hot), loads litter and
// ambulatory in real time while the requesting element smokes the LZ under
// contact, and only when it lifts do the patients enter the medical chain the
// replacement pipeline already knows how to finish.
import { S } from '../../engine/state'
import type { EvacBird, Soldier, SupportRequest, Unit } from '../../engine/GameState'
import { nearestLand } from '../../world/place'
import { hashStr } from '../../lib/math'
import { grid } from '../../lib/format'
import { deriveElements, deriveStrength } from '../forces/casualties'
import { radio, toast } from '../comms/radio'

const BIRD_SPEED = 55            // m/s — a Black Hawk at the treetops
const LZ_HOT_R = 600             // hostiles inside this = the LZ is hot
const HOLD_LIMIT = 150           // seconds a bird will stand off before aborting
const LOAD_BASE = 10             // seconds on the ground, plus per patient
const LOAD_PER = 6

/** the evac cases a unit is holding: wounded past LIGHT, not yet lifted */
const patientsOf = (u: Unit): Soldier[] =>
  u.soldiers.filter(s =>
    s.status === 'WIA' && !s.evac && !!s.wound && s.wound.sev !== 'LIGHT')

const openFor = (unitId: number, kind: SupportRequest['kind']): SupportRequest | undefined =>
  S.requests.find(r => r.kind === kind && r.from === unitId
    && (r.state === 'raised' || r.state === 'approved' || r.state === 'executing'))

// --- the commander's verbs (the UI calls these) ------------------------------

export function approveRequest(id: number): void {
  const r = S.requests.find(x => x.id === id)
  if (!r || r.state !== 'raised') return
  r.state = 'approved'
  radio('NET CONTROL', 'request', `MEDEVAC APPROVED — DUSTOFF INBOUND FOR ${label(r)}`, r.x, r.y)
}

export function denyRequest(id: number): void {
  const r = S.requests.find(x => x.id === id)
  if (!r || r.state !== 'raised') return
  r.state = 'denied'
  radio('NET CONTROL', 'request', `MEDEVAC DENIED — ${label(r)}, HOLD YOUR CASUALTIES`, r.x, r.y)
}

const label = (r: SupportRequest): string =>
  S.units.find(u => u.id === r.from)?.label ?? 'STATION'

// --- the tick ---------------------------------------------------------------

export function supportUpdate(dt: number): void {
  raiseSweep()
  deteriorate(dt)
  launchApproved()
  for (const b of S.evacBirds) flyBird(b, dt)
  // finished birds leave the sky; settled requests age off the queue
  for (let i = S.evacBirds.length - 1; i >= 0; i--) {
    const b = S.evacBirds[i]!
    const r = S.requests.find(x => x.id === b.reqId)
    if (!r || r.state === 'complete' || r.state === 'aborted') {
      if (b.state !== 'back') continue
      if (Math.hypot(b.x - b.home.x, b.y - b.home.y) < 80) S.evacBirds.splice(i, 1)
    }
  }
  for (let i = S.requests.length - 1; i >= 0; i--) {
    const r = S.requests[i]!
    if ((r.state === 'complete' || r.state === 'denied' || r.state === 'aborted')
      && S.t - r.t > 300) S.requests.splice(i, 1)
  }
}

/** A unit holding evac cases calls its own 9-line, once, when it can. */
function raiseSweep(): void {
  for (const u of S.units) {
    if (u.side !== 'friend' || u.strength <= 0) continue
    const cases = patientsOf(u)
    if (!cases.length || openFor(u.id, 'medevac')) continue
    const litter = cases.filter(s => s.wound!.sev === 'CRITICAL').length
    const ambulatory = cases.length - litter
    S.requests.push({
      id: S.counters.nextId++, kind: 'medevac', from: u.id,
      x: u.x, y: u.y, t: S.t, state: 'raised', litter, ambulatory,
    })
    radio(u.label, 'request',
      `MEDEVAC 9-LINE — GRID ${grid(u.x, u.y)} · ${litter} LITTER ${ambulatory} AMBULATORY · ` +
      `LZ WILL BE MARKED — REQUEST DUSTOFF`, u.x, u.y)
    toast(`9-LINE — ${u.label} REQUESTS MEDEVAC (${litter}L ${ambulatory}A)`)
  }
}

/** THE GOLDEN HOUR, in the unit. An unstabilized evac case gets worse:
 *  SERIOUS becomes CRITICAL, CRITICAL dies of wounds. A medic's aura sets
 *  `wound.stab` and stops this clock — which is the whole argument for
 *  keeping a MED detachment forward now that evacuation takes real time. */
function deteriorate(_dt: number): void {
  for (const u of S.units) {
    if (u.side !== 'friend' || u.strength <= 0) continue
    let lost = false
    for (const s of patientsOf(u)) {
      const w = s.wound!
      if (w.stab) continue
      const age = S.t - w.t
      const jit = 0.75 + (Math.abs(hashStr(`${s.pid ?? s.id}:gh2`)) % 100) / 200
      if (w.sev === 'CRITICAL' && age > 600 * jit) {
        s.status = 'KIA'
        lost = true
        radio(u.label, 'loss',
          `${s.rank ?? ''} ${s.name ?? 'CASUALTY'} DIED OF WOUNDS AWAITING EVAC`, u.x, u.y)
      } else if (w.sev === 'SERIOUS' && age > 480 * jit) {
        w.sev = 'CRITICAL'
      }
    }
    if (lost) { deriveElements(u); deriveStrength(u) }
  }
}

/** An approved 9-line gets a BIRD: launched from the CP, pointed at an LZ
 *  established beside the requester. */
function launchApproved(): void {
  for (const r of S.requests) {
    if (r.kind !== 'medevac' || r.state !== 'approved') continue
    const u = S.units.find(x => x.id === r.from)
    const cp = S.structures.find(s => s.side === 'friend' && s.kind === 'HQ' && s.buildT <= 0)
    if (!u || u.strength <= 0 || !cp || !S.map) { r.state = 'aborted'; continue }
    const lz = nearestLand(S.map, u.x + 120, u.y + 80)
    r.lz = { x: lz.x, y: lz.y }
    const n = S.evacBirds.length + 1
    const bird: EvacBird = {
      id: S.counters.nextId++, reqId: r.id,
      x: cp.x, y: cp.y, wp: { ...r.lz }, home: { x: cp.x, y: cp.y },
      state: 'out', loadT: 0, holdT: 0,
      label: `DUSTOFF 2-${n}`,
    }
    S.evacBirds.push(bird)
    r.birdId = bird.id
    r.state = 'executing'
    radio(bird.label, 'move', `LIFTING — EN ROUTE GRID ${grid(r.lz.x, r.lz.y)}`, cp.x, cp.y)
  }
}

const hostilesNear = (x: number, y: number, rr: number): boolean =>
  S.units.some(h => h.side === 'hostile' && h.strength > 0
    && Math.hypot(h.x - x, h.y - y) < rr)

function flyBird(b: EvacBird, dt: number): void {
  const r = S.requests.find(x => x.id === b.reqId)
  if (!r) { b.state = 'back'; b.wp = b.home }
  const u = r ? S.units.find(x => x.id === r.from) : undefined

  // the requester died while the bird was out: nothing to load, come home
  if (r && r.state === 'executing' && b.state !== 'back' && (!u || u.strength <= 0)) {
    r.state = 'aborted'
    b.state = 'back'; b.wp = b.home
    radio(b.label, 'move', 'NO CONTACT WITH REQUESTING STATION — RETURNING TO BASE', b.x, b.y)
  }

  // move toward the current waypoint
  const d = Math.hypot(b.wp.x - b.x, b.wp.y - b.y)
  if (d > 4) {
    const step = Math.min(d, BIRD_SPEED * dt)
    b.x += ((b.wp.x - b.x) / d) * step
    b.y += ((b.wp.y - b.y) / d) * step
  }

  if (!r || !r.lz || !u) return
  switch (b.state) {
    case 'out': {
      if (Math.hypot(b.x - r.lz.x, b.y - r.lz.y) > 60) return
      if (hostilesNear(r.lz.x, r.lz.y, LZ_HOT_R)) {
        b.state = 'hold'
        radio(b.label, 'move', 'LZ IS HOT — HOLDING OFF, GET IT COLD', b.x, b.y)
        return
      }
      touchdown(b, r, u)
      return
    }
    case 'hold': {
      b.holdT += dt
      if (!hostilesNear(r.lz.x, r.lz.y, LZ_HOT_R)) { touchdown(b, r, u); return }
      if (b.holdT > HOLD_LIMIT) {
        r.state = 'aborted'
        b.state = 'back'; b.wp = b.home
        radio(b.label, 'move', 'LZ WILL NOT COOL — ABORTING, RE-REQUEST WHEN COLD', b.x, b.y)
      }
      return
    }
    case 'loading': {
      b.loadT -= dt
      if (b.loadT > 0) return
      const lifted = patientsOf(u)
      for (const s of lifted) s.evac = true
      r.state = 'complete'
      b.state = 'back'; b.wp = b.home
      radio(b.label, 'move',
        `LIFTING — ${lifted.length} ABOARD, EN ROUTE ROLE II`, b.x, b.y)
      return
    }
    case 'back':
      return
  }
}

function touchdown(b: EvacBird, r: SupportRequest, u: Unit): void {
  b.state = 'loading'
  const n = patientsOf(u).length
  b.loadT = LOAD_BASE + LOAD_PER * n
  // the requesting element marks the LZ — smoke if they are in contact, and
  // the crew's door guns stand watch either way
  if (S.t - u.lastCombatT < 60 && r.lz) {
    S.smoke.push({ x: r.lz.x, y: r.lz.y, t: S.t, r: 45 })
    radio(u.label, 'move', 'LZ MARKED — GREEN SMOKE OUT', r.lz.x, r.lz.y)
  }
  radio(b.label, 'arrive',
    `DUSTOFF ON THE GROUND — LOADING ${n}, DOOR GUNNERS COVERING`, b.x, b.y)
}
