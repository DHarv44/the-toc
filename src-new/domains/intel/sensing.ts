// Sensing and the contact picture. Ported verbatim from src/game/sim.js.
// Contacts are one-directional by design: the picture is the PLAYER's common
// operating picture; the OPFOR cheats honestly by reading unit positions in
// its commander code, same as the old sim.
import { S } from '../../engine/state'
import type { Drone, Structure, Unit } from '../../engine/GameState'
import type { WorldMap } from '../../world/WorldMap'
import { T_FOREST, T_URBAN } from '../../world/WorldMap'
import { UNIT_TYPES } from '../forces/catalog'
import { effStats } from '../forces/elements'
import { DRONE_TYPES } from '../air/catalog'
import { radio } from '../comms/radio'
import { grid } from '../../lib/format'

export const SMOKE_DURATION = 75

export function concealment(map: WorldMap, x: number, y: number): number {
  const t = map.terr[map.cellAt(x, y)]
  let c = (t === T_FOREST || t === T_URBAN) ? 0.45 : 1.0
  // smoke screens beat everything — sensors and gunners alike
  for (const sm of S.smoke) {
    if (Math.hypot(sm.x - x, sm.y - y) < sm.r) { c = Math.min(c, 0.22); break }
  }
  return c
}

export function unitSees(u: Unit, sight: number, x: number, y: number): boolean {
  const d = Math.hypot(u.x - x, u.y - y)
  return d <= sight * concealment(S.map!, x, y)
}

export function isVisibleToFriendlies(x: number, y: number): boolean {
  for (const u of S.units) {
    if (u.side !== 'friend') continue
    if (unitSees(u, effStats(u).sight, x, y)) return true
  }
  for (const s of S.structures) {
    if (s.side !== 'friend' || s.buildT > 0 || !s.sight) continue
    if (Math.hypot(s.x - x, s.y - y) <= s.sight * concealment(S.map!, x, y)) return true
  }
  for (const d of S.drones) {
    if (d.state !== 'onstation') continue
    const dd = Math.hypot(d.tx - x, d.ty - y)
    if (dd <= DRONE_TYPES[d.type].sight * (d.sightMul || 1) * Math.max(0.55, concealment(S.map!, x, y))) return true
  }
  return false
}

export interface Spotter {
  cs: string
  obj: Unit | Structure | Drone   // lastSpotT throttle is stamped on the spotter
}

// like isVisibleToFriendlies, but returns WHO sees the point (for spot reports)
function findSpotter(x: number, y: number): Spotter | null {
  for (const u of S.units) {
    if (u.side !== 'friend') continue
    if (unitSees(u, effStats(u).sight, x, y)) return { cs: u.label, obj: u }
  }
  for (const s of S.structures) {
    if (s.side !== 'friend' || s.buildT > 0 || !s.sight) continue
    if (Math.hypot(s.x - x, s.y - y) <= s.sight * concealment(S.map!, x, y)) return { cs: s.label, obj: s }
  }
  for (const d of S.drones) {
    // an airborne sensor reveals anything inside its footprint on the BFT — if a UAV can
    // see it, the network reports it. No terrain concealment penalty: looking straight
    // down, a treeline doesn't hide a vic the way it does from a ground unit. Also spots
    // during transit, not just on-station, so a bird en route still feeds the picture.
    if (d.state === 'rtb') continue
    const dd = Math.hypot(d.tx - x, d.ty - y)
    if (dd <= DRONE_TYPES[d.type].sight * (d.sightMul || 1)) return { cs: d.label, obj: d }
  }
  return null
}

// Force a hostile onto the BFT as a live contact. The aerostat designates by direct
// observation — the operator is looking at the vic in the feed — so it doesn't wait for
// the passive reveal sweep; clicking it in the feed IS the detection.
export function revealContact(unitId: number): void {
  const u = S.units.find(u => u.id === unitId)
  if (!u || u.side === 'friend') return
  S.contacts.set(u.id, { x: u.x, y: u.y, type: u.type, lastSeen: S.t, live: true, strength: u.strength })
}

export function updateContacts(): void {
  const newSpots = new Map<Spotter['obj'], { cs: string; types: Unit['type'][]; x: number; y: number }>()
  for (const u of S.units) {
    if (u.side !== 'hostile') continue
    const sp = findSpotter(u.x, u.y)
    if (sp) {
      const prev = S.contacts.get(u.id)
      S.contacts.set(u.id, { x: u.x, y: u.y, type: u.type, lastSeen: S.t, live: true, strength: u.strength })
      if (!prev || !prev.live) {
        let batch = newSpots.get(sp.obj)
        if (!batch) newSpots.set(sp.obj, batch = { cs: sp.cs, types: [], x: u.x, y: u.y })
        batch.types.push(u.type)
      }
    } else {
      const c = S.contacts.get(u.id)
      if (c) c.live = false
    }
  }
  // one spot report per sensor, aggregated, throttled per sensor
  for (const [obj, batch] of newSpots) {
    if (S.t - (obj.lastSpotT ?? -99) <= 12) continue
    obj.lastSpotT = S.t
    const msg = batch.types.length === 1
      ? `SPOT REPORT — ${UNIT_TYPES[batch.types[0]!].name.toUpperCase()} GRID ${grid(batch.x, batch.y)}`
      : `SPOT REPORT — ${batch.types.length}X HOSTILE (${batch.types.map(t => UNIT_TYPES[t].abbr).join(', ')}) GRID ${grid(batch.x, batch.y)}`
    radio(batch.cs, 'spot', msg, batch.x, batch.y)
  }
  for (const [id, c] of S.contacts) {
    const u = S.units.find(u => u.id === id)
    if (!u) { S.contacts.delete(id); continue }
    if (!c.live && isVisibleToFriendlies(c.x, c.y)
        && Math.hypot(u.x - c.x, u.y - c.y) > 250) {
      S.contacts.delete(id)
    }
  }
  // hostile structures: once spotted, marked forever (buildings don't move)
  for (const s of S.structures) {
    if (s.side !== 'hostile' || S.structContacts.has(s.id)) continue
    if (isVisibleToFriendlies(s.x, s.y)) S.structContacts.add(s.id)
  }
}

// a hostile that fires is only revealed if something can actually detect it:
// any friendly within earshot (2.5 km) or a SIG unit doing DF within range
export function firingDetected(u: Unit): boolean {
  for (const f of S.units) {
    if (f.side !== 'friend') continue
    const d = Math.hypot(f.x - u.x, f.y - u.y)
    if (d < 2500) return true
    const df = UNIT_TYPES[f.type].df
    if (df && d < df) return true
  }
  return false
}

export function canEngage(u: Unit, x: number, y: number, tgt?: Unit): boolean {
  const st = effStats(u)
  const d = Math.hypot(u.x - x, u.y - y)
  if (d > st.range) return false
  let eff = st.sight * concealment(S.map!, x, y) * 1.15
  // a camouflaged, dug-in defender is harder to spot
  if (tgt && tgt.posture === 'dig' && tgt.digT) eff *= 1 - 0.3 * tgt.digT
  // muzzle flash: a target that fired recently is visible well beyond normal sight
  if (tgt && tgt.lastFiredT != null && S.t - tgt.lastFiredT < 5) {
    eff = Math.max(eff, st.sight * 1.6)
  }
  return d <= eff
}
