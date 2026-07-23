// UAS orders: launch, retasking, sensor control, strikes. Ported verbatim from
// src/game/sim.js. The aerostat has its own dedicated paths (fieldAerostat /
// droneSensorMode / the tether branches) — it is a tethered sensor mast, not a
// drone that happens to be slow.
import { S } from '../../engine/state'
import type { Drone } from '../../engine/GameState'
import { clampWorld, nearestLand } from '../../world/place'
import { DRONE_TYPES, type DroneTypeKey } from './catalog'
import { airAvailability, endSortie } from './availability'
import { targetPoint } from './targeting'
import { gunshipHowitzerFire } from './gunship'
import { UNIT_TYPES } from '../forces/catalog'
import { toast, radio } from '../comms/radio'
import { grid, fmtCooldown } from '../../lib/format'

export const AEROSTAT_SCAN_RATE = 0.014 // rad/s at 1× — a full turret sweep takes ~7.5 min (MED)

export function deployDrone(typeKey: DroneTypeKey, x: number, y: number): Drone | null {
  x = clampWorld(S.map, x); y = clampWorld(S.map, y)
  const spec = DRONE_TYPES[typeKey]
  if (!spec) return null
  // structural scarcity: concurrent cap, then turnaround from the last sortie
  const avail = airAvailability(typeKey)
  if (avail.capped) {
    return toast(`${spec.abbr} AT LIMIT — ${avail.active}/${avail.max} AIRBORNE`)
  }
  if (avail.cooldown > 0) {
    return toast(`${spec.abbr} IN TURNAROUND — ${fmtCooldown(avail.cooldown)}`)
  }
  let ox: number, oy: number
  let tether = null as ReturnType<typeof S.structures.find> | null
  let launcherId: number | null = null
  if (spec.src === 'tether') {
    // aerostat: raised at a FOB/HQ, one per site
    const site = S.structures
      .filter(s => s.side === 'friend' && s.buildT <= 0 && (s.kind === 'FOB' || s.kind === 'HQ')
        && Math.hypot(s.x - x, s.y - y) <= spec.tetherRange!)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0]
    if (!site) return toast('MUST TETHER AT A FOB OR HQ')
    if (S.drones.some(d => d.tether === site.id)) return toast(site.label + ' ALREADY FLIES AN AEROSTAT')
    tether = site
    // stand the mast off to the side of the base rather than on top of its symbol, on a
    // bearing away from the map interior (behind the base) and on passable ground
    const away = Math.atan2(site.y - S.map!.WORLD / 2, site.x - S.map!.WORLD / 2)
    const p = nearestLand(S.map!, site.x + Math.cos(away) * 220, site.y + Math.sin(away) * 220, 'foot')
    ox = p.x; oy = p.y
    x = p.x; y = p.y
  } else if (spec.src === 'airfield') {
    const afld = S.structures
      .filter(s => s.side === 'friend' && s.buildT <= 0 && s.launchesDrones)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0]
    if (!afld) return toast('NO ACTIVE AIRFIELD')
    ox = afld.x; oy = afld.y
  } else {
    // field-launched: hand-thrown by the nearest friendly unit in control range
    const launcher = S.units
      .filter(u => u.side === 'friend' && Math.hypot(u.x - x, u.y - y) <= spec.ctrlRange!)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0]
    if (!launcher) return toast('NO FRIENDLY UNIT IN CONTROL RANGE')
    ox = launcher.x; oy = launcher.y
    launcherId = launcher.id
  }
  if (S.resources < spec.cost) return toast('INSUFFICIENT SUPPLY')
  S.resources -= spec.cost
  const id = S.counters.nextId++
  const d: Drone = {
    id, type: typeKey, x: ox, y: oy, ox, oy,
    tx: x, ty: y, state: tether ? 'onstation' : 'transit', route: [],
    tether: tether ? tether.id : null,
    sensorMode: tether ? 'auto' : null,   // aerostat turret: free / auto / lock
    scanAngle: 0,
    altMul: 1, sightMul: 1, orbitMul: 1,
    endurance: spec.endurance, angle: 0,
    ammo: spec.weapons ? spec.weapons.ammo : 0,
    label: spec.abbr + '-' + (id % 100),
    // a unit-launched bird recovers to its parent unit, and stays over it by default
    launcherId,
    followId: launcherId,
  }
  if (spec.gunship) {
    d.gunSel = spec.gunship.order[0]!       // active weapon
    d.fireMode = 'hold'                      // guns start safe until the player commits
    d.gunCd = 0
    d.gunAmmo = {}
    for (const k of spec.gunship.order) d.gunAmmo[k] = spec.gunship.weapons[k]!.ammo
    d.targets = []
  }
  S.drones.push(d)
  radio(d.label, 'move', tether
    ? `${spec.name.toUpperCase()} ALOFT AT ${tether.label}`
    : `${spec.name.toUpperCase()} LAUNCHED — ORBIT GRID ${grid(x, y)}`, x, y)
  return d
}

// Raise the aerostat at a selected FOB/HQ — the one-click equivalent for the tethered
// balloon. It tethers at that site anyway, so there's nothing to place on the map.
// deployDrone enforces the cost and the one-per-site rule.
export function fieldAerostat(structId: number): Drone | null {
  const st = S.structures.find(s => s.id === structId && s.side === 'friend')
  if (!st) return toast('NO SITE SELECTED')
  if (st.kind !== 'HQ' && st.kind !== 'FOB') return toast(`${st.label} CANNOT FLY AN AEROSTAT`)
  return deployDrone('AEROSTAT', st.x, st.y)
}

// retask a drone's orbit anchor; shift-click appends route waypoints
export function orderDroneMove(droneId: number, x: number, y: number, append = false): void | null {
  const d = S.drones.find(d => d.id === droneId)
  if (!d) return
  if (d.tether) return toast(d.label + ' IS TETHERED')
  if (d.state === 'rtb' || d.state === 'striking') return toast(d.label + ' — UNABLE, COMMITTED')
  x = clampWorld(S.map, x); y = clampWorld(S.map, y)
  d.followId = null
  if (!d.route) d.route = []
  if (append && d.route.length) {
    d.route.push({ x, y })
    radio(d.label, 'move', `COPY — WP ADDED, GRID ${grid(x, y)}`, x, y)
  } else {
    d.route = [{ x, y }]
    d.tx = x; d.ty = y
    if (d.state === 'onstation') d.state = 'transit'
    radio(d.label, 'move', `RETASKING — ORBIT GRID ${grid(x, y)}`, x, y)
  }
}

export function droneDropWp(droneId: number): void {
  const d = S.drones.find(d => d.id === droneId)
  if (!d || !d.route || !d.route.length) return
  d.route.pop()
  if (d.route.length) {
    d.tx = d.route[0]!.x; d.ty = d.route[0]!.y
  } else if (d.state === 'transit') {
    // dropped the active leg: orbit right here
    d.tx = d.x; d.ty = d.y
    d.state = 'onstation'
  }
}

// altitude / orbit radius / turret presets from the drone context menu and feed
export type DroneSetPatch = Partial<Pick<Drone, 'altMul' | 'orbitMul' | 'scanAngle' | 'tilt' | 'scanMul'>>
export function droneSet(droneId: number, patch: DroneSetPatch): void {
  const d = S.drones.find(d => d.id === droneId)
  if (!d) return
  Object.assign(d, patch)
  d.sightMul = d.altMul >= 1.5 ? 1.25 : d.altMul <= 0.7 ? 0.8 : 1
  if (patch.altMul != null) {
    radio(d.label, 'move', `ANGELS ${patch.altMul <= 0.7 ? 'LOW' : patch.altMul >= 1.5 ? 'HIGH' : 'MED'}`, d.x, d.y)
  }
}

export function droneRTB(droneId: number): void {
  const d = S.drones.find(d => d.id === droneId)
  if (!d || d.state === 'rtb') return
  if (d.tether) {
    // balloons don't fly home — winch down and recover
    radio(d.label, 'move', 'AEROSTAT WINCHED DOWN', d.x, d.y)
    endSortie(d)
    S.drones.splice(S.drones.indexOf(d), 1)
    return
  }
  d.state = 'rtb'
  d.followId = null
  d.route = []
  radio(d.label, 'move', 'RTB PER TASKING', d.x, d.y)
}

// Aerostat turret mode: 'auto' (continuous 360° survey sweep) or 'free' (operator slews
// the bearing by hand). Pointing at a specific contact is FOLLOW, not a mode — designate
// it in the feed and press FOLLOW, same as every other drone.
export function droneSensorMode(droneId: number, mode: 'auto' | 'free'): void {
  const d = S.drones.find(d => d.id === droneId)
  if (!d) return
  d.sensorMode = mode
  // FREE starts level — the operator can only tilt down from the horizon
  if (mode === 'free' && d.tilt == null) d.tilt = 0.05
  // taking manual/auto control drops any follow-track the sensor was holding
  if (d.followId) { d.followId = null; if (d.lock && d.lock.track) d.lock = null }
}

// sensor lock: camera stays on a unit (track) or a grid (point) regardless of orbit
export function droneLock(droneId: number, lock: { unitId?: number; x?: number; y?: number } | null): void {
  const d = S.drones.find(d => d.id === droneId)
  if (!d) return
  // sensor lock is a silent camera action — no net traffic. The transmission happens on
  // TARGET lock instead (see droneToggleTarget), as a request for permission to fire.
  if (!lock) { d.lock = null; return }
  if (lock.unitId != null) {
    const u = S.units.find(u => u.id === lock.unitId)
    if (!u) return
    d.lock = { unitId: u.id, x: u.x, y: u.y }
  } else {
    d.lock = { x: lock.x!, y: lock.y! }
  }
}

// track a designated contact: the orbit anchor chases the unit (movable airframes),
// or the sensor slaves to it while it stays in the field of regard (tethered aerostat).
// unitId is any unit the sensor can see — usually a hostile picked in the feed.
export function droneFollow(droneId: number, unitId: number | null): void {
  const d = S.drones.find(d => d.id === droneId)
  if (!d) return
  if (unitId) {
    const u = S.units.find(u => u.id === unitId)
    if (!u) return
    d.followId = unitId
    d.route = []
    const who = u.side === 'friend' ? u.label : 'HOSTILE ' + UNIT_TYPES[u.type].abbr
    radio(d.label, 'spot', d.tether
      ? `SENSOR TRACKING ${who} — GRID ${grid(u.x, u.y)}`
      : `TRACKING ${who} — GRID ${grid(u.x, u.y)}`, u.x, u.y)
  } else {
    d.followId = null
    if (d.lock && d.lock.track) d.lock = null   // release the follow camera
    // aerostat: hold the view where the track left it rather than resuming the sweep —
    // scanAngle/tilt were kept synced to the target in the tick, so FREE holds the shot
    if (d.tether) d.sensorMode = 'free'
    radio(d.label, 'move', `TRACK DROPPED — HOLDING GRID ${grid(d.tx, d.ty)}`, d.tx, d.ty)
  }
}

// armed drones: VIPER fires an AGM at a point; SWITCHBLADE dives on it
export function droneStrike(droneId: number, x: number, y: number): void | null {
  const d = S.drones.find(d => d.id === droneId)
  if (!d) return
  const spec = DRONE_TYPES[d.type]
  if (spec.weapons) {
    // fires from the orbit or while transiting — not once committed to RTB/striking
    if (d.state !== 'onstation' && d.state !== 'transit') return toast(d.label + ' NOT ON STATION')
    if (d.ammo <= 0) return toast(d.label + ' WINCHESTER — NO ORDNANCE')
    if (Math.hypot(d.x - x, d.y - y) > spec.weapons.range) return toast('TARGET OUTSIDE WEAPON RANGE')
    d.ammo--
    const impactT = S.t + spec.weapons.flight
    S.shells.push({
      fromX: d.x, fromY: d.y, x, y,
      impactT,
      dmg: spec.weapons.dmg, blast: spec.weapons.blast, side: 'friend',
      splashFrom: d.label,
    })
    d.strikeMark = { x, y, until: impactT }
    radio(d.label, 'fires', `RIFLE — TGT GRID ${grid(x, y)}, ${d.ammo} AGM REMAINING`, x, y)
  } else if (spec.kamikaze) {
    if (d.state !== 'onstation' && d.state !== 'transit') return
    d.state = 'striking'
    d.sx = x; d.sy = y
    d.strikeMark = { x, y, until: S.t + 30 } // cleared on impact when the drone despawns
    radio(d.label, 'fires', `TERMINAL ATTACK — GRID ${grid(x, y)}`, x, y)
  }
}

// --- viewer target designation (per-vic) ---
// the player clicks individual vics/troops in the UAV feed to build a target set,
// then presses FIRE. targets track the specific element so a moving vic stays marked.
export function droneToggleTarget(droneId: number, unitId: number, ei: number): void {
  const d = S.drones.find(d => d.id === droneId)
  if (!d) return
  const spec = DRONE_TYPES[d.type]
  // any drone can designate a target in its feed — armed drones use it to FIRE,
  // every drone can use it to FOLLOW. Selecting is silent for unarmed sensors.
  const armed = spec.weapons || spec.kamikaze || spec.gunship
  if (!d.targets) d.targets = []
  const i = d.targets.findIndex(t => t.unitId === unitId && t.ei === ei)
  if (i >= 0) { d.targets.splice(i, 1); return }
  const wasEmpty = !d.targets.length
  d.targets.push({ unitId, ei })
  // first target of an engagement on an armed platform → request permission to fire
  if (wasEmpty && armed) {
    const p = targetPoint({ unitId, ei })
    if (p) radio(d.label, 'fires', `TARGET LOCKED — GRID ${grid(p.x, p.y)}, REQUEST PERMISSION TO ENGAGE`, p.x, p.y)
  }
}

export function droneClearTargets(droneId: number): void {
  const d = S.drones.find(d => d.id === droneId)
  if (d) d.targets = []
}

// release ordnance against every designated vic (one munition each) until winchester.
// the target set is NOT cleared — reticles stay put; targets drop only when destroyed.
export function droneFire(droneId: number): void {
  const d = S.drones.find(d => d.id === droneId)
  if (!d) return
  const spec = DRONE_TYPES[d.type]
  if (spec.gunship) return gunshipHowitzerFire(d) // manual round on the selected big gun
  if (!d.targets || !d.targets.length) return
  const live = d.targets.filter(t => targetPoint(t))
  if (!live.length) return
  if (spec.kamikaze) {
    // one-shot airframe: dive on the first designated vic
    const p = targetPoint(live[0]!)!
    droneStrike(droneId, p.x, p.y)
    return
  }
  // weapons drone: service targets in order, one AGM per vic, stop when out
  for (const t of live) {
    if (d.ammo <= 0) break
    const p = targetPoint(t)!
    droneStrike(droneId, p.x, p.y)
  }
}
