// Forces tick slices: movement (columns, convoy, bridging, dig progress),
// battle drills/mission resumption, reports, surrender, attrition and deaths.
// Ported verbatim from src/game/sim.js tick(); engine/SimLoop composes these in
// the frozen phase order — do not call them from anywhere else.
//
// The surrender roll draws from S.rng (seeded), so a battle replays identically
// from its seed. (Was raw Math.random during the migration for old-sim parity;
// re-baselined after the cutover.)
import { S } from '../../engine/state'
import { findPath } from '../../world/pathfinding'
import { grid } from '../../lib/format'
import { locRef } from '../../world/ref'
import { UNIT_TYPES } from './catalog'
import { stowageMax } from './composition'
import { effStats } from './elements'
import { liftFactor } from './loadplan'
import { inRecovery } from '../movement/recovery'
import {
  deriveElements, deriveStrength, downUnit, medicalUpdate,
  processCapture, processWipe, remnantCheck,
} from './casualties'
import { solveColumns } from '../movement/column'
import { stationUpdate, stationSweep } from '../movement/station'
import { trailUpdate } from '../fires/expendables'
import { netRadio, radio, toast } from '../comms/radio'

// units: group pacing, column order/stragglers, dig progress, convoy loops,
// bridging, and movement itself
export function movementUpdate(dt: number): void {
  // Group movement: every unit in a move group station-keeps on the one ahead
  // of it, ordered by progress toward the shared objective. See
  // movement/column.ts — this used to be four passes of bespoke pacing here.
  const col = solveColumns(dt)

  // units: movement + bridging
  for (const u of S.units) {
    const type = UNIT_TYPES[u.type]
    u.fireCooldown = Math.max(0, u.fireCooldown - dt)
    u.missionCooldown = Math.max(0, u.missionCooldown - dt)
    // preparing positions: progress while stationary
    // a column halted for its stragglers digs in too, even though it still holds a route
    if (u.posture === 'dig' && (!u.path.length || u.colWait) && u.digT < 1 && type.def) {
      u.digT = Math.min(1, u.digT + dt / type.def.time)
      if (u.digT >= 1 && !u.dugRadioed && u.side === 'friend') {
        u.dugRadioed = true
        radio(u.label, 'arrive', `DEFENSE SET — ${type.def.name}`, u.x, u.y)
      }
    }
    // forward medical care, best source wins (P2.5): a MED detachment alongside
    // treats faster than the platoon's own medic doing buddy-aid in a hole.
    // Calm only — nobody works casualties under fire.
    if (u.strength > 0 && !u.targetId && S.t - u.lastCombatT > 20) {
      const medNear = u.type !== 'MED' && S.units.some(m => m.side === u.side
        && m.type === 'MED' && m.strength > 0 && Math.hypot(m.x - u.x, m.y - u.y) < 300)
      if (medNear) medicalUpdate(u, dt, 0.7)
      else if (u.posture === 'dig' && u.digT >= 1
        && u.soldiers.some(s => s.kind === 'MEDIC' && s.status === 'FIT')) {
        medicalUpdate(u, dt, 0.35)
      }
    }
    // munitions resupply (both sides): trickle near an own-side base, faster
    // with an own-side LOG truck alongside. Calm only — nobody cross-loads
    // rounds under fire. Covers the indirect basic load AND the consumable
    // stowage (AT rockets/missiles, cannon rounds — FORCE-MODEL Phase 3).
    if (u.strength > 0 && !u.targetId && S.t - u.lastCombatT > 20) {
      const smax = stowageMax(u.type)
      const needsIndirect = !!type.indirect && (u.ammo ?? 0) < type.indirect.load
      const needsStow = (Object.keys(smax) as (keyof typeof smax)[])
        .some(k => (u.stowage[k] ?? 0) < smax[k]!)
      if (needsIndirect || needsStow) {
        const nearBase = S.structures.some(s => s.side === u.side && s.buildT <= 0
          && (s.kind === 'HQ' || s.kind === 'FOB') && Math.hypot(s.x - u.x, s.y - u.y) < 350)
        const nearLog = S.units.some(o => o.side === u.side && o.strength > 0
          && UNIT_TYPES[o.type].logi && Math.hypot(o.x - u.x, o.y - u.y) < 150)
        const rate = nearLog ? 1.0 : nearBase ? 0.5 : 0
        if (rate > 0) {
          if (needsIndirect) u.ammo = Math.min(type.indirect!.load, (u.ammo ?? 0) + rate * dt)
          if (needsStow) {
            // fraction-based per type (loads span 4 rockets to 1200 cannon rds):
            // full basic load in ~8 min at a base, ~4 min beside a LOG truck
            for (const k of Object.keys(smax) as (keyof typeof smax)[]) {
              const max = smax[k]!, cur = u.stowage[k] ?? 0
              if (cur >= max) continue
              const next = Math.min(max, cur + max * (rate / 480) * dt)
              u.stowage[k] = next
              if (u.winch?.[k] && next > max * 0.15) u.winch[k] = false // back in the fight
            }
          }
        }
      }
    }
    // logistics loop: HQ -> load -> FOB -> unload -> repeat
    if (u.convoy && u.side === 'friend' && u.strength > 0) {
      const c = u.convoy
      const fob = S.structures.find(s => s.id === c.fobId && s.side === 'friend')
      const hq = S.structures.find(s => s.side === 'friend' && s.kind === 'HQ' && s.buildT <= 0)
      const logi = UNIT_TYPES[u.type].logi!
      if (!fob) {
        u.convoy = null
        radio(u.label, 'move', 'SUPPLY ROUTE TERMINATED — DESTINATION LOST', u.x, u.y)
      } else if (!hq) {
        // no command post: convoys pause where they are
      } else if (!u.breaking && !u.targetId) {
        if (c.phase === 'toSource') {
          if (Math.hypot(u.x - hq.x, u.y - hq.y) < 300) {
            u.path = []; u.legs = []
            c.phase = 'load'; c.timer = logi.loadTime
          } else if (!u.path.length) {
            // trucks route like everything else, with the convoy doctrine
            // profile: arterials over-preferred beyond raw time
            const p = findPath(S.map!, u.x, u.y, hq.x, hq.y, effStats(u).mob, 'convoy')
            if (p) { u.path = p; u.legs = [{ x: hq.x, y: hq.y, n: p.length }] }
          }
        } else if (c.phase === 'load') {
          c.timer -= dt
          if (c.timer <= 0) {
            // division provides at the CP — trucks load full capacity of real
            // materiel (ammo and stores), no point-pool draw. What the FOB
            // holds is what the trucks have physically hauled up.
            c.carrying = logi.capacity
            c.phase = 'toFob'
          }
        } else if (c.phase === 'toFob') {
          if (Math.hypot(u.x - fob.x, u.y - fob.y) < 300) {
            u.path = []; u.legs = []
            c.phase = 'unload'; c.timer = logi.loadTime
          } else if (!u.path.length) {
            const p = findPath(S.map!, u.x, u.y, fob.x, fob.y, effStats(u).mob, 'convoy')
            if (p) { u.path = p; u.legs = [{ x: fob.x, y: fob.y, n: p.length }] }
          }
        } else if (c.phase === 'unload') {
          c.timer -= dt
          if (c.timer <= 0) {
            fob.stock = (fob.stock || 0) + c.carrying
            radio(u.label, 'arrive', `RESUPPLY COMPLETE — ${fob.label} +${c.carrying}`, fob.x, fob.y)
            c.carrying = 0
            c.phase = 'toSource'
          }
        }
      }
    }
    if (u.bridging) {
      u.bridging.t -= dt
      if (u.bridging.t <= 0) {
        for (const i of u.bridging.cells) {
          // class 2 (road): a pontoon deck carries traffic at paved-road speed,
          // matching the pre-hierarchy behavior where any road cell did
          if (!S.map!.road[i]) { S.map!.road[i] = 2; S.pontoons.push(i) }
        }
        toast(u.label + ' — PONTOON BRIDGE ESTABLISHED')
        u.bridging = null
        u.state = 'hold'
      }
      continue
    }
    if (u.path.length) {
      // any movement abandons a defensive posture
      if (u.posture === 'dig') { u.posture = 'mobile'; u.digT = 0 }
      const st = effStats(u)
      const wp = u.path[0]!
      const dx = wp.x - u.x, dy = wp.y - u.y
      const d = Math.hypot(dx, dy)
      const f = S.map!.moveFactor(u.x, u.y, st.mob)
      // This unit's own terrain-adjusted speed. Terrain is applied HERE, to the
      // achieved speed, and not to the ceiling the column solver reasons about:
      // a platoon bogged in a wadi should fall behind and be waited for, not
      // silently drag every platoon on tarmac down to its pace.
      // liftFactor is the load plan biting: a platoon with more people than
      // seats moves at the pace of the ones walking (see ./loadplan).
      let spd = (st.speed * liftFactor(u)) / (isFinite(f) ? f : 3)
      // A vehicle on the end of a tow cable is not driving anywhere, and
      // neither is the wrecker on the other end of it. The column's own solver
      // does the rest: it waits for a member that has stopped exactly as it
      // waits for one that has bogged (movement/recovery, movement/follow).
      if (inRecovery(u)) spd = 0
      const c = col.get(u.id)
      if (c) {
        spd = Math.min(spd, c.spd)
        // A column halted for its tail digs in rather than idling in the open —
        // a stopped convoy is a target.
        if (c.wait !== !!u.colWait) {
          u.colWait = c.wait
          if (c.wait) {
            u.posture = 'dig'
            netRadio(u, 'move', 'HOLDING FOR TRAIL ELEMENTS — GOING FIRM', u.x, u.y)
          } else {
            u.posture = 'mobile'
            u.digT = 0
          }
        }
      } else if (u.colWait) {
        u.colWait = false
        u.posture = 'mobile'
        u.digT = 0
      }
      // What the unit's OWN vics are asking for: a platoon whose tail has come
      // off a bend eases until it closes up, and one told to coil stops where it
      // stands. Computed last tick, because the formation solves against where
      // the unit ended up (see movement/station.ts).
      if (u.formCap !== undefined) spd *= u.formCap
      u._spd = spd
      if (d < Math.max(4, spd * dt)) {
        u.odo += d
        u.x = wp.x; u.y = wp.y
        u.path.shift()
        if (u.legs.length && --u.legs[0]!.n <= 0) {
          const leg = u.legs.shift()!
          if (u.legs.length) netRadio(u, 'arrive', `WP CLEAR GRID ${grid(leg.x, leg.y)} — CONTINUING`, leg.x, leg.y)
          else netRadio(u, 'arrive', `AT GRID ${grid(leg.x, leg.y)} — HOLDING`, leg.x, leg.y)
        }
        if (!u.path.length) {
          u.legs = []; u.state = 'hold'
          // arriving completes the mission — drop any break-resume bookkeeping
          // (unless this was the evasion leg itself, which still wants its resume)
          if (!u.breaking) { u.resumeDest = undefined; u.breakRetried = undefined; u.coverSought = undefined }
        }
      } else {
        u.x += (dx / d) * spd * dt
        u.y += (dy / d) * spd * dt
        u.odo += spd * dt
        u.heading = Math.atan2(dy, dx)
        u.state = 'moving'
      }
    }
  }

  // Station keeping inside each unit: the vics drive to their slots along the
  // route the unit has actually taken. Its own pass, after every unit has
  // moved — a `continue` in the loop above (bridging) must not skip it, and a
  // unit that has arrived still has vics closing up behind it.
  for (const u of S.units) stationUpdate(u, dt)
  stationSweep()
}

// mission resumption: contact clear and neighborhood quiet → continue movement.
// side-agnostic: friendly and hostile units execute the identical drill code.
export function drillsUpdate(dt: number): void {
  for (const u of S.units) {
    if (u.strength <= 0) continue
    // engine-exhaust smoke keeps laying while the vehicle rolls (armed by the
    // break drill). Side-agnostic, like every drill in this loop.
    trailUpdate(u, dt)
    // deliberate attack: pursue the designated target until it dies
    if (u.attackId != null) {
      const tgt = S.units.find(x => x.id === u.attackId)
      if (!tgt || tgt.strength <= 0) {
        u.attackId = null
        u.attackMove = false
        netRadio(u, 'contact', 'TARGET DESTROYED — HOLDING', u.x, u.y)
        u.path = []; u.legs = []
      } else if (u.targetId === u.attackId) {
        // in engagement range of the designated target: stand and fight
        u.path = []; u.legs = []
      } else {
        u.attackRepathT -= dt
        if (u.attackRepathT <= 0 && !u.targetId) {
          u.attackRepathT = 8
          const drift = u.legs.length
            ? Math.hypot(u.legs[u.legs.length - 1]!.x - tgt.x, u.legs[u.legs.length - 1]!.y - tgt.y)
            : Infinity
          if (drift > 250) {
            const p = findPath(S.map!, u.x, u.y, tgt.x, tgt.y, effStats(u).mob)
            if (p) { u.path = p; u.legs = [{ x: tgt.x, y: tgt.y, n: p.length }] }
          }
        }
      }
    }
    if (u.breaking && !u.targetId && S.t - u.lastCombatT > 15) {
      u.breaking = false
      u.lastBreakT = S.t // break fatigue window starts when the run completes
      // resume the interrupted mission once contact is broken — one retry, so a
      // soft unit doesn't need re-tasking for every brush, but a route that keeps
      // drawing fire is abandoned rather than ping-ponged forever
      if (u.resumeDest && !u.breakRetried) {
        u.breakRetried = true
        const p = findPath(S.map!, u.x, u.y, u.resumeDest.x, u.resumeDest.y, effStats(u).mob)
        if (p) {
          u.path = p
          u.legs = [{ x: u.resumeDest.x, y: u.resumeDest.y, n: p.length }]
          u.state = 'moving'
          netRadio(u, 'move', `CONTACT BROKEN — RESUMING MOVEMENT TO GRID ${grid(u.resumeDest.x, u.resumeDest.y)}`, u.resumeDest.x, u.resumeDest.y)
        } else {
          u.resumeDest = undefined
          netRadio(u, 'contact', 'CONTACT BROKEN — HOLDING, AWAITING ORDERS', u.x, u.y)
        }
      } else {
        const spent = u.breakRetried
        u.resumeDest = undefined
        u.breakRetried = undefined
        netRadio(u, 'contact', spent
          ? 'UNABLE TO CONTINUE — HOLDING, AWAITING ORDERS'
          : 'CONTACT BROKEN — HOLDING, AWAITING ORDERS', u.x, u.y)
      }
    }
    const calm = !u.targetId && S.t - u.lastCombatT > 12
    // missionCooldown gate: a battery that held its route to fire stays emplaced
    // through the reload, then rolls again (shoot-and-scoot without re-tasking)
    if (calm && u.missionCooldown <= 0 && (u.heldRoute || u.autoDismounted)) {
      const nearBusy = S.units.some(o => o !== u && o.side === u.side && o.targetId
        && Math.hypot(o.x - u.x, o.y - u.y) < 600)
      if (!nearBusy) {
        // remount applies whether or not the unit ever fully halted
        if (u.autoDismounted && UNIT_TYPES[u.type].carrier && !u.mounted) {
          u.mounted = true
          deriveElements(u)
          netRadio(u, 'move', 'REMOUNTING', u.x, u.y)
        }
        u.autoDismounted = false
        u.coverSought = undefined // next contact gets a fresh cover scan
        if (u.heldRoute) {
          const afterFire = u.state === 'firing'
          u.path = u.heldRoute.path
          u.legs = u.heldRoute.legs
          u.heldRoute = null
          u.state = 'moving'
          netRadio(u, 'move', afterFire
            ? 'ROUNDS COMPLETE — RESUMING MOVEMENT'
            : 'CONTACT CLEAR — CONTINUING MISSION', u.x, u.y)
        }
      }
    }
    // a battery that finished its fire mission stands relaxed again instead of
    // reading FIRING forever
    if (u.state === 'firing' && u.missionCooldown <= 0 && !u.path.length) u.state = 'hold'
  }
}

// casualty reports (friendly net)
export function casualtyReports(): void {
  for (const u of S.units) {
    if (u.side !== 'friend') continue
    for (const th of [70, 45, 20]) {
      if (u.strength <= th && u.strMark > th) {
        radio(u.label, 'damage', `TAKING CASUALTIES — STRENGTH ${Math.max(0, Math.round(u.strength))}%`, u.x, u.y)
        break
      }
    }
    u.strMark = Math.min(u.strMark, u.strength)
  }
}

// surrender: a worn-down unit under fire may throw in the towel instead of fighting on.
// Rolled once, when strength first crosses below ~30% while in/just out of contact.
export function surrenderUpdate(): void {
  for (let i = S.units.length - 1; i >= 0; i--) {
    const u = S.units[i]!
    if (u.strength <= 0 || u.surrenderRolled) continue
    if (u.strength > 30) continue
    if (u.targetId == null && S.t - (u.lastCombatT ?? -99) > 12) continue // not under duress
    u.surrenderRolled = true
    const rng = S.rng || Math.random // seeded in-game; fallback only pre-init
    const p = 0.01 + rng() * 0.04 // 1–5%
    if (rng() < p) {
      S.contacts.delete(u.id)
      processCapture(u) // everyone still standing walks into captivity — MIA/POW
      if (u.side === 'friend') {
        radio(u.label, 'loss', 'ELEMENTS SURRENDERING — WE ARE COMBAT INEFFECTIVE', u.x, u.y)
        toast(u.label + ' SURRENDERED')
        S.stats.lost++
      } else {
        radio('NET', 'spot', `ENEMY ELEMENT SURRENDERING — ${locRef(S.map!, u.x, u.y)}`, u.x, u.y)
        S.stats.enemyDestroyed++
      }
      S.units.splice(i, 1)
    }
  }
}

// coherence pass (P2.5 inversion): elements and strength DERIVE from the
// roster every tick — casualties were already rolled at damage time, and any
// recovery (RTD, repairs) shows up here as revived elements/rising strength.
// remnantCheck first: a mounted platoon whose last vic just died dismounts its
// survivors instead of being deleted at the derive.
export function attritionSync(): void {
  for (const u of S.units) { remnantCheck(u); deriveElements(u); deriveStrength(u) }
}

// deaths: units (per-element wrecks were already spawned as elements died)
export function unitDeaths(): void {
  for (let i = S.units.length - 1; i >= 0; i--) {
    const u = S.units[i]!
    if (u.strength <= 0) {
      S.contacts.delete(u.id)
      if (u.side === 'friend') {
        // DUSTWUN: the TOC only knows the signal dropped. No fates roll here —
        // the site holds the unresolved roster at the LKP until somebody
        // secures the ground (recovery.ts) or the operation writes it off.
        downUnit(u)
        radio('NET', 'loss', `${u.label} SIGNAL LOST — LKP GRID ${grid(u.x, u.y)}, STATUS UNKNOWN`, u.x, u.y)
        toast(u.label + ' — SIGNAL LOST, STATUS UNKNOWN')
        S.stats.lost++
      } else {
        // enemy wipes resolve on the spot (we don't model their recovery)
        processWipe(u)
        S.stats.enemyDestroyed++
      }
      S.units.splice(i, 1)
    }
  }
}
