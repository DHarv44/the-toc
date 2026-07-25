// DIV HQ secure video conference — how orders arrive. A FRAGO opens a mock VTC
// window: the commanding general's "camera" feed (stylized silhouette, speaking
// bars driven by the procedural briefing voice) beside a staff-officer POWERPOINT
// slide rendered live from the world state (map crop, axis of advance, objective
// graphics, FLOT). The opening OPORD is the first VTC (blocking, sim held);
// FRAGOs mid-fight are non-blocking — the world keeps running while higher
// talks. Every received order lands in CampaignState.fragoLog and can be
// recalled (replayed) from the objectives tracker at any time.
import { useEffect, useRef, useState } from 'react'
import { S } from '../engine/state'
import { useUI } from './store'
import { ackBriefing, ackFrago } from '../engine/campaign'
import { renderTerrainLayer, TERRAIN_PX } from '../map/mapRender'
import { CELL } from '../world/WorldMap'
import { controlField } from '../engine/frontline'
import { radioBrief } from '../audio/audio'

const AMBER = '#e8b34a'
const bump = () => useUI.setState((s) => ({ tick: s.tick + 1 }))

// terrain layer for the slide's map inset — one render per map, shared
let _terrain: { mapRef: unknown; cv: HTMLCanvasElement } | null = null
function terrainLayer(): HTMLCanvasElement {
  if (!_terrain || _terrain.mapRef !== S.map) _terrain = { mapRef: S.map, cv: renderTerrainLayer(S.map!) }
  return _terrain.cv
}

// ---------------------------------------------------------------------------
// The slide: one OPORD graphic drawn from live campaign data. Deliberately
// styled like the real thing — white deck, banner, title block, map inset with
// operational graphics, task bullets.
// ---------------------------------------------------------------------------
function drawSlide(cv: HTMLCanvasElement, title: string, text: string): void {
  const ctx = cv.getContext('2d')!
  const W = cv.width, H = cv.height
  const m = S.map, c = S.campaign
  ctx.fillStyle = '#f0efe8'
  ctx.fillRect(0, 0, W, H)

  // exercise banners (the fictional classification strip)
  ctx.fillStyle = '#8c1d1d'
  ctx.fillRect(0, 0, W, 15); ctx.fillRect(0, H - 15, W, 15)
  ctx.fillStyle = '#f0e6d0'
  ctx.font = 'bold 8px Consolas, monospace'
  ctx.textAlign = 'center'
  ctx.fillText('EXERCISE EXERCISE EXERCISE', W / 2, 11)
  ctx.fillText('EXERCISE EXERCISE EXERCISE', W / 2, H - 5)

  // title block
  ctx.fillStyle = '#161616'
  ctx.textAlign = 'left'
  ctx.font = 'bold 15px Arial, sans-serif'
  ctx.fillText(title, 14, 34)
  ctx.font = '9px Consolas, monospace'
  ctx.fillStyle = '#555'
  const dtg = c ? `${String(Math.floor(S.t / 3600)).padStart(2, '0')}${String(Math.floor(S.t / 60) % 60).padStart(2, '0')}Z` : '0000Z'
  ctx.fillText(`DIV HQ  ·  DTG ${dtg}  ·  SLIDE 1 OF 1`, 14, 46)
  ctx.strokeStyle = '#999'
  ctx.beginPath(); ctx.moveTo(14, 51); ctx.lineTo(W - 14, 51); ctx.stroke()

  if (!m || !c) return
  const hq = m.fob, town = c.strongpoint

  // map inset: crop framing the HQ → objective corridor
  const MX = 14, MY = 60, MW = 235, MH = H - 60 - 24
  const cx = (hq.x + town.x) / 2, cy = (hq.y + town.y) / 2
  const span = Math.max(Math.hypot(town.x - hq.x, town.y - hq.y) * 1.7, 3600)
  const sx = cx - span / 2, sy = cy - span * (MH / MW) / 2
  const k = MW / span // slide px per meter
  const w2x = (wx: number) => MX + (wx - sx) * k
  const w2y = (wy: number) => MY + (wy - sy) * k
  ctx.save()
  ctx.beginPath(); ctx.rect(MX, MY, MW, MH); ctx.clip()
  const tpm = TERRAIN_PX / CELL // terrain-layer px per meter
  ctx.drawImage(terrainLayer(), sx * tpm, sy * tpm, span * tpm, span * tpm * (MH / MW), MX, MY, MW, MH)

  // FLOT trace over the inset
  const cf = controlField(S)
  if (cf) {
    ctx.strokeStyle = 'rgba(170,30,30,0.9)'
    ctx.lineWidth = 1.6
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    for (const p of cf.paths) {
      ctx.moveTo(w2x(p[0]!.x), w2y(p[0]!.y))
      for (let i = 1; i < p.length; i++) ctx.lineTo(w2x(p[i]!.x), w2y(p[i]!.y))
    }
    ctx.stroke()
    ctx.setLineDash([])
  }

  // axis of advance: fat friendly arrow HQ → objective
  {
    const x0 = w2x(hq.x), y0 = w2y(hq.y), x1 = w2x(town.x), y1 = w2y(town.y)
    const a = Math.atan2(y1 - y0, x1 - x0)
    const L = Math.hypot(x1 - x0, y1 - y0) - 22
    ctx.save()
    ctx.translate(x0, y0); ctx.rotate(a)
    ctx.fillStyle = 'rgba(30,80,160,0.55)'
    ctx.strokeStyle = 'rgba(20,60,130,0.9)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(0, -5); ctx.lineTo(L - 16, -5); ctx.lineTo(L - 16, -11)
    ctx.lineTo(L, 0)
    ctx.lineTo(L - 16, 11); ctx.lineTo(L - 16, 5); ctx.lineTo(0, 5)
    ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.restore()
  }

  // objective graphic + suspected enemy + own HQ
  ctx.strokeStyle = '#a01414'
  ctx.lineWidth = 1.8
  ctx.beginPath(); ctx.ellipse(w2x(town.x), w2y(town.y), 21, 15, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = '#a01414'
  ctx.font = 'bold 9px Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('OBJ', w2x(town.x), w2y(town.y) - 19)
  for (const ct of S.contacts.values()) {
    const x = w2x(ct.x), y = w2y(ct.y)
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4)
    ctx.strokeStyle = '#a01414'; ctx.lineWidth = 1.4
    ctx.strokeRect(-4, -4, 8, 8)
    ctx.restore()
  }
  ctx.fillStyle = '#1e50a0'
  ctx.fillRect(w2x(hq.x) - 5, w2y(hq.y) - 4, 10, 8)
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 6px Arial, sans-serif'
  ctx.fillText('HQ', w2x(hq.x), w2y(hq.y) + 2)
  ctx.restore()
  ctx.strokeStyle = '#444'
  ctx.lineWidth = 1
  ctx.strokeRect(MX, MY, MW, MH)

  // task bullets: the FRAGO's sentences, staff-fragment style
  const bx = MX + MW + 12, bw = W - bx - 14
  ctx.fillStyle = '#161616'
  ctx.font = 'bold 10px Arial, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('TASKINGS', bx, MY + 8)
  ctx.font = '9.5px Arial, sans-serif'
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 5)
  let y = MY + 24
  for (const s of sentences) {
    // wrap each bullet to the column
    const words = s.trim().split(/\s+/)
    let line = '•'
    for (const w of words) {
      if (ctx.measureText(line + ' ' + w).width > bw) {
        ctx.fillText(line, bx, y); y += 12
        line = '  ' + w
      } else line += ' ' + w
      if (y > H - 30) break
    }
    if (y > H - 30) { ctx.fillText('  …', bx, y); break }
    ctx.fillText(line, bx, y); y += 16
  }
}

// ---------------------------------------------------------------------------
// The window
// ---------------------------------------------------------------------------
export function VtcWindow({ entry, blocking, onClose }: {
  entry: { title: string; text: string }
  blocking?: boolean
  onClose: () => void
}) {
  const [phase, setPhase] = useState<'link' | 'live'>('link')
  const [speaking, setSpeaking] = useState(false)
  const slideRef = useRef<HTMLCanvasElement>(null)

  // connect beat, then the CG reads the order (speaking bars run for the
  // exact scheduled duration; 0 = audio unavailable, bars stay still)
  useEffect(() => {
    setPhase('link')
    const t1 = setTimeout(() => {
      setPhase('live')
      const dur = radioBrief(entry.text)
      if (dur > 0) {
        setSpeaking(true)
        const t2 = setTimeout(() => setSpeaking(false), dur * 1000)
        return () => clearTimeout(t2)
      }
    }, 900)
    return () => clearTimeout(t1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry])

  useEffect(() => {
    if (phase === 'live' && slideRef.current) drawSlide(slideRef.current, entry.title, entry.text)
  }, [phase, entry])

  const win = (
    <div style={{
      width: 700, maxWidth: '92vw',
      background: 'rgba(10,14,19,0.97)', border: '1px solid #2a3a48', borderTop: `3px solid ${AMBER}`,
      borderRadius: 4, fontFamily: 'Consolas, monospace', boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
      userSelect: 'none',
    }}>
      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
        borderBottom: '1px solid #24343f',
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%', background: phase === 'live' ? '#d43a3a' : '#666',
          animation: phase === 'live' ? 'vtcBlink 1.2s step-end infinite' : 'none',
        }} />
        <span style={{ fontSize: 10, letterSpacing: 2.5, color: '#9ab8d0' }}>DIV HQ — SECURE VTC</span>
        <span style={{ fontSize: 9, letterSpacing: 1.5, color: '#54708a', marginLeft: 'auto' }}>
          {phase === 'link' ? 'ESTABLISHING SECURE LINK…' : 'LINK ENCRYPTED · LIVE'}
        </span>
      </div>

      {phase === 'link' ? (
        <div style={{
          height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#54708a', fontSize: 11, letterSpacing: 2,
          background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.02) 0 1px, transparent 1px 3px)',
        }}>
          ▚▞ CONNECTING ▞▚
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10, padding: 10 }}>
          {/* the CG's camera */}
          <div style={{ width: 210, flexShrink: 0 }}>
            <div style={{
              position: 'relative', height: 240, borderRadius: 3, overflow: 'hidden',
              background: 'radial-gradient(circle at 50% 42%, #22303c 0%, #101820 70%)',
              border: '1px solid #24343f',
            }}>
              {/* silhouette */}
              <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                <ellipse cx="50" cy="38" rx="15" ry="18" fill="#060a0e" />
                <path d="M 18 100 Q 22 62 50 60 Q 78 62 82 100 Z" fill="#060a0e" />
                {/* collar rank flash */}
                <rect x="44" y="66" width="12" height="5" fill="#3a4a34" />
              </svg>
              {/* scanlines */}
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 3px)',
              }} />
              {/* speaking bars */}
              <div style={{ position: 'absolute', left: 8, bottom: 8, display: 'flex', gap: 2, alignItems: 'flex-end', height: 14 }}>
                {[0, 1, 2, 3, 4].map(i => (
                  <span key={i} style={{
                    width: 3, background: speaking ? '#7ec87e' : '#33454f', height: 4 + (i % 3) * 4,
                    animation: speaking ? `vtcBar 0.${5 + i}s ease-in-out infinite alternate` : 'none',
                  }} />
                ))}
              </div>
              <div style={{
                position: 'absolute', right: 8, bottom: 8, fontSize: 8.5, letterSpacing: 1.5,
                color: '#9ab8d0', background: 'rgba(6,10,14,0.75)', padding: '2px 6px', borderRadius: 2,
              }}>CG · DIV</div>
            </div>
            <div style={{ marginTop: 6, fontSize: 9, lineHeight: 1.5, color: '#54708a', letterSpacing: 1 }}>
              {speaking ? '— TRANSMITTING —' : 'STANDING BY'}
            </div>
          </div>
          {/* the slide */}
          <canvas ref={slideRef} width={460} height={300}
            style={{ width: 460, height: 300, borderRadius: 2, flexShrink: 0 }} />
        </div>
      )}

      {/* footer */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 12px 10px' }}>
        <button onClick={() => { onClose(); bump() }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = AMBER }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a3a48' }}
          style={{
            padding: '7px 22px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit',
            background: 'rgba(16,26,36,0.85)', border: '1px solid #2a3a48', borderLeft: `3px solid ${AMBER}`,
            color: '#e6f0f8', fontSize: 11, letterSpacing: 2.5, fontWeight: 'bold',
          }}>{blocking ? 'ACKNOWLEDGE' : 'END CALL'}</button>
      </div>
    </div>
  )

  // keyframes injected once
  useEffect(() => {
    if (document.getElementById('vtc-keyframes')) return
    const st = document.createElement('style')
    st.id = 'vtc-keyframes'
    st.textContent = `
      @keyframes vtcBlink { 50% { opacity: 0.25; } }
      @keyframes vtcBar { from { height: 3px; } to { height: 14px; } }`
    document.head.appendChild(st)
  }, [])

  return blocking ? (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 105, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(circle at 50% 30%, rgba(14,26,36,0.95) 0%, rgba(5,8,11,0.97) 70%)',
    }}>{win}</div>
  ) : (
    <div style={{ position: 'fixed', top: 46, left: '50%', transform: 'translateX(-50%)', zIndex: 104 }}>
      {win}
    </div>
  )
}

// Non-blocking VTC host: mounts whenever a FRAGO is open (new tasking or a
// recall from the log). The sim keeps running underneath.
export function VtcFrago() {
  useUI((s) => s.tick)
  const c = S.campaign
  if (!c || c.complete || !c.briefed || c.frago == null) return null
  return <VtcWindow entry={c.frago} onClose={() => ackFrago(S)} />
}

// Blocking opener: the campaign's first VTC — the OPORD from higher. Holds the
// sim (speed 0) until acknowledged, exactly like the old briefing modal.
export function VtcOpener() {
  useUI((s) => s.tick)
  const c = S.campaign
  if (!c || c.complete || c.briefed) return null
  const opener = c.fragoLog[0]
  if (!opener) return null
  return <VtcWindow entry={opener} blocking onClose={() => ackBriefing(S)} />
}
