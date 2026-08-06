// WHAT HAPPENS TO THE FRONT OF A COLUMN.
//
// An order of march is a form until something asymmetric hits position one.
// Every other kind of damage in this game is applied to a UNIT — a fire
// mission, a direct-fire engagement, an air strike — so it reaches the whole
// platoon at once and the sequence you put it in changes nothing. A mine does
// not work like that: it is under ONE vehicle, and which vehicle that is was
// decided by whoever wrote the order.
//
// So this is deliberately small. One hazard, buried on a route, armed until
// somebody drives over it. It exists to make the manifest cost something.
//
// The three things it asks, which are exactly the three the planner sets:
//   WHO IS IN FRONT   the first vehicle into the radius takes it
//   HOW HARD IS IT    a hardened vic is mobility-killed; a soft one is gone
//   HOW FAR APART     at close interval the blast reaches the next vic too
import { S } from '../../engine/state'
import type { Hazard, Unit, UnitElement } from '../../engine/GameState'
import { elemWorld } from '../forces/elements'
import { applyElementLoss } from '../forces/casualties'
import { radio } from '../comms/radio'
import { routeStruck } from '../control/routes'

/** metres of overpressure around the strike that can reach a NEIGHBOURING vic.
 *  Well inside `close` interval (30 m) and well outside `open` (100 m), which
 *  is the whole reason interval is a decision and not a preference. */
const SPLASH = 45

/** Bury one. `side` is who laid it, so it never goes off under them. */
export function layHazard(
  x: number, y: number, side: Hazard['side'],
  kind: Hazard['kind'] = 'mine', r = 18,
): Hazard {
  const h: Hazard = { id: S.counters.nextId++, kind, x, y, r, side, armed: true }
  S.hazards.push(h)
  return h
}

export function hazardUpdate(): void {
  if (!S.hazards.length) return
  for (const h of S.hazards) {
    if (!h.armed) continue
    for (const u of S.units) {
      if (u.strength <= 0) continue
      // a hazard laid against one side does not go off under the people who
      // laid it
      if (h.side === u.side) continue
      const hit = firstInto(u, h)
      if (!hit) continue
      h.armed = false
      h.t = S.t
      strike(u, hit.el, h, true)
      // ANYTHING ELSE CLOSE ENOUGH, across the whole column and not just the
      // vic that found it. The march interval is spacing BETWEEN units, so a
      // splash that only looked inside one platoon could never charge for it —
      // close interval would cost exactly as much as open, which is the
      // decision this hazard exists to make real.
      for (const o of S.units) {
        if (o.side !== u.side || o.strength <= 0) continue
        for (const el of o.elements) {
          if (el === hit.el || !el.alive || el.kind !== 'veh') continue
          if (within(o, el, h, SPLASH)) strike(o, el, h, false)
        }
      }
      break
    }
  }
  // spent hazards linger briefly so the map can draw the crater, then go
  for (let i = S.hazards.length - 1; i >= 0; i--) {
    const h = S.hazards[i]!
    if (!h.armed && h.t != null && S.t - h.t > 120) S.hazards.splice(i, 1)
  }
}

const within = (u: Unit, el: UnitElement, h: Hazard, r: number): boolean => {
  const w = elemWorld(u, el)
  return Math.hypot(w.x - h.x, w.y - h.y) <= r
}

/** The FIRST vehicle into the radius — by odometer, not by array order, so it
 *  is the one actually at the front of the column rather than the one that
 *  happens to be listed first. */
function firstInto(u: Unit, h: Hazard): { el: UnitElement } | null {
  let best: UnitElement | null = null, bestDist = -Infinity
  for (const el of u.elements) {
    if (!el.alive || el.kind !== 'veh') continue
    if (!within(u, el, h, h.r)) continue
    const d = el.dist ?? 0
    if (d > bestDist) { bestDist = d; best = el }
  }
  return best ? { el: best } : null
}

function strike(u: Unit, el: UnitElement, h: Hazard, lead: boolean): void {
  // A HARDENED VIC IS NOT A DEAD VIC. It is mobility-killed and recoverable —
  // which is the decision the disabled-vehicle policy will be about. A soft
  // one is a catastrophic loss and takes its crew with it.
  const catastrophic = !el.hard
  applyElementLoss(u, el, catastrophic, h.kind)
  const w = elemWorld(u, el)
  // a strike ON a commissioned route flips it red (domains/control/routes)
  if (lead) routeStruck(w.x, w.y, h.kind)
  radio(u.label, 'damage',
    lead
      ? `${h.kind.toUpperCase()} STRIKE — LEAD VIC ${catastrophic ? 'DESTROYED' : 'DISABLED'}, COLUMN HALTED`
      : `SECONDARY — ${catastrophic ? 'LOST' : 'DISABLED'} IN THE BLAST, TOO CLOSE UP`,
    w.x, w.y)
  if (lead) {
    // Actions on contact: the column stops. It does not drive on through a
    // minefield it has just found the edge of.
    u.roe = 'halt'
    u._spd = 0
  }
}
