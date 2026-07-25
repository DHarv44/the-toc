// Expendables — the things a crew THROWS, POPS or BURNS rather than shoots.
// The engine ships the VERBS (pop a screen, run a smoke trail, throw a
// grenade); the packs ship what each one IS (composition.ts EXPENDABLES,
// filled from packs/lib/*.json). Nothing here knows a side: a hostile platoon
// under fire pops smoke by the same call the player's does, which is the whole
// point of keeping the drill in one place.
//
// Determinism: no rng — the pattern is a fixed fan around the threat bearing,
// so the same contact lays the same screen every replay.
import { S } from '../../engine/state'
import type { Unit } from '../../engine/GameState'
import { EXPENDABLES, unitExpendables, type ExpendableType } from '../forces/composition'
import { damageUnit } from '../forces/casualties'
import { clampWorld } from '../../world/place'
import { netRadio } from '../comms/radio'

// what a unit can actually employ RIGHT NOW. Three gates, all of them honest:
// the platform has to carry it, the pool has to have it left (no ammo key = it
// never runs out — VEESS burns fuel the vehicle already has), and SOMEONE has
// to be in a position to use it. Mounted infantry are shut inside their
// carrier: they get the vic's launchers or nothing. A platoon with no running
// vehicles left is down to what the soldiers carry.
export function readyExpendable(u: Unit, cls: 'SCREEN' | 'TRAIL' | 'FRAG'): ExpendableType | null {
  const src = {
    veh: u.vehicles.some(v => v.status === 'OK'),
    troop: !u.mounted,
  }
  for (const x of unitExpendables(u.type, cls, src)) {
    if (!x.ammo) return x
    if ((u.stowage[x.ammo] ?? 0) >= (x.use ?? 1)) return x
  }
  return null
}

function draw(u: Unit, x: ExpendableType): void {
  if (!x.ammo) return
  u.stowage[x.ammo] = Math.max(0, (u.stowage[x.ammo] ?? 0) - (x.use ?? 1))
}

// POP SMOKE — a screen between us and the guns. The pattern is laid on the
// threat side (that is what a screen is FOR); a vehicle bank arcs several
// clouds across the frontage, a thrown pot makes one or two.
// Returns the expendable used, or null if the unit had nothing / just popped.
export function popScreen(u: Unit, threat: { x: number; y: number }): ExpendableType | null {
  if (S.t - (u.lastScreenT ?? -999) < 30) return null
  const x = readyExpendable(u, 'SCREEN')
  if (!x) return null
  draw(u, x)
  u.lastScreenT = S.t
  const bear = Math.atan2(threat.y - u.y, threat.x - u.x)
  const n = Math.max(1, x.puffs ?? 1)
  const spread = x.spread ?? 30
  for (let i = 0; i < n; i++) {
    // a fan centred on the threat bearing: one cloud dead ahead when n is odd,
    // the rest walked out to either side across the frontage
    const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * Math.PI * 0.9
    const a = bear + off
    S.smoke.push({
      x: clampWorld(S.map, u.x + Math.cos(a) * spread),
      y: clampWorld(S.map, u.y + Math.sin(a) * spread),
      t: S.t, r: x.r, dur: x.dur, c: x.conceal,
    })
  }
  return x
}

// VEESS — engine exhaust smoke: a screen laid CONTINUOUSLY behind a moving
// vehicle, not a puff. Armed for `secs`, then burned down by trailUpdate.
export function startTrail(u: Unit, secs = 30): ExpendableType | null {
  const x = readyExpendable(u, 'TRAIL')
  if (!x) return null
  u.trailT = Math.max(u.trailT ?? 0, secs)
  return x
}

// lay the trail: called every tick for every unit (side-agnostic). Only a unit
// that is actually MOVING leaves one — exhaust smoke needs the engine working
// and a track to lay it along.
export function trailUpdate(u: Unit, dt: number): void {
  if (!u.trailT || u.trailT <= 0) return
  u.trailT -= dt
  if (u.trailT <= 0) { u.trailT = 0; return }
  if (!u.path.length) return
  const x = readyExpendable(u, 'TRAIL')
  if (!x) { u.trailT = 0; return }
  // one cloud every few seconds: consecutive clouds overlap into a wall as the
  // vehicle drives, which is exactly what the real system produces
  if (S.t - (u.trailPuffT ?? -999) < 3) return
  u.trailPuffT = S.t
  S.smoke.push({ x: u.x, y: u.y, t: S.t, r: x.r, dur: x.dur, c: x.conceal })
}

// FRAG — grenades at arm's length. Not a ranged weapon: it only exists at the
// distance where a platoon is being assaulted, and it hurts whoever is there.
export function throwFrag(u: Unit, tgt: Unit): ExpendableType | null {
  const x = readyExpendable(u, 'FRAG')
  if (!x) return null
  const d = Math.hypot(tgt.x - u.x, tgt.y - u.y)
  if (d > (x.reach ?? 40)) return null
  draw(u, x)
  damageUnit(tgt, (x.dmg ?? 0) * (S.damageMul ?? 1), 'FRAG')
  return x
}

// the radio traffic that goes with a screen — separated so the drills can
// choose whether this one is worth a call on the net
export function screenCall(u: Unit, x: ExpendableType): void {
  netRadio(u, 'contact', x.cls === 'TRAIL' ? 'SMOKE ON — SCREENING' : 'POPPING SMOKE', u.x, u.y)
}

// registry passthrough for UI (troop card / pack viewer)
export function expendable(key: string): ExpendableType | undefined {
  return EXPENDABLES[key]
}
