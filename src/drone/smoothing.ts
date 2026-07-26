// FEED SMOOTHING — the picture is eased; the sim never is.
//
// The sim ticks at 20 Hz (SimLoop's 50 ms interval) and the feed draws at the
// display's rate, usually 60. Read straight off sim state, anything that moves
// gets three identical frames and then a jump. It reads worse than it sounds,
// because the CAMERA does it too: the drone's own position steps at 20 Hz, so
// the entire world shears sideways three frames at a time.
//
// So the render layer keeps its own pose for each moving thing and eases it
// toward the sim's. NOTHING the game reasons about is touched — combat ranges,
// sensing, where a pinpoint strike lands all still use the exact tick
// positions. Only the picture lags, by about a frame and a half, which is well
// under what an eye picks up on a downlink.
//
// The ease is exponential, so it is frame-rate independent (a 30 Hz display and
// a 144 Hz one converge at the same rate in real time) and it degrades
// gracefully: pause the sim and the picture simply settles.

// closes ~63% of the remaining gap every 1/RATE seconds — a 62 ms time
// constant, a bit over one sim tick
const RATE = 16

// Turn rates. The sim assigns heading outright — atan2 at the next waypoint,
// no rate limit — so a unit reaching a corner changes its axis of advance in
// one 50 ms tick and the whole formation lattice swings with it. Nothing on a
// battlefield turns like that, so the render layer imposes a plausible rate.
// These only ever CLAMP: give the sim real turn rates and they stop mattering.
const FORM_TURN = 0.55   // rad/s — how fast a unit swings its formation frame
const VEH_TURN = 1.1     // rad/s — how fast one hull comes round

// Furthest, in metres, a drawn vehicle may sit from its true station. Combat
// kills the vic at the SIM position, so the picture is not allowed to wander.
const LAG_MAX = 45

const k = (dt: number) => 1 - Math.exp(-RATE * Math.min(0.25, dt))

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

export interface Pose { x: number; y: number; heading: number }

// Ease a pose toward where the sim says it is. A move bigger than `snap` is not
// movement — it is a spawn, a mount, a teleport — and sliding across the map to
// meet it would look far worse than the jump; those land instantly.
export function easePose(
  p: Pose, x: number, y: number, heading: number, dt: number, snap = 80, turn = 0,
): void {
  if (Math.abs(x - p.x) > snap || Math.abs(y - p.y) > snap) {
    p.x = x; p.y = y; p.heading = heading
    return
  }
  const a = k(dt)
  p.x += (x - p.x) * a
  p.y += (y - p.y) * a
  // shortest way round, so a vehicle crossing due west turns through a few
  // degrees rather than spinning the long way
  let d = wrap(heading - p.heading) * a
  if (turn) { const lim = turn * dt; d = Math.max(-lim, Math.min(lim, d)) }
  p.heading += d
}

// Per-unit render poses. Units die and battle groups re-form, so entries that
// stop being asked for are swept rather than left to accumulate.
export function makePoseCache() {
  const m = new Map<number, Pose & { seen: number }>()
  let frame = 0
  return {
    // call once per drawn unit, per frame
    pose(id: number, x: number, y: number, heading: number, dt: number): Pose {
      let p = m.get(id)
      if (!p) { p = { x, y, heading, seen: frame }; m.set(id, p) }
      else { easePose(p, x, y, heading, dt, 80, FORM_TURN); p.seen = frame }
      return p
    },
    // call once per frame, after drawing
    sweep(): void {
      frame++
      if (frame % 600 !== 0) return // ~every 10 s
      for (const [id, p] of m) if (frame - p.seen > 600) m.delete(id)
    },
  }
}

// Per-ELEMENT render poses.
//
// The formation offsets don't give a vehicle a position — they give it a
// STATION, the slot it is trying to be in. Drawing it AT that slot is what
// makes a platoon look like one rigid object: turn the unit and every vic
// translates on a rail, all of them pointing the same way, none of them
// behaving like a driver. So the drawn vic chases its station instead of being
// pinned to it, and its hull points where IT is going rather than where its
// unit is going. A turn now deforms the formation — trail vics swing wide, cut
// back in, and settle — which is what a column doing a left turn looks like
// from 3000 feet.
//
// This is cosmetic and deliberately so: nothing is written back, and the vic
// combat kills is still the vic at the sim station (LAG_MAX bounds how far the
// two may disagree). It is also the shape a real per-element sim layer would
// feed, so when elements gain positions of their own this reads them unchanged.
export function makeElemPoses() {
  const m = new Map<number, Pose & { seen: number }>()
  let frame = 0
  return {
    // `key` must be stable per element; `face` is the fallback heading for a
    // vic that has not moved far enough to have a direction of its own yet
    pose(key: number, x: number, y: number, face: number, dt: number): Pose {
      let p = m.get(key)
      if (!p) { p = { x, y, heading: face, seen: frame }; m.set(key, p); return p }
      p.seen = frame
      // a station that jumped this far is a re-form or a mount, not a drive
      if (Math.abs(x - p.x) > 300 || Math.abs(y - p.y) > 300) {
        p.x = x; p.y = y; p.heading = face
        return p
      }
      const ox = p.x, oy = p.y
      const a = k(dt)
      p.x += (x - p.x) * a
      p.y += (y - p.y) * a
      const gx = x - p.x, gy = y - p.y
      const gap = Math.hypot(gx, gy)
      if (gap > LAG_MAX) { p.x = x - gx / gap * LAG_MAX; p.y = y - gy / gap * LAG_MAX }
      // Hull follows its own track. Below a walking pace there is no track to
      // read, so a halted vic holds the heading it stopped on rather than
      // spinning on numerical noise.
      const mx = p.x - ox, my = p.y - oy
      if (Math.hypot(mx, my) > dt * 0.6) {
        const lim = VEH_TURN * dt
        const d = wrap(Math.atan2(my, mx) - p.heading)
        p.heading += Math.max(-lim, Math.min(lim, d))
      }
      return p
    },
    sweep(): void {
      frame++
      if (frame % 600 !== 0) return
      for (const [key, p] of m) if (frame - p.seen > 600) m.delete(key)
    },
  }
}
