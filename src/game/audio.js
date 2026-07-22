// Synthesized feed audio — no external assets, everything generated with Web Audio.
// Sound only fires for events the player is watching in a drone feed (see DroneView);
// the 2D command map stays a silent CIC view.

let ctx = null
let master = null
let noiseBuf = null
let muted = false // sound on by default; the HUD mute button toggles this

export function isMuted() { return muted }
export function audioReady() { return !!ctx && ctx.state === 'running' }

// lazily build the graph on the first user gesture (browsers block audio otherwise)
export function ensureAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 0.85
    master.connect(ctx.destination)
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  if (ctx.state === 'suspended') ctx.resume()
}

export function setMuted(m) {
  muted = !!m
  if (!muted) ensureAudio()
  if (master) master.gain.value = muted ? 0 : 0.85 // also silences the ambient loops
}
export function toggleMute() { setMuted(!muted); return muted }

// gun firing report: a punchy thud. Lower `freq` = bigger gun = deeper thud.
export function muzzle(gain = 0.4, freq = 90) {
  if (muted || !audioReady()) return
  const t = ctx.currentTime
  // sub thump — the body of the report
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(freq * 1.7, t)
  o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.11)
  const g = ctx.createGain()
  g.gain.setValueAtTime(Math.min(0.9, gain), t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.16)
  o.connect(g).connect(master)
  o.start(t); o.stop(t + 0.18)
  // brief edge transient so it reads as a "crack-thud", not just a tone
  const n = ctx.createBufferSource(); n.buffer = noiseBuf
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = freq * 9
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(gain * 0.45, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.04)
  n.connect(lp).connect(ng).connect(master)
  n.start(t, Math.random()); n.stop(t + 0.05)
}

// round impact: a deep, low rumble that rolls off — quieter than the firing thud.
export function rumble(gain = 0.25, freq = 55) {
  if (muted || !audioReady()) return
  const t = ctx.currentTime
  const n = ctx.createBufferSource()
  n.buffer = noiseBuf; n.playbackRate.value = 0.45 + Math.random() * 0.2
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'
  lp.frequency.setValueAtTime(freq * 4.5, t); lp.frequency.exponentialRampToValueAtTime(freq * 0.8, t + 0.55)
  const g = ctx.createGain()
  g.gain.setValueAtTime(Math.min(0.8, gain), t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.6)
  n.connect(lp).connect(g).connect(master)
  n.start(t, Math.random()); n.stop(t + 0.65)
  const o = ctx.createOscillator(); o.type = 'sine'
  o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + 0.4)
  const og = ctx.createGain()
  og.gain.setValueAtTime(gain * 0.7, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
  o.connect(og).connect(master); o.start(t); o.stop(t + 0.52)
}

// --- per-drone-type ambient platform loops (engine/prop/motor) ---
// Each airframe gets its own signature, played only while its feed is open. `base` = tonal
// fundamental (Hz, 0 = none), `harm` = harmonic ratios, `cutoff` = lowpass (muffling),
// `noise` = broadband engine hiss, `wob` = [rate, depth] of the drone's pulse, `gain` = level.
const AMBIENT = {
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

const ambients = new Map() // feedId -> { type, stop() }

// start/replace the ambient loop for a feed; pass null typeKey to silence that feed
export function setFeedAmbient(feedId, typeKey) {
  ensureAudio()
  if (!ctx) return
  const cur = ambients.get(feedId)
  if (cur && cur.type === typeKey) return // unchanged
  if (cur) { cur.stop(); ambients.delete(feedId) }
  if (!typeKey) return
  const p = AMBIENT[typeKey] || AMBIENT._default
  const vol = p.gain * AMBIENT_VOL
  const vg = ctx.createGain()
  vg.gain.value = vol
  vg.connect(master)
  const started = []
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
    for (const n of started) { try { n.stop() } catch (e) { /* already stopped */ } }
    try { vg.disconnect() } catch (e) { /* detached */ }
  }
  ambients.set(feedId, { type: typeKey, stop })
}

export function clearFeedAmbient(feedId) {
  const a = ambients.get(feedId)
  if (a) { a.stop(); ambients.delete(feedId) }
}

// resume/create the context on the first interaction anywhere in the app
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => { if (!muted) ensureAudio() }, { passive: true })
}
