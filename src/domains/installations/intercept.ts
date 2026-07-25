// Point-defense INTERCEPT verb (#14 / ASSET-REQUESTS.md): emplaced systems
// whose facility spec carries an `intercept` effect engage inbound indirect
// rounds whose impact falls inside their radius. The engine knows only the
// SPEC (targets/radius/pk/rof/sound) — never a system's name.
//
// Honest limits: engagements are budgeted by the spec's rof (a big enough
// salvo SATURATES the system), each round gets ONE deterministic hash roll
// (no rng stream — golden-safe), and only shells with a nature the spec
// targets are engageable. Runs BEFORE ballistics so a killed round never
// lands.
//
// This module also raises the TOC's base-under-fire cues (UI-only bus
// events, no state): the INCOMING alarm when rounds are inbound on the
// commander's CP, and per-impact proximity events for the boom + shake.
import { S, bus } from '../../engine/state'
import { FACILITIES, type InterceptEffect } from './catalog'
import { hashStr } from '../../lib/math'
import { radio } from '../comms/radio'

const ENGAGE_WINDOW = 2.5   // terminal seconds of flight the system can engage in
const MIN_ENGAGE = 0.3      // too late — the round is already in
const CP_ALERT_RADIUS = 1100 // inbound inside this of the CP = the TOC hears the alarm
const BUDGET_CAP = 3        // stored engagements (bursts) a system can bank

let lastPingT = -999        // UI cadence only (module-local, never state)

function interceptSpec(stFacilities: readonly string[] | undefined): InterceptEffect | null {
  for (const k of stFacilities ?? []) {
    const fx = FACILITIES[k]?.effects.intercept
    if (fx) return fx
  }
  return null
}

export function interceptUpdate(dt: number): void {
  if (!S.shells.length) return
  const hq = S.structures.find(s => s.side === 'friend' && s.kind === 'HQ')

  // --- the TOC hears it coming: radar alarm + impact cues (UI-only) ---------
  // The alarm is a RADAR STATE, not a per-round chirp: while ANY hostile
  // round is tracked inbound on the CP, a detection ping goes out about once
  // a second — the audio layer loops the siren off these pings and lets it
  // run 10 s past the last one. One alarm per attack, however many rounds.
  if (hq) {
    let eta = Infinity
    for (const sh of S.shells) {
      if (sh.side !== 'hostile') continue
      const d = Math.hypot(sh.x - hq.x, sh.y - hq.y)
      if (d > CP_ALERT_RADIUS) continue
      eta = Math.min(eta, sh.impactT - S.t)
      // this round lands within the tick: boom + shake, harder when closer
      if (sh.impactT <= S.t + dt && !sh._snd) {
        bus.emit('baseimpact', { prox: Math.max(0, 1 - d / CP_ALERT_RADIUS) })
      }
    }
    if (isFinite(eta) && S.t - lastPingT > 0.9) {
      lastPingT = S.t
      bus.emit('incoming', { eta: Math.max(0, eta) })
    }
  }

  // --- the intercept verb ---------------------------------------------------
  for (const st of S.structures) {
    if (st.buildT > 0) continue
    const fx = interceptSpec(st.side === 'friend' ? st.facilities : undefined)
    if (!fx) { st.intBudget = 0; continue }
    st.intBudget = Math.min(BUDGET_CAP, (st.intBudget ?? 0) + fx.rof * dt)
    for (let i = S.shells.length - 1; i >= 0; i--) {
      const sh = S.shells[i]!
      if (sh.side === st.side || sh._int) continue
      // engageable natures only: today every ShellKind round is INDIRECT
      // class; drone AGMs (no `shell` field) are too fast for this system.
      // The ammo-natures rework (HARDCODE-AUDIT item 0) makes this a real
      // class lookup instead of a field heuristic.
      if (!sh.shell || !fx.targets.includes('INDIRECT')) continue
      if (Math.hypot(sh.x - st.x, sh.y - st.y) > fx.radius) continue
      const tt = sh.impactT - S.t
      if (tt > ENGAGE_WINDOW || tt < MIN_ENGAGE) continue
      if (st.intBudget < 1) continue // saturated — this round gets through
      st.intBudget -= 1
      sh._int = true
      const roll = (Math.abs(hashStr(
        `int:${st.id}:${sh.x.toFixed(0)}:${sh.y.toFixed(0)}:${sh.impactT.toFixed(2)}`)) % 1000) / 1000
      const kill = roll < fx.pk
      // the burst fires either way — tracers into the sky over the base
      bus.emit('intercept', {
        x: st.x, y: st.y, tx: sh.x, ty: sh.y, kill,
        sound: fx.sound ?? null,
      })
      if (S.t - (st.lastIntT ?? -999) > 20) {
        st.lastIntT = S.t
        radio(st.label, 'fires', 'POINT DEFENSE ENGAGING — INCOMING INDIRECT OVER THE BASE', st.x, st.y)
      }
      if (kill) {
        // the round dies in the air: a high pop, no ground impact
        S.impacts.push({ x: sh.x, y: sh.y, t: S.t, sz: 0.4 })
        S.shells.splice(i, 1)
      }
    }
  }
}
