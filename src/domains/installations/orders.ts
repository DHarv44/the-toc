// Basing: structure construction and fielding ground units from installations.
// Ported verbatim from src/game/sim.js.
import { S } from '../../engine/state'
import type { Side, Structure, Unit } from '../../engine/GameState'
import type { Vec2 } from '../../world/WorldMap'
import { T_WATER } from '../../world/WorldMap'
import type { Mobility } from '../../world/mobility'
import { clampWorld, nearestLand } from '../../world/place'
import { STRUCTURES, type StructureTypeKey } from './catalog'
import { UNIT_TYPES, type UnitTypeKey } from '../forces/catalog'
import { newUnit } from '../forces/factory'
import { effStats } from '../forces/elements'
import { orderMove } from '../forces/orders'
import { unitAvailability, stampFieldCooldown } from '../economy/economy'
import { fmtCooldown } from '../../lib/format'
import { toast, radio, netRadio } from '../comms/radio'

export function addStructure(
  side: Side, kind: StructureTypeKey, x: number, y: number,
  label?: string, instant = false,
): Structure {
  const spec = STRUCTURES[kind]
  const s: Structure = {
    id: S.counters.nextId++, side, kind, x, y,
    label: label || (spec.abbr + '-' + S.counters.nextId),
    hp: spec.hp, maxHp: spec.hp,
    buildT: instant ? 0 : spec.buildTime,
    sight: spec.sight, deployZone: spec.deployZone,
    income: spec.income, launchesDrones: !!spec.launchesDrones,
    stock: spec.stock0 || 0,
  }
  S.structures.push(s)
  return s
}

// the structure whose deploy zone covers this point (nearest if several)
export function fundingStructure(x: number, y: number): Structure | null {
  let best: Structure | null = null, bd = Infinity
  for (const s of S.structures) {
    if (s.side !== 'friend' || s.buildT > 0 || !s.deployZone) continue
    const d = Math.hypot(x - s.x, y - s.y)
    if (d <= s.deployZone && d < bd) { best = s; bd = d }
  }
  return best
}

export function deployUnit(typeKey: UnitTypeKey, x: number, y: number, free = false): Unit | null {
  const type = UNIT_TYPES[typeKey]
  const mob = type.carrier ? type.carrier.mob : type.mob
  if (!isFinite(S.map!.moveFactor(x, y, mob))) return toast('NO-GO TERRAIN')
  if (!free) {
    const site = fundingStructure(x, y)
    if (!site) return toast('OUTSIDE DEPLOY ZONE')
    if (site.kind === 'FOB') {
      // forward bases spend their own stock — keep the convoys rolling
      if ((site.stock || 0) < type.cost) {
        return toast(`${site.label} LOW ON SUPPLY — ${type.abbr} NEEDS ${type.cost}, HAS ${Math.floor(site.stock || 0)}`)
      }
      site.stock -= type.cost
    } else {
      if (S.resources < type.cost) return toast('INSUFFICIENT SUPPLY')
      S.resources -= type.cost
    }
    S.stats.supplySpent += type.cost
  }
  const u = newUnit(typeKey, 'friend', x, y)
  S.units.push(u)
  return u
}

// Rally point for a unit fielded at a site: a spot just clear of the base, facing the
// map interior. Successive units fan left/right of that bearing so a production queue
// spreads out instead of stacking on one grid square.
function rallyPoint(st: Structure, mob: Mobility): Vec2 {
  st.rallySeq = (st.rallySeq || 0) + 1
  const toward = Math.atan2(S.map!.WORLD / 2 - st.y, S.map!.WORLD / 2 - st.x)
  const n = st.rallySeq
  const spread = Math.ceil(n / 2) * (n % 2 ? 1 : -1) * 0.3
  for (const rad of [340, 460, 600, 780]) {
    const x = clampWorld(S.map, st.x + Math.cos(toward + spread) * rad)
    const y = clampWorld(S.map, st.y + Math.sin(toward + spread) * rad)
    if (isFinite(S.map!.moveFactor(x, y, mob))) return { x, y }
  }
  return nearestLand(S.map!, st.x + Math.cos(toward) * 340, st.y + Math.sin(toward) * 340, mob)
}

// Field a ground unit from a specific installation — the one-click flow. The unit is
// built AT the site and then moves out to a rally point on its own, rather than being
// placed by the player somewhere inside the deploy zone. No map click, no deploy mode:
// the selected installation already says where it comes from.
export function fieldUnit(typeKey: UnitTypeKey, structId: number): Unit | null {
  const type = UNIT_TYPES[typeKey]
  if (!type) return null
  const st = S.structures.find(s => s.id === structId && s.side === 'friend')
  if (!st) return toast('NO FIELDING SITE SELECTED')
  if (st.buildT > 0) return toast(`${st.label} STILL UNDER CONSTRUCTION`)
  if (st.kind !== 'HQ' && st.kind !== 'FOB') return toast(`${st.label} CANNOT FIELD GROUND UNITS`)

  // force cap and per-type turnaround, same shape as the airframe limits
  const av = unitAvailability(typeKey, 'friend')
  if (av.capped) return toast(`FORCE AT CAPACITY — ${av.used}/${av.max} FIELDED`)
  if (av.cooldown > 0) return toast(`${type.abbr} REFITTING — ${fmtCooldown(av.cooldown)}`)

  // forward bases spend their own stock; the HQ draws on the theatre pool
  if (st.kind === 'FOB') {
    if ((st.stock || 0) < type.cost) {
      return toast(`${st.label} LOW ON SUPPLY — ${type.abbr} NEEDS ${type.cost}, HAS ${Math.floor(st.stock || 0)}`)
    }
    st.stock -= type.cost
  } else {
    if (S.resources < type.cost) return toast('INSUFFICIENT SUPPLY')
    S.resources -= type.cost
  }
  S.stats.supplySpent += type.cost

  const mob = type.carrier ? type.carrier.mob : type.mob
  const spawn = nearestLand(S.map!, st.x, st.y, mob)
  const u = newUnit(typeKey, 'friend', spawn.x, spawn.y)
  S.units.push(u)
  stampFieldCooldown(typeKey, 'friend')

  const r = rallyPoint(st, mob)
  netRadio(u, 'move', `FIELDED AT ${st.label} — MOVING TO RALLY`, u.x, u.y)
  orderMove(u.id, r.x, r.y)
  return u
}

export function deployStructure(kind: StructureTypeKey, x: number, y: number): Structure | null {
  x = clampWorld(S.map, x); y = clampWorld(S.map, y)
  const spec = STRUCTURES[kind]
  if (!spec) return null
  if (S.resources < spec.cost) return toast('INSUFFICIENT SUPPLY')
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
  S.resources -= spec.cost
  S.stats.supplySpent += spec.cost
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
  if (S.resources < 300) return toast('INSUFFICIENT SUPPLY')
  S.resources += (s.stock || 0) // remaining FOB stock absorbed into the main pool
  S.resources -= 300
  S.stats.supplySpent += 300
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
