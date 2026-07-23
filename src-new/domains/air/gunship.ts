// The AC-130 gun suite: weapon selection, fire modes, the manual 105, and the
// per-tick automatic guns. Ported verbatim from src/game/sim.js.
//
// PARITY NOTE: burst length, inter-burst gap and dispersion use raw
// Math.random() on purpose — the golden harness seeds Math.random globally, so
// old and new must consume the identical sequence. S.rng re-routing is
// post-migration cleanup.
import { S } from '../../engine/state'
import type { Drone, GunFireMode } from '../../engine/GameState'
import { clampWorld } from '../../world/place'
import { DRONE_TYPES, type DroneType } from './catalog'
import { targetPoint } from './targeting'
import { elemExposed, elemWorld } from '../forces/elements'
import { toast, radio } from '../comms/radio'
import { grid } from '../../lib/format'

export function gunshipSelectWeapon(droneId: number, key: string): void {
  const d = S.drones.find(d => d.id === droneId)
  const g = d && DRONE_TYPES[d.type].gunship
  if (!d || !g || !g.weapons[key]) return
  d.gunSel = key
}

export function gunshipSetMode(droneId: number, mode: GunFireMode): void {
  const d = S.drones.find(d => d.id === droneId)
  if (d) d.fireMode = mode
}

// manual fire for the selected howitzer: one round per designated vic, until winchester
export function gunshipHowitzerFire(d: Drone): void {
  const g = DRONE_TYPES[d.type].gunship!
  const w = d.gunSel != null ? g.weapons[d.gunSel] : undefined
  if (!w || w.kind !== 'howitzer') return
  if (!d.targets || !d.targets.length) return
  const live = d.targets.filter(t => targetPoint(t))
  for (const t of live) {
    if ((d.gunAmmo![d.gunSel!] || 0) <= 0) { toast(d.label + ' — ' + w.short + ' WINCHESTER'); break }
    const p = targetPoint(t)!
    if (Math.hypot(d.x - p.x, d.y - p.y) > w.range) continue
    d.gunAmmo![d.gunSel!]--
    const m105 = gunMuzzle(d, DRONE_TYPES[d.type])
    S.shells.push({
      fromX: m105.x, fromY: m105.y, x: p.x, y: p.y,
      impactT: S.t + w.flight, dmg: w.dmg, blast: w.blast, side: 'friend', splashFrom: d.label,
      t0: S.t, bigGun: true, // firing-report cue for feed audio (deepest thud)
    })
    d.strikeMark = { x: p.x, y: p.y, until: S.t + w.flight }
    radio(d.label, 'fires', `SHOT — ${w.short} GRID ${grid(p.x, p.y)}`, p.x, p.y)
  }
}

// Where the gunship's rounds leave the airframe: directly BELOW the sensor. A point
// straight under the camera projects onto the frame's vertical centre-line, below the
// aim point, at every bearing and altitude — so tracers always depart from bottom-centre
// of the feed like a gun camera, instead of wandering with the orbit geometry. (A lateral
// offset was tried first and projected ABOVE the sight line — top of frame — because the
// steep look-down angle drops faster than any plausible muzzle drop.)
export function gunMuzzle(d: Drone, spec: DroneType): { x: number; y: number; alt: number } {
  return { x: d.x, y: d.y, alt: Math.max(20, spec.alt * (d.altMul || 1) - 10) }
}

// the gunship flies a pylon turn with the guns pointed inboard, so it can only
// engage the killbox INSIDE its orbit ring — not everything within gun range. The
// bound matches the drawn orbit ring exactly (no margin) so nothing outside the
// visible circle is ever acquired.
function inKillbox(d: Drone, x: number, y: number): boolean {
  const spec = DRONE_TYPES[d.type]
  const oR = spec.orbitR * (d.orbitMul || 1)
  return Math.hypot(x - d.tx, y - d.ty) <= oR
}

// nearest visible hostile vic/troop inside the turn and within range (weapons-free acquire)
function gunshipAcquire(d: Drone, range: number): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null, bd = range
  for (const u of S.units) {
    if (u.side === 'friend' || u.strength <= 0 || !u.elements) continue
    if (S.fogEnabled) { const c = S.contacts.get(u.id); if (!c || !c.live) continue }
    for (const el of u.elements) {
      if (!el.alive || !elemExposed(u, el)) continue
      const w = elemWorld(u, el)
      if (!inKillbox(d, w.x, w.y)) continue          // only inward of the turn
      const dd = Math.hypot(w.x - d.x, w.y - d.y)
      if (dd < bd) { bd = dd; best = { x: w.x, y: w.y } }
    }
  }
  return best
}

// per-tick automatic gun fire for the selected 25mm/40mm gun by its fire mode
export function updateGunship(d: Drone, dt: number): void {
  const spec = DRONE_TYPES[d.type]
  const g = spec.gunship!
  const w = d.gunSel != null ? g.weapons[d.gunSel] : undefined
  if (!w || w.kind !== 'gun') return           // howitzer is manual only
  if (d.fireMode === 'hold' || !d.fireMode) return
  if ((d.gunAmmo![d.gunSel!] || 0) <= 0) return
  d.gunCd = (d.gunCd || 0) - dt
  if (d.gunCd > 0) return
  let aim: { x: number; y: number } | null = null
  if (d.fireMode === 'will') {
    aim = gunshipAcquire(d, w.range)           // engage anything visible in range
  } else if (d.fireMode === 'designated') {
    // the player explicitly picked these vics, so engage them anywhere in range —
    // the inboard-of-the-turn restriction only governs weapons-free acquisition
    let bd = w.range
    for (const t of (d.targets || [])) {
      const p = targetPoint(t); if (!p) continue
      const dd = Math.hypot(p.x - d.x, p.y - d.y)
      if (dd <= bd) { bd = dd; aim = p }
    }
  }
  if (!aim) { d.burstLeft = 0; return }   // nothing to shoot — end any burst in progress
  // fire in bursts, not a continuous stream: N rounds at ROF, then an inter-burst pause
  if (!(d.burstLeft! > 0)) {
    d.burstLeft = w.burst[0] + Math.floor(Math.random() * (w.burst[1] - w.burst[0] + 1))
  }
  d.gunAmmo![d.gunSel!]--
  d.burstLeft!--
  // within a burst rounds come at the ROF; after the last round hold for the gap
  d.gunCd = d.burstLeft! > 0 ? 1 / w.rof : w.gap + Math.random() * 0.5
  // dispersed aim: Gaussian scatter (sum of uniforms) — area fire, never pinpoint
  const gs = () => (Math.random() + Math.random() + Math.random() - 1.5) * (2 / 1.5)
  let dx0 = aim.x + gs() * w.disp, dy0 = aim.y + gs() * w.disp
  // keep every round inside the visible orbit ring: the gunship only brings guns to
  // bear inboard of its pylon turn, so dispersion can't fling a round past the ring
  const oR = spec.orbitR * (d.orbitMul || 1)
  const rdx = dx0 - d.tx, rdy = dy0 - d.ty, rd = Math.hypot(rdx, rdy)
  if (rd > oR) { const k = oR / rd; dx0 = d.tx + rdx * k; dy0 = d.ty + rdy * k }
  const ix = clampWorld(S.map, dx0)
  const iy = clampWorld(S.map, dy0)
  // ballistic round from the (moving) aircraft muzzle; time-of-flight forces lead,
  // damage/flash resolve on impact, not at the trigger pull.
  const m = gunMuzzle(d, spec)
  const dist = Math.hypot(ix - m.x, iy - m.y, m.alt)
  S.gunRounds.push({
    fromX: m.x, fromY: m.y, mAlt: m.alt, x: ix, y: iy,
    t0: S.t, impactT: S.t + dist / w.muzzleV,
    blast: w.blast, dmg: w.dmg, flash: w.flash, ap: w.ap || 1,
  })
  if (S.gunRounds.length > 260) S.gunRounds.shift()
}
