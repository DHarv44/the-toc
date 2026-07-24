// Forces tick slices: movement (columns, convoy, bridging, dig progress),
// battle drills/mission resumption, reports, surrender, attrition and deaths.
// Ported verbatim from src/game/sim.js tick(); engine/SimLoop composes these in
// the frozen phase order — do not call them from anywhere else.
//
// The surrender roll draws from S.rng (seeded), so a battle replays identically
// from its seed. (Was raw Math.random during the migration for old-sim parity;
// re-baselined after the cutover.)
import { S } from '../../engine/state'
import type { Unit } from '../../engine/GameState'
import { findPath } from '../../world/pathfinding'
import { grid } from '../../lib/format'
import { locRef } from '../../world/ref'
import { UNIT_TYPES } from './catalog'
import { effStats, healUnit, syncElements } from './elements'
import { COLUMN_GAP, STRAGGLE_GAP } from './orders'
import { netRadio, radio, toast } from '../comms/radio'

// units: group pacing, column order/stragglers, dig progress, convoy loops,
// bridging, and movement itself
export function movementUpdate(dt: number): void {
  // group movement: a formation moves no faster than its slowest moving member.
  // recomputed each tick from live, still-moving members (arrived/dead don't count) —
  // cap the REAL (post-terrain) speed so a member on a road can't outrun one in a field.
  const groupCap = new Map<number, number>()
  for (const u of S.units) {
    if (u.groupId == null || !u.path.length || u.strength <= 0) continue
    const st = effStats(u)
    const f = S.map!.moveFactor(u.x, u.y, st.mob)
    const real = st.speed / (isFinite(f) ? f : 3)
    const cur = groupCap.get(u.groupId)
    if (cur == null || real < cur) groupCap.set(u.groupId, real)
  }

  // Column order is recomputed every tick from progress along the shared route (fewest
  // waypoints remaining = furthest along). Fixing the order when the move is issued
  // doesn't survive contact with reality: at that moment every unit is bunched at the
  // start with indistinguishable route positions, and the order then drifts as the
  // faster ones pull ahead — leaving "the vic ahead" pointing at a unit that's actually
  // behind, so the front ran free while the rear waited on it.
  const colMembers = new Map<number, Unit[]>()
  for (const u of S.units) {
    if (u.groupId == null || u.colIdx == null || u.strength <= 0) continue
    if (!colMembers.has(u.groupId)) colMembers.set(u.groupId, [])
    colMembers.get(u.groupId)!.push(u)
  }
  const colAhead = new Map<string, Unit>()
  for (const [gid, list] of colMembers) {
    list.sort((a, b) => a.path.length - b.path.length)
    list.forEach((u, i) => { u.colIdx = i; colAhead.set(gid + ':' + i, u) })
  }

  // A column doesn't leave its tail behind: if a gap opens past STRAGGLE_GAP, everyone
  // forward of the break stops and goes firm until the straggler closes up. Waiting
  // units dig in rather than idling in the open — a halted convoy is a target.
  const colStall = new Map<number, number>()
  for (const [gid, list] of colMembers) {
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i]!, b = list[i + 1]!
      if (!b.path.length) continue // already arrived — not a straggler
      if (Math.hypot(b.x - a.x, b.y - a.y) > STRAGGLE_GAP) { colStall.set(gid, a.colIdx!); break }
    }
  }

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
    // rest and buddy-aid in prepared positions: slow recovery, capped at 70%
    if (u.posture === 'dig' && u.digT >= 1 && u.strength > 0 && u.strength < 70
        && !u.targetId && S.t - u.lastCombatT > 20) {
      healUnit(u, 0.15 * dt, 70, false) // buddy-aid patches crews; destroyed vics stay dead
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
            const p = findPath(S.map!, u.x, u.y, hq.x, hq.y, effStats(u).mob)
            if (p) { u.path = p; u.legs = [{ x: hq.x, y: hq.y, n: p.length }] }
          }
        } else if (c.phase === 'load') {
          c.timer -= dt
          if (c.timer <= 0) {
            c.carrying = Math.min(logi.capacity, Math.floor(S.resources))
            S.resources -= c.carrying
            c.phase = 'toFob'
          }
        } else if (c.phase === 'toFob') {
          if (Math.hypot(u.x - fob.x, u.y - fob.y) < 300) {
            u.path = []; u.legs = []
            c.phase = 'unload'; c.timer = logi.loadTime
          } else if (!u.path.length) {
            const p = findPath(S.map!, u.x, u.y, fob.x, fob.y, effStats(u).mob)
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
      // this unit's own terrain-adjusted speed, then held to the group's slowest real pace
      let spd = st.speed / (isFinite(f) ? f : 3)
      if (u.groupId != null) {
        // halt and go firm if the tail has fallen behind us
        const stall = colStall.get(u.groupId)
        const waiting = stall != null && u.colIdx != null && u.colIdx <= stall
        if (waiting !== !!u.colWait) {
          u.colWait = waiting
          if (waiting) {
            u.posture = 'dig'
            netRadio(u, 'move', 'HOLDING FOR TRAIL ELEMENTS — GOING FIRM', u.x, u.y)
          } else {
            u.posture = 'mobile'
            u.digT = 0
          }
        }
        // Station-keeping. The group cap stops a formation outrunning its slowest
        // member, but applied blindly it also means a unit that falls behind can NEVER
        // close the gap — everyone crawls at the same speed and the column stretches
        // out forever. So a follower outside its station is released from the cap and
        // runs at its own speed until it's back on the vic ahead.
        let capped = true
        if (u.colIdx != null && u.colIdx > 0) {
          const ahead = colAhead.get(u.groupId + ':' + (u.colIdx - 1))
          if (ahead) {
            const gap = Math.hypot(ahead.x - u.x, ahead.y - u.y)
            if (gap > COLUMN_GAP * 1.2) capped = false          // trailing — close up
            else if (gap < COLUMN_GAP) {                        // closed up — ease off
              spd *= Math.max(0, (gap - COLUMN_GAP * 0.45) / (COLUMN_GAP * 0.55))
            }
          }
        }
        const cap = groupCap.get(u.groupId)
        if (capped && cap != null) spd = Math.min(spd, cap)
        if (waiting) spd = 0
      }
      u._spd = spd
      if (d < Math.max(4, spd * dt)) {
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
          if (!u.breaking) { u.resumeDest = undefined; u.breakRetried = undefined }
        }
      } else {
        u.x += (dx / d) * spd * dt
        u.y += (dy / d) * spd * dt
        u.heading = Math.atan2(dy, dx)
        u.state = 'moving'
      }
    }
  }
}

// mission resumption: contact clear and neighborhood quiet → continue movement.
// side-agnostic: friendly and hostile units execute the identical drill code.
export function drillsUpdate(dt: number): void {
  for (const u of S.units) {
    if (u.strength <= 0) continue
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
          syncElements(u, true)
          netRadio(u, 'move', 'REMOUNTING', u.x, u.y)
        }
        u.autoDismounted = false
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

// element attrition: bring each unit's vics/troops in line with its strength,
// spawning individual wrecks/explosions as they're picked off by direct fire
export function attritionSync(): void {
  for (const u of S.units) syncElements(u, false)
}

// deaths: units (per-element wrecks were already spawned as elements died)
export function unitDeaths(): void {
  for (let i = S.units.length - 1; i >= 0; i--) {
    const u = S.units[i]!
    if (u.strength <= 0) {
      S.contacts.delete(u.id)
      if (u.side === 'friend') {
        radio('NET', 'loss', `${u.label} SIGNAL LOST — LKP GRID ${grid(u.x, u.y)}`, u.x, u.y)
        toast(u.label + ' DESTROYED')
        S.stats.lost++
      } else {
        S.stats.enemyDestroyed++
      }
      S.units.splice(i, 1)
    }
  }
}
