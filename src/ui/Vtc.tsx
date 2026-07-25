// DIV HQ secure video conference — how orders arrive. A FRAGO opens a mock VTC
// window: the commanding general's "camera" feed (stylized silhouette, speaking
// bars driven by the procedural briefing voice), the task force's platoon
// leaders as attendee tiles below, and a staff POWERPOINT deck rendered live
// from world state. The opening OPORD is the first VTC (blocking, sim held);
// FRAGOs mid-fight are non-blocking — the world keeps running while higher
// talks. Every received order lands in CampaignState.fragoLog and can be
// recalled (replayed) from the objectives tracker at any time.
//
// The deck: THREE slides for this operation — CLEAR the town, DEFEND it until
// the FOB stands, BUILD the FOB — each just what a staff slide would carry: a
// map inset with operational graphics and a handful of task fragments.
import { useEffect, useRef, useState } from 'react'
import { S } from '../engine/state'
import { useUI } from './store'
import { ackBriefing, ackFrago, shopOfficer } from '../engine/campaign'
import { renderTerrainLayer, TERRAIN_PX } from '../map/mapRender'
import { CELL } from '../world/WorldMap'
import { controlField } from '../engine/frontline'
import { radioBrief, stopBrief, setBriefMuted, isBriefMuted } from '../audio/audio'
import { playerPack } from '../packs'
import type { StaffShop } from '../engine/GameState'
import BnHeader from './BnHeader'
import { PatchIcon } from './insignia'
import { Portrait } from './portrait'

const AMBER = '#e8b34a'
const bump = () => useUI.setState((s) => ({ tick: s.tick + 1 }))

// terrain layer for the slide's map inset — one render per map, shared
let _terrain: { mapRef: unknown; cv: HTMLCanvasElement } | null = null
function terrainLayer(): HTMLCanvasElement {
  if (!_terrain || _terrain.mapRef !== S.map) _terrain = { mapRef: S.map, cv: renderTerrainLayer(S.map!) }
  return _terrain.cv
}

const townName = (): string => {
  const t = S.campaign?.strongpoint
  if (!t || !S.map) return 'THE TOWN'
  const tw = S.map.towns.find(x => Math.hypot(x.x - t.x, x.y - t.y) < 200)
  return tw?.name ?? 'THE TOWN'
}

// ---------------------------------------------------------------------------
// Slide plumbing: shared deck chrome + a world→slide projection for the map
// inset, then one body function per slide.
// ---------------------------------------------------------------------------
interface Inset {
  ctx: CanvasRenderingContext2D
  x: (wx: number) => number
  y: (wy: number) => number
  rect: { x: number; y: number; w: number; h: number }
}

interface Slide {
  title: () => string
  // frame: world center + span for the map inset
  frame: () => { cx: number; cy: number; span: number }
  body: (i: Inset) => void
  bullets: () => string[]
}

function drawFlot(i: Inset): void {
  const cf = controlField(S)
  if (!cf) return
  const { ctx } = i
  const trace = (paths: typeof cf.blue, color: string) => {
    ctx.strokeStyle = color
    ctx.lineWidth = 1.6
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    for (const p of paths) {
      ctx.moveTo(i.x(p[0]!.x), i.y(p[0]!.y))
      for (let k = 1; k < p.length; k++) ctx.lineTo(i.x(p[k]!.x), i.y(p[k]!.y))
    }
    ctx.stroke()
    ctx.setLineDash([])
  }
  trace(cf.red, 'rgba(170,30,30,0.9)')
  trace(cf.blue, 'rgba(25,80,170,0.9)')
}

function drawObjective(i: Inset, label: string): void {
  const t = S.campaign!.strongpoint
  const { ctx } = i
  ctx.strokeStyle = '#a01414'
  ctx.lineWidth = 1.8
  ctx.beginPath(); ctx.ellipse(i.x(t.x), i.y(t.y), 24, 17, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = '#a01414'
  ctx.font = 'bold 9px Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(label, i.x(t.x), i.y(t.y) - 21)
}

function drawHq(i: Inset): void {
  const hq = S.map!.fob
  const { ctx } = i
  ctx.fillStyle = '#1e50a0'
  ctx.fillRect(i.x(hq.x) - 6, i.y(hq.y) - 4, 12, 8)
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 6px Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('HQ', i.x(hq.x), i.y(hq.y) + 2)
}

function drawContacts(i: Inset): void {
  const { ctx } = i
  for (const ct of S.contacts.values()) {
    ctx.save(); ctx.translate(i.x(ct.x), i.y(ct.y)); ctx.rotate(Math.PI / 4)
    ctx.strokeStyle = '#a01414'; ctx.lineWidth = 1.4
    ctx.strokeRect(-4, -4, 8, 8)
    ctx.restore()
    if (ct.unknown) {
      ctx.fillStyle = '#a01414'
      ctx.font = 'bold 8px Consolas, monospace'
      ctx.textAlign = 'center'
      ctx.fillText('?', i.x(ct.x), i.y(ct.y) + 2.5)
    }
  }
}

// fat military arrow from a to b (slide coords), friendly blue or enemy red
function drawArrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, enemy = false): void {
  const a = Math.atan2(y1 - y0, x1 - x0)
  const L = Math.hypot(x1 - x0, y1 - y0)
  ctx.save()
  ctx.translate(x0, y0); ctx.rotate(a)
  ctx.fillStyle = enemy ? 'rgba(160,20,20,0.45)' : 'rgba(30,80,160,0.55)'
  ctx.strokeStyle = enemy ? 'rgba(130,15,15,0.9)' : 'rgba(20,60,130,0.9)'
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(0, -5); ctx.lineTo(L - 16, -5); ctx.lineTo(L - 16, -11)
  ctx.lineTo(L, 0)
  ctx.lineTo(L - 16, 11); ctx.lineTo(L - 16, 5); ctx.lineTo(0, 5)
  ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.restore()
}

const corridorFrame = () => {
  const hq = S.map!.fob, t = S.campaign!.strongpoint
  return {
    cx: (hq.x + t.x) / 2, cy: (hq.y + t.y) / 2,
    span: Math.max(Math.hypot(t.x - hq.x, t.y - hq.y) * 1.7, 3600),
  }
}

const DECK: Slide[] = [
  // 1 — CLEAR: the approach and the objective
  {
    title: () => `CLEAR OBJ KEATON — ${townName()}`,
    frame: corridorFrame,
    body(i) {
      drawFlot(i)
      const hq = S.map!.fob, t = S.campaign!.strongpoint
      drawArrow(i.ctx, i.x(hq.x), i.y(hq.y), i.x(t.x), i.y(t.y) + 20)
      drawObjective(i, 'OBJ KEATON')
      drawContacts(i)
      drawHq(i)
    },
    bullets: () => [
      `UNKNOWN enemy contacts reported in ${townName()} — SCT locate and identify.`,
      `Platoons follow the MSR, FIX and CLEAR the town.`,
      `No fielding, no fires this phase — organic UAS only.`,
    ],
  },
  // 2 — DEFEND: battle positions facing the enemy, expected counterattack
  {
    title: () => 'DEFEND OBJ KEATON',
    frame: () => {
      const t = S.campaign!.strongpoint
      return { cx: t.x, cy: t.y - 200, span: 3000 }
    },
    body(i) {
      drawFlot(i)
      const t = S.campaign!.strongpoint
      const { ctx } = i
      // battle-position arc on the enemy-ward (north) side of the town
      ctx.strokeStyle = 'rgba(20,60,130,0.95)'
      ctx.lineWidth = 2.4
      ctx.beginPath()
      ctx.arc(i.x(t.x), i.y(t.y) + 8, 34, Math.PI * 1.12, Math.PI * 1.88)
      ctx.stroke()
      ctx.fillStyle = '#1e50a0'
      ctx.font = 'bold 8px Arial, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('BP 1', i.x(t.x), i.y(t.y) - 34)
      // the expected counterattack: enemy arrow in from the north
      drawArrow(ctx, i.x(t.x) + 26, i.y(t.y) - 105, i.x(t.x) + 6, i.y(t.y) - 34, true)
      ctx.fillStyle = '#a01414'
      ctx.fillText('CATK', i.x(t.x) + 40, i.y(t.y) - 96)
      drawObjective(i, 'OBJ KEATON')
    },
    bullets: () => [
      `Occupy the town — platoons ON LINE through the buildings.`,
      `EXPECT a counterattack from the north.`,
      `DIG IN — urban cover + prepared positions.`,
      `HOLD until FOB KEATON is built.`,
    ],
  },
  // 3 — BUILD FOB: sustainment forward, the supply line
  {
    title: () => `ESTABLISH FOB KEATON — ${townName()}`,
    frame: corridorFrame,
    body(i) {
      drawFlot(i)
      const hq = S.map!.fob, t = S.campaign!.strongpoint
      const { ctx } = i
      // the supply route: dashed friendly line HQ → FOB along the corridor
      ctx.strokeStyle = 'rgba(20,60,130,0.9)'
      ctx.lineWidth = 2
      ctx.setLineDash([7, 5])
      ctx.beginPath()
      ctx.moveTo(i.x(hq.x), i.y(hq.y))
      ctx.lineTo(i.x(t.x), i.y(t.y) + 14)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#1e50a0'
      ctx.font = 'bold 8px Arial, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('MSR', i.x((hq.x + t.x) / 2) + 16, i.y((hq.y + t.y) / 2))
      // FOB symbol in the town
      ctx.fillStyle = '#1e50a0'
      ctx.fillRect(i.x(t.x) - 7, i.y(t.y) - 5, 14, 10)
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 6px Arial, sans-serif'
      ctx.fillText('FOB', i.x(t.x), i.y(t.y) + 2)
      drawHq(i)
    },
    bullets: () => [
      `ENG establish FOB KEATON inside ${townName()}.`,
      `LOG open a standing supply run, HQ → KEATON.`,
      `Deliver 200 supply to stock KEATON.`,
    ],
  },
]

function drawSlide(cv: HTMLCanvasElement, idx: number): void {
  const ctx = cv.getContext('2d')!
  // the canvas is 2× its logical size — draw in logical coords, scaled, so the
  // big window stays crisp
  ctx.setTransform(2, 0, 0, 2, 0, 0)
  const W = cv.width / 2, H = cv.height / 2
  const slide = DECK[idx]!
  ctx.fillStyle = '#f0efe8'
  ctx.fillRect(0, 0, W, H)

  // classification strip (fictional — it's a game slide, styled like the real deck)
  ctx.fillStyle = '#8c1d1d'
  ctx.fillRect(0, 0, W, 15); ctx.fillRect(0, H - 15, W, 15)
  ctx.fillStyle = '#f0e6d0'
  ctx.font = 'bold 8px Consolas, monospace'
  ctx.textAlign = 'center'
  ctx.fillText('SECRET//NOFORN', W / 2, 11)
  ctx.fillText('SECRET//NOFORN', W / 2, H - 5)

  // title block
  ctx.fillStyle = '#161616'
  ctx.textAlign = 'left'
  ctx.font = 'bold 16px Arial, sans-serif'
  ctx.fillText(slide.title(), 16, 36)
  ctx.font = '9px Consolas, monospace'
  ctx.fillStyle = '#555'
  const dtg = `${String(Math.floor(S.t / 3600)).padStart(2, '0')}${String(Math.floor(S.t / 60) % 60).padStart(2, '0')}Z`
  ctx.fillText(`DIV HQ  ·  DTG ${dtg}  ·  SLIDE ${idx + 1} OF ${DECK.length}`, 16, 48)
  ctx.strokeStyle = '#999'
  ctx.beginPath(); ctx.moveTo(16, 53); ctx.lineTo(W - 16, 53); ctx.stroke()

  if (!S.map || !S.campaign) return

  // map inset
  const MX = 16, MY = 62, MW = 300, MH = H - 62 - 26
  const f = slide.frame()
  const sx = f.cx - f.span / 2, sy = f.cy - f.span * (MH / MW) / 2
  const k = MW / f.span
  const inset: Inset = {
    ctx,
    x: (wx) => MX + (wx - sx) * k,
    y: (wy) => MY + (wy - sy) * k,
    rect: { x: MX, y: MY, w: MW, h: MH },
  }
  ctx.save()
  ctx.beginPath(); ctx.rect(MX, MY, MW, MH); ctx.clip()
  const tpm = TERRAIN_PX / CELL
  ctx.drawImage(terrainLayer(), sx * tpm, sy * tpm, f.span * tpm, f.span * tpm * (MH / MW), MX, MY, MW, MH)
  // the road net (vector polylines — the cached terrain layer doesn't carry
  // them): dirt dashed, roads solid, the MSR heavier. Drawn under the
  // operational graphics like a printed map base.
  {
    const strokeCls = (cls: number, color: string, width: number, dash: number[] | null) => {
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.setLineDash(dash ?? [])
      ctx.beginPath()
      for (const r of S.map!.roads) {
        if (r.cls !== cls) continue
        ctx.moveTo(inset.x(r.pts[0]!.x), inset.y(r.pts[0]!.y))
        for (let p = 1; p < r.pts.length; p++) ctx.lineTo(inset.x(r.pts[p]!.x), inset.y(r.pts[p]!.y))
      }
      ctx.stroke()
      ctx.setLineDash([])
    }
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    strokeCls(1, 'rgba(120,96,64,0.75)', 0.8, [3, 2.5])
    strokeCls(2, 'rgba(96,80,58,0.9)', 1.4, null)
    strokeCls(3, 'rgba(70,58,42,0.95)', 2.2, null)
  }
  slide.body(inset)
  ctx.restore()
  ctx.strokeStyle = '#444'
  ctx.lineWidth = 1
  ctx.strokeRect(MX, MY, MW, MH)

  // task bullets
  const bx = MX + MW + 14, bw = W - bx - 16
  ctx.fillStyle = '#161616'
  ctx.font = 'bold 10px Arial, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('TASKS', bx, MY + 8)
  ctx.font = '9.5px Arial, sans-serif'
  let y = MY + 26
  for (const s of slide.bullets()) {
    const words = s.trim().split(/\s+/)
    let line = '•'
    for (const w of words) {
      if (ctx.measureText(line + ' ' + w).width > bw) {
        ctx.fillText(line, bx, y); y += 12
        line = '  ' + w
      } else line += ' ' + w
    }
    ctx.fillText(line, bx, y); y += 17
    if (y > H - 26) break
  }
}

// ---------------------------------------------------------------------------
// Slide thumbnails — the deck's preview rail (think slide sorter): every page
// rendered small, click to jump. Same live drawSlide as the main canvas.
// ---------------------------------------------------------------------------
function SlideThumb({ idx, active, onClick }: { idx: number; active: boolean; onClick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => { if (ref.current) drawSlide(ref.current, idx) }, [idx, active])
  return (
    <div onClick={onClick} style={{
      position: 'relative', cursor: 'pointer', borderRadius: 2, overflow: 'hidden',
      border: active ? '2px solid #e8b34a' : '1px solid #2a3a48',
      opacity: active ? 1 : 0.75,
    }}>
      <canvas ref={ref} width={1180} height={756} style={{ width: '100%', display: 'block' }} />
      <span style={{
        position: 'absolute', left: 4, top: 3, fontSize: 9, fontWeight: 700,
        color: active ? '#e8b34a' : '#9ab8d0', background: 'rgba(6,10,14,0.8)',
        padding: '0 4px', borderRadius: 2,
      }}>{idx + 1}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Camera tiles
// ---------------------------------------------------------------------------
function CamTile({ label, sub, h, speaking, bars, seed }: {
  label: string; sub?: string; h: number; speaking?: boolean; bars?: boolean
  seed?: string   // the REAL person's portrait seed — cameras-off VTC shows the DA photo
}) {
  // photo scales with the tile — the PRESENTER'S big tile gets a visibly
  // larger portrait than the attendee thumbnails
  const photoH = Math.round(h * 0.62)
  return (
    <div style={{
      position: 'relative', height: h, borderRadius: 3, overflow: 'hidden',
      background: 'radial-gradient(circle at 50% 42%, #22303c 0%, #101820 70%)',
      border: '1px solid #24343f',
    }}>
      {seed ? (
        // the actual soldier's DA photo, framed like a cameras-off avatar
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ border: '1px solid #33454f', borderRadius: 3, padding: 3, background: '#0c1218' }}>
            <Portrait seed={seed} w={Math.round(photoH * 28 / 34)} h={photoH} />
          </div>
        </div>
      ) : (
        <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} preserveAspectRatio="xMidYMax meet">
          <ellipse cx="50" cy="40" rx="15" ry="18" fill="#060a0e" />
          <path d="M 18 100 Q 22 64 50 62 Q 78 64 82 100 Z" fill="#060a0e" />
          <rect x="44" y="68" width="12" height="5" fill="#3a4a34" />
        </svg>
      )}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 3px)',
      }} />
      {bars && (
        <div style={{ position: 'absolute', left: 6, bottom: 6, display: 'flex', gap: 2, alignItems: 'flex-end', height: 14 }}>
          {[0, 1, 2, 3, 4].map(i => (
            <span key={i} style={{
              width: 3, background: speaking ? '#7ec87e' : '#33454f', height: 4 + (i % 3) * 4,
              animation: speaking ? `vtcBar 0.${5 + i}s ease-in-out infinite alternate` : 'none',
            }} />
          ))}
        </div>
      )}
      {!bars && (
        // attendees are on receive: mic-muted glyph
        <div style={{ position: 'absolute', left: 6, bottom: 4, fontSize: 9, color: '#6a4a4a' }}>🎙̶</div>
      )}
      <div style={{
        position: 'absolute', right: 5, bottom: 4, fontSize: 8, letterSpacing: 1,
        color: '#9ab8d0', background: 'rgba(6,10,14,0.75)', padding: '1px 5px', borderRadius: 2,
        whiteSpace: 'nowrap',
      }}>{label}{sub ? ` · ${sub}` : ''}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The window
// ---------------------------------------------------------------------------
// find a FIT staff officer of the player battalion by billet (the org has the
// real people — VTCs put the PROPER attendees on the line)
function bnStaff(pos: string) {
  const bn = playerPack().formation?.playerBn
  for (const sl of S.org?.slots ?? []) {
    if (sl.bn !== bn) continue
    const s = sl.soldiers.find(x => x.pos === pos && x.status === 'FIT')
    if (s) return s
  }
  return undefined
}
const seedOf = (s?: { pid?: string; id: number }) => s ? (s.pid ?? `s:${s.id}`) : undefined
// division-wide billet lookup: the CG is a REAL person on the division roster
// (org.ts generates the Commanding General with the rest of the formation)
function divStaff(pos: string) {
  for (const sl of S.org?.slots ?? []) {
    const s = sl.soldiers.find(x => x.pos === pos && x.status === 'FIT')
    if (s) return s
  }
  return undefined
}
const staffTile = (short: string, pos: string) => {
  const s = bnStaff(pos)
  return {
    label: short,
    sub: s ? `${s.rank} ${(s.name ?? '').split(' ').pop()}` : undefined,
    seed: seedOf(s), // the real person's DA photo on the tile
  }
}

export function VtcWindow({ entry, blocking, review, startSlide = 0, onClose }: {
  entry: {
    title: string; text: string
    speaker?: { name: string; title: string } // a staff officer on the line instead of the CG
    docOnly?: boolean                          // no operation deck — the document is the visual
    shop?: StaffShop                           // staff-shop document: its console header letterheads the paper
  }
  blocking?: boolean
  review?: boolean       // recalled order/report: the DOCUMENT for review — no call, no voice
  startSlide?: number
  onClose: () => void
}) {
  const [phase, setPhase] = useState<'link' | 'live'>(review ? 'live' : 'link')
  const [speaking, setSpeaking] = useState(false)
  const [slide, setSlide] = useState(startSlide)
  const [voiceOff, setVoiceOff] = useState(isBriefMuted())
  const slideRef = useRef<HTMLCanvasElement>(null)

  // connect beat, then the CG reads the order (speaking bars run for the
  // exact scheduled duration; 0 = audio unavailable/muted, bars stay still).
  // A REVIEW skips all of it — it's a document, not a call.
  useEffect(() => {
    setSlide(startSlide)
    if (review) { setPhase('live'); return }
    setPhase('link')
    const t1 = setTimeout(() => {
      setPhase('live')
      const dur = radioBrief(entry.text, entry.speaker?.name)
      if (dur > 0) {
        setSpeaking(true)
        const t2 = setTimeout(() => setSpeaking(false), dur * 1000)
        return () => clearTimeout(t2)
      }
    }, 900)
    return () => { clearTimeout(t1); stopBrief() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry])

  // the deck auto-advances like a briefing being walked: 10 s a page, wrapping.
  // Manual ◀ ▶ clicks restart the timer (this effect re-runs on any change).
  useEffect(() => {
    if (phase !== 'live' || entry.docOnly) return
    const t = setTimeout(() => setSlide(s => (s + 1) % DECK.length), 10000)
    return () => clearTimeout(t)
  }, [phase, slide, entry.docOnly])

  useEffect(() => {
    if (phase === 'live' && !entry.docOnly && slideRef.current) drawSlide(slideRef.current, slide)
  }, [phase, slide, entry])

  // attendee tiles: the PROPER people for the meeting. A CG operations call
  // seats the battalion command team (XO, S3, CSM); a staff report call seats
  // that shop's chain (NCOIC) plus the XO and CSM.
  const attendees = entry.speaker
    ? [staffTile('S1 NCOIC', 'S1 NCOIC'), staffTile('CSM', 'Command Sergeant Major'), staffTile('XO', 'Executive Officer')]
    : [staffTile('XO', 'Executive Officer'), staffTile('S3', 'S3 — Operations'), staffTile('CSM', 'Command Sergeant Major')]

  const navBtn = (dir: -1 | 1, label: string) => (
    <button onClick={() => setSlide(s => Math.max(0, Math.min(DECK.length - 1, s + dir)))}
      style={{
        padding: '2px 10px', borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit',
        background: 'rgba(16,26,36,0.85)', border: '1px solid #2a3a48',
        color: '#9ab8d0', fontSize: 10, letterSpacing: 1,
      }}>{label}</button>
  )

  const win = (
    <div style={{
      width: 1760, maxWidth: '96vw',
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
          width: 7, height: 7, borderRadius: '50%',
          background: review ? '#54708a' : phase === 'live' ? '#d43a3a' : '#666',
          animation: !review && phase === 'live' ? 'vtcBlink 1.2s step-end infinite' : 'none',
        }} />
        {/* concise DIV HQ identity in the window bar (the PRODUCT carries the
            producing shop's full header — see ROADMAP: DIV HQ product headers) */}
        {!review && !entry.speaker && <PatchIcon id={playerPack().patch} h={15} />}
        <span style={{ fontSize: 10, letterSpacing: 2.5, color: '#9ab8d0' }}>
          {review ? (entry.speaker ? 'REPORT — REVIEW COPY' : 'ORDER — REVIEW COPY')
            : entry.speaker ? `${entry.speaker.title} — SECURE VTC`
            : `${playerPack().abbr} DIV HQ — SECURE VTC`}
        </span>
        <span style={{ fontSize: 9, letterSpacing: 1.5, color: '#54708a', marginLeft: 'auto' }}>
          {review ? 'FROM THE ORDERS LOG' : phase === 'link' ? 'ESTABLISHING SECURE LINK…' : 'LINK ENCRYPTED · LIVE'}
        </span>
        {!review && <button onClick={() => {
          const next = !voiceOff
          setBriefMuted(next)
          setVoiceOff(next)
          if (next) setSpeaking(false)
        }}
          title={voiceOff ? 'Unmute the briefing voice' : 'Mute the briefing voice'}
          style={{
            padding: '2px 9px', borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit',
            background: 'rgba(16,26,36,0.85)', border: `1px solid ${voiceOff ? '#6a4a4a' : '#2a3a48'}`,
            color: voiceOff ? '#c88a8a' : '#9ab8d0', fontSize: 9, letterSpacing: 1.5,
          }}>{voiceOff ? 'VOICE OFF' : 'VOICE ON'}</button>}
      </div>

      {phase === 'link' ? (
        <div style={{
          height: 760, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#54708a', fontSize: 14, letterSpacing: 2,
          background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.02) 0 1px, transparent 1px 3px)',
        }}>
          ▚▞ CONNECTING ▞▚
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, padding: 12 }}>
          {/* roster column: the CG + attendees — a CALL thing; a review is just the document */}
          {!review && (
          <div style={{ width: 500, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* the speaker: a staff report call puts the REAL shop officer's
                photo up (resolved from the org via the report's shop); a CG
                call puts up the ACTUAL Commanding General from the division
                roster — everyone on the net is a real person */}
            {(() => {
              const cg = entry.speaker ? undefined : divStaff('Commanding General')
              return (
                <CamTile
                  label={entry.speaker ? entry.speaker.name
                    : cg ? `${cg.rank} ${(cg.name ?? '').split(' ').pop()}` : 'CG'}
                  sub={entry.speaker?.title ?? `CG · ${playerPack().abbr}`}
                  h={390} bars speaking={speaking}
                  seed={entry.shop ? seedOf(shopOfficer(S, entry.shop) ?? undefined) : seedOf(cg)} />
              )
            })()}
            <div style={{ fontSize: 9, letterSpacing: 2, color: '#54708a' }}>
              {(() => {
                const who = entry.speaker ? entry.speaker.title.split(' —')[0] : 'CG'
                return speaking ? `— ${who} TRANSMITTING —` : `${who} STANDING BY`
              })()}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {/* your own preview tile, like any real VTC client — you are COBALT 6,
                  and your soldier exists in the org (the battalion commander) */}
              <CamTile label={`LTC ${S.campaign?.commander ?? 'ACTUAL'}`} sub="COBALT 6" h={124}
                seed={seedOf(bnStaff('Battalion Commander'))} />
              {attendees.map(a => <CamTile key={a.label} label={a.label} sub={a.sub} seed={a.seed} h={124} />)}
            </div>
          </div>
          )}
          {/* vertical divider: the people on the call | the product */}
          {!review && (
            <div style={{ width: 1, flex: '0 0 auto', alignSelf: 'stretch', background: '#24343f' }} />
          )}
          {/* the visual: the operation deck, or the report DOCUMENT itself */}
          {entry.docOnly ? (
            <div style={{
              flex: 1, minWidth: 0, height: 790, overflowY: 'auto', borderRadius: 2,
              background: '#e8e4da', color: '#1a1a18', padding: '34px 44px',
              fontFamily: 'Consolas, monospace',
            }}>
              <div style={{ textAlign: 'center', fontSize: 11, letterSpacing: 3, color: '#7a1f1f', fontWeight: 'bold' }}>
                SECRET//NOFORN
              </div>
              {/* the producing shop's letterhead — same proud header as its console, paper tone */}
              {entry.shop && (() => {
                const info = playerPack().staff?.[entry.shop!]
                return (
                  <div style={{ margin: '16px 0 4px' }}>
                    <BnHeader tone="paper" plate={info?.label ?? entry.shop!.toUpperCase()}
                      sub={`${(info?.name ?? '').toUpperCase()} · ${playerPack().name.toUpperCase()}`} />
                  </div>
                )
              })()}
              <div style={{ fontSize: 18, fontWeight: 'bold', letterSpacing: 2, margin: '18px 0 14px' }}>
                {entry.title}
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{entry.text}</div>
              <div style={{ textAlign: 'center', fontSize: 11, letterSpacing: 3, color: '#7a1f1f', fontWeight: 'bold', marginTop: 26 }}>
                SECRET//NOFORN
              </div>
            </div>
          ) : (
          <div style={{ display: 'flex', gap: 10, flex: 1, minWidth: 0 }}>
            {/* the deck's preview rail — every page, click to jump */}
            <div style={{
              width: 128, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6,
              overflowY: 'auto', paddingRight: 2,
            }}>
              {DECK.map((_, i) => (
                <SlideThumb key={i} idx={i} active={i === slide} onClick={() => setSlide(i)} />
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
              <canvas ref={slideRef} width={1180} height={756}
                style={{ width: '100%', borderRadius: 2 }} />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
                {navBtn(-1, '◀')}
                <span style={{ fontSize: 10, letterSpacing: 1.5, color: '#54708a' }}>
                  SLIDE {slide + 1} / {DECK.length}
                </span>
                {navBtn(1, '▶')}
              </div>
            </div>
          </div>
          )}
        </div>
      )}

      {/* footer bar: mirrors the header — the call's one committing action
          lives here (ACKNOWLEDGE / END CALL / CLOSE) */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10,
        padding: '7px 12px', borderTop: '1px solid #24343f', background: 'rgba(8,12,17,0.9)',
      }}>
        <span style={{ fontSize: 9, letterSpacing: 1.5, color: '#54708a', marginRight: 'auto' }}>
          {review ? 'REVIEW — NO ACKNOWLEDGEMENT REQUIRED' : 'ACKNOWLEDGE TO RELEASE THE NET'}
        </span>
        <button onClick={() => { stopBrief(); onClose(); bump() }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = AMBER }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a3a48' }}
          style={{
            padding: '7px 22px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit',
            background: 'rgba(16,26,36,0.85)', border: '1px solid #2a3a48', borderLeft: `3px solid ${AMBER}`,
            color: '#e6f0f8', fontSize: 11, letterSpacing: 2.5, fontWeight: 'bold',
          }}>{blocking ? 'ACKNOWLEDGE' : review ? 'CLOSE' : 'END CALL'}</button>
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
    <div style={{ position: 'fixed', top: 58, left: '50%', transform: 'translateX(-50%)', zIndex: 104 }}>
      {win}
    </div>
  )
}

// While ANY VTC is up, the war holds: attention is on the call. Pause on
// mount, hand the player's chosen speed back on close (a pending tutorial
// gate will re-pause itself on the next tick if it needs to).
function usePauseWhileOpen(): void {
  useEffect(() => {
    const prev = S.speed > 0 ? S.speed : 1
    S.speed = 0
    return () => { if (S.speed === 0) S.speed = prev }
  }, [])
}

// FRAGO VTC host: mounts whenever a FRAGO is open (new tasking or a recall
// from the log). Holds the sim while the call is up. The LINES OF SUPPLY call
// opens on the FOB slide; everything else starts at slide 1.
function FragoCall({ entry }: { entry: { title: string; text: string } }) {
  usePauseWhileOpen()
  const start = entry.title === 'LINES OF SUPPLY' ? 2 : 0
  return <VtcWindow entry={entry} startSlide={start} onClose={() => ackFrago(S)} />
}

export function VtcFrago() {
  useUI((s) => s.tick)
  const c = S.campaign
  if (!c || c.complete || !c.briefed || c.frago == null) return null
  if (c.frago.review) {
    // recalled order: the document for review, not a call replay
    return <ReviewDoc entry={c.frago} />
  }
  return <FragoCall entry={c.frago} />
}

function ReviewDoc({ entry }: { entry: { title: string; text: string } }) {
  usePauseWhileOpen()
  const start = entry.title === 'LINES OF SUPPLY' ? 2 : 0
  return <VtcWindow entry={entry} review startSlide={start} onClose={() => ackFrago(S)} />
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
