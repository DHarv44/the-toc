// Campaign tutorial — the INTERPRETER. The curriculum (step order, every word,
// what each step gates on, what it points at) is MISSION content and lives in
// the pack (missions/*.json `tutorial` section — see src/PACK-MISSIONS.md S3).
// This file ships the vocabulary: condition kinds (some read UI state —
// tutorial-only; sim triggers never see the UI), anchor kinds (published
// `data-tut` ids + map anchors + computed teaching markers), the reactive
// verbs (casualty-warning), and the overlay machinery (pulsing ring + callout).
//
// Gated steps pause the sim (speed 0) until done, then resume — the player
// can't skip past an unlearned action. Hint variants: first whose `when`
// matches (or has none) renders; `hide` shows no cue this frame.
import { useEffect, type CSSProperties } from 'react'
import { S } from '../engine/state'
import { UNIT_TYPES } from '../domains/forces/catalog'
import { nearestLand } from '../world/place'
import { T_WATER } from '../world/WorldMap'
import { activeScenario } from '../engine/campaign'
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
  nextKey?: string   // a read-and-continue beat: the card shows NEXT, keyed here
  nextLabel?: string // …under a different word where NEXT is the wrong verb
  panTo?: { x: number; y: number }  // camera lesson: point the player's EYES here
  panLabel?: string
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
let _atkPos: { x: number; y: number } | null = null
let _centeredKey = ''   // one auto-center per step/cue (the player can pan after)

function refresh(): void {
  if (_campStamp === (S.campaign as object | null)) return
  _campStamp = S.campaign
  _moveTarget = _exposeMarker = _m2Road = _atkPos = null
  _centeredKey = ''
  _dwellAt.clear()
  _nextDone.clear()
  _steps = []
  _reactive = []
  if (!S.campaign) return
  for (const m of activeScenario().missions ?? []) {
    if (m.tutorial) { _steps.push(...m.tutorial.steps); _reactive.push(...(m.tutorial.reactive ?? [])) }
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

// ATTACK POSITION: the ground the assault force shakes out on before it goes
// in. Hung off the SCREEN marker — the point the scouts were sent to, which is
// already proven ground on the near side of the objective — and set back from
// it so the assault is not driving through its own recon.
//
// It is an AREA, not a dot: 600 m of frontage by 100 m of depth. The force fans
// out into it side by side, which is the whole lesson — the shape says it
// before the text does.
const ATK_BACK = 50                       // metres BEHIND the screen point (south = +y here)
const ATK_HALF = { w: 300, h: 50 }        // 600 m of frontage × 100 m deep
function attackPos(): { x: number; y: number } | null {
  if (_atkPos) return _atkPos
  const s = exposeMarker()
  if (!s) return null
  _atkPos = { x: s.x, y: s.y + ATK_BACK }
  return _atkPos
}
// the release point: 60 m short of the attack position's near edge — where the
// group is sent FIRST, so the run-up is one leg and the fan-out is the next
function apApproach(): { x: number; y: number } | null {
  const p = attackPos()
  return p ? { x: p.x, y: p.y + 60 } : null
}
function attackBox(): { x0: number; y0: number; x1: number; y1: number } | null {
  const p = attackPos()
  if (!p) return null
  return {
    x0: p.x - ATK_HALF.w, y0: p.y - ATK_HALF.h,
    x1: p.x + ATK_HALF.w, y1: p.y + ATK_HALF.h,
  }
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
    case 'briefed':
      return !!S.campaign?.briefed
    case 'vtc-paged':
      return ui.vtcPaged
    case 'rail-open':
      // 'forces' is the GARRISON rail now — the old FORCES rail's contents went
      // to the task org bar and the team stations, and what was left (CALL UP)
      // became the rail itself. Pack tutorials still say 'forces'; the word in
      // their PROSE is stale and is a content fix, not a code one.
      return cond.rail === 'forces' ? ui.bgOpen
        : cond.rail === 'command' ? ui.leftOpen
          : cond.rail === 'net' ? ui.netOpen : ui.feedsOpen
    case 'callup-open':
      // there is no separate picker to open any more: the rail IS the picker
      return ui.bgOpen
    case 'callup-base':
      return ui.callupBase != null
    case 'callup-cat':
      return ui.callupCat === cond.cat
    case 'callup-co':
      return ui.callupCos.some(k => k.startsWith(`${cond.cat}|`))
    case 'drone-aloft':
      return S.drones.length > 0
    case 'unit-beyond': {
      const u = firstOf(cond.type)
      return !!u && !!S.map && Math.hypot(u.x - S.map.fob.x, u.y - S.map.fob.y) >= cond.dist
    }
    case 'view-near-hq': {
      // where the COMMANDER is looking, not where anything is. MapView keeps the
      // live view on window.__view (same hook worldToViewport reads).
      const v = (window as unknown as { __view?: { cx: number; cy: number } }).__view
      return !!v && !!S.map && Math.hypot(v.cx - S.map.fob.x, v.cy - S.map.fob.y) <= cond.dist
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
    case 'force-at-marker': {
      // the whole force closed on a COMPUTED marker. The attack position is an
      // AREA (units fan out into it), so it is judged as the box that is drawn
      // on the map — what the commander was shown is what is being asked for.
      //
      // `routed` grades the ORDER, not the arrival: the lesson is giving the
      // move, and a commander should not have to sit and watch the drive to be
      // told they got it right.
      const force = friends().filter(u => !(cond.exclude ?? []).includes(u.type))
      if (!force.length) return false
      const at = (u: Unit) => (cond.routed ? routeEnd(u) : { x: u.x, y: u.y })
      // `spread` asks for a FAN, not a pile: every platoon on its own slot. A
      // single click puts them all on one point and fails it, which is the
      // whole lesson — one shell answers a pile.
      if (cond.spread && force.length > 1) {
        for (let i = 0; i < force.length; i++) {
          for (let j = i + 1; j < force.length; j++) {
            const a = at(force[i]!), b = at(force[j]!)
            if (Math.hypot(a.x - b.x, a.y - b.y) < cond.spread) return false
          }
        }
      }
      if (cond.marker === 'attack-pos') {
        const b = attackBox()
        if (!b) return false
        return force.every(u => {
          const p = at(u)
          return p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1
        })
      }
      const m = cond.marker === 'screen-marker' ? exposeMarker()
        : cond.marker === 'ap-approach' ? apApproach() : m2RoadPoint()
      if (!m) return false
      return force.every(u => {
        const p = at(u)
        return Math.hypot(p.x - m.x, p.y - m.y) <= cond.r
      })
    }
    case 'force-holding': {
      const p = resolvePlace(S, cond.place)
      const force = friends().filter(u => !(cond.exclude ?? []).includes(u.type))
      if (!force.length) return false
      // `routed` grades the ORDER: the route ENDS there, whether or not the
      // platoons have driven it yet
      const at = (u: Unit) => (cond.routed ? routeEnd(u) : u)
      if (!force.every(u => { const q = at(u); return Math.hypot(q.x - p.x, q.y - p.y) <= cond.r })) return false
      if (cond.spread) {
        for (let i = 0; i < force.length; i++) {
          for (let j = i + 1; j < force.length; j++) {
            const a = at(force[i]!), b = at(force[j]!)
            if (Math.hypot(a.x - b.x, a.y - b.y) < cond.spread) return false
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
    case 'force-box': {
      const force = friends().filter(u => !(a.exclude ?? []).includes(u.type))
      if (!force.length) break
      const pad = a.pad ?? 140
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (const u of force) {
        x0 = Math.min(x0, u.x); y0 = Math.min(y0, u.y)
        x1 = Math.max(x1, u.x); y1 = Math.max(y1, u.y)
      }
      h.targetBox = { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad }
      break
    }
    case 'pan-to': {
      // NOT targetPoint — that would centre the view, which is the one thing
      // this lesson has to leave to the player.
      h.panTo = resolvePlace(S, a.place)
      h.panLabel = a.label ?? a.place.toUpperCase()
      break
    }
    case 'screen-marker': h.targetPoint = exposeMarker() ?? undefined; break
    case 'road-marker': h.targetPoint = m2RoadPoint() ?? undefined; break
    case 'attack-pos': h.targetBox = attackBox() ?? undefined; break
    case 'ap-approach': h.targetPoint = apApproach() ?? undefined; break
  }
  return h
}

// A dwelling hint's clock starts the first time the chain actually REACHES it —
// not when the step began. So a "look at this for 5 s" beat that sits behind a
// `when` gate still gets its full 5 s once it comes up. Keyed by step id + index
// so a re-entered step (HMR, restart) re-arms rather than reading as expired.
const _dwellAt = new Map<string, number>()
function dwellExpired(key: string, secs: number): boolean {
  const t0 = _dwellAt.get(key)
  if (t0 == null) { _dwellAt.set(key, performance.now()); return false }
  return performance.now() - t0 >= secs * 1000
}

// …and the same idea on the player's clock: a `next` hint holds until its NEXT
// button is clicked, then this remembers it so the chain falls through. Same
// key shape as the dwell clock, cleared with it on a new campaign.
const _nextDone = new Set<string>()

function hintFor(step: TutStep, ui: UIState): TutorialHint {
  for (let i = 0; i < step.hints.length; i++) {
    const v = step.hints[i]!
    const key = `${step.id}:${i}`
    if (v.when && !evalCond(v.when, ui)) continue
    if (v.dwell && dwellExpired(key, v.dwell)) continue
    if (v.next && _nextDone.has(key)) continue
    if (v.hide) return { text: '', hidden: true }
    const h = applyAnchor({ text: v.text ?? '', action: v.action }, v.anchor)
    if (v.next) h.nextKey = key
    return h
  }
  return { text: '', hidden: true }
}

// ---------------------------------------------------------------------------
// Reactive verb: casualty-warning — the first time a line platoon falls below
// HALF strength, pause and TELL the commander they are about to lose it. Fires
// WHENEVER the casualties happen and overrides the step cue until acknowledged.
// It asks for nothing: pulling the platoon out, reinforcing it or spending it
// is a command decision, and the tutorial does not get a vote. One-shot per
// campaign (CampaignState.tutBreakShown). The WORDS come from the pack.
// ---------------------------------------------------------------------------
const CASUALTY_KEY = 'reactive:casualty-warning'
function hurtUnit(): Unit | undefined {
  return S.units.find(u => u.side === 'friend' && u.type !== 'SCT' && u.strength > 0 && u.strength < 50)
}
function casualtyWarning(): TutorialHint | null {
  const c = S.campaign
  const spec = _reactive.find(r => r.verb === 'casualty-warning')
  if (!c || c.tutBreakShown || !spec) return null
  if (_nextDone.has(CASUALTY_KEY)) return null // acknowledged; the tick latches it
  const u = hurtUnit()
  if (!u) return null
  // ring the platoon in question — "which one" is the only thing they have to
  // work out, and they should not have to hunt the roster for it
  return {
    text: spec.warn.text, action: spec.warn.action, targetUnit: u.id,
    nextKey: CASUALTY_KEY, nextLabel: 'ACKNOWLEDGE',
  }
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
    // NOT gated on `briefed`: the opening VTC is itself the first lesson, so the
    // step flow has to be live while that call is still up.
    if (!c || !c.tutorial || c.complete) return
    // reactive casualty warning: pauses like a gate until ACKNOWLEDGED, then
    // latches one-shot and hands back to the step flow
    if (!c.tutBreakShown && _reactive.some(r => r.verb === 'casualty-warning')) {
      const u = hurtUnit()
      if (u) {
        if (_nextDone.has(CASUALTY_KEY)) {
          c.tutBreakShown = true
          if (S.speed === 0) S.speed = 1 // a pending gated step re-pauses next tick
        } else {
          if (S.speed !== 0) S.speed = 0
          return // the warning owns the screen until it is read
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
    }
    /* the pan lesson: the hand stroke, replayed. --tdx/--tdy are the drag
       vector, set inline per frame (the camera can be pointed anywhere). */
    @keyframes tutDrag {
      0%      { transform: translate(0,0); opacity: 0; }
      18%     { opacity: 1; }
      78%     { opacity: 1; }
      100%    { transform: translate(var(--tdx), var(--tdy)); opacity: 0; }
    }
    @keyframes tutBlink { 0%,100% { opacity: .35; } 50% { opacity: 1; } }`
    document.head.appendChild(st)
  }, [])

  if (!c || !c.tutorial || c.complete) return null
  if (ui.console) return null // a staff console owns the column; cues point at the map
  // The OPENING VTC is the curriculum's first classroom — the overlay rides over
  // it (z 108/109 clears the call's 105). Every LATER order window owns the
  // screen alone: by then the player knows what a call is.
  if (c.briefed && c.frago != null) return null
  // the reactive casualty warning overrides the step cue — and still renders
  // after the scripted steps are exhausted (casualties come with the counterattack)
  const tip = casualtyWarning()
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
    // a BOX frames a group: fit its whole span (with air around it) so every
    // unit the cue is talking about is on screen. A point/unit gets the
    // generic close-up. Either way `minZoom` only zooms IN — never back out.
    const span = hint.targetBox
      ? Math.max(1800, Math.max(hint.targetBox.x1 - hint.targetBox.x0, hint.targetBox.y1 - hint.targetBox.y0) * 1.9)
      : 4200
    if (mapTarget) centerView(mapTarget, { minZoom: zoomFor(span) })
  }

  // resolve the ring target: a DOM element, a map unit/point, or nothing.
  // `lift` bottom-anchors the callout (translateY(-100%)) so a box pointing
  // down at a bottom-tray control stacks ABOVE it, never clipped off-screen.
  let ring: { left: number; top: number; width: number; height: number } | null = null
  // a `data-tut` tag may sit on SEVERAL elements (the deck's thumbnails and its
  // arrows are one lesson in two places): ring them all, hang the callout off
  // the first. Their bounding box is no good — it would swallow the slide.
  const extraRings: { left: number; top: number; width: number; height: number }[] = []
  let callout: { left: number; top: number; width: number; pointer?: 'left' | 'right' | 'up' | 'down'; lift?: boolean; overlap?: boolean } | null = null

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
    const els = Array.from(document.querySelectorAll(`[data-tut="${hint.targetSel}"]`))
    const el = els[0]
    for (const other of els.slice(1)) {
      const o = other.getBoundingClientRect()
      extraRings.push({ left: o.left - 5, top: o.top - 5, width: o.width + 10, height: o.height + 10 })
    }
    if (el) {
      const r = el.getBoundingClientRect()
      ring = { left: r.left - 5, top: r.top - 5, width: r.width + 10, height: r.height + 10 }
      const vw = window.innerWidth, vh = window.innerHeight
      const short = r.height < 90 // a button/row — TALL boxes (a whole list) always get a side callout
      // A WHOLE WINDOW (the VTC) leaves no room beside it, and a cue jammed
      // against the screen edge reads as unrelated to it. Sit the card on the
      // window's bottom edge instead, centred and wide, with its top 40%
      // lapping over the frame so the two clearly belong together.
      if (r.width > vw * 0.6 && r.height > vh * 0.5) {
        const w = 620
        const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), vw - w - 8)
        callout = { left, top: r.bottom, width: w, overlap: true }
      } else if (short && r.bottom + 140 > vh) {
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
  // PAN cue: the map is the only control with no button to ring, so the lesson
  // has to be drawn. An arrow rides the map edge on the bearing to the place,
  // and a mouse glyph strokes the gesture that gets you there. The stroke runs
  // the OPPOSITE way to the bearing — you drag the ground, not the camera
  // (MapView: view.cx -= dx), the same as dragging a paper map across a table.
  let panCue: {
    ex: number; ey: number; deg: number; km: string
    cx: number; cy: number; dx: number; dy: number; label: string
  } | null = null
  if (hint.panTo) {
    const p = worldToViewport(hint.panTo.x, hint.panTo.y)
    const v = (window as unknown as { __view?: { cx: number; cy: number } }).__view
    if (p && v) {
      const cx0 = p.rect.left + p.rect.width / 2, cy0 = p.rect.top + p.rect.height / 2
      const L = Math.hypot(p.x - cx0, p.y - cy0) || 1
      const ux = (p.x - cx0) / L, uy = (p.y - cy0) / L
      // where that bearing leaves the map box (kept inboard so the label fits)
      const hw = p.rect.width / 2 - 80, hh = p.rect.height / 2 - 80
      const t = Math.min(Math.abs(ux) > 1e-3 ? hw / Math.abs(ux) : Infinity,
        Math.abs(uy) > 1e-3 ? hh / Math.abs(uy) : Infinity)
      const d = Math.hypot(hint.panTo.x - v.cx, hint.panTo.y - v.cy)
      panCue = {
        ex: cx0 + ux * Math.min(t, L), ey: cy0 + uy * Math.min(t, L),
        deg: Math.atan2(uy, ux) * 180 / Math.PI + 90,  // a CSS triangle points -Y
        km: d >= 1000 ? `${(d / 1000).toFixed(1)} KM` : `${Math.round(d)} M`,
        cx: cx0, cy: cy0, dx: -ux * 54, dy: -uy * 54,
        label: hint.panLabel ?? '',
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
      {(ring ? [ring, ...extraRings] : []).map((r, i) => (
        <div key={`tut-ring-${i}`} style={{
          position: 'fixed', zIndex: 108, pointerEvents: 'none',
          left: r.left, top: r.top, width: r.width, height: r.height,
          border: `2px solid ${RING_A}`, borderRadius: isMapCircle ? '50%' : 5,
          animation: 'tutPulse 1.4s ease-in-out infinite',
        }} />
      ))}

      {/* PAN lesson: bearing arrow at the map edge + the middle-drag stroke */}
      {panCue && (
        <div key="tut-pan" style={{ position: 'fixed', zIndex: 108, pointerEvents: 'none', inset: 0 }}>
          <div style={{ position: 'absolute', left: panCue.ex, top: panCue.ey, transform: 'translate(-50%,-50%)' }}>
            <div style={{
              margin: '0 auto', width: 0, height: 0,
              borderLeft: '15px solid transparent', borderRight: '15px solid transparent',
              borderBottom: `24px solid ${RING_A}`, transform: `rotate(${panCue.deg}deg)`,
              animation: 'tutBlink 1.2s ease-in-out infinite',
            }} />
            <div style={{
              marginTop: 7, textAlign: 'center', fontFamily: 'Consolas, monospace',
              fontSize: 10, fontWeight: 'bold', letterSpacing: 1.6, color: RING_A,
              textShadow: '0 1px 4px #000, 0 0 8px #000',
            }}>{panCue.label} · {panCue.km}</div>
          </div>
          {/* the hand: a mouse with its WHEEL lit, stroking the drag over and over */}
          <div style={{ position: 'absolute', left: panCue.cx, top: panCue.cy, transform: 'translate(-50%,-50%)' }}>
            <div style={{
              ['--tdx' as string]: `${panCue.dx}px`, ['--tdy' as string]: `${panCue.dy}px`,
              animation: 'tutDrag 1.9s ease-in-out infinite',
            } as CSSProperties}>
              <svg width="38" height="56" viewBox="0 0 38 56" style={{ filter: 'drop-shadow(0 2px 6px #000)' }}>
                <rect x="3" y="3" width="32" height="50" rx="16"
                  fill="rgba(10,16,22,0.9)" stroke="#dceeff" strokeWidth="2" />
                <rect x="15" y="10" width="8" height="15" rx="4" fill={RING_A} />
              </svg>
            </div>
            <div style={{
              marginTop: 4, textAlign: 'center', fontFamily: 'Consolas, monospace',
              fontSize: 9.5, fontWeight: 'bold', letterSpacing: 1.4, color: '#dceeff',
              textShadow: '0 1px 4px #000, 0 0 8px #000', whiteSpace: 'nowrap',
              transform: 'translateX(-50%)', marginLeft: 19,
            }}>HOLD THE WHEEL · DRAG</div>
          </div>
        </div>
      )}

      {/* the callout: beside/above the ring, or centered at the map bottom.
          `lift` bottom-anchors it above a tray control (on top of the toolbar). */}
      <div style={bottom
        ? { position: 'fixed', zIndex: 109, left: '50%', bottom: 96, transform: 'translateX(-50%)', width: callout.width, maxWidth: '80vw' }
        : { position: 'fixed', zIndex: 109, left: callout.left, top: callout.top, width: callout.width,
            // `lift` clears a bottom-tray control; `overlap` laps the card's top
            // 40% back over the window it is talking about
            ...(callout.lift ? { transform: 'translateY(-100%)' }
              : callout.overlap ? { transform: 'translateY(-40%)' } : {}) }
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
          {/* pre-wrap so a mission can paragraph a long lesson with blank lines
              — a wall of monospace is the one thing nobody reads under contact */}
          <div style={{ fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{hint.text}</div>
          {/* the DO line: every step ends with one standout imperative — the
              amber ties it to the pulsing ring it points at */}
          {hint.action && (
            <div style={{
              marginTop: 8, paddingTop: 7, borderTop: '1px solid #2a3a48',
              fontSize: 12.5, fontWeight: 'bold', letterSpacing: 0.6, color: RING_A,
            }}>▶ {hint.action}</div>
          )}
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={skip}
              onMouseEnter={e => { e.currentTarget.style.color = '#9ab8d0' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#4a6478' }}
              style={{ background: 'none', border: 'none', cursor: 'pointer',
                color: '#4a6478', fontFamily: 'inherit', fontSize: 9, letterSpacing: 1.5, padding: 0 }}>SKIP TUTORIAL</button>
            {/* a read-and-continue beat: nothing to DO but understand it, so the
                player says when they are done reading. Bumping the UI tick makes
                the chain fall through this frame instead of on the next pump. */}
            {hint.nextKey && (
              <button onClick={() => {
                _nextDone.add(hint.nextKey!)
                useUI.setState(s => ({ tick: s.tick + 1 }))
              }}
                style={{ marginLeft: 'auto', background: 'rgba(255,198,63,0.12)',
                  // same pulse as the ring: the ONE thing to click on this card,
                  // beating in time with the thing it is pointing at
                  border: `2px solid ${RING_A}`, borderRadius: 3, cursor: 'pointer',
                  animation: 'tutPulse 1.4s ease-in-out infinite',
                  color: '#ffe9b0', fontFamily: 'inherit', fontSize: 10.5, fontWeight: 'bold',
                  letterSpacing: 1.5, padding: '4px 12px' }}>{hint.nextLabel ?? 'NEXT ▶'}</button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
