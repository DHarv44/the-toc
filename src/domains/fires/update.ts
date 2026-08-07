// Weapons-effects tick slices: direct-fire combat (with the halt/dismount/
// break-contact drills it triggers) and ballistic resolution (shells, gunship
// rounds, impact/smoke expiry). Ported verbatim from src/game/sim.js tick().
// Lives downstream of intel because engagement is gated on sensing.
import { S } from '../../engine/state'
import type { Unit, Structure } from '../../engine/GameState'
import { findPath } from '../../world/pathfinding'
import type { Vec2 } from '../../world/WorldMap'
import { popScreen, screenCall, startTrail, throwFrag } from './expendables'
import { clampWorld } from '../../world/place'
import { grid } from '../../lib/format'
import { locRef } from '../../world/ref'
import { UNIT_TYPES, COVER_DEF } from '../forces/catalog'
import { effStats, postureFactor } from '../forces/elements'
import { damageUnit, deriveElements, precisionBlast } from '../forces/casualties'
import { unitFirepower, consumeAmmo } from '../forces/firepower'
import { canEngage, concealment, firingDetected, observedByDrone, SMOKE_DURATION } from '../intel/sensing'
import { netRadio, radio } from '../comms/radio'
import { TERR_NAME, T_FOREST, T_URBAN } from '../../world/WorldMap'

// observed-fire DPS multiplier when a friendly UAV is watching the target
const OBSERVED_FIRE_MUL = 1.3

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
        deriveElements(u)
        netRadio(u, 'contact', `IN CONTACT — DISMOUNTING`, u.x, u.y)
      }
      // GRENADE RANGE — the fight is at arm's length (a cleared building, a
      // trench line): the dismounts throw. Any ROE, both sides; the reach and
      // the burst are the expendable's, not the engine's.
      if (S.t - (u.lastFragT ?? -999) > 12 && !u.mounted) {
        if (throwFrag(u, tgt)) u.lastFragT = S.t
      }
      if (roe === 'halt') {
        // halt to fight rather than driving through the kill zone; keep the route to resume
        if (u.path.length && !type.indirect && type.range >= 500
            && tdist < type.range * 0.85) {
          u.heldRoute = { path: u.path, legs: u.legs }
          u.path = []; u.legs = []
        }
        // unit SOP — the platoon leader's call, not the TOC's: caught fighting
        // in the open, bound to nearby cover and fight from it. One scan per
        // contact; never a bound that closes on the shooter; both sides.
        if (!u.coverSought && u.posture !== 'dig' && !u.path.length && !u.bridging) {
          u.coverSought = true
          const m = S.map!
          const here = m.terrAt(u.x, u.y)
          if (here !== T_FOREST && here !== T_URBAN) {
            const gx0 = Math.floor(u.x / m.CELL), gy0 = Math.floor(u.y / m.CELL)
            let cbx = 0, cby = 0, cbd = Infinity
            for (let dy = -5; dy <= 5; dy++) {
              for (let dx = -5; dx <= 5; dx++) {
                if (!dx && !dy) continue
                const gx = gx0 + dx, gy = gy0 + dy
                if (!m.inBounds(gx, gy)) continue
                const t2 = m.terr[gy * m.GRID + gx]
                if (t2 !== T_FOREST && t2 !== T_URBAN) continue
                const px = (gx + 0.5) * m.CELL, py = (gy + 0.5) * m.CELL
                const dSelf = Math.hypot(px - u.x, py - u.y)
                if (dSelf >= cbd || dSelf > 260) continue
                if (Math.hypot(px - tgt.x, py - tgt.y) < tdist * 0.8) continue // no bounding toward the guns
                cbd = dSelf; cbx = px; cby = py
              }
            }
            if (isFinite(cbd)) {
              const cp = findPath(S.map!, u.x, u.y, cbx, cby, effStats(u).mob)
              if (cp) {
                u.path = cp // no legs: the bound is silent SOP, not a reported move
                netRadio(u, 'move', 'CONTACT — BOUNDING TO COVER', u.x, u.y)
              }
            }
          }
        }
      }
      // push: no halt, no dismount — return fire on the move and keep rolling
      const at = effStats(u)
      const et = effStats(tgt)
      // Derived firepower (FORCE-MODEL Phase 3): what this unit's SURVIVORS
      // with ammo remaining can actually put out — replaces the catalog dps
      // pools AND the old strength scaling (fewer live shooters already means
      // less fire). A winchester unit's small arms cannot kill armor.
      const fp = unitFirepower(u, et.soft)
      let dps = fp.dpsSoft * et.soft + fp.dpsHard * (1 - et.soft)
      dps *= COVER_DEF[TERR_NAME[S.map!.terr[S.map!.cellAt(tgt.x, tgt.y)]!]!]
      // fortifications protect what they FACE — direct fire carries the
      // attacker's aspect, so a flanked position is a position half-lost
      dps *= postureFactor(tgt, u)
      if (et.soft < 0.3 && at.soft >= 0.7 && concealment(S.map!, u.x, u.y) < 1 && tdist < 400) dps *= 2.2
      if (u.state === 'moving') dps *= 0.6
      // SUPPRESSION (maneuver-beats-mass): a shooter that is itself under
      // fire shoots with its head down. Symmetric — this is what makes
      // support-by-fire a real tactic: the fixing element halves the
      // defenders' output while the assault closes.
      if (S.t - (u.underFireT ?? -999) < 5) dps *= 0.55
      // observed fire: a friendly UAV watching the target walks rounds onto it —
      // every friendly gun on that target hits ~30% harder. Drones are friendly
      // only, so this is a player edge for now (OPFOR UAS is future work).
      if (u.side === 'friend' && observedByDrone(tgt.x, tgt.y)) dps *= OBSERVED_FIRE_MUL
      damageUnit(tgt, dps * dt * (S.damageMul ?? 1), 'GSW')
      consumeAmmo(u, fp.consumers, dt)
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
        // derived firepower vs structures (buildings read as half-hard)
        const fp = unitFirepower(u, 0.5)
        st.hp -= (fp.dpsSoft * 0.6 + fp.dpsHard * 0.5) * dt
        consumeAmmo(u, fp.consumers, dt)
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
    // break-contact drill: triggers on acquiring a target OR on taking fire.
    // Break FATIGUE: a unit that only just finished running does not run again —
    // it stands and fights this one (kills the push/retreat yo-yo where an AI
    // commander re-tasks a broken unit straight back into the same contact)
    if (u.roe === 'break') {
      const underFire = S.t - (u.underFireT ?? -99) < 3
      const threat = tgt ? { x: tgt.x, y: tgt.y }
        : underFire && u.threatX != null ? { x: u.threatX, y: u.threatY! } : null
      // A FRESH break respects break fatigue. A unit ALREADY running that has
      // run out of route while still in contact cuts another leg immediately —
      // no fatigue gate, because standing still is how a breaking platoon dies.
      const fresh = !u.breaking && S.t - (u.lastBreakT ?? -999) > 120
      if (threat && (fresh || (u.breaking && !u.path.length))) {
        const away = breakRoute(u, threat)
        // NO route out is not a break: latching `breaking` on a failed path
        // strands the unit — marked as running, standing still, and locked out
        // of ever trying again. Leave it fighting and retry next tick.
        if (away) {
          if (!u.breaking) {
            u.breaking = true
            // remember the objective so the drill can resume it once clear (one retry —
            // see drillsUpdate). Convoys are exempt: their loop already re-paths itself.
            if (!u.convoy && u.legs.length && !u.resumeDest) {
              const dest = u.legs[u.legs.length - 1]!
              u.resumeDest = { x: dest.x, y: dest.y }
            }
            netRadio(u, 'contact', `BREAKING CONTACT — MOVING GRID ${grid(away.x, away.y)}`, u.x, u.y)
          }
          u.heldRoute = null
          u.path = away.path
          u.legs = [{ x: away.x, y: away.y, n: away.path.length }]
          // smoke first, then move — the screen is what makes the move survivable.
          // Both sides run this: the drill is the drill.
          const scr = popScreen(u, threat)
          if (scr) screenCall(u, scr)
          startTrail(u, 30)
        }
      }
    }
  }
}

// A way OUT, not just a bearing. Straight away from the guns is the first
// choice; if the ground there doesn't go (water, cliff, a closed valley) the
// drill fans off that bearing and then shortens the bound rather than giving
// up — a platoon in contact does not stand still because its preferred exit is
// blocked. Fixed order, no rng: same contact, same route, every replay.
const BREAK_FAN = [0, -0.5, 0.5, -1.0, 1.0, -1.6, 1.6]   // radians off the away bearing
const BREAK_LEGS = [900, 550, 300]                        // metres, longest first

function breakRoute(u: Unit, threat: { x: number; y: number }):
{ x: number; y: number; path: Vec2[] } | null {
  const away = Math.atan2(u.y - threat.y, u.x - threat.x)
  const mob = effStats(u).mob
  for (const dist of BREAK_LEGS) {
    for (const off of BREAK_FAN) {
      const a = away + off
      const bx = clampWorld(S.map, u.x + Math.cos(a) * dist)
      const by = clampWorld(S.map, u.y + Math.sin(a) * dist)
      // never bound toward the shooter, whatever the terrain says
      if (Math.hypot(bx - threat.x, by - threat.y) <= Math.hypot(u.x - threat.x, u.y - threat.y)) continue
      const p = findPath(S.map!, u.x, u.y, bx, by, mob)
      if (p) return { x: bx, y: by, path: p }
    }
  }
  return null
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
    // each cloud stands for its OWN duration (an expendable's `dur`); artillery
    // smoke and anything else unmarked uses the house default
    if (S.t - S.smoke[i]!.t > (S.smoke[i]!.dur ?? SMOKE_DURATION)) S.smoke.splice(i, 1)
  }
}
