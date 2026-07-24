// Weapons-effects tick slices: direct-fire combat (with the halt/dismount/
// break-contact drills it triggers) and ballistic resolution (shells, gunship
// rounds, impact/smoke expiry). Ported verbatim from src/game/sim.js tick().
// Lives downstream of intel because engagement is gated on sensing.
import { S } from '../../engine/state'
import type { Unit, Structure } from '../../engine/GameState'
import { findPath } from '../../world/pathfinding'
import { clampWorld } from '../../world/place'
import { grid } from '../../lib/format'
import { locRef } from '../../world/ref'
import { UNIT_TYPES, COVER_DEF } from '../forces/catalog'
import { effStats, postureFactor, precisionBlast, syncElements } from '../forces/elements'
import { canEngage, concealment, firingDetected, SMOKE_DURATION } from '../intel/sensing'
import { netRadio, radio } from '../comms/radio'
import { TERR_NAME } from '../../world/WorldMap'

// direct-fire combat: units first, then structures
export function directFireUpdate(dt: number): void {
  for (const u of S.units) {
    const type = UNIT_TYPES[u.type]
    const wpn = u.weapons || 'free'
    let tgt: Unit | null = null, tdist = Infinity
    if (wpn !== 'hold') {
      const provoked = S.t - (u.underFireT ?? -99) < 6
      for (const e of S.units) {
        if (e.side === u.side) continue
        // weapons tight: only engage shooters, or anyone once we're taking fire
        if (wpn === 'tight' && !provoked && !(e.lastFiredT != null && S.t - e.lastFiredT < 6)) continue
        const d = Math.hypot(u.x - e.x, u.y - e.y)
        if (d < tdist && canEngage(u, e.x, e.y, e)) { tgt = e; tdist = d }
      }
    }
    u.targetId = tgt ? tgt.id : null
    let fired = false
    if (tgt) {
      u.lastCombatT = S.t
      const roe = u.roe || 'halt'
      // troops in contact: carriers drop their infantry (halt drill only — push/break stay mounted)
      if (type.carrier && u.mounted && tdist < 900 && roe === 'halt') {
        u.mounted = false
        u.autoDismounted = true
        syncElements(u, true)
        netRadio(u, 'contact', `IN CONTACT — DISMOUNTING`, u.x, u.y)
      }
      if (roe === 'halt') {
        // halt to fight rather than driving through the kill zone; keep the route to resume
        if (u.path.length && !type.indirect && type.range >= 500
            && tdist < type.range * 0.85) {
          u.heldRoute = { path: u.path, legs: u.legs }
          u.path = []; u.legs = []
        }
      }
      // push: no halt, no dismount — return fire on the move and keep rolling
      const at = effStats(u)
      const et = effStats(tgt)
      let dps = at.dpsSoft * et.soft + at.dpsHard * (1 - et.soft)
      dps *= COVER_DEF[TERR_NAME[S.map!.terr[S.map!.cellAt(tgt.x, tgt.y)]!]!]
      dps *= postureFactor(tgt)
      if (et.soft < 0.3 && at.soft >= 0.7 && concealment(S.map!, u.x, u.y) < 1 && tdist < 400) dps *= 2.2
      if (u.state === 'moving') dps *= 0.6
      tgt.strength -= dps * dt * (u.strength / 100) * (S.damageMul ?? 1)
      // the victim is in contact too, even if it can't answer
      tgt.underFireT = S.t
      tgt.lastCombatT = S.t
      tgt.threatX = u.x; tgt.threatY = u.y
      u.state = u.path.length ? 'moving' : 'engaging'
      fired = true
      if (u.side === 'friend') {
        if (S.t - u.lastContactT > 25) {
          u.lastContactT = S.t
          radio(u.label, 'contact', `CONTACT — ${et.name.toUpperCase()} ${locRef(S.map!, tgt.x, tgt.y)}, ENGAGING`, tgt.x, tgt.y)
        }
        if (S.t - u.lastReqT > 60) {
          if (et.soft < 0.25 && type.dpsHard < 2.5) {
            u.lastReqT = S.t
            radio(u.label, 'request', `HARD TARGET, CANNOT PENETRATE — REQUEST AT SUPPORT GRID ${grid(tgt.x, tgt.y)}`, tgt.x, tgt.y)
          } else if (u.strength < 50) {
            u.lastReqT = S.t
            radio(u.label, 'request', `HEAVY CONTACT — REQUEST IMMEDIATE FIRES GRID ${grid(tgt.x, tgt.y)}`, tgt.x, tgt.y)
          }
        }
      }
    } else {
      // no unit target: engage enemy structures in range
      let st: Structure | null = null, sd = Infinity
      for (const s of S.structures) {
        if (s.side === u.side) continue
        const d = Math.hypot(u.x - s.x, u.y - s.y)
        if (d < sd && canEngage(u, s.x, s.y)) { st = s; sd = d }
      }
      if (st) {
        st.hp -= (type.dpsSoft * 0.6 + type.dpsHard * 0.5) * dt * (u.strength / 100)
        u.state = u.path.length ? 'moving' : 'engaging'
        fired = true
      } else if (u.state === 'engaging') {
        u.state = 'hold'
      }
    }
    if (fired) u.lastFiredT = S.t
    if (fired && u.side === 'hostile' && firingDetected(u)) {
      S.contacts.set(u.id, { x: u.x, y: u.y, type: u.type, lastSeen: S.t, live: true, strength: u.strength })
    }
    // break-contact drill: triggers on acquiring a target OR on taking fire
    if (u.roe === 'break' && !u.breaking) {
      const underFire = S.t - (u.underFireT ?? -99) < 3
      const threat = tgt ? { x: tgt.x, y: tgt.y }
        : underFire && u.threatX != null ? { x: u.threatX, y: u.threatY! } : null
      if (threat) {
        u.breaking = true
        // remember the objective so the drill can resume it once clear (one retry —
        // see drillsUpdate). Convoys are exempt: their loop already re-paths itself.
        if (!u.convoy && u.legs.length && !u.resumeDest) {
          const dest = u.legs[u.legs.length - 1]!
          u.resumeDest = { x: dest.x, y: dest.y }
        }
        u.heldRoute = null
        const bdx = u.x - threat.x, bdy = u.y - threat.y
        const bL = Math.hypot(bdx, bdy) || 1
        const bx = clampWorld(S.map, u.x + (bdx / bL) * 900), by = clampWorld(S.map, u.y + (bdy / bL) * 900)
        const bp = findPath(S.map!, u.x, u.y, bx, by, effStats(u).mob)
        if (bp) { u.path = bp; u.legs = [{ x: bx, y: by, n: bp.length }] }
        netRadio(u, 'contact', `BREAKING CONTACT — MOVING GRID ${grid(bx, by)}`, u.x, u.y)
      }
    }
  }
}

// artillery shells, gunship cannon rounds, impact flash and smoke expiry
export function ballisticsUpdate(_dt: number): void {
  // artillery shells
  for (let i = S.shells.length - 1; i >= 0; i--) {
    const sh = S.shells[i]!
    if (S.t >= sh.impactT) {
      S.shells.splice(i, 1)
      if (sh.shell === 'SMOKE') {
        S.smoke.push({ x: sh.x, y: sh.y, t: S.t, r: 140 })
      } else {
        S.impacts.push({ x: sh.x, y: sh.y, t: S.t })
        const icm = sh.shell === 'ICM'
        // resolve against individual vics — units whose formation reaches the blast
        for (const u of S.units) {
          if (Math.hypot(u.x - sh.x, u.y - sh.y) < sh.blast + 90) {
            precisionBlast(u, sh.x, sh.y, sh.blast, sh.dmg, sh.shell)
          }
        }
        for (const s of S.structures) {
          const d = Math.hypot(s.x - sh.x, s.y - sh.y)
          if (d < sh.blast) s.hp -= sh.dmg * (1 - d / sh.blast) * (icm ? 0.5 : 0.8)
        }
      }
      if (sh.splashFrom) radio(sh.splashFrom, 'fires', `SPLASH — TGT GRID ${grid(sh.x, sh.y)}`, sh.x, sh.y)
    }
  }
  // gunship cannon rounds land after their time-of-flight: small blast, small flash
  for (let i = S.gunRounds.length - 1; i >= 0; i--) {
    const r = S.gunRounds[i]!
    if (S.t < r.impactT) continue
    S.gunRounds.splice(i, 1)
    const reach = r.blast * (r.ap || 1) + 90 // widen so anti-personnel splash finds spread-out troops
    for (const u of S.units) {
      if (Math.hypot(u.x - r.x, u.y - r.y) < reach) precisionBlast(u, r.x, r.y, r.blast, r.dmg, 'HE', r.ap || 1)
    }
    S.impacts.push({ x: r.x, y: r.y, t: S.t, gun: true, sz: r.flash })
  }
  while (S.impacts.length && S.t - S.impacts[0]!.t > 6) S.impacts.shift()
  // smoke dissipates
  for (let i = S.smoke.length - 1; i >= 0; i--) {
    if (S.t - S.smoke[i]!.t > SMOKE_DURATION) S.smoke.splice(i, 1)
  }
}
