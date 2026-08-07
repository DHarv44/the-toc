// Basing: structure construction and fielding ground units from installations.
// Ported verbatim from src/game/sim.js.
import { S } from '../../engine/state'
import type { OrgSlot, Side, Structure, Unit } from '../../engine/GameState'
import type { Vec2 } from '../../world/WorldMap'
import { T_WATER } from '../../world/WorldMap'
import type { Mobility } from '../../world/mobility'
import { clampWorld, nearestLand } from '../../world/place'
import { connectStructureToRoads } from '../../world/access'
import { roadSpot } from '../../world/pack/roadGraph'
import { STRUCTURES, FACILITIES, type StructureTypeKey, type FacilityKey } from './catalog'
import { UNIT_TYPES, type UnitTypeKey } from '../forces/catalog'
import { newUnit } from '../forces/factory'
import { commandsStructure } from '../forces/command'
import { effStats } from '../forces/elements'
import { orderMove } from '../forces/orders'
import { unitAvailability } from '../economy/economy'
import { campaignAllows } from '../../engine/campaign'
import { facilityAssetKind } from '../assets/service'
import { fmtCooldown } from '../../lib/format'
import { toast, radio, netRadio } from '../comms/radio'

export function addStructure(
  side: Side, kind: StructureTypeKey, x: number, y: number,
  label?: string, instant = false,
  // OWNING FORMATION (scenario task-org): a sister brigade's FOB or the
  // division main. Absent = the player's own command.
  formation?: string,
): Structure {
  const spec = STRUCTURES[kind]
  const s: Structure = {
    id: S.counters.nextId++, side, kind, x, y,
    ...(formation ? { formation } : {}),
    label: label || (spec.abbr + '-' + S.counters.nextId),
    hp: spec.hp, maxHp: spec.hp,
    buildT: instant ? 0 : spec.buildTime,
    sight: spec.sight, deployZone: spec.deployZone,
    income: spec.income, launchesDrones: !!spec.launchesDrones,
    stock: spec.stock0 || 0,
    // an HQ has the full facility set organically — motorpool, aid station,
    // the works; FOBs start bare and BUY their build-outs
    facilities: side === 'friend' && kind === 'HQ' ? ['MOTORPOOL', 'AID'] : [],
  }
  S.structures.push(s)
  // A BASE OFF THE NETWORK GETS A DIRT ACCESS TRACK to the nearest road —
  // every base, both sides: nobody sites a command post, forward base or OP
  // that its own trucks cannot reach, and the engineers cutting the track in
  // is exactly what stands one up. (Was FOB-only; HQs and OPs sat roadless.)
  if ((kind === 'HQ' || kind === 'FOB' || kind === 'OP') && S.map) {
    connectStructureToRoads(S.map, x, y)
  }
  return s
}

// FOB build-out: stand up a facility at an established forward base. NOTHING
// is purchased — a motorpool/aid station is the battalion's own people and
// gear relocating forward. A facility that some division asset DELIVERS
// (e.g. an intercept battery) is never a build-out: it arrives only through
// the request pipeline, by convoy (ASSET-REQUESTS.md). No system names here.
export function installFacility(structId: number, key: FacilityKey): void {
  const st = S.structures.find(s => s.id === structId && s.side === 'friend')
  if (!st) return
  if (st.buildT > 0) { toast(`${st.label} STILL UNDER CONSTRUCTION`); return }
  if (facilityAssetKind(key)) { toast(`${FACILITIES[key]?.name.toUpperCase() ?? key} COMES BY DIVISION REQUEST, NOT BUILD-OUT`); return }
  if (st.kind !== 'FOB') { toast('BUILD-OUTS ARE FOR FORWARD BASES'); return }
  if (st.facilities?.includes(key)) { toast(`${st.label} ALREADY HAS A ${FACILITIES[key].name.toUpperCase()}`); return }
  const spec = FACILITIES[key]
  st.facilities = [...(st.facilities ?? []), key]
  toast(`${spec.name.toUpperCase()} ESTABLISHED AT ${st.label}`)
  radio('NET', 'arrive', `${st.label} — ${spec.name.toUpperCase()} IS OPERATIONAL`, st.x, st.y)
}

// the structure whose deploy zone covers this point (nearest if several)
export function fundingStructure(x: number, y: number): Structure | null {
  let best: Structure | null = null, bd = Infinity
  for (const s of S.structures) {
    // a sister formation's base is on your map, not in your task
    // organization — it is not a place YOUR battalion deploys from
    if (!commandsStructure(s) || s.buildT > 0 || !s.deployZone) continue
    const d = Math.hypot(x - s.x, y - s.y)
    if (d <= s.deployZone && d < bd) { best = s; bd = d }
  }
  return best
}

export function deployUnit(
  typeKey: UnitTypeKey, x: number, y: number, free = false,
  // field THIS org element rather than the first free one of its type — the
  // scenario task-org path (a named sister-formation platoon). `noSlot` places
  // without drawing at all, so a scenario can never raid the player's pool for
  // somebody else's platoon.
  opts?: { slot?: OrgSlot; noSlot?: boolean },
): Unit | null {
  // campaign phases can lock fielding; the campaign's own free placements are exempt
  if (!free && !campaignAllows('field')) return toast('FIELDING NOT AUTHORIZED THIS PHASE')
  const type = UNIT_TYPES[typeKey]
  const mob = type.carrier ? type.carrier.mob : type.mob
  if (!isFinite(S.map!.moveFactor(x, y, mob))) return toast('NO-GO TERRAIN')
  if (!free) {
    // units are NOT bought with supply (P5): the force pool, caps and refit
    // cooldowns are the limiter — supply sustains the force, it doesn't buy it.
    // Placement still requires a live deploy zone.
    const site = fundingStructure(x, y)
    if (!site) return toast('OUTSIDE DEPLOY ZONE')
  }
  const u = newUnit(typeKey, 'friend', x, y, opts)
  S.units.push(u)
  return u
}

// Rally point for a unit fielded at a site: a spot just clear of the base, facing the
// map interior. Successive units fan left/right of that bearing so a production queue
// spreads out instead of stacking on one grid square.
/** THE MOTOR POOL LINE.
 *
 *  A fielded unit used to fan out ~340 m into open ground on an arc — every
 *  base grew a loose ring of vics in the dirt, and getting any of them onto a
 *  road meant a slow cross-country crawl first. A real base parks its
 *  vehicles ON THE ROAD THAT SERVES IT: the motor pool is a line down the
 *  access track (or the road the base was sited on), first vehicle at the
 *  head, each next one taking the next slot, offset off the lane so the road
 *  itself stays open. A unit ordered out is already standing ON a network
 *  edge — the router snaps at zero metres and it rides straight out.
 *
 *  The old arc survives only as the fallback for a base with no road at all
 *  (a roadless map, a spur that could not be laid). */
function rallyPoint(st: Structure, mob: Mobility): Vec2 {
  st.rallySeq = (st.rallySeq || 0) + 1
  const k = st.rallySeq - 1
  const m = S.map!
  const spot = roadSpot(m, st.x, st.y)
  if (spot && spot.dist < 450 && spot.pts.length >= 2) {
    const total = spot.cum[spot.cum.length - 1]!
    // park DOWN the lane from the base's own doorstep: slots every 35 m from
    // 40 m out, running toward whichever end of the edge has the room
    const fwd = (total - spot.at) >= spot.at
    const want = 40 + (k % 10) * 35
    const s = fwd ? Math.min(total, spot.at + want) : Math.max(0, spot.at - want)
    // arc position → point + tangent on the polyline
    let seg = 1
    while (seg < spot.cum.length - 1 && spot.cum[seg]! < s) seg++
    const a = spot.pts[seg - 1]!, b = spot.pts[seg]!
    const segLen = spot.cum[seg]! - spot.cum[seg - 1]!
    const t = segLen > 0 ? (s - spot.cum[seg - 1]!) / segLen : 0
    const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
    // off the right shoulder of the direction of travel, lane kept clear
    const side = fwd ? 1 : -1
    const x = clampWorld(S.map, px + ((b.y - a.y) / L) * 16 * side)
    const y = clampWorld(S.map, py - ((b.x - a.x) / L) * 16 * side)
    if (isFinite(m.moveFactor(x, y, mob))) return { x, y }
  }
  // no road serves this base — the old dispersed arc, better than stacking
  const toward = Math.atan2(m.WORLD / 2 - st.y, m.WORLD / 2 - st.x)
  const n = st.rallySeq
  const spread = Math.ceil(n / 2) * (n % 2 ? 1 : -1) * 0.3
  for (const rad of [340, 460, 600, 780]) {
    const x = clampWorld(S.map, st.x + Math.cos(toward + spread) * rad)
    const y = clampWorld(S.map, st.y + Math.sin(toward + spread) * rad)
    if (isFinite(m.moveFactor(x, y, mob))) return { x, y }
  }
  return nearestLand(m, st.x + Math.cos(toward) * 340, st.y + Math.sin(toward) * 340, mob)
}

// Field a ground unit from a specific installation — the one-click flow. The unit is
// built AT the site and then moves out to a rally point on its own, rather than being
// placed by the player somewhere inside the deploy zone. No map click, no deploy mode:
// the selected installation already says where it comes from.
export function fieldUnit(typeKey: UnitTypeKey, structId: number): Unit | null {
  const type = UNIT_TYPES[typeKey]
  if (!type) return null
  if (!campaignAllows('field')) return toast('FIELDING NOT AUTHORIZED THIS PHASE')
  const st = S.structures.find(s => s.id === structId && s.side === 'friend')
  if (!st) return toast('NO FIELDING SITE SELECTED')
  if (st.buildT > 0) return toast(`${st.label} STILL UNDER CONSTRUCTION`)
  if (st.kind !== 'HQ' && st.kind !== 'FOB') return toast(`${st.label} CANNOT FIELD GROUND UNITS`)

  // force cap only — unit cooldowns are dead (the org roster is the limiter)
  const av = unitAvailability(typeKey, 'friend')
  if (av.capped) return toast(`FORCE AT CAPACITY — ${av.used}/${av.max} FIELDED`)

  // units are NOT bought with supply (P5): the cap and the finite org limit
  // the force; supply sustains it (upkeep, munitions, structures)
  const mob = type.carrier ? type.carrier.mob : type.mob
  const spawn = nearestLand(S.map!, st.x, st.y, mob)
  const u = newUnit(typeKey, 'friend', spawn.x, spawn.y)
  S.units.push(u)

  const r = rallyPoint(st, mob)
  netRadio(u, 'move', `FIELDED AT ${st.label} — MOVING TO RALLY`, u.x, u.y)
  orderMove(u.id, r.x, r.y)
  return u
}

// Echelon-real fielding (the FORCES rail): call up a SPECIFIC org element —
// "A CO 1st PLT", not "a rifle platoon". The slot's people ARE the unit's
// people; the platoon stages out of the base it is GARRISONED at (its
// garrisonAt, or the CP). Type-level caps and refit turnarounds still apply
// (the motorpool doesn't care which company the hulls belong to).
// `qrfLaunch` — this fielding IS the reaction force answering its own base.
// That is the ONE case where the duty survives leaving the wire: the element
// rolls, fights, and the duty resumes when it comes back through the gate.
// Every other way out of garrison RELEASES it — a QRF is what the commander
// explicitly put on QRF and is still standing there, nothing else.
export function fieldSlot(
  slotId: string, structId?: number, opts?: { qrfLaunch?: boolean },
): Unit | null {
  const sl = S.org?.slots.find(s => s.id === slotId)
  if (!sl || !sl.type) return null
  const type = UNIT_TYPES[sl.type]
  if (!campaignAllows('field')) return toast('FIELDING NOT AUTHORIZED THIS PHASE')
  if (sl.unitId != null) return toast(`${sl.lin.toUpperCase()} ALREADY FIELDED`)
  if (!sl.soldiers.some(s => s.status === 'FIT')) return toast(`${sl.lin.toUpperCase()} — NO PERSONNEL FIT FOR DUTY`)
  const st = S.structures.find(s => structId != null
    ? s.id === structId && s.side === 'friend'
    : s.id === sl.garrisonAt && s.side === 'friend' && s.buildT <= 0)
    ?? S.structures.find(s => s.side === 'friend' && s.kind === 'HQ')
  if (!st) return toast('NO FIELDING SITE')
  if (st.buildT > 0) return toast(`${st.label} STILL UNDER CONSTRUCTION`)

  const av = unitAvailability(sl.type, 'friend')
  if (av.capped) return toast(`FORCE AT CAPACITY — ${av.used}/${av.max} FIELDED`)

  const mob = type.carrier ? type.carrier.mob : type.mob
  const spawn = nearestLand(S.map!, st.x, st.y, mob)
  const u = newUnit(sl.type, 'friend', spawn.x, spawn.y, { slot: sl })
  S.units.push(u)
  // out the gate = off the duty roster (unless this IS the reaction)
  if (sl.qrf && !opts?.qrfLaunch) {
    sl.qrf = false
    toast(`${sl.name.toUpperCase()} RELEASED FROM QRF — DEPLOYED`)
  }

  const r = rallyPoint(st, mob)
  netRadio(u, 'move', `${sl.lin.toUpperCase()} FIELDED AT ${st.label} — MOVING TO RALLY`, u.x, u.y)
  orderMove(u.id, r.x, r.y)
  return u
}

// RETURN TO GARRISON: send a fielded element back to a base to stand down —
// off the map, back into its org slot, garrisoned AT that base (this is how a
// FOB gets a garrison). Every element carries a garrison ASSIGNMENT even while
// deployed (slot.garrisonAt, CP by default): RTB with no target goes HOME;
// passing a structId REASSIGNS the garrison (arrival stamps the new home).
// The de-field happens on ARRIVAL (installations update).
export function orderReturnToGarrison(unitId: number, structId?: number): void {
  const u = S.units.find(x => x.id === unitId && x.side === 'friend')
  if (!u) return
  // no slot = not task-force troops (asset convoys etc.) — nothing to return to
  const sl = S.org?.slots.find(x => x.unitId === u.id)
  if (!sl) return void toast(`${u.label} HAS NO GARRISON BILLET`)
  const st = (structId != null
    ? S.structures.find(s => s.id === structId && s.side === 'friend')
    : S.structures.find(s => s.id === sl.garrisonAt && s.side === 'friend' && s.buildT <= 0))
    ?? S.structures.find(s => s.side === 'friend' && s.kind === 'HQ')
  if (!st) return void toast('NO FRIENDLY BASE TO GARRISON AT')
  u.qrfHome = undefined // stand down from any QRF tasking
  netRadio(u, 'move', `RETURNING TO GARRISON AT ${st.label}`, u.x, u.y)
  orderMove(u.id, st.x, st.y)
  u.rtgBase = st.id // AFTER the move order (orderMove clears the flag)
}

export function deployStructure(kind: StructureTypeKey, x: number, y: number): Structure | null {
  if (!campaignAllows('field')) return toast('CONSTRUCTION NOT AUTHORIZED THIS PHASE')
  x = clampWorld(S.map, x); y = clampWorld(S.map, y)
  const spec = STRUCTURES[kind]
  if (!spec) return null
  // an airfield is division-echelon infrastructure: the campaign's exists at
  // H-hour, and standing up another would be its own tasking, not a purchase
  if (kind === 'AFLD' && S.campaign) return toast('AIRFIELD CONSTRUCTION IS A DIVISION TASKING')
  if (S.map!.terrAt(x, y) === T_WATER) return toast('CANNOT BUILD ON WATER')
  if (kind === 'HQ' && S.structures.some(s => s.side === 'friend' && s.kind === 'HQ')) {
    return toast('ONLY ONE COMMAND POST PERMITTED')
  }
  if (kind === 'FOB' && !S.units.some(u => u.side === 'friend' && u.type === 'ENG'
      && u.strength > 0 && Math.hypot(u.x - x, u.y - y) <= 500)) {
    return toast('FOB CONSTRUCTION REQUIRES ENGINEERS ON SITE')
  }
  const nearStruct = S.structures.some(s => s.side === 'friend' && s.buildT <= 0 && Math.hypot(s.x - x, s.y - y) <= spec.near)
  // a supply truck on site lets an engineer establish a FOB forward of the base network
  const supplyOnSite = kind === 'FOB' && S.units.some(u => u.side === 'friend' && u.type === 'LOG'
    && u.strength > 0 && Math.hypot(u.x - x, u.y - y) <= 500)
  // airfields are a strategic asset — only the HQ can stand one up
  const nearHQ = kind === 'AFLD' && S.structures.some(s => s.side === 'friend' && s.kind === 'HQ'
    && s.buildT <= 0 && Math.hypot(s.x - x, s.y - y) <= spec.near)
  const nearOk = kind === 'OP'
    ? (S.units.some(u => u.side === 'friend' && Math.hypot(u.x - x, u.y - y) <= spec.near) || nearStruct)
    : kind === 'AFLD' ? nearHQ
      : (nearStruct || supplyOnSite)
  if (!nearOk) return toast(
    kind === 'OP' ? 'TOO FAR FROM FRIENDLY FORCES'
      : kind === 'AFLD' ? 'AIRFIELD MUST BE ESTABLISHED NEAR THE HQ'
        : kind === 'FOB' ? 'TOO FAR FROM BASE — NEEDS A SUPPLY TRUCK ON SITE'
          : 'TOO FAR FROM EXISTING BASE')
  // no cost: construction is engineer effort + placement rules, not a purchase
  const s = addStructure('friend', kind, x, y)
  toast(s.label + ' — CONSTRUCTION STARTED')
  return s
}

// re-establish command: convert a FOB into the (single) command post
export function convertToHq(structId: number): Structure | null {
  const s = S.structures.find(s => s.id === structId)
  if (!s || s.side !== 'friend' || s.kind !== 'FOB') return null
  if (S.structures.some(o => o.side === 'friend' && o.kind === 'HQ')) {
    return toast('ONLY ONE COMMAND POST PERMITTED')
  }
  // no cost: re-establishing command is a decision, not a purchase
  const spec = STRUCTURES.HQ
  s.kind = 'HQ'
  s.buildT = 40
  s.sight = spec.sight
  s.deployZone = spec.deployZone
  s.income = spec.income
  s.stock = 0
  s.hp = Math.min(s.hp, spec.hp); s.maxHp = spec.hp
  radio(s.label, 'struct', 'CONVERTING TO COMMAND POST — 40S', s.x, s.y)
  return s
}
