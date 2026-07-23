// Airframe tick slice: gunship guns, sensor track maintenance, follow logic,
// and the transit/onstation/rtb/striking state machines (incl. the aerostat's
// fixed station + turret sweep). Ported verbatim from src/game/sim.js tick().
import { S } from '../../engine/state'
import { DRONE_TYPES } from './catalog'
import { AEROSTAT_SCAN_RATE } from './orders'
import { updateGunship } from './gunship'
import { targetPoint } from './targeting'
import { endSortie } from '../economy/economy'
import { precisionBlast } from '../forces/elements'
import { radio } from '../comms/radio'
import { grid } from '../../lib/format'

export function airUpdate(dt: number): void {
  for (let i = S.drones.length - 1; i >= 0; i--) {
    const d = S.drones[i]!
    const spec = DRONE_TYPES[d.type]
    // drop designated targets only once the vic is actually destroyed
    if (d.targets && d.targets.length) d.targets = d.targets.filter(t => targetPoint(t))
    // AC-130 automatic gun fire (selected gun + fire mode)
    if (spec.gunship && d.state === 'onstation') updateGunship(d, dt)
    // sensor track maintenance: follow the locked unit, degrade to point lock if lost
    if (d.lock && d.lock.unitId != null) {
      const lu = S.units.find(x => x.id === d.lock!.unitId)
      if (lu) { d.lock.x = lu.x; d.lock.y = lu.y }
      else {
        delete d.lock.unitId
        radio(d.label, 'spot', `TRACK LOST — HOLDING GRID ${grid(d.lock.x, d.lock.y)}`, d.lock.x, d.lock.y)
      }
    }
    // contact tracking. A movable airframe flies its orbit anchor after the
    // contact — the SENSOR is left under operator control (following moves the
    // aircraft, not the camera). The tethered aerostat can't move, so it follows
    // with the sensor only (camera lock) and drops once the contact leaves its arc.
    if (d.followId && (d.state === 'transit' || d.state === 'onstation')) {
      const u = S.units.find(x => x.id === d.followId)
      if (!u || u.strength <= 0) {
        d.followId = null
        if (d.lock && d.lock.track) d.lock = null
        radio(d.label, 'spot', `TRACK LOST — CONTACT GONE`, d.tx, d.ty)
      } else if (d.tether) {
        d.lock = { x: u.x, y: u.y, track: true }   // aerostat: sensor slaves to the contact
        const reach = spec.sight * (d.sightMul || 1)
        if (Math.hypot(u.x - d.x, u.y - d.y) > reach) {
          d.followId = null; d.lock = null
          radio(d.label, 'spot', `TRACK LOST — CONTACT OUTSIDE SENSOR RANGE`, u.x, u.y)
        }
      } else {
        const dx = u.x - d.tx, dy = u.y - d.ty
        const dist = Math.hypot(dx, dy)
        if (dist > 2) {
          const chase = Math.min(dist, spec.speed * 0.95 * dt)
          d.tx += (dx / dist) * chase
          d.ty += (dy / dist) * chase
        }
      }
    }
    if (d.state === 'transit') {
      const oR = spec.orbitR * (d.orbitMul || 1)
      const dx = d.tx - d.x, dy = d.ty - d.y
      const dist = Math.hypot(dx, dy)
      const midLeg = d.route && d.route.length > 1
      // intermediate waypoints: cut the corner; final leg: intercept the ring itself
      const arrive = midLeg ? 100 : Math.max(oR, 60)
      if (dist <= arrive) {
        if (midLeg) {
          d.route.shift()
          d.tx = d.route[0]!.x; d.ty = d.route[0]!.y
        } else {
          d.route = []
          d.state = 'onstation'
          // enter the pattern where we actually are: phase from approach bearing,
          // current distance becomes the starting radius, then spiral to standard
          d.angle = Math.atan2(d.y - d.ty, d.x - d.tx)
          d.orbR = Math.max(dist, 25)
          radio(d.label, 'move', `ON STATION — ORBIT ESTABLISHED GRID ${grid(d.tx, d.ty)}`, d.tx, d.ty)
        }
      } else { d.x += (dx / dist) * spec.speed * dt; d.y += (dy / dist) * spec.speed * dt }
    } else if (d.state === 'onstation') {
      d.endurance -= dt
      if (d.tether) {
        // the aerostat holds a fixed station over its tether point — it does not
        // orbit. Its sensor turret sweeps a continuous 360° survey of the ground
        // around the mast; a lock stops the sweep and holds the point (handled in
        // DroneCamera). scanAngle is the bearing the turret is currently looking down.
        d.x = d.tx; d.y = d.ty; d.orbR = 0
        if (d.lock) {
          // locked/following: keep scanAngle+tilt tracking the lock point so that
          // dropping the lock (unfollow, or a manual slew) holds the current view
          // instead of snapping back to bearing 0 / the mast
          const bx = d.lock.x - d.tx, by = d.lock.y - d.ty
          d.scanAngle = Math.atan2(by, bx)
          d.tilt = Math.atan2(spec.alt * (d.altMul || 1), Math.max(1, Math.hypot(bx, by)))
        } else if (d.sensorMode === 'auto') {
          // sweep only in AUTO; FREE holds the manual bearing. scanMul is the operator's
          // sweep-speed setting (slow/med/fast).
          d.scanAngle = (d.scanAngle || 0) + dt * AEROSTAT_SCAN_RATE * (d.scanMul || 1)
        }
      } else {
        const oR = spec.orbitR * (d.orbitMul || 1)
        if (d.orbR == null) d.orbR = oR
        // rate-limited spiral toward the commanded radius
        const maxStep = spec.speed * 0.5 * dt
        d.orbR += Math.max(-maxStep, Math.min(maxStep, oR - d.orbR))
        // gunships fly a left-hand (counter-clockwise) pylon turn so the guns face inboard
        const turnDir = spec.gunship ? -1 : 1
        d.angle += turnDir * dt * ((spec.speed || 3) / Math.max(80, d.orbR))
        d.x = d.tx + Math.cos(d.angle) * d.orbR
        d.y = d.ty + Math.sin(d.angle) * d.orbR
      }
      if (d.endurance <= 0) {
        d.state = 'rtb'
        radio(d.label, 'move', `BINGO — RTB`, d.x, d.y)
      }
    } else if (d.state === 'rtb') {
      // unit-launched birds recover to the unit that launched them (it may have
      // moved). If that unit is gone/dead there is no one to recover it — it crashes.
      let hx = d.ox, hy = d.oy
      if (d.launcherId != null) {
        const home = S.units.find(u => u.id === d.launcherId && u.side === 'friend' && u.strength > 0)
        if (!home) {
          radio(d.label, 'loss', 'NO RECOVERY UNIT — AIRFRAME LOST', d.x, d.y)
          S.impacts.push({ x: d.x, y: d.y, t: S.t }) // crash puff
          endSortie(d)
          S.drones.splice(i, 1)
          continue
        }
        hx = home.x; hy = home.y
      }
      const dx = hx - d.x, dy = hy - d.y
      const dist = Math.hypot(dx, dy)
      if (dist < 80) {
        radio(d.label, 'arrive', 'RECOVERED', hx, hy)
        endSortie(d)
        S.drones.splice(i, 1)
      } else { d.x += (dx / dist) * spec.speed * dt; d.y += (dy / dist) * spec.speed * dt }
    } else if (d.state === 'striking') {
      const dx = d.sx! - d.x, dy = d.sy! - d.y
      const dist = Math.hypot(dx, dy)
      if (dist < 25) {
        S.impacts.push({ x: d.sx!, y: d.sy!, t: S.t })
        const k = spec.kamikaze!
        for (const u of S.units) {
          if (Math.hypot(u.x - d.sx!, u.y - d.sy!) < k.blast + 90) {
            precisionBlast(u, d.sx!, d.sy!, k.blast, k.dmg, 'HE')
          }
        }
        for (const s of S.structures) {
          const sd = Math.hypot(s.x - d.sx!, s.y - d.sy!)
          if (sd < k.blast) s.hp -= k.dmg * (1 - sd / k.blast) * 0.7
        }
        radio(d.label, 'fires', `IMPACT — GRID ${grid(d.sx!, d.sy!)}`, d.sx!, d.sy!)
        endSortie(d)
        S.drones.splice(i, 1)
      } else { d.x += (dx / dist) * spec.speed * 1.7 * dt; d.y += (dy / dist) * spec.speed * 1.7 * dt }
    }
  }
}
