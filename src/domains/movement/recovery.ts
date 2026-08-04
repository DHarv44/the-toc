// THE DISABLED VEHICLE — the decision a movement order has to make in advance.
//
// A mobility kill is not a casualty. The Bradley is still there, its crew is
// mostly alive, and it is a thirty-ton roadblock sitting in the middle of a
// route with a column stacked up behind it. Somebody has to say which way it
// goes, and the whole point of saying it in the ORDER is that nobody has to ask
// over the net while they are being shot at.
//
// Until now a DAMAGED vehicle was a readout. It killed its element, dropped the
// unit's strength, and then had no further opinion about anything: the column
// drove on as though a vic that could not move were not in it. Both real
// answers cost something, and the commander picks which:
//
//   RECOVER   the column waits while the wrecker hooks it up and tows it. The
//             vehicle lives and the motorpool gets it back. Ninety seconds of
//             a battalion's column standing still on a route is a long time,
//             and it needs a recovery vehicle SOMEWHERE IN THE COLUMN — which
//             is a task organization decision made an hour earlier.
//   PUSH      shoved off the route and written off. The column does not break
//             stride. You have destroyed one of your own vehicles to save four
//             minutes, and its crew is now looking for a seat in somebody
//             else's (domains/forces/loadplan), which may cost you the time
//             anyway if there isn't one.
//
// A THIRD OPTION IS DELIBERATELY ABSENT. Destroy-in-place is real and a TOC
// does order it, but it differs from pushing a hulk off the road only in what
// the enemy can do with what you left — and nothing in this game recovers or
// exploits an abandoned friendly vehicle yet. Shipping it now would be a
// button that lies about being different.
import { S } from '../../engine/state'
import type { DisabledPolicy, Unit, UnitVehicle } from '../../engine/GameState'
import { VEHICLES } from '../forces/composition'
import { autoLoad } from '../forces/loadplan'
import { deriveElements, deriveStrength } from '../forces/casualties'
import { marchPlan } from './march'
import { netRadio } from '../comms/radio'
import { teamOf } from '../forces/teams'

// the net speaks in one voice — a platform's display name goes up in it as the
// rest of the traffic does, not as it appears in a data table
const vicName = (v: UnitVehicle): string =>
  (VEHICLES[v.type]?.name ?? v.type).toUpperCase() + ' '

/** Seconds this platform needs to recover one casualty, or 0 if it cannot. */
export const recoveryTime = (v: UnitVehicle): number =>
  (v.status === 'OK' ? VEHICLES[v.type]?.recovery : 0) ?? 0

/** Does this element carry recovery? */
export const hasWrecker = (u: Unit): boolean => u.vehicles.some(v => recoveryTime(v) > 0)

/** THE ELEMENT IN THE COLUMN THAT CAN DO THE WORK.
 *
 *  Column-wide, not unit-wide, and that is the whole design: a rifle platoon
 *  has never carried a wrecker and never will. Recovery is why you attach the
 *  support element, and a commander who did not is finding out here. */
export function wreckerIn(gid: number | null): Unit | null {
  if (gid == null) return null
  const t = S.teams.find(x => x.id === gid)
  const pool = t
    ? t.members.map(id => S.units.find(u => u.id === id))
    : S.units.filter(u => u.groupId === gid)
  for (const u of pool) {
    if (u && u.strength > 0 && hasWrecker(u)) return u
  }
  return null
}

export const policyOf = (gid: number | null): DisabledPolicy =>
  (gid != null ? marchPlan(gid)?.disabled : undefined) ?? 'recover'

/** Vehicles that have stopped but are not write-offs. */
const disabledIn = (u: Unit): UnitVehicle[] => u.vehicles.filter(v => v.status === 'DAMAGED')

/** Is this unit stopped over a vehicle? Read by the movement tick; the column's
 *  own solver does the rest, waiting for a member that has stopped exactly as
 *  it waits for one that has bogged.
 *
 *  Three ways to be stopped, and the third is the one that matters: a unit
 *  whose vehicle is STRANDED holds until the commander answers. It does not
 *  drive off and leave a crew standing in the road next to a Bradley — no
 *  platoon has ever done that, and if the order is to abandon the vehicle then
 *  somebody has to actually give it. That is what makes PUSH IT OFF a decision
 *  rather than a preference. */
export const inRecovery = (u: Unit): boolean =>
  S.recoveries.some(j => j.unitId === u.id || j.byId === u.id)
  || u.vehicles.some(v => v.status === 'DAMAGED' && v.recov === 'stranded')

/** Push a hulk off the route. The vehicle is gone; the people are not, and
 *  they are now somebody else's passengers. */
function pushOff(u: Unit, v: UnitVehicle): void {
  v.status = 'DESTROYED'
  autoLoad(u)          // the crew of a vic that no longer carries needs a seat
  deriveElements(u)
  deriveStrength(u)
  netRadio(u, 'damage',
    `${vicName(v)}PUSHED OFF THE ROUTE — CREW UP WITH THE OTHERS`, u.x, u.y)
}

export function recoveryUpdate(dt: number): void {
  // --- work in progress ------------------------------------------------------
  for (let i = S.recoveries.length - 1; i >= 0; i--) {
    const j = S.recoveries[i]!
    const u = S.units.find(x => x.id === j.unitId)
    const by = S.units.find(x => x.id === j.byId)
    const v = u?.vehicles.find(x => x.id === j.vehId)
    // the casualty, the wrecker or the vehicle itself can all stop existing
    // mid-job, and a recovery that has lost any of the three is over
    if (!u || !by || !v || u.strength <= 0 || by.strength <= 0 || v.status !== 'DAMAGED') {
      S.recoveries.splice(i, 1)
      continue
    }
    j.t += dt
    if (j.t < j.need) continue
    S.recoveries.splice(i, 1)
    // Recovered means TOWED, not repaired. It stays DAMAGED and the motorpool
    // still has to fix it — what the column bought was the vehicle's life.
    netRadio(u, 'arrive',
      `${vicName(v)}RECOVERED — ${by.label} HAS IT ON TOW`, u.x, u.y)
  }

  // --- new casualties --------------------------------------------------------
  // Only elements actually MARCHING: a disabled vic in a unit sitting in an
  // assembly area is the motorpool's problem, not the column's, and the choice
  // this models is a choice about a route.
  for (const u of S.units) {
    if (u.side !== 'friend' || u.strength <= 0) continue
    if (u.groupId == null || !u.path.length) continue
    if (inRecovery(u)) continue
    const dis = disabledIn(u)
    if (!dis.length) continue
    const v = dis[0]!
    if (v.recov) continue                       // already dealt with once
    const gid = teamOf(u)?.id ?? u.groupId
    const policy = policyOf(gid)
    if (policy === 'push') {
      v.recov = 'pushed'
      pushOff(u, v)
      continue
    }
    const by = wreckerIn(u.groupId) ?? wreckerIn(gid)
    if (!by) {
      // NO RECOVERY MEANS NO CHOICE. The order said recover; there is nothing
      // in the column that can. Say so plainly rather than silently doing the
      // other thing — the commander needs to know the order could not be
      // carried out, and needs to know it now rather than at the objective.
      v.recov = 'stranded'
      netRadio(u, 'damage',
        `${vicName(v)}DISABLED — NO RECOVERY IN THE COLUMN, REQUEST GUIDANCE`,
        u.x, u.y)
      continue
    }
    v.recov = 'towed'
    S.recoveries.push({
      gid: gid ?? -1, unitId: u.id, vehId: v.id, byId: by.id,
      t: 0, need: recoveryTime(by.vehicles.find(x => recoveryTime(x) > 0)!),
    })
    netRadio(u, 'move',
      `${vicName(v)}DISABLED — ${by.label} RECOVERING, COLUMN HOLDING`,
      u.x, u.y)
  }
}

/** A stranded vehicle the commander has since decided to abandon — the answer
 *  to the "REQUEST GUIDANCE" call. */
export function pushDisabled(unitId: number): void {
  const u = S.units.find(x => x.id === unitId)
  if (!u) return
  for (const v of u.vehicles) {
    if (v.status !== 'DAMAGED') continue
    v.recov = 'pushed'
    pushOff(u, v)
  }
}

/** How many of this unit's vics are stopped and unresolved — the number the
 *  board puts in front of the commander. */
export const strandedIn = (u: Unit): UnitVehicle[] =>
  u.vehicles.filter(v => v.status === 'DAMAGED' && v.recov === 'stranded')
