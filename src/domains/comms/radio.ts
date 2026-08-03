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
import { activePack } from '../../packs/install'

// net traffic urgency drives the chatter throttle: contact/loss/fires cut in, routine yields
function radioPriority(kind: RadioKind): number {
  if (kind === 'contact' || kind === 'loss' || kind === 'fires') return 2
  if (kind === 'spot' || kind === 'struct') return 1
  return 0
}

// Dress terse traffic up into a full radio transmission — addressee, self-ID,
// the report, a range read-back for spot/contact, and a closing proword — so
// it reads and *sounds* like net chatter (longer transmissions also give the
// mumble voice more to work with).
//
// The WORDS are the pack's (Pack.net): net procedure is culture, and an
// opposing force should not sign off the way this one does. This function owns
// only the shape — who is speaking, to whom, and when a range is worth saying.
function radioHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

const fill = (tpl: string, f: Record<string, string>): string =>
  tpl.replace(/\{(\w+)\}/g, (_, k: string) => f[k] ?? '')

function phraseRadio(callsign: string, kind: RadioKind, msg: string, x?: number, y?: number): string {
  // whose net this is: the speaker's own pack, so each side sounds like itself
  const speaker = S.units.find(uu => uu.label === callsign) || S.drones.find(dd => dd.label === callsign)
  const side = (speaker as Unit | undefined)?.side === 'hostile' ? 'hostile' : 'friend'
  const net = activePack(side)?.net
  if (!net) return `${callsign}: ${msg}` // a pack with no voice still gets heard

  if (callsign === 'NET') return fill(net.broadcast, { control: net.control, msg })

  // each element calls the SAME higher every time — a station that wandered
  // between addressees every transmission would not sound like a net
  const higher = net.higher[radioHash(callsign) % net.higher.length] ?? net.control
  const rng = S.rng || Math.random // seeded in-game; fallback only pre-init
  const closing = net.closings[(rng() * net.closings.length) | 0] ?? ''
  let range = ''
  if ((kind === 'spot' || kind === 'contact') && x != null && y != null && speaker) {
    const m = Math.hypot(speaker.x - x, speaker.y - y)
    if (m >= (net.rangeFloor ?? 400)) {
      const c = m / 1000
      range = fill(net.range, { n: c < 10 ? c.toFixed(1) : c.toFixed(0) })
    }
  }
  return fill(net.call, { higher, callsign, msg, range, closing })
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
