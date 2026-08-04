// THE LOAD PLAN — who rides in which vehicle, and what that costs when it burns.
//
// A manifest is not paperwork. It is the answer to two questions a TOC gets
// asked at the worst possible moment:
//
//   "WHO WAS IN THAT VIC?"   the Bradley that brewed up had a crew of three
//                            and a fire team in the back, and the difference
//                            between those two facts is six men.
//   "CAN YOU STILL LIFT?"    lose enough vics and the seats stop adding up.
//                            The platoon does not stop existing; it starts
//                            WALKING, and a battle group moves at the pace of
//                            whoever is on foot.
//
// Both of those already had the data to be true and neither of them was. Crews
// died with their vehicle (casualties.ts) but riders did not, because nobody
// was ever manifested anywhere: `buildRoster` seats crews on their platform and
// leaves every dismount at `vehId: null`, which is the org fact, not a seat.
// So an ATGM through the troop compartment killed three crewmen and left the
// squad it was carrying untouched, standing in a vehicle that no longer existed.
//
// SEATS ARE PACK DATA. `VehicleType.pax` has been in the platform library since
// it was written — a Bradley lifts 6, a Stryker 9, an Abrams lifts nobody. The
// engine only knows that vehicles HAVE capacity and that capacity is finite.
//
// A NOTE ON WHAT THIS IS NOT. It is not a seating chart down to the individual
// hatch, and it does not let the commander move a gunner into a driver's hole.
// A battalion TOC does not crew vehicles; it decides who has lift and who does
// not. What it does track is which SQUAD is on which vic, because that is the
// granularity at which the loss lands.
import type { Soldier, Unit, UnitVehicle } from '../../engine/GameState'
import { UNIT_TYPES } from './catalog'
import { VEHICLES } from './composition'

/** Dismount seats on a platform — pack data, 0 for a tank. */
export const seatsOn = (v: UnitVehicle): number => VEHICLES[v.type]?.pax ?? 0

// WHAT A VEHICLE WILL TAKE WHEN IT HAS TO, as against what it seats.
//
// The pack's own numbers put this question on the table. A rifle platoon's
// HMMWVs lift 32 and it has 32 dismounts; a Stryker platoon lifts 36 and has
// 36. A Bradley platoon lifts 24 and has 30 — and that is not a data slip, it
// is the M2 platoon's actual, famous squeeze: four vics with six seats each
// against a dismount element that has never fitted in them. Real platoons solve
// it the real way. Men sit on the floor, on the ramp, on each other's kit.
//
// So overloading is allowed, to half again, and it costs what it costs: a
// crammed troop compartment is a much worse place to be when the vic is hit,
// because nobody gets out of it quickly. A commander who does not like that
// number can spread the load and leave people walking instead. That is the
// trade, and it is a real one — which is the point of writing it down.
export const crushOn = (v: UnitVehicle): number => {
  const p = seatsOn(v)
  return p ? Math.ceil(p * 1.5) : 0
}

/** Vehicles that can actually carry anyone right now. A DAMAGED vic is a
 *  mobility or firepower kill — it is still a hull with seats in it, and a
 *  platoon that has to cross-load onto its casualties does exactly that. A
 *  DESTROYED one is a wreck. */
const carrying = (u: Unit): UnitVehicle[] => u.vehicles.filter(v => v.status !== 'DESTROYED')

/** Everyone still with the platoon who needs a ride.
 *
 *  Dismounts, plus THE CREW OF A VEHICLE THAT IS NO LONGER CARRYING ANYONE.
 *  That second half was missing and it mattered: the three men who got out of
 *  a burning Bradley are not still riding in it, they are standing on a route
 *  looking for a seat, and pretending otherwise made a destroyed vic cost
 *  nothing but the vic. Their `vehId` is left alone — it is the billet, and
 *  they are still that crew — only the manifest changes.
 *
 *  Evacuated and replaced records have left the unit and are nobody's problem;
 *  a non-evacuated WIA is very much still a passenger. */
export const needsLift = (u: Unit): Soldier[] => {
  const gone = new Set(u.vehicles.filter(v => v.status === 'DESTROYED').map(v => v.id))
  return u.soldiers.filter(s =>
    (s.vehId === null || gone.has(s.vehId)) && !s.replaced && !s.evac
    && s.status !== 'KIA' && s.status !== 'MIA')
}

export interface VicLoad {
  veh: UnitVehicle
  seats: number       // nominal
  cap: number         // the most it will take, crammed
  crew: Soldier[]
  riders: Soldier[]
  over: number        // riders past nominal — the ones sitting on the floor
  free: number        // what will still fit before it is full
}

/** The manifest, vic by vic. */
export function loadOf(u: Unit): VicLoad[] {
  const lift = needsLift(u)
  return carrying(u).map(veh => {
    const seats = seatsOn(veh)
    const cap = crushOn(veh)
    const riders = lift.filter(s => s.seat === veh.id)
    return {
      veh, seats, cap,
      crew: u.soldiers.filter(s => s.vehId === veh.id && s.status !== 'KIA' && s.status !== 'MIA'),
      riders,
      over: Math.max(0, riders.length - seats),
      free: Math.max(0, cap - riders.length),
    }
  })
}

/** Is this vic carrying more than it seats? Read at the moment it is hit. */
export const isCrammed = (u: Unit, veh: UnitVehicle): boolean =>
  needsLift(u).filter(s => s.seat === veh.id).length > seatsOn(veh)

export interface LiftState {
  seats: number       // nominal dismount seats still rolling
  cap: number         // the most those vics will take, crammed
  lifted: number      // people with a place aboard something
  crammed: number     // of those, how many are riding over the nominal count
  walking: Soldier[]  // people with nothing
}

export function liftState(u: Unit): LiftState {
  const vics = carrying(u)
  const all = needsLift(u)
  const rolling = new Set(vics.map(v => v.id))
  const walking = all.filter(s => s.seat == null || !rolling.has(s.seat))
  return {
    seats: vics.reduce((n, v) => n + seatsOn(v), 0),
    cap: vics.reduce((n, v) => n + crushOn(v), 0),
    lifted: all.length - walking.length,
    crammed: loadOf(u).reduce((n, l) => n + l.over, 0),
    walking,
  }
}

// --- assignment --------------------------------------------------------------

/** Fill the seats. Deterministic and rng-free: squads are taken in roster order
 *  and vehicles in build order, so the same platoon always loads the same way.
 *
 *  A SQUAD RIDES TOGETHER where it can. That is not tidiness — it is the whole
 *  reason the granularity is worth having. A fire team spread one man per vic
 *  makes every loss a papercut; a fire team in one vic makes the loss of that
 *  vic the loss of the fire team, which is what actually happens and what the
 *  commander is choosing between when they set the order of march.
 *
 *  Anyone left over WALKS. That is not a failure to solve — it is the report. */
export function autoLoad(u: Unit): void {
  const vics = carrying(u)
  const rolling = new Set(vics.map(v => v.id))
  const pool = needsLift(u)
  // drop seats on vics that are gone; keep the ones that still hold
  for (const s of pool) if (s.seat != null && !rolling.has(s.seat)) s.seat = null

  const free = new Map(vics.map(v => [v.id, seatsOn(v)]))
  for (const s of pool) {
    if (s.seat != null) free.set(s.seat, (free.get(s.seat) ?? 0) - 1)
  }

  // group the unseated by their sub-element — the squad, not the individual
  const groups: Soldier[][] = []
  const byKey = new Map<string, Soldier[]>()
  for (const s of pool) {
    if (s.seat != null) continue
    const key = s.sec ?? `#${s.id}`
    let g = byKey.get(key)
    if (!g) { g = []; byKey.set(key, g); groups.push(g) }
    g.push(s)
  }

  // TWO PASSES, and the order is the whole point. Everybody gets a real seat
  // before anybody sits on the floor: cramming one vic while another rolls with
  // empty benches is the one load plan no platoon sergeant would sign.
  const place = (): void => {
    for (const g of groups) {
      if (g.every(s => s.seat != null)) continue
      const want = g.filter(s => s.seat == null)
      // the tightest vic that takes the WHOLE group, so a big squad does not
      // eat a truck a bigger one needed
      let pick: UnitVehicle | undefined
      let best = Infinity
      for (const v of vics) {
        const f = free.get(v.id) ?? 0
        if (f >= want.length && f < best) { best = f; pick = v }
      }
      if (pick) {
        for (const s of want) s.seat = pick.id
        free.set(pick.id, best - want.length)
        continue
      }
      // it fits nowhere whole — split it across what is left, and whoever the
      // seats run out on stays unseated for the next pass (or walks)
      for (const s of want) {
        const v = vics.find(x => (free.get(x.id) ?? 0) > 0)
        if (!v) break
        s.seat = v.id
        free.set(v.id, (free.get(v.id) ?? 0) - 1)
      }
    }
  }
  place()
  // pass two: what is left rides crammed
  for (const v of vics) {
    const taken = pool.filter(s => s.seat === v.id).length
    free.set(v.id, Math.max(0, crushOn(v) - taken))
  }
  place()
}

/** Move one soldier to a vic (or off, with `null`). Refuses to overload —
 *  capacity is the constraint the whole thing exists to enforce. Returns false
 *  with nothing changed if it will not fit. */
export function assignSeat(u: Unit, soldierId: number, vehId: number | null): boolean {
  const s = u.soldiers.find(x => x.id === soldierId)
  if (!s || s.vehId !== null) return false      // crew do not move; that is a billet
  if (vehId == null) { s.seat = null; return true }
  const v = u.vehicles.find(x => x.id === vehId && x.status !== 'DESTROYED')
  if (!v) return false
  const load = loadOf(u).find(l => l.veh.id === vehId)
  if (!load || (load.free <= 0 && s.seat !== vehId)) return false   // full is full, even crammed
  s.seat = vehId
  return true
}

/** Riders aboard a given vic, for the moment it is hit. Only meaningful while
 *  the platoon is MOUNTED — dismounted troops are on the ground beside their
 *  vehicles, and a vic that burns there does not take them with it. */
export function ridersOn(u: Unit, veh: UnitVehicle): Soldier[] {
  if (!u.mounted) return []
  return u.soldiers.filter(s =>
    s.vehId === null && s.seat === veh.id && s.status === 'FIT')
}

// --- the consequence ---------------------------------------------------------

/** How fast this unit can actually move, as a fraction of its mounted pace.
 *
 *  A platoon that cannot lift everyone does not leave them. It moves at the
 *  speed of the men on foot — the vics crawling alongside, or shuttling, which
 *  comes to the same thing at this scale. One destroyed Stryker can take a
 *  battle group from 14 m/s to 2, and the commander finds out by watching the
 *  column fail to make its SP time.
 *
 *  Dismounted units are already walking, so there is nothing to lose. */
export function liftFactor(u: Unit): number {
  const type = UNIT_TYPES[u.type]
  if (!type?.carrier || !u.mounted) return 1
  if (!liftState(u).walking.length) return 1
  return Math.min(1, type.speed / type.carrier.speed)
}
