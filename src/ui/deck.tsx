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
//   operationDeck() — the mainline, GENERATED from the scenario's objectives
//   recoveryDeck(r) — a personnel-recovery tasking, built per downed site
//
// Neither one is a written list of pages. A deck is a RENDERING of something
// the world already knows — the operation's objectives, a downed site — so it
// cannot drift from what the tracker, the map and the fight actually say.
import { useEffect, useRef, useState } from 'react'
import { S } from '../engine/state'
import { packLayerFor, TERRAIN_PX } from '../map/packRender'
import { controlField } from '../engine/frontline'
import { locRef } from '../world/ref'
import {
  operation, objectiveFocus, revealedEnd,
  type ObjKind, type RuntimeObjective,
} from '../engine/campaign'
import { commandsStructure } from '../domains/forces/command'
import { STRUCTURES } from '../domains/installations/catalog'
import type { Vec2 } from '../world/WorldMap'
import type { RecoveryRef } from '../engine/GameState'
import { TUT } from './tutTargets'

// terrain layer for the slide's map inset. This kept its OWN cache keyed on
// S.map, which meant the deck baked a second 64 MB sheet identical to the one
// MapView was already holding. One cache, in packRender, for every consumer.
const terrainLayer = (): HTMLCanvasElement => packLayerFor(S.map!, S.map!.ground!)

// WHAT TO CALL A PIECE OF GROUND on paper: the gazetteer name if the map has
// one there, otherwise the grid reference. Never 'THE TOWN' — a slide that
// cannot name the ground it is about gives the commander a grid instead.
function groundName(p: Vec2): string {
  const m = S.map
  if (!m) return ''
  const near = <T extends { name: string; x: number; y: number }>(list: T[]): T | undefined =>
    list.find(t => Math.hypot(t.x - p.x, t.y - p.y) < 600)
  return near(m.towns)?.name ?? near(m.features)?.name ?? locRef(m, p.x, p.y)
}

// YOUR command post — the base every scheme of maneuver is drawn from. The one
// you COMMAND, not merely the friendly one nearest the top of the list: a
// sister formation's headquarters is not where your supply line starts.
function playerHq(): { x: number; y: number; label: string } {
  const st = S.structures.find(s => s.kind === 'HQ' && commandsStructure(s))
  if (st) return { x: st.x, y: st.y, label: st.label || 'HQ' }
  const f = S.map!.fob
  return { x: f.x, y: f.y, label: 'HQ' }
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

// metres → slide pixels, read off the page's OWN projection, so a graphic
// scales with whatever frame it lands in instead of guessing at one
const scale = (i: Inset): number => (i.x(1000) - i.x(0)) / 1000

// a base stamp — the little filled block an installation gets on paper
function drawBase(i: Inset, p: Vec2, abbr: string): void {
  const { ctx } = i
  const x = i.x(p.x), y = i.y(p.y)
  ctx.fillStyle = '#1e50a0'
  ctx.fillRect(x - 7, y - 5, 14, 10)
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 6px Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(abbr, x, y + 2)
}

const drawHq = (i: Inset): void => drawBase(i, playerHq(), 'HQ')

// The objective itself: the ring at its REAL radius, its name above it. Drawn
// DASHED while the task is still an assumption — a ring nobody has stood on is
// what intelligence believes, and paper should say which one it is.
function drawObjective(
  i: Inset, at: { x: number; y: number; r: number }, label: string, assumed = false,
): void {
  const { ctx } = i
  const x = i.x(at.x), y = i.y(at.y)
  const r = Math.max(11, at.r * scale(i))
  ctx.strokeStyle = '#a01414'
  ctx.lineWidth = 1.8
  if (assumed) ctx.setLineDash([5, 4])
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#a01414'
  ctx.font = 'bold 9px Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(label, x, y - r - 5)
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

// an axis of advance in WORLD terms, stopped short of whatever it points at
// (an arrow should reach the objective, not sit on top of it)
function drawAxis(i: Inset, from: Vec2, to: Vec2, stop = 0, enemy = false): void {
  const x0 = i.x(from.x), y0 = i.y(from.y)
  let x1 = i.x(to.x), y1 = i.y(to.y)
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy)
  if (L < stop + 20) return              // too close to draw an honest arrow
  x1 -= (dx / L) * stop; y1 -= (dy / L) * stop
  drawArrow(i.ctx, x0, y0, x1, y1, enemy)
}

// WHICH WAY THE ENEMY IS from a piece of ground — the bearing to their base,
// and the word for it. The counterattack graphic and the bullet that warns
// about it both come off this, so they can never point different ways.
const threatDir = (at: Vec2): number =>
  Math.atan2(S.map!.enemyBase.y - at.y, S.map!.enemyBase.x - at.x)
const COMPASS = ['EAST', 'SOUTHEAST', 'SOUTH', 'SOUTHWEST', 'WEST', 'NORTHWEST', 'NORTH', 'NORTHEAST']
const compassOf = (rad: number): string =>
  COMPASS[Math.round(((rad + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8]!

// how many contacts the COP holds inside a piece of ground (what the S2 can
// actually say about it — not what is really there)
const contactsIn = (at: { x: number; y: number; r: number }): number =>
  [...S.contacts.values()].filter(c => Math.hypot(c.x - at.x, c.y - at.y) <= at.r).length

// ---------------------------------------------------------------------------
// OPERATION deck — one page per objective, GENERATED from the scenario. The
// missions ARE the scheme of maneuver, so the deck renders them rather than
// restating them; nothing below names a place, a town or an operation.
//
// Each objective VERB brings its own operational graphic and its own TASKS
// lines. That is the extension point: a new objective kind ships its slide
// here, beside the rule that evaluates it, and every scenario using that verb
// gets a briefing page for free.
// ---------------------------------------------------------------------------
type Focus = { x: number; y: number; r: number } | null

interface ObjGraphic {
  /** the page's operational graphic, drawn about the objective's own ground */
  body(i: Inset, o: RuntimeObjective, at: Focus): void
  /** the TASKS column, read off the objective's own parameters */
  bullets(o: RuntimeObjective, at: Focus): string[]
  /** how much ground the page shows — ZONE frames the objective itself,
   *  CORRIDOR frames base → objective (a phase that is about getting there) */
  frame: 'zone' | 'corridor'
}

const OBJ_GRAPHICS: Record<ObjKind, ObjGraphic> = {
  // FIND THEM — a screen forward onto ground nobody has stood on yet
  'recon-area': {
    frame: 'corridor',
    body(i, o, at) {
      drawFlot(i)
      if (at) {
        drawAxis(i, playerHq(), at, Math.max(11, at.r * scale(i)) + 6)
        drawObjective(i, at, o.label, true)
      }
      drawContacts(i)
      drawHq(i)
    },
    bullets(o, at) {
      const held = at ? contactsIn(at) : 0
      return [
        `SCREEN forward and IDENTIFY what holds ${at ? groundName(at) : 'the objective'}.`,
        at ? `Area of interest — ${Math.round(at.r)} m about ${locRef(S.map!, at.x, at.y)}.`
          : 'Area of interest not yet fixed.',
        held ? `${held} contact${held === 1 ? '' : 's'} on the board, none of them confirmed.`
          : 'Nothing held on the board — expect to be surprised.',
        'RECON task: eyes on the objective, not decisive engagement.',
      ]
    },
  },
  // CLEAR — the assault: axis of advance onto the objective
  'clear-area': {
    frame: 'corridor',
    body(i, o, at) {
      drawFlot(i)
      if (at) {
        drawAxis(i, playerHq(), at, Math.max(11, at.r * scale(i)) + 6)
        drawObjective(i, at, o.label)
      }
      drawContacts(i)
      drawHq(i)
    },
    bullets(o, at) {
      const held = at ? contactsIn(at) : 0
      return [
        `CLEAR ${at ? groundName(at) : 'the objective'} — nothing hostile left inside it.`,
        `Assault axis runs from ${playerHq().label}; the objective is ${at ? `${Math.round(at.r)} m` : 'as marked'}.`,
        held ? `${held} contact${held === 1 ? '' : 's'} held inside the objective at this hour.`
          : 'No contacts held inside the objective at this hour.',
      ]
    },
  },
  // HOLD — the ground is yours; the graphic is the counterattack coming for it
  'defeat-group': {
    frame: 'zone',
    body(i, o, at) {
      drawFlot(i)
      if (!at) { drawContacts(i); return }
      const { ctx } = i
      const x = i.x(at.x), y = i.y(at.y)
      const dir = threatDir(at)                       // toward the enemy base
      const R = Math.max(26, at.r * scale(i) * 0.9)
      // battle position: an arc facing the way they are coming from
      ctx.strokeStyle = 'rgba(20,60,130,0.95)'
      ctx.lineWidth = 2.4
      ctx.beginPath()
      ctx.arc(x, y, R, dir - Math.PI * 0.38, dir + Math.PI * 0.38)
      ctx.stroke()
      ctx.fillStyle = '#1e50a0'
      ctx.font = 'bold 8px Arial, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('BP', x + Math.cos(dir) * (R + 9), y + Math.sin(dir) * (R + 9))
      // the counterattack itself, in from their side of the map
      const from = { x: at.x + Math.cos(dir) * at.r * 4, y: at.y + Math.sin(dir) * at.r * 4 }
      drawAxis(i, from, at, R + 8, true)
      ctx.fillStyle = '#a01414'
      ctx.fillText(o.groupTag ? `CATK · ${o.groupTag}` : 'CATK',
        i.x(at.x + Math.cos(dir) * at.r * 3.2), i.y(at.y + Math.sin(dir) * at.r * 3.2) - 8)
      drawObjective(i, at, o.label)
      drawContacts(i)
    },
    bullets(o, at) {
      return [
        `HOLD what you have taken — ${at ? groundName(at) : 'the objective'} does not change hands.`,
        at ? `Counterattack expected from the ${compassOf(threatDir(at))}.`
          : 'Counterattack expected — direction unconfirmed.',
        'DIG IN. Prepared positions stack with whatever cover the ground gives.',
        `${o.groupTag ?? 'The attacking force'} is defeated when it is destroyed OR broken — a group that`
        + ' runs is beaten, and chasing its last vehicle is not the mission.',
      ]
    },
  },
  // BUILD — sustainment forward: the site and what goes on it
  build: {
    frame: 'zone',
    body(i, o, at) {
      drawFlot(i)
      if (!at) { drawHq(i); return }
      drawObjective(i, at, o.label)
      drawBase(i, at, o.structKind ? STRUCTURES[o.structKind].abbr : 'BASE')
      drawContacts(i)
    },
    bullets(o, at) {
      const st = o.structKind ? STRUCTURES[o.structKind] : null
      return [
        `ENGINEERS establish ${st ? st.name.toUpperCase() : 'the installation'}`
        + ` at ${at ? groundName(at) : 'the marked site'}.`,
        at ? `Site is the marked ground — ${Math.round(at.r)} m about ${locRef(S.map!, at.x, at.y)}.`
          : 'Site as marked.',
        'It goes up where the engineers are standing. Bring them forward, and keep them covered.',
      ]
    },
  },
  // DELIVER — the supply line: base to forward base, running on its own
  deliver: {
    frame: 'corridor',
    body(i, o, at) {
      drawFlot(i)
      const hq = playerHq()
      if (at) {
        const { ctx } = i
        ctx.strokeStyle = 'rgba(20,60,130,0.9)'
        ctx.lineWidth = 2
        ctx.setLineDash([7, 5])
        ctx.beginPath()
        ctx.moveTo(i.x(hq.x), i.y(hq.y))
        ctx.lineTo(i.x(at.x), i.y(at.y))
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = '#1e50a0'
        ctx.font = 'bold 8px Arial, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('MSR', i.x((hq.x + at.x) / 2) + 16, i.y((hq.y + at.y) / 2))
        drawBase(i, at, 'FOB')
      }
      drawContacts(i)
      drawHq(i)
    },
    bullets(o, at) {
      return [
        `Deliver ${o.amount ?? 0} supply forward to ${at ? groundName(at) : 'the forward base'}.`,
        `Standing convoy — ${playerHq().label} to the forward base, running without further orders.`,
        'The trucks do not fight. Route security is the task force’s problem.',
      ]
    },
  },
}

/** ONE PAGE for one objective. Every part of it is a thunk over live state
 *  (the deck draws what is true when you look at it, not when it was built),
 *  so an objective whose ground moves — a FOB that gets built, a counterattack
 *  that arrives — redraws itself. */
function objectiveSlide(o: RuntimeObjective): Slide {
  const g = OBJ_GRAPHICS[o.kind]
  const at = (): Focus => objectiveFocus(S, o)
  return {
    title: () => {
      const p = at()
      const ground = p ? groundName(p) : ''
      return ground && !o.label.includes(ground) ? `${o.label} — ${ground}` : o.label
    },
    frame: () => {
      const p = at(), hq = playerHq()
      if (!p) return { cx: hq.x, cy: hq.y, span: 6000 }
      if (g.frame === 'zone') return { cx: p.x, cy: p.y, span: Math.max(p.r * 6, 2400) }
      return {
        cx: (hq.x + p.x) / 2, cy: (hq.y + p.y) / 2,
        span: Math.max(Math.hypot(p.x - hq.x, p.y - hq.y) * 1.7, 3600),
      }
    },
    body: (i) => g.body(i, o, at()),
    // AUTHORED WORDS WIN. Absent — the normal case — the lines come off the
    // objective's own parameters and cannot go stale when it is edited.
    bullets: () => {
      const notes = o.notes?.filter(n => n.trim())
      return notes?.length ? notes : g.bullets(o, at())
    },
  }
}

/** The mainline scheme of maneuver, as far down the stream as the commander is
 *  allowed to see it (revealedEnd — the same rule the objective tracker uses,
 *  so a slide can never brief a tasking the board is still hiding). */
export function operationDeck(): Slide[] {
  const objs = operation().objectives
  const end = S.campaign ? revealedEnd(S.campaign.objIdx) : objs.length
  return objs.slice(0, end).map(objectiveSlide)
}

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
    <button data-tut={dir > 0 ? TUT.vtcNext : undefined}
      onClick={() => page(s => Math.max(0, Math.min(deck.length - 1, s + dir)))}
      style={{
        padding: '2px 10px', borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit',
        background: 'rgba(16,26,36,0.85)', border: '1px solid #2a3a48',
        color: '#9ab8d0', fontSize: 10, letterSpacing: 1,
      }}>{label}</button>
  )

  return (
    <div data-tut={TUT.vtcDeck} style={{ display: 'flex', gap: 10, flex: 1, minWidth: 0 }}>
      {/* the preview rail — every page, click to jump. Shares the `vtc-nav`
          tutorial tag with the arrow row below: they are the two ways to drive
          the deck, so a cue rings both */}
      <div data-tut={TUT.vtcNav} style={{
        width: 128, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6,
        overflowY: 'auto', paddingRight: 2,
      }}>
        {deck.map((_, i) => (
          <SlideThumb key={i} idx={i} deck={deck} active={i === slide} onClick={() => page(i)} />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
        <canvas ref={ref} width={1180} height={756} style={{ width: '100%', borderRadius: 2 }} />
        <div data-tut={TUT.vtcNav} style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
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
