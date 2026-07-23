// Feed audio: only for events on this sensor's footprint, each sounded once.
// Guns THUD when fired (deeper for bigger guns); rounds land as a quieter deep
// rumble. A muted feed skips the whole pass rather than silencing the calls —
// the `_snd` flags are one-shot and GLOBAL, so consuming them here would rob
// any other open (unmuted) feed of the same event.
// Extracted verbatim from src/drone/DroneView.jsx's useFrame audio block.
import { S } from '../engine/state'
import { muzzle, rumble, gunfire, audioReady } from '../audio/audio'
import { UNIT_TYPES } from '../domains/forces/catalog'
import type { FeedState } from './DroneCamera'

export function playFeedAudio(feed: FeedState, muted: boolean): void {
  if (!audioReady() || muted) return
  const { cx, cy } = feed
  const R = feed.viewR || 500
  // firing reports — cannon rounds, as they leave the (off-screen) aircraft
  for (const r of S.gunRounds) {
    if (r._snd || S.t - r.t0 > 0.2) continue
    if (Math.hypot(r.x - cx, r.y - cy) > R) continue
    r._snd = true
    const s = Math.min(1.9, Math.max(0.8, r.flash || 1)) // 25mm ~1.0, 40mm ~1.7
    muzzle(0.26 + (s - 1) * 0.30, 108 - (s - 1) * 58)     // bigger gun = louder + deeper
  }
  // firing report — 105mm howitzer (deepest thud)
  for (const sh of S.shells) {
    if (!sh.bigGun || sh._snd || sh.t0 == null || S.t - sh.t0 > 0.2) continue
    if (Math.hypot(sh.x - cx, sh.y - cy) > R) continue
    sh._snd = true
    muzzle(0.7, 46)
  }
  // impacts — deep rumble at roughly half the firing volume
  for (const im of S.impacts) {
    if (im._snd || S.t - im.t > 0.25) continue
    const dd = Math.hypot(im.x - cx, im.y - cy)
    if (dd > R) continue
    im._snd = true
    const vol = Math.max(0.2, 1 - dd / R)
    if (im.gun) {
      const s = Math.min(1.9, Math.max(0.8, im.sz || 1))
      // ~0.7x the firing thud so impacts stay at least half as loud, but deeper
      rumble(vol * (0.26 + (s - 1) * 0.30) * 0.7, (108 - (s - 1) * 58) * 0.66)
    } else {
      rumble(vol * 0.55, 42) // shell / HE — big deep rumble
    }
  }
  // ground-unit weapons fire — a firefight in view should be audible, but muffled.
  // combat is DPS-based (no per-shot event), so we sound a burst per firing unit,
  // throttled per unit so a big contact doesn't machine-gun the mixer.
  for (const u of S.units) {
    if (u.strength <= 0 || u.lastFiredT == null || S.t - u.lastFiredT > 0.5) continue
    const dd = Math.hypot(u.x - cx, u.y - cy)
    if (dd > R) continue
    const heavy = (UNIT_TYPES[u.type]?.soft ?? 1) < 0.4   // armor/vehicle guns vs small arms
    const gap = heavy ? 1.3 : 0.7
    if (u._sndFireT != null && S.t - u._sndFireT < gap) continue
    u._sndFireT = S.t
    const vol = Math.max(0.15, 1 - dd / R)
    gunfire((heavy ? 0.12 : 0.085) * vol, heavy)
  }
}
