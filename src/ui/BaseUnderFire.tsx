// Base-under-fire TOC cues (#14): a SUBTLE red wash over the whole TOC when
// indirect is inbound on the commander's CP, and a short screen shake scaled
// by impact proximity. Pure UI — listens to the sim's bus events (emitted by
// domains/installations/intercept.ts), touches no state, renders nothing when
// the base is quiet.
import { useEffect, useRef, useState } from 'react'
import { bus } from '../engine/state'

// the INCOMING banner: an overlay across the TOP OF THE MAP/CONSOLE PANE
// (not the app header) — mounted inside the map column in App. Subscribes to
// the radar pings itself; visible while the alarm is live (+10 s tail).
export function IncomingBanner() {
  const [alarm, setAlarm] = useState(false)
  const off = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const unsub = bus.on('incoming', () => {
      setAlarm(true)
      if (off.current) clearTimeout(off.current)
      off.current = setTimeout(() => setAlarm(false), 10000)
    })
    return () => { unsub(); if (off.current) clearTimeout(off.current) }
  }, [])
  if (!alarm) return null
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, zIndex: 60,
      pointerEvents: 'none', background: '#a3121b',
      borderBottom: '1px solid #ff8a7e', padding: '3px 0',
      textAlign: 'center', fontFamily: 'Consolas, monospace',
      color: '#ffffff', fontSize: 13, fontWeight: 700, letterSpacing: 4,
      animation: 'bufBlink 0.9s step-end infinite',
    }}>
      ⚠ INCOMING · INCOMING · INCOMING — TAKE COVER, GET TO THE NEAREST BUNKER ⚠
      <style>{'@keyframes bufBlink { 0% { opacity: 1 } 55% { opacity: 1 } 60% { opacity: 0.35 } 100% { opacity: 0.35 } }'}</style>
    </div>
  )
}

export default function BaseUnderFire({ shakeRef }: { shakeRef: React.RefObject<HTMLDivElement | null> }) {
  const flashRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    let strobeRaf = 0
    let lastPing = 0
    const TAIL = 10000 // matches the audio alarm: strobe until 10 s past the last radar ping
    const strobe = (now: number) => {
      const el = flashRef.current
      if (!el) return
      if (now - lastPing > TAIL) { el.style.opacity = '0'; strobeRaf = 0; return }
      // slow alarm strobe — a red wash breathing at ~0.8 Hz, never a damage vignette
      const k = (Math.sin(now / 1250 * Math.PI * 2) + 1) / 2
      el.style.opacity = String(0.05 + 0.11 * k)
      strobeRaf = requestAnimationFrame(strobe)
    }
    const offIncoming = bus.on('incoming', () => {
      lastPing = performance.now()
      if (!strobeRaf) strobeRaf = requestAnimationFrame(strobe)
    })
    let flickering = false
    const offImpact = bus.on('baseimpact', (e: { prox: number }) => {
      // 300-500 ms shake, harder when closer; decaying random offsets
      const host = shakeRef.current
      if (!host) return
      const amp = 3 + 9 * e.prox
      const dur = 300 + 200 * e.prox
      const t0 = performance.now()
      cancelAnimationFrame(raf)
      const step = (now: number) => {
        const k = (now - t0) / dur
        if (k >= 1 || !shakeRef.current) {
          host.style.transform = ''
          return
        }
        const a = amp * (1 - k)
        host.style.transform =
          `translate(${(Math.random() * 2 - 1) * a}px, ${(Math.random() * 2 - 1) * a}px)`
        raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
      // power flicker: the concussion dips the generators for a heartbeat —
      // two quick brightness stutters (~150 ms total), screens never die
      if (!flickering) {
        flickering = true
        const dim = 0.45 + 0.25 * (1 - e.prox) // closer = deeper dip
        host.style.filter = `brightness(${dim})`
        setTimeout(() => { host.style.filter = '' }, 55)
        setTimeout(() => { host.style.filter = `brightness(${Math.min(0.85, dim + 0.25)})` }, 95)
        setTimeout(() => { host.style.filter = ''; flickering = false }, 150)
      }
    })
    return () => { offIncoming(); offImpact(); cancelAnimationFrame(raf); cancelAnimationFrame(strobeRaf) }
  }, [shakeRef])

  return (
    <div ref={flashRef} style={{
      position: 'fixed', inset: 0, zIndex: 2000, pointerEvents: 'none',
      background: 'radial-gradient(ellipse at center, rgba(220,40,30,0.35) 0%, rgba(220,40,30,0.65) 100%)',
      opacity: 0,
    }} />
  )
}
