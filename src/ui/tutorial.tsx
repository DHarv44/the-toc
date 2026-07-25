// Campaign tutorial: guided, gated teaching steps that live entirely in the UI.
// The engine only stores two plain fields (S.campaign.tutorial / tutStep); the
// step DEFINITIONS, advancement, pause handling and the on-screen cues all live
// here. Each step has a sim-observable `done(S)` and an adaptive `hint(S, ui)`
// that changes as the player makes progress. Gated steps pause the sim (speed 0)
// until done, then resume — so the player can't skip past an unlearned action.
//
// A hint can point at a DOM element (a rail item, via `data-tut`) OR at a unit on
// the map (via `targetUnit`) — the overlay draws the same pulsing ring on either
// and floats the callout beside it.
import { useEffect } from 'react'
import { S } from '../engine/state'
import { MISSIONS } from '../engine/campaign'
import { UNIT_TYPES } from '../domains/forces/catalog'
import { nearestLand } from '../world/place'
import { useUI, type UIState } from './store'

export interface TutorialHint {
  text: string                         // the WHY — context/teaching, no action verbs
  action?: string                      // the DO — one imperative line, rendered standout at the callout's bottom
  targetSel?: string                   // data-tut key to ring-highlight (a rail/menu item)
  targetUnit?: number                  // unit id to ring-highlight on the map
  targetPoint?: { x: number; y: number } // world point to ring-highlight (e.g. a move destination)
  targetBox?: { x0: number; y0: number; x1: number; y1: number } // world bbox to ring-highlight (a group)
  hidden?: boolean                     // show no cue this frame (e.g. waiting for a move to finish)
}

export interface TutorialStep {
  id: string
  gate?: boolean                              // pause the sim until done
  done: (S: typeof import('../engine/state').S, ui: UIState) => boolean
  hint: (S: typeof import('../engine/state').S, ui: UIState) => TutorialHint
}

// the campaign's recon platoon — the scout section that leads the advance
const recon = () => S.units.find(u => u.side === 'friend' && u.type === 'SCT')

// The move-tutorial destination: a road point a short bound up the axis toward the
// objective town — cached for the (fixed) campaign map.
let _moveTarget: { x: number; y: number } | null = null
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

// nearest hostile to the HQ — the town garrison the recon is sent to scout
function nearestEnemyUnit() {
  const hq = S.map?.fob
  if (!hq) return null
  let best = null, bd = Infinity
  for (const u of S.units) {
    if (u.side !== 'hostile' || u.strength <= 0) continue
    const d = Math.hypot(u.x - hq.x, u.y - hq.y)
    if (d < bd) { bd = d; best = u }
  }
  return best
}
function nearestEnemy(): { x: number; y: number } | null {
  const u = nearestEnemyUnit()
  return u ? { x: u.x, y: u.y } : null
}

// step-2 move marker: a standoff point ~650 m short of the nearest enemy on the
// HQ side, so advancing the recon there brings the enemy inside its sight (and
// under its Raven) without walking into rifle range. Snapped toward a road where
// one is close. Cached for the fixed campaign map (garrison doesn't move).
let _exposeMarker: { x: number; y: number } | null = null
function exposeMarker(): { x: number; y: number } | null {
  if (_exposeMarker) return _exposeMarker
  const m = S.map, hq = m?.fob, e = nearestEnemy()
  if (!m || !hq || !e) return moveTarget() // fallback: road point toward the town
  const dx = hq.x - e.x, dy = hq.y - e.y, L = Math.hypot(dx, dy) || 1
  const px = e.x + (dx / L) * 650, py = e.y + (dy / L) * 650
  _exposeMarker = nearestRoad(m, px, py, 260) || nearestLand(m, px, py)
  return _exposeMarker
}

// a live enemy contact on the common picture (recon has eyes on)
const enemySpotted = () => { for (const c of S.contacts.values()) if (c.live) return true; return false }

// M2 principals: the sustainment element and the FOB it stands up
const m2eng = () => S.units.find(u => u.side === 'friend' && u.type === 'ENG' && u.strength > 0)
const m2log = () => S.units.find(u => u.side === 'friend' && u.type === 'LOG' && u.strength > 0)
const m2fob = () => S.structures.find(s => s.side === 'friend' && s.kind === 'FOB')

// the waypoint lesson's first marker: a road point partway to the town, so the
// column takes the (faster) road before pushing to its destination
let _m2Road: { x: number; y: number } | null = null
function m2RoadPoint(): { x: number; y: number } | null {
  if (_m2Road) return _m2Road
  const m = S.map, t = S.campaign?.strongpoint, hq = m?.fob
  if (!m || !t || !hq) return null
  _m2Road = nearestRoad(m, hq.x + (t.x - hq.x) * 0.45, hq.y + (t.y - hq.y) * 0.45, 600)
  return _m2Road
}

// the spotted enemy the recon has eyes on — the one to attack (nearest live
// contact to the recon platoon)
function spottedEnemy() {
  const r = recon()
  let best = null, bd = Infinity
  for (const u of S.units) {
    if (u.side !== 'hostile' || u.strength <= 0) continue
    const c = S.contacts.get(u.id)
    if (!c || !c.live) continue
    const d = r ? Math.hypot(u.x - r.x, u.y - r.y) : 0
    if (d < bd) { bd = d; best = u }
  }
  return best
}

// Curriculum, keyed by mission id (front-loaded; empty by mission 4).
export const TUTORIALS: Record<string, TutorialStep[]> = {
  lodgment: [
    // 1) select the recon platoon — and teach WHY scouts lead: the garrison is
    //    concealed, and the scouts are pre-set to BREAK if it springs on them.
    {
      id: 'select-recon',
      done: (_S, ui) => {
        const r = recon()
        return !!r && ui.selectedIds.length === 1 && ui.selectedIds[0] === r.id
      },
      hint: () => ({
        text: 'SCOUTS LEAD — the garrison in the town is CONCEALED: nobody sees them until they are found, or they fire. Your recon platoon sees farthest, and it is set to BREAK contact automatically if engaged.',
        action: 'LEFT-CLICK your recon platoon.',
        targetUnit: recon()?.id,
      }),
    },
    // 2) screen forward to the standoff marker (≈650 m out — inside scout
    //    spotting range through urban concealment, outside the garrison's
    //    trigger range). Non-gated; the cue clears the instant the order is
    //    set. Completes at HALF A KLICK from the HQ, where the drone prompts.
    {
      id: 'move-recon',
      done: () => {
        const r = recon()
        return !!r && !!S.map && Math.hypot(r.x - S.map.fob.x, r.y - S.map.fob.y) >= 500
      },
      hint: () => {
        const r = recon(), t = exposeMarker()
        const dest = r && r.legs.length ? r.legs[r.legs.length - 1] : null
        if (dest && t && Math.hypot(dest.x - t.x, dest.y - t.y) <= 200) return { text: '', hidden: true }
        return {
          text: 'SCREEN FORWARD — push your scouts toward the town. From the highlighted point they can spot the hidden garrison at standoff; if it opens fire on them, they will break away on their own.',
          action: 'RIGHT-CLICK the highlighted point.',
          targetPoint: t ?? undefined,
        }
      },
    },
    // 3) eyes forward at half a klick — launch the recon platoon's Raven. Gated.
    {
      id: 'deploy-drone',
      gate: true,
      done: () => S.drones.length > 0,
      hint: (_S, ui) => {
        const sel = ui.selectedIds.length === 1
          ? S.units.find(u => u.id === ui.selectedIds[0]) : undefined
        const isCarrier = !!sel && sel.side === 'friend'
          && (UNIT_TYPES[sel.type].carries?.length ?? 0) > 0
        if (!isCarrier) {
          return {
            text: 'EYES FORWARD — your recon platoon carries a hand-launched Raven UAV.',
            action: 'LEFT-CLICK your recon platoon.',
            targetUnit: recon()?.id,
          }
        }
        return {
          text: 'LAUNCH THE RAVEN — its drone goes up right over the platoon and gives you a live feed of the ground ahead.',
          action: 'CLICK the ⊕ on the Raven row, in the COMMAND rail on the left.',
          targetSel: 'uas-raven',
        }
      },
    },
    // 4) silent hold: let the recon keep advancing until it makes contact.
    {
      id: 'await-contact',
      done: () => enemySpotted(),
      hint: () => ({ text: '', hidden: true }),
    },
    // 5) contact — group the rest of the force (select them together). Gated: the
    //    sim pauses on contact. The box highlight clears once they're all selected.
    {
      id: 'group-select',
      gate: true,
      done: (_S, ui) => ui.selectedIds.filter(id => {
        const u = S.units.find(x => x.id === id)
        return !!u && u.side === 'friend' && u.type !== 'SCT'
      }).length >= 2,
      hint: () => {
        // box the remaining (non-recon) platoons so the player sees who to group
        const rest = S.units.filter(u => u.side === 'friend' && u.type !== 'SCT' && u.strength > 0)
        let targetBox: TutorialHint['targetBox']
        if (rest.length) {
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
          for (const u of rest) { x0 = Math.min(x0, u.x); y0 = Math.min(y0, u.y); x1 = Math.max(x1, u.x); y1 = Math.max(y1, u.y) }
          const pad = 95
          targetBox = { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad }
        }
        // narrate whichever way the contact came: a clean standoff spot, or the
        // garrison springing its ambush and the scouts' BREAK drill kicking in
        const sct = recon()
        const ambushed = !!sct && (sct.breaking || S.t - (sct.underFireT ?? -999) < 20)
        const lead = ambushed
          ? 'AMBUSH SPRUNG — the hidden garrison opened up on your scouts, and they are breaking contact on their own (their BREAK drill). The enemy is fixed on the map. '
          : 'CONTACT — your scouts spotted the garrison from standoff without being engaged. '
        return {
          text: lead + 'GROUP YOUR FORCE — your line platoons fight together now.',
          action: 'DRAG a selection box around your platoons (or SHIFT-CLICK each).',
          targetBox,
        }
      },
    },
    // 6) attack — switch the selected group to ATTACK mode, then right-click the enemy.
    {
      id: 'attack-enemy',
      gate: true,
      done: () => S.units.some(u => u.side === 'friend' && u.type !== 'SCT' && (u.attackId != null || u.attackMove)),
      hint: (_S, ui) => {
        if (ui.cmdMode !== 'attack') {
          return {
            text: 'SET ATTACK POSTURE — attack orders send the group in to close with and destroy, instead of just moving.',
            action: 'CLICK ATTACK in the bottom tray (or press E).',
            targetSel: 'attack-mode',
          }
        }
        // circle the enemy the recon has eyes on (a live contact), so the player
        // knows which unit to right-click
        const e = spottedEnemy()
        return {
          text: 'ASSAULT — your group will advance on the highlighted enemy and clear the position.',
          action: 'RIGHT-CLICK the highlighted enemy.',
          targetUnit: e?.id,
        }
      },
    },
    // 7) silent hold: let the assault finish clearing the town's defenders.
    {
      id: 'await-clear',
      done: () => {
        const t = S.campaign?.strongpoint
        return !!t && !S.units.some(u => u.side === 'hostile' && u.strength > 0 && Math.hypot(u.x - t.x, u.y - t.y) <= 420)
      },
      hint: () => ({ text: '', hidden: true }),
    },
    // 8) occupy the town ON LINE — teaches the formation drag as the natural
    //    way to take ground. Non-gated (they walk in). Completion is OUTCOME-
    //    based: the WHOLE surviving assault force inside the town AND actually
    //    spread out (pairwise ≥100 m) — a player who stacks the platoons on
    //    one point gets a nudge explaining why that gets people killed (one
    //    artillery shell can catch a stacked position; blasts resolve against
    //    every element in radius).
    {
      id: 'occupy-town',
      done: () => {
        const t = S.campaign?.strongpoint
        if (!t) return false
        const fighters = S.units.filter(u => u.side === 'friend' && u.type !== 'SCT' && u.strength > 0)
        if (!fighters.length) return false
        if (!fighters.every(u => Math.hypot(u.x - t.x, u.y - t.y) <= 260)) return false
        for (let i = 0; i < fighters.length; i++) {
          for (let j = i + 1; j < fighters.length; j++) {
            if (Math.hypot(fighters[i]!.x - fighters[j]!.x, fighters[i]!.y - fighters[j]!.y) < 100) return false
          }
        }
        return true
      },
      hint: () => {
        const t = S.campaign?.strongpoint
        const targetBox = t ? { x0: t.x - 260, y0: t.y - 260, x1: t.x + 260, y1: t.y + 260 } : undefined
        // if they're already in the town but bunched up, the nudge takes over
        const fighters = t ? S.units.filter(u => u.side === 'friend' && u.type !== 'SCT' && u.strength > 0) : []
        const inTown = fighters.length > 0 && fighters.every(u => Math.hypot(u.x - t!.x, u.y - t!.y) <= 260)
        if (inTown) {
          return {
            text: 'SPREAD OUT — your platoons are stacked: one artillery shell can catch a bunched-up position.',
            action: 'SELECT them, then RIGHT-CLICK and DRAG a line through the buildings.',
            targetBox,
          }
        }
        return {
          text: 'TAKE THE TOWN — urban cover protects your platoons, and a spread line can\'t be caught by a single shell.',
          action: 'SELECT your platoons, then RIGHT-CLICK and DRAG a line across the town.',
          targetBox,
        }
      },
    },
    // 9) dig in — prepared fighting positions for even more protection. Gated.
    //    Only positions dug IN THE TOWN count — digging where a platoon happens
    //    to stand outside teaches exactly the wrong lesson.
    {
      id: 'dig-in',
      gate: true,
      done: () => {
        const t = S.campaign?.strongpoint
        return !!t && S.units.some(u => u.side === 'friend' && u.type !== 'SCT'
          && u.posture === 'dig' && Math.hypot(u.x - t.x, u.y - t.y) <= 260)
      },
      hint: () => ({
        text: 'DIG IN — prepared fighting positions stack with the urban cover for even more protection. Hold here and defeat the counterattack.',
        action: 'With your platoons in the town selected, CLICK ⛨ DIG IN in the bottom tray.',
        targetSel: 'dig-in',
      }),
    },
  ],

  'lines-of-supply': [
    // 1) bring the sustainment element forward — the WAYPOINT lesson. Two
    //    phases: put them on the road first (roads are faster), then SHIFT+
    //    RIGHT-click queues the final waypoint into the town. Non-gated (they
    //    have to drive); the cue hides once their route ends at the town. A
    //    player who right-clicks the town directly skips the lesson — fine.
    {
      id: 'move-up',
      done: () => {
        const t = S.campaign?.strongpoint, e = m2eng(), l = m2log()
        return !!t && !!e && !!l
          && Math.hypot(e.x - t.x, e.y - t.y) <= 420 && Math.hypot(l.x - t.x, l.y - t.y) <= 420
      },
      hint: () => {
        const t = S.campaign?.strongpoint, e = m2eng(), l = m2log()
        if (!t || !e || !l) return { text: '', hidden: true }
        // "handled": routed to the town, or already arrived there (no legs left)
        const endsAtTown = (u: NonNullable<ReturnType<typeof m2eng>>) => u.legs.length > 0
          ? Math.hypot(u.legs[u.legs.length - 1]!.x - t.x, u.legs[u.legs.length - 1]!.y - t.y) <= 520
          : Math.hypot(u.x - t.x, u.y - t.y) <= 520
        if (endsAtTown(e) && endsAtTown(l)) return { text: '', hidden: true }
        // phase 1: no orders yet — put the column on the road
        if (!e.legs.length && !l.legs.length) {
          return {
            text: 'BRING UP THE SUSTAINMENT — your engineer and logistics platoons are pushing up from the rear. Columns move much faster on ROADS.',
            action: 'SELECT them both, then RIGHT-CLICK the highlighted road point.',
            targetPoint: m2RoadPoint() ?? undefined,
          }
        }
        // phase 2: on the road — queue the final waypoint into the town
        return {
          text: 'QUEUE THE NEXT WAYPOINT — they will follow the road, then push up to the FOB site in the town.',
          action: 'HOLD SHIFT and RIGHT-CLICK the town.',
          targetBox: { x0: t.x - 260, y0: t.y - 260, x1: t.x + 260, y1: t.y + 260 },
        }
      },
    },
    // 2) establish the FOB — engineer + palette + placement. Gated.
    {
      id: 'build-fob',
      gate: true,
      done: () => !!m2fob(),
      hint: (_S, ui) => {
        const e = m2eng()
        if (!(ui.selectedIds.length === 1 && ui.selectedIds[0] === e?.id)) {
          return {
            text: 'ESTABLISH THE FOB — your engineer platoon does the building.',
            action: 'LEFT-CLICK your engineer platoon.',
            targetUnit: e?.id,
          }
        }
        if (!ui.mode.startsWith('build:FOB')) {
          return {
            text: 'ESTABLISH THE FOB — with the engineers selected, installations are built from the COMMAND rail.',
            action: 'CLICK Forward Op. Base in the rail on the left.',
            targetSel: 'build-fob',
          }
        }
        const t = S.campaign!.strongpoint
        return {
          text: 'PLACE IT — the engineers start construction; the supply truck on site is what lets you build this far forward of the HQ.',
          action: 'CLICK a spot inside the town.',
          targetBox: { x0: t.x - 260, y0: t.y - 260, x1: t.x + 260, y1: t.y + 260 },
        }
      },
    },
    // 3) open the supply line — logistics platoon on a standing HQ→FOB run. Gated.
    {
      id: 'supply-run',
      gate: true,
      done: () => !!m2log()?.convoy,
      hint: (_S, ui) => {
        const l = m2log(), fob = m2fob()
        if (!(ui.selectedIds.length === 1 && ui.selectedIds[0] === l?.id)) {
          return {
            text: 'OPEN THE SUPPLY LINE — your logistics platoon runs standing convoys.',
            action: 'LEFT-CLICK your logistics platoon.',
            targetUnit: l?.id,
          }
        }
        if (!String(ui.mode).startsWith('convoy:')) {
          return {
            text: 'OPEN THE SUPPLY LINE — a standing run keeps the FOB stocked without further orders.',
            action: 'CLICK SUPPLY RUN in the bottom tray.',
            targetSel: 'supply-run',
          }
        }
        return {
          text: 'SET THE ROUTE — the trucks will loop HQ → FOB on their own, delivering supply every run.',
          action: 'CLICK the FOB.',
          targetPoint: fob ? { x: fob.x, y: fob.y } : undefined,
        }
      },
    },
  ],
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

  // advance / pause: runs each 10 Hz tick. Sim-observable done() only; the sim
  // stays paused while a gated step is unfinished, then resumes.
  useEffect(() => {
    if (!c || !c.tutorial || c.complete || !c.briefed) return
    const steps = TUTORIALS[MISSIONS[c.mission - 1]?.id ?? ''] ?? []
    if (c.tutStep >= steps.length) return
    const step = steps[c.tutStep]!
    if (step.done(S, ui)) {
      c.tutStep++
      const next = steps[c.tutStep]
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
  const steps = TUTORIALS[MISSIONS[c.mission - 1]?.id ?? ''] ?? []
  if (c.tutStep >= steps.length) return null
  const hint = steps[c.tutStep]!.hint(S, ui)
  if (hint.hidden) return null // no cue this frame (e.g. platoon is en route to its waypoint)

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
      if (r.bottom + 140 > vh) {
        // control sits near the bottom (the selection tray): stack the callout
        // ABOVE it, bottom-anchored and wide, pointing down — on top of the
        // toolbar, never clipped by the screen edge
        const w = 460
        const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), vw - w - 8)
        callout = { left, top: r.top - 12, width: w, pointer: 'down', lift: true }
      } else {
        const w = 300
        // beside the control, flipping left if the right side would clip
        const fitsRight = r.right + 14 + w <= vw - 8
        callout = fitsRight
          ? { left: r.right + 14, top: Math.max(8, r.top + r.height / 2 - 34), width: w, pointer: 'left' }
          : { left: Math.max(8, r.left - 14 - w), top: Math.max(8, r.top + r.height / 2 - 34), width: w, pointer: 'right' }
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
