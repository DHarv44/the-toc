// FOLLOW THE LEADER — leader/follower station-keeping, solved once per tick.
//
// Two axes, solved independently:
//   along   distance travelled down the route. Pace, catch-up, the leader
//           easing off, the leader stopping for a straggler.
//   lat     signed offset from the route centreline (+ = LEFT, matching the
//           body-frame convention the formation catalog is authored in). Shape.
//
// It knows nothing about what a mover is. A mover is a point with an odometer,
// a speed and a speed ceiling — so the same solver runs the vics inside a
// platoon and the platoons inside a battalion column, which is the whole point.
// Nothing here is stateful: everything it needs comes in, everything it decides
// goes out, and the caller integrates.
//
// The odometer MUST be monotonic. Feed it a wrapped or reprojected value and
// lag explodes the moment a mover crosses the seam.
//
// THERE IS NO TRANSITION SYSTEM, and that is deliberate. Changing the slot
// table changes nothing but the slot table; every mover's lag and lateral error
// take an instantaneous step, and the same two controllers that absorb a
// straggler on a muddy hill absorb that step. So a formation change is
// interruptible on any tick, needs no sequencing from the caller, and has no
// state to unwind. Switch column -> wedge -> line on three consecutive ticks
// and it stays stable.

export interface Mover {
  id: number
  dist: number       // odometer along the shared route, metres. MONOTONIC.
  spd: number        // current speed, m/s
  maxSpd: number     // nominal top speed on clean ground, m/s. Terrain does NOT
                     // belong here — see the note on `mobility` below.
  lat?: number       // current offset from the centreline, metres, + = LEFT
  accel?: number     // m/s^2; absent = instant
  decel?: number
  latRate?: number   // m/s of sideways slew; absent = opts.maxLatRate
  out?: boolean      // dead, detached, dismounted — dropped from the solve
                     // entirely, so the group stops waiting for it
}

// One station in the group's body frame. `along` negative is behind the leader,
// `lat` positive is to its left, `face` is radians off the direction of travel
// and is only ever non-zero in a halt posture.
export interface Slot { along: number; lat: number; face: number }

export interface FollowOpts {
  minGap: number        // hard floor between movers sharing a lane, metres
  laneWidth: number     // lateral separation still counted as "the same lane"
  deadband: number      // along-axis slack; residual group stretch ~= this
  latDeadband: number
  easeLag: number       // leader starts easing past this much lag, metres
  stopLag: number       // leader stops past this much
  resumeLag: number     // and moves again below this (hysteresis)
  stopFloor: number     // stop outright rather than crawl below this × pace
  paceMargin: number    // fraction of the SLOWEST mover's top speed
  catchUpGain: number   // along-axis P gain
  closeTime: number     // seconds to bleed off a spacing violation
  latGain: number       // lateral P gain
  maxLatRate: number    // default sideways slew, m/s
  maxReverse: number    // backing into a slot behind you while moving
  repositionSpd: number // reverse allowance in a HALT posture. Without it a
                        // mover ahead of its new slot can never reach it: the
                        // leader is stopped, so the slot never catches up.
  shiftFactor: number   // pace multiplier while the shape is still shifting
  speedLimit: number    // route-imposed cap on the whole group
  // Speed multiplier for a mover at a lateral offset, 0..1. This belongs INSIDE
  // the solver because the solver CHOOSES the lateral offset, so it has to
  // price it: a wide formation that pushes vics off the road slows the group by
  // itself. Costs the solver does NOT control — mud, damage, a blown bridge —
  // stay outside: cap the achieved speed after the order and let the lag loop
  // react. Model the cost you cause, measure the cost you don't.
  mobility: ((m: Mover, lat: number) => number) | null
}

export const FOLLOW_DEFAULTS: FollowOpts = {
  minGap: 14,
  laneWidth: 18,
  deadband: 6,
  latDeadband: 3,
  easeLag: 30,
  stopLag: 90,
  resumeLag: 25,
  stopFloor: 0.15,
  paceMargin: 0.9,
  catchUpGain: 0.9,
  closeTime: 1.0,
  latGain: 1.6,
  maxLatRate: 6,
  maxReverse: 0,
  repositionSpd: 3,
  shiftFactor: 0.8,
  speedLimit: Infinity,
  mobility: null,
}

// Safe to drive a readout or an animation straight off.
export type FollowStatus =
  | 'pacing' | 'easing' | 'stopped'          // the leader
  | 'in-slot' | 'closing' | 'max-speed'      // a follower keeping up, or not
  | 'holding-back' | 'blocked' | 'shifting'
  | 'off-track' | 'repositioning'
  | 'stopping' | 'in-place'                  // settling into a halt posture

export interface Order {
  index: number         // back into the caller's array
  status: FollowStatus
  spd: number           // THE ORDER. Accel-limited target speed, m/s.
  targetSpd: number     // pre-accel-limit desire; diagnostic
  latSpd: number        // sideways slew rate, m/s — the caller integrates it
  lag: number           // metres behind station. Positive = behind. The signal
                        // everything else is derived from.
  latErr: number
  gapAhead: number | null
  mobility: number
  topSpd: number
  face: number          // radians off direction of travel
}

export interface GroupState {
  pace: number          // what the whole group is being held to
  leaderTarget: number
  worstLag: number
  worstId: number | null
  slowestId: number | null
  minMobility: number
  formed: boolean       // everyone on station, within a band
  spread: number        // odometer front to back
  halted: boolean       // this is a halt posture, not a march
  holding: boolean      // the leader is stopped waiting on the tail
}

export interface FollowInput {
  movers: readonly Mover[]        // index 0 is the LEADER and the position
                                  // reference — not necessarily the front vic
  slots: readonly Slot[]          // parallel to `movers`. Slots are assigned by
                                  // INDEX and the solver never reassigns them:
                                  // reorder the array yourself if you want a
                                  // cheaper assignment, and it takes effect on
                                  // the next tick with no special handling.
  dt: number
  halt?: boolean                  // a coil or a herringbone: the leader holds
                                  // position and everyone forms around it
  holding?: boolean               // last tick's value — the stop hysteresis
                                  // does not work without it
  opts?: Partial<FollowOpts>
}

export interface FollowResult {
  orders: Order[]                 // parallel to `movers`; dropped movers get null
  holding: boolean
  group: GroupState
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

const EMPTY: GroupState = {
  pace: 0, leaderTarget: 0, worstLag: 0, worstId: null, slowestId: null,
  minMobility: 1, formed: true, spread: 0, halted: false, holding: false,
}

export function mobilityAt(m: Mover, lat: number, opts: FollowOpts): number {
  return opts.mobility ? clamp(opts.mobility(m, lat), 0, 1) : 1
}

export function followTheLeader(input: FollowInput): FollowResult {
  const opt: FollowOpts = input.opts ? { ...FOLLOW_DEFAULTS, ...input.opts } : FOLLOW_DEFAULTS
  const all = input.movers
  const dt = input.dt
  const halt = !!input.halt

  // Live movers only, but slots stay bound to the ORIGINAL index: a platoon
  // that loses its number three does not re-pack the survivors into a tighter
  // wedge, it drives on with a hole where the vic was.
  const live: number[] = []
  for (let i = 0; i < all.length; i++) if (!all[i]!.out) live.push(i)
  const orders: Order[] = new Array(all.length)
  if (!live.length) return { orders, holding: false, group: EMPTY }

  const lead = all[live[0]!]!
  const leadSlot = input.slots[live[0]!]!

  // 1. Error on both axes, measured off the leader.
  const lag = new Map<number, number>()
  const latErr = new Map<number, number>()
  const mob = new Map<number, number>()
  const top = new Map<number, number>()
  let slowest = Infinity, slowestId: number | null = null
  let worstLag = 0, worstId: number | null = null
  let formed = true, shifting = false
  const bandA = opt.deadband * 1.5, bandL = opt.latDeadband * 1.5
  for (const i of live) {
    const m = all[i]!, s = input.slots[i]!
    const l = i === live[0] ? 0 : lead.dist + (s.along - leadSlot.along) - m.dist
    const le = s.lat - (m.lat ?? 0)
    lag.set(i, l); latErr.set(i, le)
    const mo = mobilityAt(m, m.lat ?? 0, opt)
    const t = m.maxSpd * mo
    mob.set(i, mo); top.set(i, t)
    if (t < slowest) { slowest = t; slowestId = m.id }
    if (l > worstLag) { worstLag = l; worstId = m.id }
    // A slightly wider band than the control deadband, or movers parked on its
    // edge keep the group flagged unformed forever and it never gets its pace
    // back.
    if (Math.abs(le) > bandL) { shifting = true; formed = false }
    else if (Math.abs(l) > bandA) formed = false
  }

  // 2. Pace is set by the SLOWEST mover, not the leader — and by what that
  //    mover can do where the formation has put it.
  let pace = Math.min(slowest * opt.paceMargin, opt.speedLimit)
  // Ease off while the shape is still shifting sideways. Along-axis lag is
  // deliberately NOT folded in here: it has its own graduated response below,
  // and coupling both into one threshold produces a limit cycle — closing the
  // gap flips `formed`, which raises the pace, which reopens the gap.
  if (shifting) pace *= opt.shiftFactor

  // 3. Leader throttle: ease on lag, stop on too much of it, hysteresis out.
  let holding = !!input.holding
  if (worstLag >= opt.stopLag) holding = true
  else if (worstLag <= opt.resumeLag) holding = false

  let leaderTarget: number, leaderStatus: FollowStatus
  if (halt) {
    leaderTarget = 0
    leaderStatus = formed ? 'in-place' : 'stopping'
    holding = false
  } else if (holding) {
    leaderTarget = 0
    leaderStatus = 'stopped'
  } else if (worstLag <= opt.easeLag) {
    leaderTarget = pace
    leaderStatus = 'pacing'
  } else {
    const t = clamp((worstLag - opt.easeLag) / (opt.stopLag - opt.easeLag), 0, 1)
    leaderTarget = pace * (1 - t)
    leaderStatus = 'easing'
    // a pure ramp asymptotes into a crawl; below the floor, commit to the stop
    if (leaderTarget < pace * opt.stopFloor) {
      leaderTarget = 0; leaderStatus = 'stopped'; holding = true
    }
  }

  // 4. Solve front to back by actual position, so the don't-overrun cap always
  //    has the COMMANDED speed of whoever is ahead rather than last tick's.
  const order = live.slice().sort((a, b) => all[b]!.dist - all[a]!.dist)
  const cmd = new Map<number, number>()

  const li = live[0]!
  leaderTarget = clamp(leaderTarget, 0, top.get(li)!)
  cmd.set(li, accelLimit(lead, leaderTarget, dt))
  orders[li] = pack(li, leaderStatus, leaderTarget, cmd.get(li)!, 0, null,
    leadSlot, latErr.get(li)!, latSlew(lead, latErr.get(li)!, opt, mob.get(li)!),
    mob.get(li)!, top.get(li)!)

  const EPS = 1e-6
  for (const i of order) {
    if (i === li) continue
    const m = all[i]!, s = input.slots[i]!
    const l = lag.get(i)!, t = top.get(i)!
    let target = leaderTarget
    let status: FollowStatus = 'in-slot'

    if (l > opt.deadband + EPS) {
      target = leaderTarget + opt.catchUpGain * (l - opt.deadband)
      status = 'closing'
    } else if (l < -opt.deadband - EPS) {
      target = leaderTarget + opt.catchUpGain * (l + opt.deadband)
      status = 'holding-back'
    }

    // Don't overrun whoever is ahead of you IN YOUR OWN LANE. The check reads
    // LIVE lateral, not slot lateral — so the moment a mover has slewed clear
    // it stops being blocked, which is what lets a column fan out into line
    // instead of jamming against itself.
    let gapAhead: number | null = null, cap = Infinity
    for (const j of order) {
      if (j === i) continue
      const o = all[j]!
      if (Math.abs((o.lat ?? 0) - (m.lat ?? 0)) > opt.laneWidth) continue
      if (o.dist <= m.dist) continue
      if (input.slots[j]!.along <= s.along) continue   // that one is the yielder
      const g = o.dist - m.dist
      if (gapAhead === null || g < gapAhead) {
        gapAhead = g
        cap = Math.max(0, (cmd.get(j) ?? o.spd) + (g - opt.minGap) / opt.closeTime)
      }
    }
    if (cap < target) {
      target = cap
      if (gapAhead !== null && gapAhead < opt.minGap * 2) status = 'blocked'
    }

    const reverse = halt ? Math.max(opt.maxReverse, opt.repositionSpd) : opt.maxReverse
    target = clamp(target, -reverse, t)
    const le = latErr.get(i)!
    if (status === 'closing' && target >= t - EPS && l > opt.easeLag) status = 'max-speed'
    if (status === 'in-slot' && mob.get(i)! < 1 && Math.abs(le) <= opt.latDeadband) status = 'off-track'
    if (status === 'in-slot' && Math.abs(le) > opt.latDeadband + EPS) status = 'shifting'
    if (target < 0) status = 'repositioning'
    if (leaderStatus === 'stopped' && target <= 0) status = 'stopped'
    if (halt && Math.abs(l) <= bandA && Math.abs(le) <= bandL) status = 'in-place'

    cmd.set(i, accelLimit(m, target, dt))
    orders[i] = pack(i, status, target, cmd.get(i)!, l, gapAhead, s, le,
      latSlew(m, le, opt, mob.get(i)!), mob.get(i)!, t)
  }

  let lo = Infinity, hi = -Infinity
  for (const i of live) { const d = all[i]!.dist; if (d < lo) lo = d; if (d > hi) hi = d }

  return {
    orders,
    holding,
    group: {
      pace, leaderTarget, worstLag, worstId, slowestId,
      minMobility: Math.min(...mob.values()),
      formed, spread: hi - lo, halted: halt, holding,
    },
  }
}

function pack(
  index: number, status: FollowStatus, targetSpd: number, spd: number,
  lag: number, gapAhead: number | null, slot: Slot, latErr: number,
  latSpd: number, mobility: number, topSpd: number,
): Order {
  return {
    index, status, spd, targetSpd, latSpd, lag, latErr, gapAhead,
    mobility, topSpd, face: slot.face,
  }
}

function latSlew(m: Mover, err: number, opt: FollowOpts, mobility: number): number {
  const rate = (m.latRate ?? opt.maxLatRate) * mobility
  return clamp(opt.latGain * err, -rate, rate)
}

function accelLimit(m: Mover, target: number, dt: number): number {
  const up = m.accel == null ? Infinity : m.accel * dt
  const down = m.decel == null ? Infinity : m.decel * dt
  return clamp(target, m.spd - down, m.spd + up)
}
