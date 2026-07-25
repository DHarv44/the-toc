// Campaign tutorial — the INTERPRETER. The curriculum (step order, every word,
// what each step gates on, what it points at) is MISSION content and lives in
// the pack (missions/*.json `tutorial` section — see src/PACK-MISSIONS.md S3).
// This file ships the vocabulary: condition kinds (some read UI state —
// tutorial-only; sim triggers never see the UI), anchor kinds (published
// `data-tut` ids + map anchors + computed teaching markers), the reactive
// verbs (break-drill), and the overlay machinery (pulsing ring + callout).
//
// Gated steps pause the sim (speed 0) until done, then resume — the player
// can't skip past an unlearned action. Hint variants: first whose `when`
// matches (or has none) renders; `hide` shows no cue this frame.
import { useEffect } from 'react'
import { S } from '../engine/state'
import { UNIT_TYPES } from '../domains/forces/catalog'
import { nearestLand } from '../world/place'
import { activeCampaign } from '../engine/campaign'
import { resolvePlace } from '../engine/missions/places'
import type { TutAnchor, TutCondition, TutHint, TutReactive, TutStep } from '../packs/types'
import type { Unit } from '../engine/GameState'
import { useUI, type UIState } from './store'
import { centerView, zoomFor } from '../map/view'
import { tutorialCue } from '../audio/audio'

// the resolved on-screen cue for one frame
interface TutorialHint {
  text: string
  action?: string
  targetSel?: string
  targetUnit?: number
  targetPoint?: { x: number; y: number }
  targetBox?: { x0: number; y0: number; x1: number; y1: number }
  hidden?: boolean
}

// ---------------------------------------------------------------------------
// Curriculum: the mainline missions' tutorial steps, flattened in order (same
// shape as the objective stream). Cached per campaign.
// ---------------------------------------------------------------------------
let _campStamp: object | null = null
let _steps: TutStep[] = []
let _reactive: TutReactive[] = []
let _moveTarget: { x: number; y: number } | null = null
let _exposeMarker: { x: number; y: number } | null = null
let _m2Road: { x: number; y: number } | null = null
let _centeredKey = ''   // one auto-center per step/cue (the player can pan after)

function refresh(): void {
  if (_campStamp === (S.campaign as object | null)) return
  _campStamp = S.campaign
  _moveTarget = _exposeMarker = _m2Road = null
  _centeredKey = ''
  _steps = []
  _reactive = []
  if (!S.campaign) return
  const spec = activeCampaign()
  for (const mid of spec.manifest.mainline) {
    const t = spec.missions[mid]?.tutorial
    if (t) { _steps.push(...t.steps); _reactive.push(...(t.reactive ?? [])) }
  }
}

// ---------------------------------------------------------------------------
// Computed teaching markers (engine verbs — the pack references them by kind)
// ---------------------------------------------------------------------------
function nearestRoad(m: NonNullable<typeof S.map>, x: number, y: number, maxR: number): { x: number; y: number } | null {
  const gx0 = Math.floor(x / m.CELL), gy0 = Math.floor(y / m.CELL), maxC = Math.ceil(maxR / m.CELL)
  for (let r = 0; r <= maxC; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
      const gx = gx0 + dx, gy = gy0 + dy
      if (gx < 0 || gy < 0 || gx >= m.GRID || gy >= m.GRID) continue
      if (m.road[gy * m.GRID + gx]) return { x: (gx + 0.5) * m.CELL, y: (gy + 0.5) * m.CELL }
    }
  }
  return null
}

// a road point a short bound up the axis toward the objective town
function moveTarget(): { x: number; y: number } | null {
  if (_moveTarget) return _moveTarget
  const m = S.map, c = S.campaign
  if (!m || !c) return null
  const hq = m.fob, town = c.strongpoint
  const dx = town.x - hq.x, dy = town.y - hq.y, L = Math.hypot(dx, dy) || 1
  for (let d = 450; d <= 950; d += 50) {
    const rp = nearestRoad(m, hq.x + (dx / L) * d, hq.y + (dy / L) * d, 220)
    if (rp) { _moveTarget = rp; return rp }
  }
  _moveTarget = { x: hq.x + (dx / L) * 600, y: hq.y + (dy / L) * 600 }
  return _moveTarget
}

function nearestEnemyUnit(): Unit | null {
  const hq = S.map?.fob
  if (!hq) return null
  let best: Unit | null = null, bd = Infinity
  for (const u of S.units) {
    if (u.side !== 'hostile' || u.strength <= 0) continue
    const d = Math.hypot(u.x - hq.x, u.y - hq.y)
    if (d < bd) { bd = d; best = u }
  }
  return best
}

// standoff point ~650 m short of the nearest enemy on the HQ side — inside
// scout spotting range, outside the garrison's trigger range
function exposeMarker(): { x: number; y: number } | null {
  if (_exposeMarker) return _exposeMarker
  const m = S.map, hq = m?.fob, e = nearestEnemyUnit()
  if (!m || !hq || !e) return moveTarget()
  const dx = hq.x - e.x, dy = hq.y - e.y, L = Math.hypot(dx, dy) || 1
  const px = e.x + (dx / L) * 650, py = e.y + (dy / L) * 650
  _exposeMarker = nearestRoad(m, px, py, 260) || nearestLand(m, px, py)
  return _exposeMarker
}

// road point partway to the strongpoint (the waypoint lesson's first marker)
function m2RoadPoint(): { x: number; y: number } | null {
  if (_m2Road) return _m2Road
  const m = S.map, t = S.campaign?.strongpoint, hq = m?.fob
  if (!m || !t || !hq) return null
  _m2Road = nearestRoad(m, hq.x + (t.x - hq.x) * 0.45, hq.y + (t.y - hq.y) * 0.45, 600)
  return _m2Road
}

// the spotted enemy nearest the recon (a live contact) — the one to attack
function spottedEnemy(): Unit | null {
  const r = S.units.find(u => u.side === 'friend' && u.type === 'SCT')
  let best: Unit | null = null, bd = Infinity
  for (const u of S.units) {
    if (u.side !== 'hostile' || u.strength <= 0) continue
    const c = S.contacts.get(u.id)
    if (!c || !c.live) continue
    const d = r ? Math.hypot(u.x - r.x, u.y - r.y) : 0
    if (d < bd) { bd = d; best = u }
  }
  return best
}

// ---------------------------------------------------------------------------
// Condition evaluation — pure reads of S + UI state
// ---------------------------------------------------------------------------
const friends = () => S.units.filter(u => u.side === 'friend' && u.strength > 0)
const firstOf = (type: string) => S.units.find(u => u.side === 'friend' && u.type === type)
const routeEnd = (u: Unit) => u.legs.length ? u.legs[u.legs.length - 1]! : { x: u.x, y: u.y }

function evalCond(cond: TutCondition, ui: UIState): boolean {
  switch (cond.kind) {
    case 'fielded': {
      const list = friends().filter(u =>
        (!cond.type || u.type === cond.type) && !(cond.exclude ?? []).includes(u.type))
      return list.length >= cond.min
    }
    case 'selected-only': {
      if (ui.selectedIds.length !== 1) return false
      const u = S.units.find(x => x.id === ui.selectedIds[0])
      return !!u && u.side === 'friend' && u.type === cond.type
    }
    case 'selected-struct': {
      if (ui.selectedIds.length !== 1) return false
      return S.structures.some(st => st.id === ui.selectedIds[0]
        && st.side === 'friend' && st.kind === cond.struct)
    }
    case 'selected-carrier': {
      if (ui.selectedIds.length !== 1) return false
      const u = S.units.find(x => x.id === ui.selectedIds[0])
      return !!u && u.side === 'friend' && (UNIT_TYPES[u.type].carries?.length ?? 0) > 0
    }
    case 'group-selected':
      return ui.selectedIds.filter(id => {
        const u = S.units.find(x => x.id === id)
        return !!u && u.side === 'friend' && !(cond.exclude ?? []).includes(u.type)
      }).length >= cond.min
    case 'roe-set': {
      const u = firstOf(cond.type)
      return !!u && u.roe === cond.roe
    }
    case 'mode-is':
      return ui.cmdMode === cond.mode || String(ui.mode).startsWith(cond.mode)
    case 'callup-open':
      return ui.callupOpen
    case 'drone-aloft':
      return S.drones.length > 0
    case 'unit-beyond': {
      const u = firstOf(cond.type)
      return !!u && !!S.map && Math.hypot(u.x - S.map.fob.x, u.y - S.map.fob.y) >= cond.dist
    }
    case 'enemy-spotted': {
      for (const c of S.contacts.values()) if (c.live) return true
      return false
    }
    case 'attack-ordered':
      return S.units.some(u => u.side === 'friend' && !(cond.exclude ?? []).includes(u.type)
        && (u.attackId != null || u.attackMove))
    case 'routed-to-marker': {
      const u = firstOf(cond.type), t = exposeMarker()
      if (!u || !u.legs.length || !t) return false
      const dest = u.legs[u.legs.length - 1]!
      return Math.hypot(dest.x - t.x, dest.y - t.y) <= 200
    }
    case 'column-has-orders':
      return cond.types.some(k => (firstOf(k)?.legs.length ?? 0) > 0)
    case 'column-routed': {
      const p = resolvePlace(S, cond.place)
      return cond.types.every(k => {
        const u = firstOf(k)
        if (!u) return false
        const e = routeEnd(u)
        return Math.hypot(e.x - p.x, e.y - p.y) <= cond.r
      })
    }
    case 'column-at': {
      const p = resolvePlace(S, cond.place)
      return cond.types.every(k => {
        const u = firstOf(k)
        return !!u && Math.hypot(u.x - p.x, u.y - p.y) <= cond.r
      })
    }
    case 'area-clear': {
      const p = resolvePlace(S, cond.place)
      return !S.units.some(u => u.side === 'hostile' && u.strength > 0
        && Math.hypot(u.x - p.x, u.y - p.y) <= cond.r)
    }
    case 'force-holding': {
      const p = resolvePlace(S, cond.place)
      const force = friends().filter(u => !(cond.exclude ?? []).includes(u.type))
      if (!force.length) return false
      if (!force.every(u => Math.hypot(u.x - p.x, u.y - p.y) <= cond.r)) return false
      if (cond.spread) {
        for (let i = 0; i < force.length; i++) {
          for (let j = i + 1; j < force.length; j++) {
            if (Math.hypot(force[i]!.x - force[j]!.x, force[i]!.y - force[j]!.y) < cond.spread) return false
          }
        }
      }
      return true
    }
    case 'dug-in': {
      const p = resolvePlace(S, cond.place)
      return S.units.some(u => u.side === 'friend' && !(cond.exclude ?? []).includes(u.type)
        && u.posture === 'dig' && Math.hypot(u.x - p.x, u.y - p.y) <= cond.r)
    }
    case 'structure-built':
      return S.structures.some(st => st.side === 'friend' && st.kind === cond.struct)
    case 'convoy-running':
      return S.units.some(u => u.side === 'friend' && !!u.convoy)
    case 'not':
      return !evalCond(cond.of, ui)
    case 'all':
      return cond.of.every(c => evalCond(c, ui))
  }
}

// ---------------------------------------------------------------------------
// Anchor resolution → the frame's cue fields
// ---------------------------------------------------------------------------
function applyAnchor(h: TutorialHint, a: TutAnchor | undefined): TutorialHint {
  if (!a) return h
  switch (a.kind) {
    case 'ui': h.targetSel = a.sel; break
    case 'unit': h.targetUnit = firstOf(a.type)?.id; break
    case 'spotted-enemy': h.targetUnit = spottedEnemy()?.id; break
    case 'struct': {
      const st = S.structures.find(s => s.side === 'friend' && s.kind === a.struct)
      if (st) h.targetPoint = { x: st.x, y: st.y }
      break
    }
    case 'point': h.targetPoint = resolvePlace(S, a.place); break
    case 'box': {
      const p = resolvePlace(S, a.place)
      h.targetBox = { x0: p.x - a.r, y0: p.y - a.r, x1: p.x + a.r, y1: p.y + a.r }
      break
    }
    case 'screen-marker': h.targetPoint = exposeMarker() ?? undefined; break
    case 'road-marker': h.targetPoint = m2RoadPoint() ?? undefined; break
  }
  return h
}

function hintFor(step: TutStep, ui: UIState): TutorialHint {
  for (const v of step.hints) {
    if (v.when && !evalCond(v.when, ui)) continue
    if (v.hide) return { text: '', hidden: true }
    return applyAnchor({ text: v.text ?? '', action: v.action }, v.anchor)
  }
  return { text: '', hidden: true }
}

// ---------------------------------------------------------------------------
// Reactive verb: break-drill — the first time a line platoon falls below HALF
// strength, pause and teach the BREAK drill. Fires WHENEVER the casualties
// happen and overrides the step cue until acted on. One-shot per campaign
// (CampaignState.tutBreakShown). The WORDS come from the pack.
// ---------------------------------------------------------------------------
function hurtUnit(): Unit | undefined {
  return S.units.find(u => u.side === 'friend' && u.type !== 'SCT' && u.strength > 0 && u.strength < 50)
}
function breakTip(ui: UIState): TutorialHint | null {
  const c = S.campaign
  const spec = _reactive.find(r => r.verb === 'break-drill')
  if (!c || c.tutBreakShown || !spec) return null
  const u = hurtUnit()
  if (!u) return null
  if (u.roe === 'break') return null // acted on; the effect latches tutBreakShown
  if (!ui.selectedIds.includes(u.id)) {
    return { text: spec.seek.text, action: spec.seek.action, targetUnit: u.id }
  }
  return applyAnchor({ text: spec.act.text, action: spec.act.action }, spec.act.anchor)
}

const ACCENT = '#7ec8ff'   // callout chrome (matches the campaign UI)
const RING_A = '#ffc63f'   // attention ring: pulses yellow…
const RING_B = '#ff4a3c'   // …to red — reads as "look HERE" against the map blues

// the map canvas is the largest <canvas> in the document; use its rect + __view
// (exposed by MapView) to convert a world point to a viewport pixel position
function worldToViewport(wx: number, wy: number): { x: number; y: number; rect: DOMRect } | null {
  const view = (window as unknown as { __view?: { cx: number; cy: number; ppm: number } }).__view
  if (!view) return null
  let canvas: HTMLCanvasElement | null = null, best = 0
  for (const cv of Array.from(document.querySelectorAll('canvas'))) {
    const a = cv.clientWidth * cv.clientHeight
    if (a > best) { best = a; canvas = cv }
  }
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  return {
    x: rect.left + (wx - view.cx) * view.ppm + rect.width / 2,
    y: rect.top + (wy - view.cy) * view.ppm + rect.height / 2,
    rect,
  }
}

export default function TutorialOverlay() {
  const tick = useUI(s => s.tick)
  const ui = useUI()
  const c = S.campaign
  refresh()

  // advance / pause: runs each 10 Hz tick. The sim stays paused while a gated
  // step is unfinished, then resumes.
  useEffect(() => {
    if (!c || !c.tutorial || c.complete || !c.briefed) return
    // reactive BREAK drill: pauses like a gate until set on the hurt platoon,
    // then latches one-shot and hands back to the step flow
    if (!c.tutBreakShown && _reactive.some(r => r.verb === 'break-drill')) {
      const u = hurtUnit()
      if (u) {
        if (u.roe === 'break') {
          c.tutBreakShown = true
          if (S.speed === 0) S.speed = 1 // a pending gated step re-pauses next tick
        } else {
          if (S.speed !== 0) S.speed = 0
          return // the tip owns the screen until acted on
        }
      }
    }
    if (c.tutStep >= _steps.length) return
    const step = _steps[c.tutStep]!
    if (evalCond(step.done, ui)) {
      c.tutStep++
      const next = _steps[c.tutStep]
      // hold for the next gated step; on resume, only lift a pause — never
      // stomp the player's chosen speed (they may be running 4×)
      if (next?.gate) S.speed = 0
      else if (S.speed === 0) S.speed = 1
    } else if (step.gate && S.speed !== 0) {
      S.speed = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])

  // inject the pulse keyframes ONCE — re-emitting the <style> every 10 Hz tick
  // would restart the animation each frame and freeze it visually
  useEffect(() => {
    if (document.getElementById('tut-keyframes')) return
    const st = document.createElement('style')
    st.id = 'tut-keyframes'
    st.textContent = `@keyframes tutPulse {
      0%,100% { border-color: ${RING_A}; box-shadow: 0 0 0 2px ${RING_A}66, 0 0 10px 3px ${RING_A}33; opacity: .8; }
      50%     { border-color: ${RING_B}; box-shadow: 0 0 0 4px ${RING_B}, 0 0 30px 10px ${RING_B}99; opacity: 1; }
    }`
    document.head.appendChild(st)
  }, [])

  if (!c || !c.tutorial || c.complete || !c.briefed) return null
  if (ui.console) return null // a staff console owns the column; cues point at the map
  if (c.frago != null) return null // an order window (call or review) is up — sim's paused anyway
  // the reactive BREAK tip overrides the step cue — and still renders after the
  // scripted steps are exhausted (casualties often come with the counterattack)
  const tip = breakTip(ui)
  if (!tip && c.tutStep >= _steps.length) return null
  const hint = tip ?? hintFor(_steps[c.tutStep]!, ui)
  if (hint.hidden) return null // no cue this frame (e.g. platoon is en route)

  // Map-anchored instruction → bring the player's eyes THERE first: center
  // (and zoom in if the view is wide) on the target, once per step/cue — the
  // player can still pan freely afterwards.
  const mapTarget = hint.targetPoint
    ?? (hint.targetUnit != null ? (() => { const u = S.units.find(x => x.id === hint.targetUnit); return u ? { x: u.x, y: u.y } : undefined })() : undefined)
    ?? (hint.targetBox ? { x: (hint.targetBox.x0 + hint.targetBox.x1) / 2, y: (hint.targetBox.y0 + hint.targetBox.y1) / 2 } : undefined)
  const centerKey = tip ? 'tip' : `${c.tutStep}:${hint.targetPoint ? 'p' : hint.targetBox ? 'b' : hint.targetUnit != null ? 'u' : '-'}`
  if (centerKey !== _centeredKey) {
    _centeredKey = centerKey
    tutorialCue() // a new instruction popped — soft chime (master mute respects it)
    if (mapTarget) centerView(mapTarget, { minZoom: zoomFor(4200) })
  }

  // resolve the ring target: a DOM element, a map unit/point, or nothing.
  // `lift` bottom-anchors the callout (translateY(-100%)) so a box pointing
  // down at a bottom-tray control stacks ABOVE it, never clipped off-screen.
  let ring: { left: number; top: number; width: number; height: number } | null = null
  let callout: { left: number; top: number; width: number; pointer?: 'left' | 'right' | 'up' | 'down'; lift?: boolean } | null = null

  // a ring + right-side callout anchored to a world point on the map
  const mapAnchor = (wx: number, wy: number, R: number) => {
    const p = worldToViewport(wx, wy)
    if (!p) return
    if (p.x < p.rect.left || p.x > p.rect.right || p.y < p.rect.top || p.y > p.rect.bottom) return
    ring = { left: p.x - R, top: p.y - R, width: R * 2, height: R * 2 }
    const w = 340
    const top = Math.min(Math.max(p.rect.top + 8, p.y - 30), p.rect.bottom - 110)
    const fitsRight = p.x + R + 14 + w <= p.rect.right - 8
    callout = fitsRight
      ? { left: p.x + R + 14, top, width: w, pointer: 'left' }
      : { left: Math.max(p.rect.left + 8, p.x - R - 14 - w), top, width: w, pointer: 'right' }
  }

  if (hint.targetSel) {
    const el = document.querySelector(`[data-tut="${hint.targetSel}"]`)
    if (el) {
      const r = el.getBoundingClientRect()
      ring = { left: r.left - 5, top: r.top - 5, width: r.width + 10, height: r.height + 10 }
      const vw = window.innerWidth, vh = window.innerHeight
      const short = r.height < 90 // a button/row — TALL boxes (a whole list) always get a side callout
      if (short && r.bottom + 140 > vh) {
        // a SHORT control near the bottom (the selection tray): stack the
        // callout ABOVE it, bottom-anchored and wide, pointing down — on top
        // of the toolbar, never clipped by the screen edge
        const w = 460
        const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), vw - w - 8)
        callout = { left, top: r.top - 12, width: w, pointer: 'down', lift: true }
      } else {
        const w = 300
        // beside the target, to the RIGHT (flipping left only if it would
        // clip). Short controls center on the control; tall rectangles hang
        // the callout near their top, clamped on-screen.
        const top = short
          ? Math.max(8, r.top + r.height / 2 - 34)
          : Math.min(Math.max(8, r.top + 24), vh - 170)
        const fitsRight = r.right + 14 + w <= vw - 8
        callout = fitsRight
          ? { left: r.right + 14, top, width: w, pointer: 'left' }
          : { left: Math.max(8, r.left - 14 - w), top, width: w, pointer: 'right' }
      }
    }
  } else if (hint.targetUnit != null) {
    const u = S.units.find(x => x.id === hint.targetUnit)
    if (u) mapAnchor(u.x, u.y, 26)
  } else if (hint.targetPoint) {
    mapAnchor(hint.targetPoint.x, hint.targetPoint.y, 32)
  } else if (hint.targetBox) {
    // a rectangle around a group of units, clamped to the map, callout to its right
    const tl = worldToViewport(hint.targetBox.x0, hint.targetBox.y0)
    const br = worldToViewport(hint.targetBox.x1, hint.targetBox.y1)
    if (tl && br) {
      const L = Math.max(tl.rect.left, tl.x), T = Math.max(tl.rect.top, tl.y)
      const R = Math.min(tl.rect.right, br.x), B = Math.min(tl.rect.bottom, br.y)
      if (R > L && B > T) {
        ring = { left: L, top: T, width: R - L, height: B - T }
        const w = 340
        const top = Math.min(Math.max(tl.rect.top + 8, T), tl.rect.bottom - 130)
        const fitsRight = R + 14 + w <= tl.rect.right - 8
        callout = fitsRight
          ? { left: R + 14, top, width: w, pointer: 'left' }
          : { left: Math.max(tl.rect.left + 8, L - 14 - w), top, width: w, pointer: 'right' }
      }
    }
  }
  // fallback: no anchor found → a plain callout at the map bottom
  if (!callout) callout = { left: -1, top: -1, width: 440 }
  const isMapCircle = hint.targetUnit != null || hint.targetPoint != null

  const skip = () => { if (S.campaign) { S.campaign.tutorial = false; if (S.speed === 0) S.speed = 1 } }
  const bottom = callout.left < 0

  return (
    <>
      {/* the slow-pulsing highlight ring over the target (DOM element or map unit).
          Stable key so React never remounts it (which would restart the pulse). */}
      {ring && (
        <div key="tut-ring" style={{
          position: 'fixed', zIndex: 108, pointerEvents: 'none',
          left: ring.left, top: ring.top, width: ring.width, height: ring.height,
          border: `2px solid ${RING_A}`, borderRadius: isMapCircle ? '50%' : 5,
          animation: 'tutPulse 1.4s ease-in-out infinite',
        }} />
      )}

      {/* the callout: beside/above the ring, or centered at the map bottom.
          `lift` bottom-anchors it above a tray control (on top of the toolbar). */}
      <div style={bottom
        ? { position: 'fixed', zIndex: 109, left: '50%', bottom: 96, transform: 'translateX(-50%)', width: callout.width, maxWidth: '80vw' }
        : { position: 'fixed', zIndex: 109, left: callout.left, top: callout.top, width: callout.width,
            ...(callout.lift ? { transform: 'translateY(-100%)' } : {}) }
      }>
        <div style={{
          position: 'relative',
          background: 'rgba(10,16,22,0.97)', border: `1px solid ${ACCENT}66`, borderLeft: `3px solid ${ACCENT}`,
          borderRadius: 4, padding: '10px 13px', fontFamily: 'Consolas, monospace', color: '#dceeff',
          boxShadow: '0 4px 18px rgba(0,0,0,0.5)',
        }}>
          {/* pointer toward the ring */}
          {callout.pointer === 'left' && (
            <div style={{ position: 'absolute', left: -7, top: 28, width: 0, height: 0,
              borderTop: '7px solid transparent', borderBottom: '7px solid transparent', borderRight: `7px solid ${ACCENT}` }} />
          )}
          {callout.pointer === 'right' && (
            <div style={{ position: 'absolute', right: -7, top: 28, width: 0, height: 0,
              borderTop: '7px solid transparent', borderBottom: '7px solid transparent', borderLeft: `7px solid ${ACCENT}` }} />
          )}
          {callout.pointer === 'up' && (
            <div style={{ position: 'absolute', top: -7, left: '50%', marginLeft: -7, width: 0, height: 0,
              borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderBottom: `7px solid ${ACCENT}` }} />
          )}
          {callout.pointer === 'down' && (
            <div style={{ position: 'absolute', bottom: -7, left: '50%', marginLeft: -7, width: 0, height: 0,
              borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderTop: `7px solid ${ACCENT}` }} />
          )}
          <div style={{ fontSize: 8.5, letterSpacing: 2.5, color: '#5f9fd0', marginBottom: 4 }}>▸ TRAINING</div>
          <div style={{ fontSize: 12, lineHeight: 1.5 }}>{hint.text}</div>
          {/* the DO line: every step ends with one standout imperative — the
              amber ties it to the pulsing ring it points at */}
          {hint.action && (
            <div style={{
              marginTop: 8, paddingTop: 7, borderTop: '1px solid #2a3a48',
              fontSize: 12.5, fontWeight: 'bold', letterSpacing: 0.6, color: RING_A,
            }}>▶ {hint.action}</div>
          )}
          <button onClick={skip}
            onMouseEnter={e => { e.currentTarget.style.color = '#9ab8d0' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#4a6478' }}
            style={{ marginTop: 8, background: 'none', border: 'none', cursor: 'pointer',
              color: '#4a6478', fontFamily: 'inherit', fontSize: 9, letterSpacing: 1.5, padding: 0 }}>SKIP TUTORIAL</button>
        </div>
      </div>
    </>
  )
}
