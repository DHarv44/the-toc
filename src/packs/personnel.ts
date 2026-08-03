// Personnel assignment (Packs P2): every soldier in a roster gets a NAME, RANK,
// POSITION and (for leadership billets) a personal CALLSIGN the moment the unit
// is built. Everything is DETERMINISTIC — hashed from unit id + soldier slot,
// no rng draws — so rosters are stable across saves and the golden harness
// never moves (all fields are digest-invisible).
//
// Billets follow the composition's casualty order: leaders are listed LAST in
// a dismount array, so the last LEADER is the Platoon Leader (last to fall),
// the one before is the Platoon Sergeant. Vehicle crews take crew-position
// billets (TC/Gunner/Loader/Driver); in platoons with no dismount leadership
// (tanks, guns, trucks) the first vehicle's commander IS the PL and the last
// vehicle's commander is the PSG — that's where they actually ride.
import type { Unit, Soldier } from '../engine/GameState'
import { VEHICLES, COMPOSITIONS, type TroopKindKey } from '../domains/forces/composition'
import { hashStr } from '../lib/math'
import { activePack } from './install'
import type { BilletPlan, BilletTables } from './types'

// --- name pools ------------------------------------------------------------
// Pools come from the SIDE'S PACK (Pack.names — pack folder's names.json,
// stored as the author wrote them); a pack that ships none falls back to this
// neutral default. The APP owns the casing (the TOC style is all-caps, so
// composed names are uppercased in code — the data never screams). Explicit
// Pack.people pins override generation per billet (applied in namePersonnel).
const DEFAULT_MALE = [
  'Alex', 'Sam', 'Chris', 'Morgan', 'Taylor', 'Jordan', 'Casey', 'Robin',
  'Drew', 'Lee', 'Jamie', 'Quinn', 'Reese', 'Avery', 'Blake', 'Dana',
]
const DEFAULT_LAST = [
  'Adams', 'Baker', 'Carter', 'Diaz', 'Evans', 'Fisher', 'Grant', 'Hayes',
  'Irwin', 'Jones', 'Keller', 'Lopez', 'Mason', 'Novak', 'Osborn', 'Parks',
]

// realistic force mix: heavy male majority when the pack provides both pools
const FEMALE_PCT = 12

function pools(side: 'friend' | 'hostile'): { male: readonly string[]; female: readonly string[]; last: readonly string[] } {
  // side's pack → 1CD (the canonical fallback, baked in at pack build) →
  // this tiny neutral list only if everything else is somehow empty
  const n = activePack(side)?.names
  return {
    male: n?.male?.length ? n.male : DEFAULT_MALE,
    female: n?.female ?? [],
    last: n?.last?.length ? n.last : DEFAULT_LAST,
  }
}

const pick = <T,>(arr: readonly T[], h: number): T => arr[Math.abs(h) % arr.length]!

// A billet resolved: a fixed rank stands, a spread is drawn by hash (the same
// job is not the same rank in every platoon).
const held = (b: BilletPlan, h: number): { pos: string; rank: string } =>
  ({ pos: b.pos, rank: Array.isArray(b.rank) ? pick(b.rank, h) : b.rank })

const billetsOf = (side: 'friend' | 'hostile'): BilletTables => {
  const t = activePack(side)?.billets
  if (!t) throw new Error(`pack for side '${side}' ships no billet table`)
  return t
}

// POSITION + RANK for a dismount, by kind and its index within that kind's
// group. The engine owns only the STRUCTURE here — that the group's LAST
// entries are its leadership, because rosters are listed in casualty order and
// the last one standing is the platoon leader — while every title and rank
// comes from the pack. (Exported for the P3 pipeline: replacements arrive at
// the junior end of their kind, so they never inherit a command billet.)
export function dismountBillet(
  kind: TroopKindKey, idx: number, groupN: number, h: number,
  side: 'friend' | 'hostile' = 'friend',
): { pos: string; rank: string } {
  const t = billetsOf(side)
  const b = t.dismount[kind]
  if (!b) return held(t.default, h)
  const fromEnd = b.fromEnd ?? []
  const back = groupN - 1 - idx                   // 0 = last in the group
  if (back < fromEnd.length) return held(fromEnd[back]!, h)
  const fromStart = b.fromStart ?? []
  if (idx < fromStart.length) return held(fromStart[idx]!, h)
  return held(b, h)
}

// CREW billets by seat. The engine owns the shape of a crew — armed vehicles
// are commanded from seat 0, seats fill in order, and a crew larger than its
// table repeats the last seat — while what each seat is CALLED is the pack's.
function crewBillet(
  vehType: string, seat: number, h: number, side: 'friend' | 'hostile',
): { pos: string; rank: string } {
  const spec = VEHICLES[vehType]
  const table = billetsOf(side).crew[spec.weapons.length > 0 ? 'armed' : 'unarmed']
  const seats = table[String(spec.crew)] ?? table['*']
  if (!seats?.length) throw new Error(`no crew billets for a ${spec.crew}-hand crew`)
  return held(seats[Math.min(seat, seats.length - 1)]!, h)
}

// Name a soldier from the seed key (also stamps the stable personnel identity
// `pid`, which seeds the portrait — so a face survives fielding transfers).
export function nameSoldier(s: Soldier, seedKey: string, side: 'friend' | 'hostile' = 'friend'): void {
  const p = pools(side)
  const h = hashStr(`${seedKey}:${s.id}`)
  // gender split is deterministic and male-heavy; a pack with no female pool
  // (or an all-male force) simply always draws male
  const female = p.female.length > 0
    && Math.abs(hashStr(`${seedKey}:${s.id}:g`)) % 100 < FEMALE_PCT
  const first = female ? p.female : p.male
  // pool data is author-cased; the TOC's all-caps style is applied HERE, by
  // the app — if a pack wants Van der Berg, the data keeps it
  s.name = `${pick(first, h)} ${pick(p.last, hashStr(`${seedKey}:${s.id}:ln`))}`.toUpperCase()
  s.pid = `${seedKey}:${s.id}`
}

// --- chain of command ------------------------------------------------------
// THE PLATOON'S ELEMENTS. A platoon is not a bag of people to be sorted by
// what they are riding in — it is a HQ and its squads, and squads are fire
// teams. Who rides in which track is a SEPARATE assignment laid on top of
// that structure and changes nothing about it: the S1 does not care what
// vehicle a soldier is on, and neither does this.
//
// Assigned here, beside the billets, because the two must agree by
// construction — the soldier who is the Platoon Sergeant is the soldier in
// PLT HQ. Every consumer (the roster tree, PERSTAT, anything later) reads
// `sec`/`team` and derives nothing of its own.
const ORD = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH'] as const

function assignElements(soldiers: Soldier[], vehicles: Unit['vehicles']): void {
  const dis = soldiers.filter(s => s.vehId == null)
  const sqLeaders = dis.filter(s => s.pos === 'Squad Leader')
  // A platoon with no squad leadership — a mortar section, a signal team, a
  // tank platoon whose crews ARE the platoon — is one element. It gets no
  // invented rungs; its people hang off it directly.
  if (!sqLeaders.length) return

  // PLT HQ takes the platoon leadership and the medic.
  const hq = dis.filter(s =>
    s.pos === 'Platoon Leader' || s.pos === 'Platoon Sergeant' || s.pos === 'Platoon Medic')
  for (const s of hq) s.sec = 'PLT HQ'

  // Every squad is TWO FIRE TEAMS, and a team leader leads each. People are
  // DEALT round-robin across the teams, never sliced: the roster is listed in
  // casualty order (like kinds together), so slicing hands one team every
  // rifleman and another every Javelin — teams that could not fight. Dealing
  // gives each the same mix, which is what cross-loading actually looks like.
  const teams: Soldier[][] = Array.from({ length: sqLeaders.length * 2 }, () => [])
  const tls = dis.filter(s => s.pos === 'Team Leader')
  tls.forEach((tl, k) => teams[k % teams.length]!.push(tl))
  dis.filter(s => !hq.includes(s) && !sqLeaders.includes(s) && !tls.includes(s))
    .forEach((s, k) => teams[k % teams.length]!.push(s))
  teams.forEach((members, k) => {
    for (const s of members) {
      s.sec = `${ORD[Math.floor(k / 2)]} SQD`
      s.team = k % 2 === 0 ? 'ALPHA TM' : 'BRAVO TM'
    }
  })
  // the squad leader leads both teams, so he stands in neither
  sqLeaders.forEach((sl, i) => { sl.sec = `${ORD[i]} SQD` })

  // THE CARRIERS' CREWS. Crewing a track is a JOB, not a place in the org —
  // there is no crew rung and no vehicle ever names an element. The crews are
  // simply people in the platoon's elements: the first carries the platoon
  // headquarters, the rest carry a squad each, and each crewman stands in that
  // element beside its leader, in no fire team. Change who rides in what and
  // the org chart does not move.
  vehicles.forEach((v, i) => {
    const sec = i === 0 ? 'PLT HQ' : `${ORD[Math.min(i - 1, sqLeaders.length - 1)]} SQD`
    for (const s of soldiers) if (s.vehId === v.id) s.sec = sec
  })
}

// Names + billets for a composition-built roster, seeded by any stable key —
// units pass their id, division-org slots pass the slot path (so a platoon
// keeps its exact people whether garrisoned or fielded).
export function namePersonnel(
  soldiers: Soldier[], vehicles: Unit['vehicles'], type: Unit['type'],
  seedKey: string, side: 'friend' | 'hostile',
): void {
  const comp = COMPOSITIONS[type]
  const noDismountLeaders = !comp.dismounts.some(d => d.kind === 'LEADER')

  // walk the roster in build order (crews per vehicle first, then dismounts —
  // buildRoster's exact layout) and hand out billets
  const perVeh = new Map<number, number>()   // vehId -> next seat index
  const kindIdx = new Map<string, number>()  // dismount kind -> occurrence index
  const kindTotal = new Map<string, number>()
  for (const d of comp.dismounts) kindTotal.set(d.kind, d.n)

  const vehCommanders: Soldier[] = []
  for (const s of soldiers) {
    const h = hashStr(`${seedKey}:${s.id}`)
    nameSoldier(s, seedKey, side)
    if (s.vehId != null) {
      const seat = perVeh.get(s.vehId) ?? 0
      perVeh.set(s.vehId, seat + 1)
      const veh = vehicles.find(v => v.id === s.vehId)
      const b = crewBillet(veh!.type, seat, h, side)
      s.pos = b.pos; s.rank = b.rank
      if (seat === 0) vehCommanders.push(s)
    } else {
      const idx = kindIdx.get(s.kind) ?? 0
      kindIdx.set(s.kind, idx + 1)
      const b = dismountBillet(s.kind, idx, kindTotal.get(s.kind) ?? 1, h, side)
      s.pos = b.pos; s.rank = b.rank
    }
  }

  // leaderless platoons (tanks, guns, trucks): the first vehicle's commander is
  // the PL, the last vehicle's commander the PSG — they ride, not walk
  if (noDismountLeaders && vehCommanders.length > 1) {
    const pl = vehCommanders[0]!, psg = vehCommanders[vehCommanders.length - 1]!
    pl.pos = 'Platoon Leader'; pl.rank = pick(['2LT', '2LT', '1LT'], hashStr(`${seedKey}:pl`))
    psg.pos = 'Platoon Sergeant'; psg.rank = 'SFC'
  }

  assignElements(soldiers, vehicles)

  // EXPLICIT pins (Pack.people): a pack can put a real person on a billet —
  // keyed '<seedKey>/<pos>' — and generation fills everything it doesn't pin
  const people = activePack(side)?.people
  if (people) {
    for (const s of soldiers) {
      const pin = s.pos && people[`${seedKey}/${s.pos}`]
      if (pin) {
        if (pin.name) s.name = pin.name.toUpperCase()
        if (pin.rank) s.rank = pin.rank
      }
    }
  }
}

// personal callsigns for the leadership billets ("6" = the boss, "7" = PSG) —
// assigned at FIELDING (labels don't exist in garrison)
export function assignCallsigns(u: Unit): void {
  for (const s of u.soldiers) {
    if (s.pos === 'Platoon Leader') s.cs = `${u.label}-6`
    else if (s.pos === 'Platoon Sergeant') s.cs = `${u.label}-7`
  }
}

// Assign names/ranks/positions/callsigns to a freshly built roster, in place.
// (Enemy units + the slot-exhausted fallback path; slot-drawn friendlies keep
// their garrison personnel and only take callsigns.)
export function assignPersonnel(u: Unit): void {
  namePersonnel(u.soldiers, u.vehicles, u.type, `${u.id}`, u.side)
  assignCallsigns(u)
}
