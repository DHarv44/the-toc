// Synthesized feed audio — no external assets, everything generated with Web Audio.
// Sound only fires for events the player is watching in a drone feed (see DroneView);
// the 2D command map stays a silent CIC view. Ported verbatim from src/game/audio.js.
//
// Seam change: net chatter arrives via the engine event bus (the sim no longer
// calls into audio directly) — see the subscription at the bottom.
import { bus } from '../engine/state'
import { hashStr } from '../lib/math'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
let muted = false // sound on by default; the HUD mute button toggles this
let radioBus: GainNode | null = null // narrow-band + crunch bus that all net chatter routes through
let radioIn: BiquadFilterNode | null = null // chatter voices connect here (was radioBus.inNode)
let lastRadio = -99 // throttle timestamp so transmissions don't stack
const RADIO_VOL = 0.7

export function isMuted(): boolean { return muted }
export function audioReady(): boolean { return !!ctx && ctx.state === 'running' }

// lazily build the graph on the first user gesture (browsers block audio otherwise)
export function ensureAudio(): void {
  if (!ctx) {
    const AC = window.AudioContext
      || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 0.85
    master.connect(ctx.destination)
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    // radio bus: narrow bandpass + soft-clip crunch, so all net chatter reads as "over the net"
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 0.8
    const shaper = ctx.createWaveShaper(); shaper.curve = crunchCurve(0.4)
    radioBus = ctx.createGain(); radioBus.gain.value = RADIO_VOL
    bp.connect(shaper).connect(radioBus).connect(master)
    radioIn = bp
  }
  if (ctx.state === 'suspended') ctx.resume()
}

function crunchCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 256, c = new Float32Array(n)
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * (1 + amount * 4)) }
  return c
}

export function setMuted(m: boolean): void {
  muted = !!m
  if (!muted) ensureAudio()
  if (master) master.gain.value = muted ? 0 : 0.85 // also silences the ambient loops
}
export function toggleMute(): boolean { setMuted(!muted); return muted }

// gun firing report: a punchy thud. Lower `freq` = bigger gun = deeper thud.
export function muzzle(gain = 0.4, freq = 90): void {
  if (muted || !audioReady()) return
  const t = ctx!.currentTime
  // sub thump — the body of the report
  const o = ctx!.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(freq * 1.7, t)
  o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.11)
  const g = ctx!.createGain()
  g.gain.setValueAtTime(Math.min(0.9, gain), t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.16)
  o.connect(g).connect(master!)
  o.start(t); o.stop(t + 0.18)
  // brief edge transient so it reads as a "crack-thud", not just a tone
  const n = ctx!.createBufferSource(); n.buffer = noiseBuf
  const lp = ctx!.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = freq * 9
  const ng = ctx!.createGain()
  ng.gain.setValueAtTime(gain * 0.45, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.04)
  n.connect(lp).connect(ng).connect(master!)
  n.start(t, Math.random()); n.stop(t + 0.05)
}

// round impact: a deep, low rumble that rolls off — quieter than the firing thud.
export function rumble(gain = 0.25, freq = 55): void {
  if (muted || !audioReady()) return
  const t = ctx!.currentTime
  const n = ctx!.createBufferSource()
  n.buffer = noiseBuf; n.playbackRate.value = 0.45 + Math.random() * 0.2
  const lp = ctx!.createBiquadFilter(); lp.type = 'lowpass'
  lp.frequency.setValueAtTime(freq * 4.5, t); lp.frequency.exponentialRampToValueAtTime(freq * 0.8, t + 0.55)
  const g = ctx!.createGain()
  g.gain.setValueAtTime(Math.min(0.8, gain), t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.6)
  n.connect(lp).connect(g).connect(master!)
  n.start(t, Math.random()); n.stop(t + 0.65)
  const o = ctx!.createOscillator(); o.type = 'sine'
  o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + 0.4)
  const og = ctx!.createGain()
  og.gain.setValueAtTime(gain * 0.7, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
  o.connect(og).connect(master!); o.start(t); o.stop(t + 0.52)
}

// ground-unit weapons fire heard from a UAS sensor overhead. Small arms crackle
// in a short burst; vehicle guns are fewer, deeper thumps. Everything is heavily
// low-passed so it reads as muffled/distant through the sensor, never sharp.
export function gunfire(gain = 0.12, heavy = false): void {
  if (muted || !audioReady()) return
  const t = ctx!.currentTime
  const lp = ctx!.createBiquadFilter(); lp.type = 'lowpass'
  lp.frequency.value = heavy ? 600 : 950   // muffle
  const out = ctx!.createGain(); out.gain.value = Math.min(0.5, gain)
  lp.connect(out).connect(master!)
  const pops = heavy ? (1 + (Math.random() * 2 | 0)) : (3 + (Math.random() * 4 | 0))
  const step = heavy ? 0.1 : 0.05
  for (let i = 0; i < pops; i++) {
    const tt = t + i * step * (0.7 + Math.random() * 0.6)
    const amp = heavy ? 0.9 : 0.5 + Math.random() * 0.4
    const dur = heavy ? 0.15 : 0.06
    // filtered noise crack
    const n = ctx!.createBufferSource(); n.buffer = noiseBuf
    n.playbackRate.value = heavy ? 0.5 + Math.random() * 0.2 : 1 + Math.random() * 0.5
    const ng = ctx!.createGain()
    ng.gain.setValueAtTime(amp, tt); ng.gain.exponentialRampToValueAtTime(0.001, tt + dur)
    n.connect(ng).connect(lp)
    n.start(tt, Math.random()); n.stop(tt + dur + 0.02)
    // low tonal body for weight
    const o = ctx!.createOscillator(); o.type = 'sine'
    const f = heavy ? 68 : 150
    o.frequency.setValueAtTime(f * 1.6, tt); o.frequency.exponentialRampToValueAtTime(f * 0.7, tt + 0.08)
    const og = ctx!.createGain()
    og.gain.setValueAtTime(amp * 0.5, tt); og.gain.exponentialRampToValueAtTime(0.001, tt + dur)
    o.connect(og).connect(lp)
    o.start(tt); o.stop(tt + dur + 0.02)
  }
}

// --- radio net chatter ---
// The net readout stays; this is the SOUND of it. No real words: a keyed-mic click, a
// procedural "mumble" voice that tracks the message's cadence/inflection (military, not
// cartoon), and a squelch tail — all through the radio bus. Global (the command net), not
// feed-gated. `seed` (callsign) varies the speaker; `priority` gates the throttle.

// a stable, distinct voice per callsign — pitch, timbre, formant color, sharpness, pace,
// and an occasional growl — so units become identifiable by the sound of their traffic.
interface VoiceProfile {
  pitch: number
  wave: OscillatorType
  q: number
  rate: number
  f1: number
  f2: number
  staticAmt: number
  growl: boolean
}
function voiceProfile(seed: string): VoiceProfile {
  const h = Math.abs(hashStr(String(seed)))
  const h2 = Math.abs(hashStr('v' + seed))
  const WAVES: OscillatorType[] = ['sawtooth', 'triangle', 'sawtooth', 'triangle', 'square']
  return {
    pitch: 78 + (h % 92),                                          // 78..170 Hz — wide spread
    wave: WAVES[h2 % 5]!,                                          // mostly soft waves
    q: 1.6 + (h % 20) / 10,                                        // 1.6..3.5 — broad, un-horny formants
    rate: 0.85 + (h2 % 40) / 100,                                  // 0.85..1.24 speaking pace
    f1: 320 + (h % 260),                                           // 320..580 first formant (vowel color)
    f2: 880 + (h2 % 950),                                          // 880..1830 second formant
    staticAmt: 0.02 + (h % 7) / 100,                               // 0.02..0.08 per-unit channel noise
    growl: (h2 % 5) === 0,                                         // ~1 in 5 gets a sub-octave rasp
  }
}
function sylCount(w: string): number {
  const m = w.toLowerCase().match(/[aeiouy]+/g)
  return m ? Math.min(4, m.length) : Math.min(3, Math.max(1, Math.ceil(w.length / 2)))
}
function radioClick(t: number, gain: number): void {
  const n = ctx!.createBufferSource(); n.buffer = noiseBuf
  const bp = ctx!.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.6
  const g = ctx!.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04)
  n.connect(bp).connect(g).connect(radioIn!); n.start(t, Math.random()); n.stop(t + 0.05)
}
function radioStatic(t: number, dur: number, gain: number): void {
  const n = ctx!.createBufferSource(); n.buffer = noiseBuf; n.loop = true
  const hp = ctx!.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1100
  const g = ctx!.createGain()
  g.gain.setValueAtTime(gain, t); g.gain.setValueAtTime(gain, t + dur); g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.05)
  n.connect(hp).connect(g).connect(radioIn!); n.start(t, Math.random()); n.stop(t + dur + 0.1)
}
function radioSquelch(t: number): void {
  const n = ctx!.createBufferSource(); n.buffer = noiseBuf
  const bp = ctx!.createBiquadFilter(); bp.type = 'bandpass'
  bp.frequency.setValueAtTime(2300, t); bp.frequency.exponentialRampToValueAtTime(650, t + 0.1); bp.Q.value = 0.7
  const g = ctx!.createGain(); g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
  n.connect(bp).connect(g).connect(radioIn!); n.start(t, Math.random()); n.stop(t + 0.14)
}
// one syllable, in a speaker's voice `v`: a voiced source shaped by two BROAD, gliding
// formants (mouth articulating) + a breath layer, with a decaying envelope — so it reads
// as a mumbled syllable, not a held horn note.
function radioSyllable(t: number, pitch: number, v: VoiceProfile, dur: number): void {
  const o = ctx!.createOscillator(); o.type = v.wave
  o.frequency.setValueAtTime(pitch * 1.05, t)
  o.frequency.linearRampToValueAtTime(pitch * 0.94, t + dur) // spoken pitch fall
  // formants glide across the syllable (vowel morph) and use a broad Q so they don't ring
  const f1 = ctx!.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = v.q
  const f2 = ctx!.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = v.q
  f1.frequency.setValueAtTime(v.f1 * (0.8 + Math.random() * 0.4), t)
  f1.frequency.linearRampToValueAtTime(v.f1 * (0.8 + Math.random() * 0.4), t + dur)
  f2.frequency.setValueAtTime(v.f2 * (0.8 + Math.random() * 0.4), t)
  f2.frequency.linearRampToValueAtTime(v.f2 * (0.8 + Math.random() * 0.4), t + dur)
  const g = ctx!.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.8, t + 0.02)          // quick attack
  g.gain.linearRampToValueAtTime(0.5, t + dur * 0.65)    // fall through the body (not held)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.02)
  o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(radioIn!)
  o.start(t); o.stop(t + dur + 0.04)
  // breath — a little filtered noise so it's a voice, not a pure tone
  const nz = ctx!.createBufferSource(); nz.buffer = noiseBuf
  const nb = ctx!.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.value = v.f2; nb.Q.value = 1
  const ng = ctx!.createGain()
  ng.gain.setValueAtTime(0.0001, t)
  ng.gain.linearRampToValueAtTime(0.07, t + 0.03)
  ng.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.02)
  nz.connect(nb).connect(ng).connect(radioIn!); nz.start(t, Math.random()); nz.stop(t + dur + 0.04)
  if (v.growl) { // sub-octave rasp for a gravelly speaker
    const sub = ctx!.createOscillator(); sub.type = 'square'; sub.frequency.value = pitch * 0.5
    const sg = ctx!.createGain()
    sg.gain.setValueAtTime(0.0001, t)
    sg.gain.linearRampToValueAtTime(0.18, t + 0.03)
    sg.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.03)
    sub.connect(sg).connect(radioIn!); sub.start(t); sub.stop(t + dur + 0.05)
  }
}
export function radioMsg(text: string, seed = '', priority = 0): void {
  if (muted || !audioReady() || !radioBus) return
  const now = ctx!.currentTime
  const gap = priority >= 2 ? 0.35 : 0.9 // urgent traffic can cut in; routine yields
  if (now - lastRadio < gap) return
  const v = voiceProfile(seed)
  // urgency: contact/fires/loss (priority 2) are tenser and faster — troops-in-contact
  // should sound dire; routine movement stays calm and measured.
  const urgent = priority >= 2
  const basePitch = v.pitch * (urgent ? 1.12 : 1)  // stress raises the pitch
  const durMul = (urgent ? 0.82 : 1) * v.rate       // clipped/quicker under contact
  const gapMul = (urgent ? 0.6 : 1) * v.rate
  let t = now
  radioClick(t, 0.45); t += 0.09
  const words = String(text).replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean)
  const startVoice = t
  let contour = urgent ? 0.16 : 0.06                // starts agitated when in contact
  outer:
  for (let wi = 0; wi < words.length; wi++) {
    const n = sylCount(words[wi]!)
    for (let s = 0; s < n; s++) {
      if (t - startVoice > 3.0) break outer         // cap transmission length
      const pitch = basePitch * (1 + contour) * (0.97 + Math.random() * (urgent ? 0.1 : 0.06))
      const dur = (0.13 + Math.random() * 0.07) * durMul
      radioSyllable(t, pitch, v, dur)
      t += dur + 0.06 * gapMul
      contour += (Math.random() - 0.5) * (urgent ? 0.08 : 0.05)
    }
    t += 0.16 * gapMul                              // pause between words
    // urgent traffic stays high and jittery; routine settles down (statement inflection)
    contour = urgent ? contour * 0.92 + Math.random() * 0.05 : contour * 0.8 - 0.02
  }
  // per-unit channel noise, heavier when transmitting under fire
  radioStatic(startVoice - 0.02, (t - startVoice) + 0.06, v.staticAmt * (urgent ? 1.6 : 1))
  radioSquelch(t + 0.02)
  lastRadio = t + 0.05
}

// --- per-drone-type ambient platform loops (engine/prop/motor) ---
// Each airframe gets its own signature, played only while its feed is open. `base` = tonal
// fundamental (Hz, 0 = none), `harm` = harmonic ratios, `cutoff` = lowpass (muffling),
// `noise` = broadband engine hiss, `wob` = [rate, depth] of the drone's pulse, `gain` = level.
interface AmbientSpec {
  base: number
  harm: readonly number[]
  wave: OscillatorType
  cutoff: number
  noise: number
  wob: readonly [number, number]
  gain: number
}
const AMBIENT: Record<string, AmbientSpec> = {
  // C-130: deep, muffled turboprop drone with a slow prop pulse — kept low, not overpowering
  SPECTRE:     { base: 44,  harm: [1, 2, 3],   wave: 'sawtooth', cutoff: 300,  noise: 0.5,  wob: [5, 0.14],  gain: 0.13 },
  // RQ-7 Shadow: small buzzy piston engine
  SHADOW:      { base: 84,  harm: [1, 2],      wave: 'sawtooth', cutoff: 1000, noise: 0.3,  wob: [6, 0.12],  gain: 0.09 },
  // RQ-4 Sentinel: high turbofan whine/hiss
  SENTINEL:    { base: 150, harm: [1, 1.5],    wave: 'triangle', cutoff: 1500, noise: 0.6,  wob: [2, 0.08],  gain: 0.08 },
  // MQ-1 Viper: the iconic pusher-prop buzz
  VIPER:       { base: 82,  harm: [1, 2],      wave: 'sawtooth', cutoff: 900,  noise: 0.35, wob: [7, 0.12],  gain: 0.085 },
  // small electric fliers: high, quiet motor buzz
  RAVEN:       { base: 124, harm: [1, 2],      wave: 'triangle', cutoff: 780,  noise: 0.3,  wob: [9, 0.1],   gain: 0.055 },
  SWITCHBLADE: { base: 150, harm: [1, 2],      wave: 'triangle', cutoff: 900,  noise: 0.3,  wob: [11, 0.1],  gain: 0.055 },
  // tethered balloon: no engine, just wind
  AEROSTAT:    { base: 0,   harm: [],          wave: 'sine',     cutoff: 420,  noise: 0.7,  wob: [0.6, 0.18], gain: 0.05 },
  _default:    { base: 92,  harm: [1, 2],      wave: 'sawtooth', cutoff: 1000, noise: 0.3,  wob: [5, 0.12],  gain: 0.08 },
}

const AMBIENT_VOL = 0.12 // global trim on all platform ambients

const ambients = new Map<string | number, { type: string | null; stop(): void }>()

// start/replace the ambient loop for a feed; pass null typeKey to silence that feed
export function setFeedAmbient(feedId: string | number, typeKey: string | null): void {
  ensureAudio()
  if (!ctx) return
  const cur = ambients.get(feedId)
  if (cur && cur.type === typeKey) return // unchanged
  if (cur) { cur.stop(); ambients.delete(feedId) }
  if (!typeKey) return
  const p = AMBIENT[typeKey] || AMBIENT['_default']!
  const vol = p.gain * AMBIENT_VOL
  const vg = ctx.createGain()
  vg.gain.value = vol
  vg.connect(master!)
  const started: AudioScheduledSourceNode[] = []
  for (const h of p.harm) {
    const o = ctx.createOscillator()
    o.type = p.wave
    o.frequency.value = p.base * h * (0.99 + Math.random() * 0.02) // slight detune
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = p.cutoff
    const og = ctx.createGain(); og.gain.value = 0.9 / p.harm.length
    o.connect(lp).connect(og).connect(vg)
    o.start(); started.push(o)
  }
  const noise = ctx.createBufferSource(); noise.buffer = noiseBuf; noise.loop = true
  const nlp = ctx.createBiquadFilter(); nlp.type = 'lowpass'; nlp.frequency.value = p.cutoff * 0.85
  const ng = ctx.createGain(); ng.gain.value = p.noise * 0.22
  noise.connect(nlp).connect(ng).connect(vg)
  noise.start(); started.push(noise)
  if (p.wob[0] > 0) {
    const lfo = ctx.createOscillator(); lfo.frequency.value = p.wob[0]
    const lg = ctx.createGain(); lg.gain.value = vol * p.wob[1]
    lfo.connect(lg).connect(vg.gain)
    lfo.start(); started.push(lfo)
  }
  const stop = () => {
    for (const n of started) { try { n.stop() } catch { /* already stopped */ } }
    try { vg.disconnect() } catch { /* detached */ }
  }
  ambients.set(feedId, { type: typeKey, stop })
}

export function clearFeedAmbient(feedId: string | number): void {
  const a = ambients.get(feedId)
  if (a) { a.stop(); ambients.delete(feedId) }
}

// wiring: net chatter comes off the engine bus; resume/create the context on the
// first interaction anywhere in the app. Guarded so HMR re-imports don't stack
// subscriptions or listeners.
const g = globalThis as typeof globalThis & { __WOD2_AUDIO_WIRED?: boolean }
if (typeof window !== 'undefined' && !g.__WOD2_AUDIO_WIRED) {
  g.__WOD2_AUDIO_WIRED = true
  bus.on('radio', e => radioMsg(e.text, e.callsign, e.priority))
  window.addEventListener('pointerdown', () => { if (!muted) ensureAudio() }, { passive: true })
}
