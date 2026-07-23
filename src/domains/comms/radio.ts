// Net traffic and HUD toasts. Ported verbatim from src/game/sim.js; the one
// behavioral seam changed is the outward edge — the old sim called audio's
// radioMsg() directly, the new one emits a 'radio' event on the bus and the
// audio layer subscribes (wave 5).
//
// The closing proword draws from S.rng (seeded), so a whole battle — chatter
// included — replays identically from its seed. (Was raw Math.random during
// the migration for old-sim parity; re-baselined after the cutover.)
import { S, bus } from '../../engine/state'
import type { RadioKind, Unit } from '../../engine/GameState'
import { grid } from '../../lib/format'

// net traffic urgency drives the chatter throttle: contact/loss/fires cut in, routine yields
function radioPriority(kind: RadioKind): number {
  if (kind === 'contact' || kind === 'loss' || kind === 'fires') return 2
  if (kind === 'spot' || kind === 'struct') return 1
  return 0
}

// dress terse traffic up into a full radio transmission — addressee + self-ID, the report,
// a range read-back for spot/contact, and a closing proword — so it reads and *sounds* like
// real net chatter (longer transmissions = a fuller mumble voice).
const NET_HIGHER = ['COMMAND', 'BASE', 'TOC', 'MOTHER', 'NET CONTROL']
const RADIO_CLOSINGS = ['OVER', 'HOW COPY, OVER', 'OUT', 'ACKNOWLEDGE, OVER', 'SEND IT']
function radioHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
function phraseRadio(callsign: string, kind: RadioKind, msg: string, x?: number, y?: number): string {
  if (callsign === 'NET') return `ALL STATIONS, THIS IS NET CONTROL. ${msg}, OUT.`
  const higher = NET_HIGHER[radioHash(callsign) % NET_HIGHER.length] // each element calls the same higher
  const rng = S.rng || Math.random // seeded in-game; fallback only pre-init
  const close = RADIO_CLOSINGS[(rng() * RADIO_CLOSINGS.length) | 0]
  let dist = ''
  if ((kind === 'spot' || kind === 'contact') && x != null && y != null) {
    const u = S.units.find(uu => uu.label === callsign) || S.drones.find(dd => dd.label === callsign)
    if (u) {
      const c = Math.hypot(u.x - x, u.y - y) / 1000
      if (c >= 0.4) dist = `, ${c < 10 ? c.toFixed(1) : c.toFixed(0)} CLICKS FROM OUR POSITION`
    }
  }
  return `${higher}, THIS IS ${callsign}. ${msg}${dist}, ${close}.`
}

export function radio(callsign: string, kind: RadioKind, msg: string, x?: number, y?: number): void {
  const full = phraseRadio(callsign, kind, msg, x, y)
  S.radio.push({ t: S.t, callsign, kind, msg: full, x, y })
  if (S.radio.length > 100) S.radio.shift()
  // audible net chatter — audio subscribes; no-op if nothing listens
  bus.emit('radio', { text: full, callsign, priority: radioPriority(kind) })
}

// unit chatter only reaches the player's JBC-P net for friendly callsigns;
// enemy elements execute the identical orders silently.
export function netRadio(u: Unit, kind: RadioKind, msg: string, x?: number, y?: number): void {
  if (u.side === 'friend') radio(u.label, kind, msg, x, y)
}

// returns null so order functions can `return toast(...)` as their refusal path
export function toast(msg: string): null {
  S.toasts.push({ msg, t: S.t })
  if (S.toasts.length > 5) S.toasts.shift()
  bus.emit('toast', { msg, t: S.t })
  return null
}
