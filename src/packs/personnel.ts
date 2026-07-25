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

// --- name pools ------------------------------------------------------------
// Pools come from the SIDE'S PACK (Pack.names — framework mode); a pack that
// ships none falls back to this neutral default. Explicit Pack.people pins
// override generation per billet (applied in namePersonnel).
const DEFAULT_FIRST = [
  'ALEX', 'SAM', 'CHRIS', 'MORGAN', 'TAYLOR', 'JORDAN', 'CASEY', 'ROBIN',
  'DREW', 'LEE', 'JAMIE', 'QUINN', 'REESE', 'AVERY', 'BLAKE', 'DANA',
]
const DEFAULT_LAST = [
  'ADAMS', 'BAKER', 'CARTER', 'DIAZ', 'EVANS', 'FISHER', 'GRANT', 'HAYES',
  'IRWIN', 'JONES', 'KELLER', 'LOPEZ', 'MASON', 'NOVAK', 'OSBORN', 'PARKS',
]

function pools(side: 'friend' | 'hostile'): { first: readonly string[]; last: readonly string[] } {
  const n = activePack(side)?.names
  return { first: n?.first ?? DEFAULT_FIRST, last: n?.last ?? DEFAULT_LAST }
}

// junior enlisted rank spread (hash-weighted): mostly PFC/SPC, some PVT
const JR = ['PVT', 'PFC', 'PFC', 'SPC', 'SPC', 'SPC']

const pick = <T,>(arr: readonly T[], h: number): T => arr[Math.abs(h) % arr.length]!

// position + rank for a dismount, by kind and its index within that kind group
// (exported for the P3 pipeline — replacements arrive with a junior billet)
export function dismountBillet(kind: TroopKindKey, idx: number, groupN: number, h: number): { pos: string; rank: string } {
  switch (kind) {
    case 'LEADER':
      // casualty order: the LAST leader standing is the PL
      if (idx === groupN - 1) return { pos: 'Platoon Leader', rank: pick(['2LT', '2LT', '1LT'], h) }
      if (idx === groupN - 2) return { pos: 'Platoon Sergeant', rank: 'SFC' }
      return { pos: 'Squad Leader', rank: 'SSG' }
    case 'MEDIC': return { pos: 'Platoon Medic', rank: 'SPC' }
    case 'AUTO_RIFLEMAN': return { pos: 'Automatic Rifleman', rank: 'SPC' }
    case 'MG_GUNNER': return { pos: 'Machine Gunner', rank: pick(['SPC', 'CPL'], h) }
    case 'AT_GUNNER': return { pos: 'Javelin Gunner', rank: pick(['SPC', 'CPL'], h) }
    case 'ATGM_GUNNER': return { pos: 'TOW Gunner', rank: pick(['SPC', 'CPL'], h) }
    case 'MORTARMAN': return { pos: idx === 0 ? 'Mortar Gunner' : 'Mortarman', rank: idx === 0 ? 'CPL' : pick(JR, h) }
    case 'SCOUT': return { pos: 'Scout', rank: pick(['SPC', 'SPC', 'CPL', 'SGT'], h) }
    case 'SAPPER': return { pos: 'Sapper', rank: pick(JR, h) }
    case 'SIGNALLER': return { pos: 'Signaller', rank: pick(['SPC', 'SPC', 'SGT'], h) }
    case 'RIFLEMAN_AT': return { pos: 'Rifleman (AT4)', rank: pick(JR, h) }
    default: return { pos: 'Rifleman', rank: pick(JR, h) }
  }
}

// crew billets by seat index, shaped by the vehicle (armed/unarmed, crew size)
function crewBillet(vehType: string, seat: number, h: number): { pos: string; rank: string } {
  const spec = VEHICLES[vehType]
  const armed = spec.weapons.length > 0
  if (!armed) return seat === 0 ? { pos: 'Driver', rank: 'SPC' } : { pos: 'A-Driver', rank: pick(JR, h) }
  if (seat === 0) return { pos: 'Vehicle Commander', rank: pick(['SSG', 'SGT'], h) }
  if (seat === 1) return spec.crew === 2 ? { pos: 'Driver', rank: 'SPC' } : { pos: 'Gunner', rank: 'SGT' }
  if (seat === 2 && spec.crew === 4) return { pos: 'Loader', rank: pick(JR, h) }
  return { pos: 'Driver', rank: 'SPC' }
}

// Name a soldier from the seed key (also stamps the stable personnel identity
// `pid`, which seeds the portrait — so a face survives fielding transfers).
export function nameSoldier(s: Soldier, seedKey: string, side: 'friend' | 'hostile' = 'friend'): void {
  const { first, last } = pools(side)
  const h = hashStr(`${seedKey}:${s.id}`)
  s.name = `${pick(first, h)} ${pick(last, hashStr(`${seedKey}:${s.id}:ln`))}`
  s.pid = `${seedKey}:${s.id}`
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
      const b = crewBillet(veh?.type ?? 'HMMWV', seat, h)
      s.pos = b.pos; s.rank = b.rank
      if (seat === 0) vehCommanders.push(s)
    } else {
      const idx = kindIdx.get(s.kind) ?? 0
      kindIdx.set(s.kind, idx + 1)
      const b = dismountBillet(s.kind, idx, kindTotal.get(s.kind) ?? 1, h)
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
