// The builder's map surface: the EXACT BFT sheet (renderPackLayer — the same
// bake the game blits) with pan/zoom, drawing scenario entities through the
// game's own 2525 symbol functions. All callbacks speak WORLD metres — the
// parent owns the state.
//
// THE CONTROL GRAMMAR, rebuilt to match what a scene editor actually does.
// What was here before was a paint program: arm a tool, click to stamp, and
// left-drag on empty ground did nothing at all.
//
//   LMB on a thing            select it (replacing the selection)
//   LMB on a selected thing   drag the WHOLE selection
//   Shift/Ctrl + LMB          add or remove that thing
//   LMB drag on empty ground  MARQUEE — the box select every editor has
//   drop from the palette     place (drag from the browser into the viewport,
//                             the Unreal/Unity idiom, replacing arm-and-click)
//   handles on the selection  rotate a unit, resize a zone — dragged, not typed
//   MMB drag, or Space + LMB  pan
//   RMB                       context menu (it used to be eaten by panning,
//                             which is why this tool had no context menu)
//   wheel                     zoom to the cursor
//
// Panning moved off RMB deliberately: right-click is where every one of these
// editors puts per-object actions, and giving it to the camera meant every
// verb had to be hunted for in a side panel.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { WorldMap } from '../../world/WorldMap'
import type { Ground } from '../../world/pack/loadGround'
import { packLayerFor, TERRAIN_PX } from '../../map/packRender'
import { terrainOrtho } from '../../map/terrainOrtho'
import { frameOf } from '../../world/pack/frame'
import { frameImagery } from '../../world/pack/imagery'
import { drawUnitSymbol, drawStructure, drawPlace, drawFacility } from '../../map/symbols'
import { FACILITIES } from '../../domains/installations/catalog'
import { PACKS, playerPack } from '../../packs'
import { markOf, patchOf } from '../../packs/orgquery'
import { UNIT_TYPES } from '../../domains/forces/catalog'
import type { Entity, Sel } from '../../scenario/edit'
import type { Ghost } from './ghosts'

export interface SheetProps {
  map: WorldMap
  ground: Ground
  entities: Entity[]
  /** THE MISSION ON THE BENCH, drawn. Nothing here exists at H-hour, so all
   *  of it is dashed and dimmed — it is what the script WILL do. */
  ghosts: Ghost[]
  /** what the palette is carrying — a drop places it. Null when the cursor
   *  is empty, which is the normal state (there is no armed MODE any more). */
  carry: { label: string } | null
  /** planned FOB access tracks (world/access planAccessTrack) — the exact
   *  dirt road the game will lay at H-hour, previewed */
  tracks: { id: number; pts: { x: number; y: number }[] }[]
  /** base anatomy preview (installations/anatomy) — the same footprint, gate
   *  and facility layout the game derives at H-hour */
  wires: {
    id: number
    poly: { x: number; y: number }[]
    gate: { x: number; y: number }
    anchor: { x: number; y: number }
    facs: Record<string, { x: number; y: number }>
  }[]
  /** every selected entity */
  sel: number[]
  /** the shared map-control toggles — same semantics as the game's BFT */
  night: boolean
  sat: boolean
  /** the scenario's chair: friendly entities outside it (and unattached) are
   *  a sister formation's — drawn dimmed and tagged with their owner */
  playerFormation: string
  /** the pack playing BLUFOR — its org names each formation's echelon */
  friendPack: string
  /** `add` is a shift/ctrl click — toggle rather than replace */
  onPick: (id: number | null, add: boolean) => void
  /** a marquee closed over these ids */
  onMarquee: (ids: number[], add: boolean) => void
  /** a ghost was clicked — select the script node that put it there */
  onPickGhost: (s: Sel) => void
  /** the carried palette item was dropped here */
  onDrop: (wx: number, wy: number) => void
  onDragStart: () => void
  /** move the whole selection by a world delta */
  onDragBy: (dx: number, dy: number) => void
  /** a handle was dragged: a unit's heading (radians) or a zone's radius (m) */
  onHandle: (id: number, patch: { heading?: number; r?: number }) => void
  /** right-click — the parent opens the context menu at these screen coords */
  onContext: (sx: number, sy: number, id: number | null) => void
}

export interface SheetHandle {
  fit: () => void
  /** put a world point on screen at a readable scale (the script's ◎) */
  centerOn: (wx: number, wy: number) => void
}

const SheetCanvas = forwardRef<SheetHandle, SheetProps>(function SheetCanvas(p, handle) {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const propsRef = useRef(p)
  propsRef.current = p
  const fitRef = useRef<() => void>(() => {})
  const centerRef = useRef<(wx: number, wy: number) => void>(() => {})
  useImperativeHandle(handle, () => ({
    fit: () => fitRef.current(),
    centerOn: (wx, wy) => centerRef.current(wx, wy),
  }), [])

  useEffect(() => {
    const canvas = cvRef.current!
    const ctx = canvas.getContext('2d')!
    const { map, ground } = propsRef.current
    const layer = packLayerFor(map, ground)
    const mpp = map.CELL / TERRAIN_PX

    // open fit-to-sheet, centred
    const view = { cx: map.WORLD / 2, cy: map.WORLD / 2, ppm: 0.02 }
    const fit = () => {
      const s = Math.min(canvas.clientWidth || 800, canvas.clientHeight || 800)
      view.cx = map.WORLD / 2
      view.cy = map.WORLD / 2
      view.ppm = Math.max(0.005, s / map.WORLD)
    }
    fitRef.current = fit
    // GO THERE: put a point mid-screen, zoomed in enough to read the ground
    // around it (never zooming OUT — the author was already closer for a reason)
    centerRef.current = (wx, wy) => {
      view.cx = wx
      view.cy = wy
      const s = Math.min(canvas.clientWidth || 800, canvas.clientHeight || 800)
      view.ppm = Math.max(view.ppm, Math.min(4, s / 6000))
    }
    let fitted = false

    // SAT underlay — the SAME services the game's BFT uses (imagery for a map
    // that shipped satellite, the engine's terrain bake for one that didn't),
    // so the builder shows exactly what the commander will see
    let satLayer: HTMLCanvasElement | null = null
    let satKicked = false
    const kickSat = () => {
      if (satKicked) return
      satKicked = true
      if (!map.sat) {
        try { satLayer = terrainOrtho(map) } catch (e) { satKicked = false; console.error('terrain ortho bake failed', e) }
        return
      }
      frameImagery(ground, frameOf(ground.files.manifest))
        .then(cv => { satLayer = cv })
        .catch(e => { satKicked = false; console.error('satellite imagery failed', e) })
    }

    const w2sX = (wx: number) => (wx - view.cx) * view.ppm + canvas.width / 2
    const w2sY = (wy: number) => (wy - view.cy) * view.ppm + canvas.height / 2
    const s2wX = (sx: number) => (sx - canvas.width / 2) / view.ppm + view.cx
    const s2wY = (sy: number) => (sy - canvas.height / 2) / view.ppm + view.cy

    const rect = { left: 0, top: 0 }
    const mX = (ev: PointerEvent | WheelEvent) => ev.clientX - rect.left
    const mY = (ev: PointerEvent | WheelEvent) => ev.clientY - rect.top

    const hit = (sx: number, sy: number): Entity | null => {
      const es = propsRef.current.entities
      let best: Entity | null = null, bd = 16
      for (const e of es) {
        const d = Math.hypot(w2sX(e.x) - sx, w2sY(e.y) - sy)
        if (d < bd) { bd = d; best = e }
      }
      if (best) return best
      // A ZONE'S RING IS A HANDLE TOO. A big objective's centre is often off
      // the screen you are working on; without this, the only way to select
      // it is to zoom out and hunt for the middle.
      for (const e of es) {
        if (e.ent !== 'place' || e.r == null) continue
        const d = Math.abs(Math.hypot(w2sX(e.x) - sx, w2sY(e.y) - sy) - e.r * view.ppm)
        if (d < 10) return e
      }
      return null
    }

    // A GHOST IS CLICKABLE. The whole point of drawing the script is that you
    // can then work with it on the map rather than hunting it in a form, so
    // the counterattack you can see is the counterattack you can select.
    // Entities win ties — the situation is the thing you are placing.
    const hitGhost = (sx: number, sy: number): Sel | null => {
      const gs = propsRef.current.ghosts
      for (let i = gs.length - 1; i >= 0; i--) {
        const g = gs[i]!
        if (g.k === 'line') {
          if (Math.abs(w2sY(g.y) - sy) < 8) return g.sel
          continue
        }
        const d = Math.hypot(w2sX(g.x) - sx, w2sY(g.y) - sy)
        if (d < 18) return g.sel
        // a zone's RING is a handle, same as an authored place's
        if (g.k === 'zone' && Math.abs(d - g.r * view.ppm) < 10) return g.sel
      }
      return null
    }

    // THE HANDLES on the current selection. A unit gets a heading knob on a
    // ring; a zone gets a radius knob on its ring. Typing 420 into a number
    // field and then saving to find out what 420 metres looks like is not how
    // anyone sizes an objective.
    const HANDLE_R = 34            // screen px, the heading ring
    const handleAt = (sx: number, sy: number): { id: number; kind: 'rot' | 'rad' } | null => {
      const { entities: es, sel } = propsRef.current
      if (sel.length !== 1) return null       // handles are a single-selection affordance
      const e = es.find(x => x.id === sel[0])
      if (!e) return null
      const cx = w2sX(e.x), cy = w2sY(e.y)
      if (e.ent === 'unit') {
        const a = e.heading ?? 0
        const hx = cx + Math.cos(a) * HANDLE_R, hy = cy + Math.sin(a) * HANDLE_R
        return Math.hypot(hx - sx, hy - sy) < 9 ? { id: e.id, kind: 'rot' } : null
      }
      if (e.ent === 'place' && e.r != null) {
        const r = e.r * view.ppm
        const hx = cx + r, hy = cy
        return Math.hypot(hx - sx, hy - sy) < 9 ? { id: e.id, kind: 'rad' } : null
      }
      return null
    }

    // ---- pointer state ----
    let pan: { sx: number; sy: number; cx: number; cy: number } | null = null
    let drag: { started: boolean; lastX: number; lastY: number } | null = null
    let grab: { id: number; kind: 'rot' | 'rad'; started: boolean } | null = null
    let marquee: { x0: number; y0: number; x1: number; y1: number; add: boolean } | null = null
    let space = false
    // where the cursor is over the sheet — the carried item rides it
    const cursor = { x: 0, y: 0, on: false }
    const keyDown = (ev: KeyboardEvent) => { if (ev.code === 'Space') space = true }
    const keyUp = (ev: KeyboardEvent) => { if (ev.code === 'Space') space = false }
    const enter = () => { cursor.on = true }
    const leave = () => { cursor.on = false }

    const down = (ev: PointerEvent) => {
      canvas.setPointerCapture(ev.pointerId)
      // RMB is the CONTEXT MENU, not the camera. Middle-drag and Space+drag
      // pan; both are standard, and neither costs the right button.
      if (ev.button === 2) {
        const e = hit(mX(ev), mY(ev))
        propsRef.current.onContext(ev.clientX, ev.clientY, e?.id ?? null)
        return
      }
      if (ev.button === 1 || (ev.button === 0 && space)) {
        pan = { sx: ev.clientX, sy: ev.clientY, cx: view.cx, cy: view.cy }
        return
      }
      if (ev.button !== 0) return
      const sx = mX(ev), sy = mY(ev)

      // a handle beats everything under it — it is drawn on top for a reason
      const h = handleAt(sx, sy)
      if (h) { grab = { ...h, started: false }; return }

      const add = ev.shiftKey || ev.ctrlKey || ev.metaKey
      const e = hit(sx, sy)
      if (e) {
        // clicking something already selected keeps the set and drags it all;
        // clicking something new replaces the set (unless shift is held)
        if (!add && !propsRef.current.sel.includes(e.id)) propsRef.current.onPick(e.id, false)
        else propsRef.current.onPick(e.id, add)
        drag = { started: false, lastX: s2wX(sx), lastY: s2wY(sy) }
        return
      }
      const g = hitGhost(sx, sy)
      if (g) { propsRef.current.onPickGhost(g); return }
      // empty ground: MARQUEE. This is the gesture that was doing nothing.
      marquee = { x0: sx, y0: sy, x1: sx, y1: sy, add }
    }
    const move = (ev: PointerEvent) => {
      cursor.x = mX(ev); cursor.y = mY(ev); cursor.on = true
      if (pan) {
        view.cx = pan.cx - (ev.clientX - pan.sx) / view.ppm
        view.cy = pan.cy - (ev.clientY - pan.sy) / view.ppm
        return
      }
      if (marquee) { marquee.x1 = mX(ev); marquee.y1 = mY(ev); return }
      if (grab) {
        if (!grab.started) { grab.started = true; propsRef.current.onDragStart() }
        const e = propsRef.current.entities.find(x => x.id === grab!.id)
        if (!e) return
        const dx = s2wX(mX(ev)) - e.x, dy = s2wY(mY(ev)) - e.y
        if (grab.kind === 'rot') {
          propsRef.current.onHandle(grab.id, { heading: Math.atan2(dy, dx) })
        } else {
          propsRef.current.onHandle(grab.id, { r: Math.max(20, Math.round(Math.hypot(dx, dy))) })
        }
        return
      }
      if (drag) {
        if (!drag.started) { drag.started = true; propsRef.current.onDragStart() }
        // MOVE BY DELTA, not to a point: the whole selection travels together
        // and keeps its shape. Dragging to the cursor only ever worked because
        // exactly one thing could be selected.
        const wx = s2wX(mX(ev)), wy = s2wY(mY(ev))
        propsRef.current.onDragBy(wx - drag.lastX, wy - drag.lastY)
        drag.lastX = wx; drag.lastY = wy
      }
    }
    const up = (ev: PointerEvent) => {
      if (marquee) {
        const [ax, bx] = [marquee.x0, marquee.x1].sort((a, b) => a - b)
        const [ay, by] = [marquee.y0, marquee.y1].sort((a, b) => a - b)
        // a click, not a drag: nothing boxed, so it is a deselect
        if (bx - ax < 4 && by - ay < 4) propsRef.current.onPick(null, marquee.add)
        else {
          const ids = propsRef.current.entities
            .filter(e => {
              const x = w2sX(e.x), y = w2sY(e.y)
              return x >= ax && x <= bx && y >= ay && y <= by
            })
            .map(e => e.id)
          propsRef.current.onMarquee(ids, marquee.add)
        }
      }
      // A DROP PLACES. The palette hands the cursor something and releasing it
      // over the sheet puts it down — no armed mode to forget about, and no
      // stray click can stamp a second one.
      if (propsRef.current.carry && !pan && !drag && !grab) {
        propsRef.current.onDrop(s2wX(mX(ev)), s2wY(mY(ev)))
      }
      pan = null; drag = null; grab = null; marquee = null
      void ev
    }
    const wheel = (ev: WheelEvent) => {
      ev.preventDefault()
      const k = ev.deltaY < 0 ? 1.2 : 1 / 1.2
      // zoom to the cursor: the world point under it stays under it
      const wx = s2wX(mX(ev)), wy = s2wY(mY(ev))
      view.ppm = Math.max(0.004, Math.min(4, view.ppm * k))
      view.cx = wx - (mX(ev) - canvas.width / 2) / view.ppm
      view.cy = wy - (mY(ev) - canvas.height / 2) / view.ppm
    }
    const ctxMenu = (ev: Event) => ev.preventDefault()

    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('wheel', wheel, { passive: false })
    canvas.addEventListener('contextmenu', ctxMenu)
    canvas.addEventListener('pointerenter', enter)
    canvas.addEventListener('pointerleave', leave)
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)

    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const w = canvas.clientWidth, h = canvas.clientHeight
      if (w < 2 || h < 2) return
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
      const r = canvas.getBoundingClientRect()
      rect.left = r.left; rect.top = r.top
      if (!fitted) { fitted = true; fit() }

      ctx.fillStyle = '#1a1b1d'
      ctx.fillRect(0, 0, w, h)
      const { night, sat } = propsRef.current
      if (sat) kickSat()
      const showSat = sat && satLayer != null
      ctx.imageSmoothingEnabled = showSat || view.ppm * mpp < 1
      if (night) ctx.filter = 'brightness(0.42) saturate(0.5) contrast(1.05)'
      if (showSat) {
        ctx.drawImage(satLayer!, w2sX(0), w2sY(0), map.WORLD * view.ppm, map.WORLD * view.ppm)
      } else {
        ctx.drawImage(layer, w2sX(0), w2sY(0), layer.width * mpp * view.ppm, layer.height * mpp * view.ppm)
      }
      ctx.filter = 'none'
      ctx.strokeStyle = 'rgba(40,55,70,0.55)'
      ctx.lineWidth = 2
      ctx.strokeRect(w2sX(0), w2sY(0), map.WORLD * view.ppm, map.WORLD * view.ppm)

      const { entities, sel, tracks, wires } = propsRef.current
      // FOB access tracks first — under the symbols, styled like the sheet's
      // own dirt tracks so the preview reads as the road it will become
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (const t of tracks) {
        if (t.pts.length < 2) continue
        ctx.strokeStyle = 'rgba(122,98,66,0.9)'
        ctx.lineWidth = Math.max(1.2, 5 * view.ppm)
        ctx.setLineDash([6, 5])
        ctx.beginPath()
        ctx.moveTo(w2sX(t.pts[0]!.x), w2sY(t.pts[0]!.y))
        for (let i = 1; i < t.pts.length; i++) ctx.lineTo(w2sX(t.pts[i]!.x), w2sY(t.pts[i]!.y))
        ctx.stroke()
        ctx.setLineDash([])
      }
      // BASE ANATOMY under the symbols too — the same footprint, gate and
      // facility layout the game derives at H-hour, in the game's own
      // graded-earth language, at the same legibility gate as the BFT
      if (70 * view.ppm >= 24) {
        const nightSheet = propsRef.current.night
        for (const w of wires) {
          ctx.beginPath()
          w.poly.forEach((p, i) => {
            const sx = w2sX(p.x), sy = w2sY(p.y)
            if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy)
          })
          ctx.closePath()
          ctx.fillStyle = nightSheet ? 'rgba(200,205,210,0.10)' : 'rgba(88,86,80,0.28)'
          ctx.fill()
          ctx.strokeStyle = nightSheet ? 'rgba(180,200,220,0.4)' : 'rgba(62,60,54,0.5)'
          ctx.lineWidth = 1.3
          ctx.stroke()
          // gate posts astride the opening
          const gx = w2sX(w.gate.x), gy = w2sY(w.gate.y)
          const ang = Math.atan2(w.gate.y - w.anchor.y, w.gate.x - w.anchor.x) + Math.PI / 2
          const px = Math.cos(ang) * 5, py = Math.sin(ang) * 5
          ctx.strokeStyle = nightSheet ? 'rgba(180,225,255,0.95)' : 'rgba(25,50,80,0.9)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(gx + px - py * 0.6, gy + py + px * 0.6)
          ctx.lineTo(gx + px + py * 0.6, gy + py - px * 0.6)
          ctx.moveTo(gx - px - py * 0.6, gy - py + px * 0.6)
          ctx.lineTo(gx - px + py * 0.6, gy - py - px * 0.6)
          ctx.stroke()
          for (const [k, p] of Object.entries(w.facs)) {
            const spec = FACILITIES[k]
            if (!spec) continue
            drawFacility(ctx, w2sX(p.x), w2sY(p.y), {
              name: spec.name, effects: spec.effects, label: 70 * view.ppm >= 48,
            })
          }
        }
      }
      // GHOSTS UNDER THE SITUATION. Everything here happens LATER — an
      // objective's area, the troops a trigger will spawn, where the OPFOR
      // gets pushed — so it is drawn dashed and half-lit: legible enough to
      // plan against, never mistakable for something that is already there.
      // The selected one burns bright, which is what makes the outline and
      // the map one tool instead of two.
      // A LABEL ON THIS SHEET MUST SURVIVE TAN GROUND. Baghdad at midday is
      // near-white, and thin coloured text on it is unreadable — the dogfood
      // log filed exactly this against the amber control measures. Every ghost
      // label gets a dark stroke behind it, so it reads on desert, on forest
      // and on the satellite underlay without picking a colour that works on
      // only one of them.
      const tag = (text: string, x: number, y: number, fill: string, bold = false) => {
        ctx.font = `${bold ? 'bold ' : ''}12px Consolas, monospace`
        ctx.lineJoin = 'round'
        ctx.lineWidth = 3.5
        ctx.strokeStyle = 'rgba(6,10,14,0.92)'
        ctx.strokeText(text, x, y)
        ctx.fillStyle = fill
        ctx.fillText(text, x, y)
      }
      // GHOSTS STACK, because a well-written mission hangs several tasks off
      // ONE piece of ground: scout it, clear it, build on it. Drawn naively
      // every label lands on the same pixel and the whole cluster becomes an
      // unreadable smear. Each ghost sharing a spot gets its own line.
      const slot = new Map<string, number>()
      const lane = (x: number, y: number) => {
        const k = `${Math.round(x / 24)}:${Math.round(y / 24)}`
        const n = slot.get(k) ?? 0
        slot.set(k, n + 1)
        return n
      }
      ctx.textAlign = 'center'
      for (const g of propsRef.current.ghosts) {
        const on = g.on
        // unselected ghosts sit at 0.8, not 0.5: this is a PLANNING overlay, and
        // an overlay you have to squint at is one you stop consulting
        ctx.globalAlpha = on ? 1 : 0.8
        ctx.setLineDash(on ? [9, 4] : [6, 5])
        ctx.lineWidth = on ? 3 : 2
        if (g.k === 'line') {
          const y2 = w2sY(g.y)
          ctx.strokeStyle = on ? '#ffd67e' : '#d8ac62'
          ctx.beginPath(); ctx.moveTo(w2sX(0), y2); ctx.lineTo(w2sX(map.WORLD), y2); ctx.stroke()
          ctx.textAlign = 'left'
          tag(g.label, w2sX(0) + 10, y2 - 8, on ? '#ffd67e' : '#d8ac62', on)
          ctx.textAlign = 'center'
          continue
        }
        const x = w2sX(g.x), y = w2sY(g.y)
        if (g.k === 'zone') {
          // A REAL RADIUS, WITH A FLOOR. The geometry is honest — a 420m
          // objective on a 30km sheet really is small — but below about 16px
          // a ring stops reading as a ring at all, and an author zoomed out to
          // see the whole operation still needs to know the objective is
          // there. The floor makes it findable; zooming in makes it true.
          const r = Math.max(16, g.r * view.ppm)
          ctx.strokeStyle = on ? '#8fd4ff' : '#5f9fc8'
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
          tag(g.label, x, y - r - 8 - lane(x, y) * 14, on ? '#8fd4ff' : '#a8cade', on)
        } else if (g.k === 'force') {
          // the shape of what ARRIVES: a box per element, so a three-platoon
          // counterattack reads as three platoons before it ever spawns
          const n = Math.max(1, g.units.length)
          ctx.strokeStyle = on ? '#ffb07a' : '#d1855c'
          for (let i = 0; i < n; i++) {
            const bx = x + (i - (n - 1) / 2) * 26
            ctx.fillStyle = 'rgba(90,34,26,0.55)'
            ctx.beginPath(); ctx.rect(bx - 11, y - 8, 22, 16); ctx.fill(); ctx.stroke()
          }
          const d = lane(x, y) * 30
          tag(g.units.join(' ') || 'FORCE', x, y - 14 - d, on ? '#ffb07a' : '#e0a081', on)
          tag(g.label, x, y + 24 + d, on ? '#ffb07a' : '#c8916f')
        } else if (g.k === 'push') {
          // an arrow into the place — where the OPFOR is TOLD to go
          ctx.strokeStyle = on ? '#ff8f7e' : '#cc6a5c'
          ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI * 2); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(x - 46, y - 46); ctx.lineTo(x - 18, y - 18); ctx.stroke()
          ctx.setLineDash([])
          ctx.beginPath()
          ctx.moveTo(x - 16, y - 16); ctx.lineTo(x - 30, y - 18); ctx.lineTo(x - 18, y - 30)
          ctx.closePath(); ctx.fillStyle = on ? '#ff8f7e' : '#cc6a5c'; ctx.fill()
          tag(g.label, x, y + 36 + lane(x, y) * 14, on ? '#ff8f7e' : '#e0897a', on)
        } else {
          // a column: the edge it enters from, and the run to its anchor
          const edgeAt = g.edge === 'north' ? 0 : map.WORLD
          ctx.strokeStyle = on ? '#cbb4ff' : '#8f7fba'
          ctx.beginPath(); ctx.moveTo(x, w2sY(edgeAt)); ctx.lineTo(x, y); ctx.stroke()
          tag(g.label, x, y - 12, on ? '#cbb4ff' : '#a897d0', on)
        }
      }
      ctx.setLineDash([])
      ctx.globalAlpha = 1
      ctx.textAlign = 'left'

      for (const e of entities) {
        const x = w2sX(e.x), y = w2sY(e.y)
        // authored route: dashed to each waypoint, pips at the stops
        if (e.ent === 'unit' && e.route?.length) {
          ctx.strokeStyle = e.side === 'friend' ? 'rgba(128,200,255,0.6)' : 'rgba(255,128,128,0.6)'
          ctx.setLineDash([6, 5])
          ctx.lineWidth = 1.4
          ctx.beginPath()
          ctx.moveTo(x, y)
          for (const wp of e.route) ctx.lineTo(w2sX(wp.x), w2sY(wp.y))
          ctx.stroke()
          ctx.setLineDash([])
          for (const wp of e.route) {
            ctx.beginPath()
            ctx.arc(w2sX(wp.x), w2sY(wp.y), 3, 0, Math.PI * 2)
            ctx.fillStyle = e.side === 'friend' ? '#80c8ff' : '#ff8080'
            ctx.fill()
          }
        }
        if (sel.includes(e.id)) {
          ctx.strokeStyle = '#ffd67e'
          ctx.lineWidth = 1.6
          ctx.setLineDash([])
          ctx.strokeRect(x - 21, y - 16, 42, 32)
        }
        // TASK ORG at a glance: a friendly entity that belongs to another
        // formation (and is not attached to you) is drawn dimmed and carries
        // its owner's designation — you can see the neighbour without ever
        // mistaking it for your own.
        const owner = e.ent !== 'place' && e.side === 'friend'
          && e.formation && e.formation !== propsRef.current.playerFormation
          ? e.formation : null
        const allied = !!owner && !(e.ent === 'unit' && e.attached)
        // a light touch only: the owner tag and the echelon plate are what
        // say "not yours", and fading hard enough to make THOSE unreadable
        // defeats the point of drawing them
        if (allied) ctx.globalAlpha = 0.85
        if (e.ent === 'structure') {
          drawStructure(ctx, x, y, {
            side: e.side, kind: e.kind,
            label: owner ? `${e.label || e.kind} · ${owner}` : (e.label ?? ''),
            building: !!e.building,
            // the size marker names the echelon: a division main, a brigade
            // headquarters and your own CP are one symbol until you read it
            echelon: e.side === 'friend' && owner
              ? markOf(PACKS[propsRef.current.friendPack] ?? playerPack(), owner)
              : undefined,
            patch: e.side === 'friend' && owner
              ? patchOf(PACKS[propsRef.current.friendPack] ?? playerPack(), owner)
              : undefined,
          })
        } else if (e.ent === 'unit') {
          const abbr = UNIT_TYPES[e.type]?.abbr ?? e.type
          drawUnitSymbol(ctx, x, y, {
            side: e.side, glyph: UNIT_TYPES[e.type]?.glyph ?? 'inf',
            label: `${abbr}${e.tag ? ` [${e.tag}]` : ''}`
              + (owner ? ` · ${owner}${e.attached ? ' ATT' : ''}` : ''),
            dug: e.dug ? 1 : 0, showStrength: false,
          })
        } else {
          // the SAME control-measure graphic the game's BFT draws
          drawPlace(ctx, x, y, {
            name: e.name,
            ...(e.r != null ? { rPx: e.r * view.ppm } : {}),
          })
          ctx.textAlign = 'left'
        }
        if (allied) ctx.globalAlpha = 1
      }

      // ---- HANDLES on a single selection: the gizmo, such as it is --------
      // Not an axis tripod — this sheet is top-down and platoon-atomic, so
      // there is nothing to constrain to. What it does have is the two
      // continuous values an author actually tunes by eye: which way a dug-in
      // platoon faces, and how big an objective is.
      if (sel.length === 1) {
        const e = entities.find(x => x.id === sel[0])
        if (e && e.ent === 'unit') {
          const cx = w2sX(e.x), cy = w2sY(e.y), a = e.heading ?? 0
          ctx.setLineDash([3, 3]); ctx.lineWidth = 1
          ctx.strokeStyle = 'rgba(255,214,126,0.5)'
          ctx.beginPath(); ctx.arc(cx, cy, HANDLE_R, 0, Math.PI * 2); ctx.stroke()
          ctx.setLineDash([])
          const hx = cx + Math.cos(a) * HANDLE_R, hy = cy + Math.sin(a) * HANDLE_R
          ctx.strokeStyle = '#ffd67e'; ctx.lineWidth = 1.6
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(hx, hy); ctx.stroke()
          ctx.fillStyle = '#ffd67e'
          ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI * 2); ctx.fill()
        } else if (e && e.ent === 'place' && e.r != null) {
          const cx = w2sX(e.x), cy = w2sY(e.y), r = e.r * view.ppm
          ctx.fillStyle = '#ffd67e'
          ctx.beginPath(); ctx.arc(cx + r, cy, 5, 0, Math.PI * 2); ctx.fill()
          ctx.textAlign = 'left'
          tag(`${e.r} m`, cx + r + 10, cy + 4, '#ffd67e')
        }
      }

      // ---- MARQUEE --------------------------------------------------------
      if (marquee) {
        const x = Math.min(marquee.x0, marquee.x1), y = Math.min(marquee.y0, marquee.y1)
        const w2 = Math.abs(marquee.x1 - marquee.x0), h2 = Math.abs(marquee.y1 - marquee.y0)
        ctx.fillStyle = 'rgba(126,200,255,0.12)'
        ctx.fillRect(x, y, w2, h2)
        ctx.strokeStyle = '#7ec8ff'; ctx.lineWidth = 1
        ctx.setLineDash([4, 3]); ctx.strokeRect(x, y, w2, h2); ctx.setLineDash([])
      }

      // ---- THE CARRIED ITEM ------------------------------------------------
      // What the cursor is holding, held at the cursor. The old armed mode was
      // invisible, which is how a stray click ended up stamping a second enemy
      // HQ against the panel edge.
      const carry = propsRef.current.carry
      if (carry && cursor.on) {
        ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5
        ctx.strokeStyle = '#7ec8ff'
        ctx.beginPath(); ctx.arc(cursor.x, cursor.y, 13, 0, Math.PI * 2); ctx.stroke()
        ctx.setLineDash([])
        ctx.textAlign = 'left'
        tag(carry.label, cursor.x + 18, cursor.y + 4, '#bfe4ff', true)
      }
      ctx.textAlign = 'left'
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('wheel', wheel)
      canvas.removeEventListener('contextmenu', ctxMenu)
      canvas.removeEventListener('pointerenter', enter)
      canvas.removeEventListener('pointerleave', leave)
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
    }
  }, [p.map])

  return <canvas ref={cvRef} style={{ display: 'block', width: '100%', height: '100%' }} />
})

export default SheetCanvas
