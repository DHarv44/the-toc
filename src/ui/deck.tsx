// The STAFF DECK — the briefing product itself, independent of whoever is
// showing it. A deck is a list of slides drawn live from world state onto a
// canvas styled like a real operations slide: classification strips, a title
// block with the DTG, a map inset carrying the operational graphics, and a
// TASKS column down the right.
//
// This is deliberately NOT part of the VTC. A VTC is a call; a deck is paper.
// The same deck is what you look at on the call, what you pull back out of the
// orders log afterwards, and what any future console can show without a call
// happening at all. Vtc.tsx renders <SlideDeck/>; it does not own it.
//
// Decks shipped here:
//   OPERATION_DECK  — the mainline: CLEAR the town, DEFEND it, BUILD the FOB
//   recoveryDeck(r) — a personnel-recovery tasking, built per downed site
import { useEffect, useRef, useState } from 'react'
import { S } from '../engine/state'
import { renderPackLayer, TERRAIN_PX } from '../map/packRender'
import { controlField } from '../engine/frontline'
import { locRef } from '../world/ref'
import type { RecoveryRef } from '../engine/GameState'

// terrain layer for the slide's map inset — one render per map, shared
let _terrain: { mapRef: unknown; cv: HTMLCanvasElement } | null = null
function terrainLayer(): HTMLCanvasElement {
  if (!_terrain || _terrain.mapRef !== S.map) {
    _terrain = { mapRef: S.map, cv: renderPackLayer(S.map!, S.map!.ground!) }
  }
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
export interface Inset {
  ctx: CanvasRenderingContext2D
  x: (wx: number) => number
  y: (wy: number) => number
  rect: { x: number; y: number; w: number; h: number }
}

export interface Slide {
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

// ---------------------------------------------------------------------------
// OPERATION deck — the mainline scheme of maneuver
// ---------------------------------------------------------------------------
export const OPERATION_DECK: Slide[] = [
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

// ---------------------------------------------------------------------------
// RECOVERY deck — a personnel-recovery tasking is its own small operation and
// gets its own slides. Built per site rather than declared as a const: the
// ground it is about is wherever the platoon went off the net.
// ---------------------------------------------------------------------------
function drawSite(i: Inset, r: RecoveryRef): void {
  const { ctx } = i
  const x = i.x(r.x), y = i.y(r.y)
  // LKP: a DASHED ring around the DUSTWUN cross. Dashed is the whole point —
  // this is a last known position, nobody has eyes on it.
  ctx.strokeStyle = '#7a4ba8'
  ctx.lineWidth = 1.8
  ctx.setLineDash([4, 3])
  ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.stroke()
  ctx.setLineDash([])
  ctx.lineWidth = 2.4
  ctx.beginPath()
  ctx.moveTo(x - 7, y - 7); ctx.lineTo(x + 7, y + 7)
  ctx.moveTo(x + 7, y - 7); ctx.lineTo(x - 7, y + 7)
  ctx.stroke()
  ctx.fillStyle = '#7a4ba8'
  ctx.font = 'bold 9px Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(`${r.label} · LKP`, x, y - 27)
}

export function recoveryDeck(r: RecoveryRef): Slide[] {
  const assist = !!r.respFrom
  const at = () => (S.map ? locRef(S.map, r.x, r.y) : 'UNKNOWN')
  const legFrame = () => {
    const hq = S.map!.fob
    return {
      cx: (hq.x + r.x) / 2, cy: (hq.y + r.y) / 2,
      span: Math.max(Math.hypot(r.x - hq.x, r.y - hq.y) * 1.7, 3000),
    }
  }
  return [
    // 1 — SITUATION: where they went down, and what is around them
    {
      title: () => (assist ? `CONVOY DOWN — ${r.label}` : `PERSONNEL RECOVERY — ${r.label}`),
      frame: () => ({ cx: r.x, cy: r.y, span: 3200 }),
      body(i) {
        drawFlot(i)
        drawContacts(i)
        drawSite(i, r)
        drawHq(i)
      },
      bullets: () => [
        `${r.label}${r.lineage ? ` · ${r.lineage}` : ''} off the net — LKP ${at()}.`,
        `Personnel status UNKNOWN. Assume wounded on the ground.`,
        assist
          ? `${r.respFrom} element — DIVISION's tasking, not ours. Assistance is OPTIONAL.`
          : `Enemy holding that ground takes our people PRISONER.`,
      ],
    },
    // 2 — EXECUTION: get there, hold it, sweep it
    {
      title: () => 'SECURE AND SWEEP',
      frame: legFrame,
      body(i) {
        drawFlot(i)
        const hq = S.map!.fob
        drawArrow(i.ctx, i.x(hq.x), i.y(hq.y), i.x(r.x), i.y(r.y) + 18)
        drawSite(i, r)
        drawHq(i)
      },
      bullets: () => [
        `Move an element to the LKP and SECURE the grid.`,
        `HOLD it — the sweep runs on secure TIME, not on arrival.`,
        assist
          ? `Equipment may be recoverable. Division will remember the assist.`
          : `A MED element on the recovery saves lives. Every minute counts.`,
      ],
    },
  ]
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
export function drawSlide(cv: HTMLCanvasElement, idx: number, deck: Slide[]): void {
  const ctx = cv.getContext('2d')!
  // the canvas is 2× its logical size — draw in logical coords, scaled, so the
  // big window stays crisp
  ctx.setTransform(2, 0, 0, 2, 0, 0)
  const W = cv.width / 2, H = cv.height / 2
  const slide = deck[idx]
  ctx.fillStyle = '#f0efe8'
  ctx.fillRect(0, 0, W, H)
  if (!slide) return

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
  ctx.fillText(`DIV HQ  ·  DTG ${dtg}  ·  SLIDE ${idx + 1} OF ${deck.length}`, 16, 48)
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
  const tpm = TERRAIN_PX / S.map!.CELL
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
    // five classes (track → motorway), widths graded like a printed sheet
    strokeCls(1, 'rgba(120,96,64,0.75)', 0.8, [3, 2.5])
    strokeCls(2, 'rgba(104,88,62,0.85)', 1.0, null)
    strokeCls(3, 'rgba(96,80,58,0.9)', 1.4, null)
    strokeCls(4, 'rgba(80,66,48,0.95)', 1.8, null)
    strokeCls(5, 'rgba(70,58,42,0.95)', 2.2, null)
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

// Slide thumbnails — the preview rail (think slide sorter): every page
// rendered small, click to jump. Same live drawSlide as the main canvas.
function SlideThumb({ idx, active, deck, onClick }: {
  idx: number; active: boolean; deck: Slide[]; onClick: () => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => { if (ref.current) drawSlide(ref.current, idx, deck) }, [idx, active, deck])
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
// <SlideDeck/> — the deck as a self-contained thing: preview rail, the page
// itself, and the pager. It owns which slide is up and walks itself like a
// briefing being presented; `onPage` fires when the viewer takes it OFF the
// rails and drives it by hand (the tutorial listens for exactly that).
//
// The `vtc-*` data-tut ids are the PUBLISHED anchor names the packs point at,
// so they travel with the markup rather than staying behind in Vtc.tsx.
// ---------------------------------------------------------------------------
export function SlideDeck({ deck, live = true, startSlide = 0, onPage }: {
  deck: Slide[]
  live?: boolean         // false while a call is still connecting — draw nothing yet
  startSlide?: number
  onPage?: () => void
}) {
  const [slide, setSlide] = useState(startSlide)
  const ref = useRef<HTMLCanvasElement>(null)

  // a new deck (or a recalled order opening on a given page) starts there
  useEffect(() => { setSlide(startSlide) }, [deck, startSlide])

  // walks itself like a briefing: 10 s a page, wrapping. Any manual page
  // restarts the timer, because this effect re-runs on `slide`.
  useEffect(() => {
    if (!live || deck.length < 2) return
    const t = setTimeout(() => setSlide(s => (s + 1) % deck.length), 10000)
    return () => clearTimeout(t)
  }, [live, slide, deck])

  useEffect(() => {
    if (live && ref.current) drawSlide(ref.current, Math.min(slide, deck.length - 1), deck)
  }, [live, slide, deck])

  const page = (n: number | ((s: number) => number)) => { onPage?.(); setSlide(n) }

  const navBtn = (dir: -1 | 1, label: string) => (
    <button data-tut={dir > 0 ? 'vtc-next' : undefined}
      onClick={() => page(s => Math.max(0, Math.min(deck.length - 1, s + dir)))}
      style={{
        padding: '2px 10px', borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit',
        background: 'rgba(16,26,36,0.85)', border: '1px solid #2a3a48',
        color: '#9ab8d0', fontSize: 10, letterSpacing: 1,
      }}>{label}</button>
  )

  return (
    <div data-tut="vtc-deck" style={{ display: 'flex', gap: 10, flex: 1, minWidth: 0 }}>
      {/* the preview rail — every page, click to jump. Shares the `vtc-nav`
          tutorial tag with the arrow row below: they are the two ways to drive
          the deck, so a cue rings both */}
      <div data-tut="vtc-nav" style={{
        width: 128, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6,
        overflowY: 'auto', paddingRight: 2,
      }}>
        {deck.map((_, i) => (
          <SlideThumb key={i} idx={i} deck={deck} active={i === slide} onClick={() => page(i)} />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
        <canvas ref={ref} width={1180} height={756} style={{ width: '100%', borderRadius: 2 }} />
        <div data-tut="vtc-nav" style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
          {navBtn(-1, '◀')}
          <span style={{ fontSize: 10, letterSpacing: 1.5, color: '#54708a' }}>
            SLIDE {Math.min(slide, deck.length - 1) + 1} / {deck.length}
          </span>
          {navBtn(1, '▶')}
        </div>
      </div>
    </div>
  )
}
