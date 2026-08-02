// The builder's map surface: the EXACT BFT sheet (renderPackLayer — the same
// bake the game blits) with pan/zoom, drawing scenario entities through the
// game's own 2525 symbol functions. Interaction grammar (Eden's): LEFT click
// selects, LEFT drag on an entity moves it, LEFT click on empty ground places
// (when a tool is armed) or deselects; MIDDLE/RIGHT drag pans; wheel zooms to
// the cursor. All callbacks speak WORLD metres — the parent owns the state.
import { useEffect, useRef } from 'react'
import type { WorldMap } from '../../world/WorldMap'
import type { Ground } from '../../world/pack/loadGround'
import { renderPackLayer, TERRAIN_PX } from '../../map/packRender'
import { drawUnitSymbol, drawStructure } from '../../map/symbols'
import { UNIT_TYPES } from '../../domains/forces/catalog'
import type { Entity } from '../../scenario/edit'

export interface SheetProps {
  map: WorldMap
  ground: Ground
  entities: Entity[]
  sel: number | null
  /** a placement tool is armed — empty-ground clicks place instead of deselect */
  placing: boolean
  onPick: (id: number | null) => void
  onPlace: (wx: number, wy: number) => void
  onDragStart: (id: number) => void
  onDragTo: (id: number, wx: number, wy: number) => void
}

export default function SheetCanvas(p: SheetProps) {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const propsRef = useRef(p)
  propsRef.current = p

  useEffect(() => {
    const canvas = cvRef.current!
    const ctx = canvas.getContext('2d')!
    const { map, ground } = propsRef.current
    const layer = renderPackLayer(map, ground)
    const mpp = map.CELL / TERRAIN_PX

    // open fit-to-sheet, centred
    const view = { cx: map.WORLD / 2, cy: map.WORLD / 2, ppm: 0.02 }
    const fit = () => {
      const s = Math.min(canvas.clientWidth || 800, canvas.clientHeight || 800)
      view.ppm = Math.max(0.005, s / map.WORLD)
    }
    let fitted = false

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
      return best
    }

    // ---- pointer state ----
    let pan: { sx: number; sy: number; cx: number; cy: number } | null = null
    let drag: { id: number; started: boolean } | null = null

    const down = (ev: PointerEvent) => {
      canvas.setPointerCapture(ev.pointerId)
      if (ev.button === 1 || ev.button === 2) {
        pan = { sx: ev.clientX, sy: ev.clientY, cx: view.cx, cy: view.cy }
        return
      }
      if (ev.button !== 0) return
      const e = hit(mX(ev), mY(ev))
      if (e) {
        propsRef.current.onPick(e.id)
        drag = { id: e.id, started: false }
      } else if (propsRef.current.placing) {
        propsRef.current.onPlace(s2wX(mX(ev)), s2wY(mY(ev)))
      } else {
        propsRef.current.onPick(null)
      }
    }
    const move = (ev: PointerEvent) => {
      if (pan) {
        view.cx = pan.cx - (ev.clientX - pan.sx) / view.ppm
        view.cy = pan.cy - (ev.clientY - pan.sy) / view.ppm
        return
      }
      if (drag) {
        if (!drag.started) { drag.started = true; propsRef.current.onDragStart(drag.id) }
        propsRef.current.onDragTo(drag.id, s2wX(mX(ev)), s2wY(mY(ev)))
      }
    }
    const up = () => { pan = null; drag = null }
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
      ctx.imageSmoothingEnabled = view.ppm * mpp < 1
      ctx.drawImage(layer, w2sX(0), w2sY(0), layer.width * mpp * view.ppm, layer.height * mpp * view.ppm)
      ctx.strokeStyle = 'rgba(40,55,70,0.55)'
      ctx.lineWidth = 2
      ctx.strokeRect(w2sX(0), w2sY(0), map.WORLD * view.ppm, map.WORLD * view.ppm)

      const { entities, sel } = propsRef.current
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
        if (sel === e.id) {
          ctx.strokeStyle = '#ffd67e'
          ctx.lineWidth = 1.6
          ctx.strokeRect(x - 21, y - 16, 42, 32)
        }
        if (e.ent === 'structure') {
          drawStructure(ctx, x, y, {
            side: e.side, kind: e.kind,
            label: e.label ?? '', building: !!e.building,
          })
        } else {
          drawUnitSymbol(ctx, x, y, {
            side: e.side, glyph: UNIT_TYPES[e.type]?.glyph ?? 'inf',
            label: `${UNIT_TYPES[e.type]?.abbr ?? e.type}${e.tag ? ` [${e.tag}]` : ''}`,
            dug: e.dug ? 1 : 0, showStrength: false,
          })
        }
      }
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('wheel', wheel)
      canvas.removeEventListener('contextmenu', ctxMenu)
    }
  }, [p.map])

  return <canvas ref={cvRef} style={{ display: 'block', width: '100%', height: '100%' }} />
}
