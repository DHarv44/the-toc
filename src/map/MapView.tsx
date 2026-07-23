// The BFT command map: canvas terrain + 2525 symbology + all map-space input
// (pan/zoom, picking, marquee, formation-spread line, deploy/build/target
// modes). Ported verbatim from src/map/MapView.jsx; only the imports moved.
import { useEffect, useRef } from 'react'
import { S } from '../engine/state'
import type { Unit, Drone, Structure } from '../engine/GameState'
import {
  orderMove, orderAttack, removeLastWaypoint, removeWaypoint, orderConvoy, orderBridge,
} from '../domains/forces/orders'
import { deployUnit, deployStructure } from '../domains/installations/orders'
import { deployDrone, orderDroneMove, droneDropWp, removeDroneWaypoint } from '../domains/air/orders'
import { fireMission } from '../domains/fires/orders'
import { UNIT_TYPES, type UnitTypeKey } from '../domains/forces/catalog'
import { STRUCTURES, type StructureType, type StructureTypeKey } from '../domains/installations/catalog'
import { DRONE_TYPES, type DroneType, type DroneTypeKey } from '../domains/air/catalog'
import { renderTerrainLayer, TERRAIN_PX } from './mapRender'
import { drawUnitSymbol, drawDroneIcon, drawStructure } from './symbols'
import { useUI, ROUTE_OPTS } from '../ui/store'
import { CELL } from '../world/WorldMap'

interface View { cx: number; cy: number; ppm: number }
type Pick2 = { kind: 'unit'; obj: Unit } | { kind: 'drone'; obj: Drone }

export default function MapView() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef<View | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const terrainLayer = renderTerrainLayer(S.map!)
    // dev sandbox frames both bases in one screen; a normal game opens on the HQ
    const dv = S.map!.devView
    const vpMin = Math.min(window.innerWidth || 1280, window.innerHeight || 720)
    const view = viewRef.current = dv
      ? { cx: dv.cx, cy: dv.cy, ppm: Math.max(0.02, vpMin / dv.fit) }
      : { cx: S.map!.fob.x, cy: S.map!.fob.y - 2000, ppm: Math.max(0.02, vpMin / 9000) }
    ;(window as unknown as { __view?: View }).__view = view // dev hook

    // The canvas is a flex column between the side rails, so it no longer starts at
    // the viewport origin. Pointer events arrive in client space; everything here
    // (picking, panning, marquee, menus) works in canvas-local space, so translate
    // by the canvas rect. Re-synced in resize(), which runs every frame, so
    // collapsing a rail takes effect immediately.
    const cvRect = { left: 0, top: 0 }
    const mX = (ev: MouseEvent) => ev.clientX - cvRect.left
    const mY = (ev: MouseEvent) => ev.clientY - cvRect.top

    function resize() {
      const w = canvas.clientWidth || window.innerWidth || 1280
      const h = canvas.clientHeight || window.innerHeight || 720
      const r = canvas.getBoundingClientRect()
      cvRect.left = r.left; cvRect.top = r.top
      if (w < 2 || h < 2) return // hidden pane: keep last known size
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
    }
    resize()
    window.addEventListener('resize', resize)

    // zoom floor lets the whole (square) map fit the viewport — it's letterboxed on
    // the longer axis, where the off-map backdrop shows. The view centers on any axis
    // the map no longer fills; otherwise it's clamped so no gap appears on that axis.
    function clampView() {
      if (canvas.width < 2 || canvas.height < 2) return
      if (!isFinite(view.cx) || !isFinite(view.cy) || !isFinite(view.ppm) || view.ppm <= 0) {
        view.cx = S.map!.fob.x; view.cy = S.map!.fob.y - 2000
        view.ppm = Math.max(0.02, Math.min(canvas.width, canvas.height) / 9000)
      }
      const minPpm = Math.min(canvas.width, canvas.height) / S.map!.WORLD
      view.ppm = Math.max(minPpm, Math.min(1.2, view.ppm))
      const hw = canvas.width / 2 / view.ppm
      const hh = canvas.height / 2 / view.ppm
      view.cx = hw * 2 >= S.map!.WORLD ? S.map!.WORLD / 2 : Math.max(hw, Math.min(S.map!.WORLD - hw, view.cx))
      view.cy = hh * 2 >= S.map!.WORLD ? S.map!.WORLD / 2 : Math.max(hh, Math.min(S.map!.WORLD - hh, view.cy))
    }

    const w2sX = (x: number) => (x - view.cx) * view.ppm + canvas.width / 2
    const w2sY = (y: number) => (y - view.cy) * view.ppm + canvas.height / 2
    const s2wX = (sx: number) => (sx - canvas.width / 2) / view.ppm + view.cx
    const s2wY = (sy: number) => (sy - canvas.height / 2) / view.ppm + view.cy

    function pickUnit(wx: number, wy: number): Unit | null {
      const pickR = 18 / view.ppm
      let picked: Unit | null = null, pd = Infinity
      for (const u of S.units) {
        if (u.side !== 'friend') continue
        const d = Math.hypot(u.x - wx, u.y - wy)
        if (d < pickR && d < pd) { picked = u; pd = d }
      }
      return picked
    }

    function pickDrone(wx: number, wy: number): Drone | null {
      const pickR = 16 / view.ppm
      let picked: Drone | null = null, pd = Infinity
      for (const d of S.drones) {
        const dd = Math.hypot(d.x - wx, d.y - wy)
        if (dd < pickR && dd < pd) { picked = d; pd = dd }
      }
      return picked
    }

    // nearest of unit/drone under the cursor
    function pickAny(wx: number, wy: number): Pick2 | null {
      const u = pickUnit(wx, wy), d = pickDrone(wx, wy)
      if (u && d) {
        return Math.hypot(u.x - wx, u.y - wy) <= Math.hypot(d.x - wx, d.y - wy)
          ? { kind: 'unit', obj: u } : { kind: 'drone', obj: d }
      }
      if (u) return { kind: 'unit', obj: u }
      if (d) return { kind: 'drone', obj: d }
      return null
    }

    // hostiles are clickable only if we can actually see them
    function pickEnemy(wx: number, wy: number): Unit | null {
      const pickR = 18 / view.ppm
      let picked: Unit | null = null, pd = Infinity
      for (const u of S.units) {
        if (u.side !== 'hostile') continue
        if (S.fogEnabled) {
          const c = S.contacts.get(u.id)
          if (!c || !c.live) continue
        }
        const d = Math.hypot(u.x - wx, u.y - wy)
        if (d < pickR && d < pd) { picked = u; pd = d }
      }
      return picked
    }

    function pickStructure(wx: number, wy: number): Structure | null {
      const pickR = 24 / view.ppm
      let picked: Structure | null = null, pd = Infinity
      for (const s of S.structures) {
        if (s.side !== 'friend') continue
        const d = Math.hypot(s.x - wx, s.y - wy)
        if (d < pickR && d < pd) { picked = s; pd = d }
      }
      return picked
    }

    function selectedFriendlies(): Unit[] {
      const ids = useUI.getState().selectedIds
      return ids
        .map(id => S.units.find(u => u.id === id && u.side === 'friend'))
        .filter((u): u is Unit => !!u)
    }

    function selectedDrones(): Drone[] {
      const ids = useUI.getState().selectedIds
      return ids
        .map(id => S.drones.find(d => d.id === id))
        .filter((d): d is Drone => !!d)
    }

    // ---- input ----
    let panDrag = false, dragMoved = false, lastMx = 0, lastMy = 0
    let leftDown: { x: number; y: number; onUnit: boolean; hadSel: boolean; ctrl: boolean } | null = null
    let marquee: { x0: number; y0: number; x1: number; y1: number } | null = null  // screen coords
    let lineDrag: { x0: number; y0: number; x1: number; y1: number } | null = null // formation spread
    const mouse = { x: 0, y: 0 }

    function onDown(e: MouseEvent) {
      useUI.getState().closeMenu()
      if (e.button === 1 || e.button === 2) {
        panDrag = true; dragMoved = false
        lastMx = mX(e); lastMy = mY(e)
        if (e.button === 1) e.preventDefault()
      } else if (e.button === 0) {
        const ui = useUI.getState()
        leftDown = {
          x: mX(e), y: mY(e),
          onUnit: !!pickUnit(s2wX(mX(e)), s2wY(mY(e))),
          hadSel: ui.selectedIds.length > 0 && ui.mode === 'select',
          ctrl: e.ctrlKey,
        }
      }
    }
    function onMove(e: MouseEvent) {
      mouse.x = mX(e); mouse.y = mY(e)
      if (panDrag) {
        const dx = mX(e) - lastMx, dy = mY(e) - lastMy
        if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true
        if (dragMoved) {
          view.cx -= dx / view.ppm
          view.cy -= dy / view.ppm
          lastMx = mX(e); lastMy = mY(e)
        }
      } else if (leftDown && useUI.getState().mode === 'select' && !leftDown.onUnit) {
        const moved = Math.hypot(mX(e) - leftDown.x, mY(e) - leftDown.y)
        if (leftDown.hadSel && !leftDown.ctrl) {
          // drag with a selection: spread the units along the drawn line
          if (lineDrag || moved > 18) {
            lineDrag = { x0: leftDown.x, y0: leftDown.y, x1: mX(e), y1: mY(e) }
          }
        } else if (marquee || moved > 6) {
          marquee = { x0: leftDown.x, y0: leftDown.y, x1: mX(e), y1: mY(e) }
        }
      }
    }
    function onUp(e: MouseEvent) {
      if (e.button === 1 || e.button === 2) {
        panDrag = false
        if (e.button === 2 && !dragMoved) {
          const wx = s2wX(mX(e)), wy = s2wY(mY(e))
          const ui = useUI.getState()
          // right-click on a waypoint pip of the current selection deletes that
          // waypoint (mid-route waypoints re-path the gap) — checked before
          // anything else so route editing never nukes the selection
          const pipR = 12 / view.ppm
          for (const u of selectedFriendlies()) {
            const i = u.legs.findIndex(l => Math.hypot(l.x - wx, l.y - wy) <= pipR)
            if (i >= 0) { removeWaypoint(u.id, i); return }
          }
          for (const d of selectedDrones()) {
            const i = (d.route || []).findIndex(p => Math.hypot(p.x - wx, p.y - wy) <= pipR)
            if (i >= 0) { removeDroneWaypoint(d.id, i); return }
          }
          const hit = pickAny(wx, wy)
          if (hit && hit.kind === 'unit') {
            ui.setSelected([hit.obj.id])
            ui.openMenu({ x: mX(e), y: mY(e), unitId: hit.obj.id })
          } else if (hit && hit.kind === 'drone') {
            // drone controls now live in the feed window — right-click opens its feed
            ui.setSelected([hit.obj.id])
            ui.bindDrone(hit.obj.id)
          } else {
            const st = pickStructure(wx, wy)
            if (st && !selectedFriendlies().length && !selectedDrones().length) {
              ui.openMenu({ x: mX(e), y: mY(e), structId: st.id })
            } else {
              // right-click ground: clear the selection
              ui.closeMenu()
              ui.setSelected([])
            }
          }
        }
        return
      }
      if (e.button !== 0) return
      const wasMarquee = marquee
      const wasLine = lineDrag
      marquee = null
      lineDrag = null
      leftDown = null
      const ui = useUI.getState()

      // formation spread: distribute the selection evenly along the dragged line
      if (wasLine) {
        const sel: Array<Unit | Drone> = [...selectedFriendlies(), ...selectedDrones()]
        if (sel.length) {
          const wx0 = s2wX(wasLine.x0), wy0 = s2wY(wasLine.y0)
          const wx1 = s2wX(wasLine.x1), wy1 = s2wY(wasLine.y1)
          const ldx = wx1 - wx0, ldy = wy1 - wy0
          // assign slots by projection along the line to minimize crossing
          const sorted = [...sel].sort((a, b) =>
            ((a.x - wx0) * ldx + (a.y - wy0) * ldy) - ((b.x - wx0) * ldx + (b.y - wy0) * ldy))
          const attack = ui.cmdMode === 'attack'
          // no group id: an ad-hoc selection isn't a formation, so no shared pace cap
          const gid = null
          // a fan-out is a formation shape, not a new mission: shift-drag appends it as
          // the next waypoint so an existing route survives being spread out at the end
          const app = e.shiftKey
          // A spread is a formation SHAPE, not a road order. In AUTO the per-slot road
          // inference made any slot that happened to land within 100 m of a road cling
          // to the network the whole way and hook back in a U-turn, while neighbours
          // went direct. Spread slots therefore route cross-country (mild road damping)
          // unless the player explicitly picked a route mode.
          const spreadOpts = ui.routeMode === 'auto'
            ? { crossCountry: true }
            : { ...(ROUTE_OPTS[ui.routeMode] || {}) }
          sorted.forEach((o, i) => {
            const t = sorted.length > 1 ? i / (sorted.length - 1) : 0.5
            const px = wx0 + ldx * t, py = wy0 + ldy * t
            if ((S.drones as Array<Unit | Drone>).includes(o)) orderDroneMove(o.id, px, py, app)
            else orderMove(o.id, px, py, app, attack, gid, { ...spreadOpts })
          })
        }
        return
      }

      // marquee selection
      if (wasMarquee) {
        const wx0 = s2wX(Math.min(wasMarquee.x0, wasMarquee.x1))
        const wx1 = s2wX(Math.max(wasMarquee.x0, wasMarquee.x1))
        const wy0 = s2wY(Math.min(wasMarquee.y0, wasMarquee.y1))
        const wy1 = s2wY(Math.max(wasMarquee.y0, wasMarquee.y1))
        const ids = S.units
          .filter(u => u.side === 'friend' && u.x >= wx0 && u.x <= wx1 && u.y >= wy0 && u.y <= wy1)
          .map(u => u.id)
        const dIds = S.drones
          .filter(d => d.x >= wx0 && d.x <= wx1 && d.y >= wy0 && d.y <= wy1)
          .map(d => d.id)
        ids.push(...dIds)
        ui.setSelected(e.ctrlKey ? [...new Set([...ui.selectedIds, ...ids])] : ids)
        return
      }

      const wx = s2wX(mX(e)), wy = s2wY(mY(e))

      if (ui.mode.startsWith('deploy:')) {
        const what = ui.mode.slice(7)
        if (what.startsWith('DRONE:')) {
          const d = deployDrone(what.slice(6) as DroneTypeKey, wx, wy)
          if (d) { ui.bindDrone(d.id); useUI.setState({ mode: 'select' }) }
        } else {
          // keep the fielding base selected so its deploy menu stays open for the next unit
          const u = deployUnit(what as UnitTypeKey, wx, wy)
          if (u) useUI.setState({ mode: 'select' })
        }
        return
      }
      if (ui.mode.startsWith('convoy:')) {
        const fob = pickStructure(wx, wy)
        if (fob && fob.kind === 'FOB') orderConvoy(Number(ui.mode.slice(7)), fob.id)
        useUI.setState({ mode: 'select' })
        return
      }
      if (ui.mode.startsWith('build:')) {
        const s = deployStructure(ui.mode.slice(6) as StructureTypeKey, wx, wy)
        if (s) useUI.setState({ mode: 'select' })
        return
      }
      if (ui.mode === 'bridge') {
        const eng = selectedFriendlies().find(u => UNIT_TYPES[u.type].canBridge)
        if (eng) orderBridge(eng.id, wx, wy)
        useUI.setState({ mode: 'select' })
        return
      }
      if (ui.mode === 'target') {
        for (const u of selectedFriendlies()) {
          if (UNIT_TYPES[u.type].indirect) fireMission(u.id, wx, wy, ui.fireOpts)
        }
        useUI.setState({ mode: 'select' })
        return
      }

      // left click: select friendlies, or issue orders for the current selection
      const picked = pickAny(wx, wy)
      const sel = selectedFriendlies()
      const selD = selectedDrones()
      if (picked && !(sel.length && e.shiftKey)) {
        if (e.ctrlKey) ui.toggleSelect(picked.obj.id)
        else ui.setSelected([picked.obj.id])
        return
      }
      // a plain click on a friendly structure selects it — same semantics as
      // clicking a unit, even with a selection in hand (before this, clicking your
      // own HQ with units selected marched them onto the base). Shift-click still
      // appends a move waypoint onto the structure.
      if (!picked && !e.shiftKey) {
        const st = pickStructure(wx, wy)
        if (st) { ui.setSelected([st.id]); return }
      }
      if (sel.length || selD.length) {
        // attack mode: clicking a visible hostile designates it for the whole selection
        if (ui.cmdMode === 'attack') {
          const enemy = pickEnemy(wx, wy)
          if (enemy) {
            sel.forEach(u => orderAttack(u.id, enemy.id, null))
            return
          }
        }
        issueMoves(sel, wx, wy, e.shiftKey, ui.cmdMode === 'attack')
        selD.forEach((d, k) => {
          orderDroneMove(d.id, wx + (k % 2) * 300 - 150 * (k > 0 ? 1 : 0), wy + Math.floor(k / 2) * 300, e.shiftKey)
        })
      }
    }

    // An ad-hoc marquee selection is not a formation — it's several units given the same
    // order. Each paths independently and moves at its own speed. Column behaviour
    // (shared route, pace cap, station-keeping) belongs to real combat groups, which
    // don't exist yet; orderGroupMove is waiting for them.
    function issueMoves(units: Unit[], wx: number, wy: number, append: boolean, attack = false) {
      const opts = ROUTE_OPTS[useUI.getState().routeMode] || {}
      const cols = Math.ceil(Math.sqrt(units.length))
      const rows = Math.ceil(units.length / cols)
      units.forEach((u, k) => {
        const ox = ((k % cols) - (cols - 1) / 2) * 90
        const oy = (Math.floor(k / cols) - (rows - 1) / 2) * 90
        orderMove(u.id, wx + ox, wy + oy, append, attack, null, { ...opts })
      })
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18
      const wx = s2wX(mX(e)), wy = s2wY(mY(e))
      view.ppm = Math.min(1.2, view.ppm * factor)
      view.cx = wx - (mX(e) - canvas.width / 2) / view.ppm
      view.cy = wy - (mY(e) - canvas.height / 2) / view.ppm
      clampView()
    }
    const heldKeys = new Set<string>()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        useUI.setState({ mode: 'select', selectedIds: [], ctxMenu: null })
      }
      if (e.key === 'Delete') {
        for (const u of selectedFriendlies()) removeLastWaypoint(u.id)
        for (const d of selectedDrones()) droneDropWp(d.id)
      }
      const k = e.key.toLowerCase()
      if ('wasd'.includes(k)) heldKeys.add(k)
      if (k === 'q') useUI.getState().setCmdMode('move')
      if (k === 'e') useUI.getState().setCmdMode('attack')
    }
    function onKeyUp(e: KeyboardEvent) { heldKeys.delete(e.key.toLowerCase()) }
    function onBlur() { heldKeys.clear() }
    // WASD pan: constant screen-speed regardless of zoom
    const panTimer = setInterval(() => {
      if (!heldKeys.size) return
      const step = 700 * 0.04 / view.ppm // 700 px/s in world meters
      if (heldKeys.has('w')) view.cy -= step
      if (heldKeys.has('s')) view.cy += step
      if (heldKeys.has('a')) view.cx -= step
      if (heldKeys.has('d')) view.cx += step
      clampView()
    }, 40)
    canvas.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    canvas.addEventListener('mouseup', onUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    // suppress the native context menu everywhere — right-click is a command input
    const noCtx = (e: Event) => e.preventDefault()
    window.addEventListener('contextmenu', noCtx)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

    // ---- render loop ----
    let raf: number
    function draw() {
      raf = requestAnimationFrame(draw)
      resize()
      clampView()
      const night = useUI.getState().night
      const W = canvas.width, H = canvas.height
      // off-map backdrop: shows wherever the square map doesn't fill the viewport.
      // Mirrors the splash screen (radial wash + faint grid) so fit-to-screen reads
      // as a framed view rather than a clipped one.
      const bg = ctx.createRadialGradient(W * 0.5, H * 0.3, 0, W * 0.5, H * 0.3, Math.max(W, H) * 0.8)
      bg.addColorStop(0, night ? '#0e1a24' : '#1a2a36')
      bg.addColorStop(1, night ? '#05080b' : '#0b1218')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)
      ctx.save()
      ctx.globalAlpha = night ? 0.12 : 0.09
      ctx.strokeStyle = '#2a3a48'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let gx = 0; gx <= W; gx += 48) { ctx.moveTo(gx + 0.5, 0); ctx.lineTo(gx + 0.5, H) }
      for (let gy = 0; gy <= H; gy += 48) { ctx.moveTo(0, gy + 0.5); ctx.lineTo(W, gy + 0.5) }
      ctx.stroke()
      ctx.restore()

      // terrain (dimmed + desaturated at night)
      const mpp = CELL / TERRAIN_PX
      ctx.imageSmoothingEnabled = view.ppm * mpp < 1
      if (night) ctx.filter = 'brightness(0.42) saturate(0.5) contrast(1.05)'
      ctx.drawImage(
        terrainLayer,
        w2sX(0), w2sY(0),
        terrainLayer.width * mpp * view.ppm,
        terrainLayer.height * mpp * view.ppm,
      )
      ctx.filter = 'none'

      // frame the map edge so the off-map backdrop reads as "outside the AO"
      ctx.strokeStyle = night ? 'rgba(120,150,180,0.35)' : 'rgba(40,55,70,0.55)'
      ctx.lineWidth = 2
      ctx.strokeRect(w2sX(0), w2sY(0), S.map!.WORLD * view.ppm, S.map!.WORLD * view.ppm)

      // 100 m sub-grid: only once zoomed in enough that ≤ 5 of the 1 km cells span
      // the viewport, so it never clutters the wider views. Drawn under the 1 km grid.
      if (canvas.width / view.ppm <= 5000) {
        const x0 = Math.max(0, s2wX(0)), x1 = Math.min(S.map!.WORLD, s2wX(canvas.width))
        const y0 = Math.max(0, s2wY(0)), y1 = Math.min(S.map!.WORLD, s2wY(canvas.height))
        ctx.strokeStyle = night ? 'rgba(140,180,220,0.06)' : 'rgba(30,40,60,0.09)'
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let m = Math.ceil(x0 / 100) * 100; m <= x1; m += 100) {
          if (m % 1000 === 0) continue // km lines are drawn bolder below
          ctx.moveTo(w2sX(m), w2sY(y0)); ctx.lineTo(w2sX(m), w2sY(y1))
        }
        for (let m = Math.ceil(y0 / 100) * 100; m <= y1; m += 100) {
          if (m % 1000 === 0) continue
          ctx.moveTo(w2sX(x0), w2sY(m)); ctx.lineTo(w2sX(x1), w2sY(m))
        }
        ctx.stroke()
      }

      // 1 km grid + labels
      ctx.strokeStyle = night ? 'rgba(140,180,220,0.14)' : 'rgba(30,40,60,0.18)'
      ctx.lineWidth = 1
      ctx.font = '9px Consolas, monospace'
      ctx.fillStyle = night ? 'rgba(150,190,230,0.5)' : 'rgba(30,40,60,0.5)'
      ctx.beginPath()
      for (let m = 0; m <= S.map!.WORLD; m += 1000) {
        ctx.moveTo(w2sX(m), w2sY(0)); ctx.lineTo(w2sX(m), w2sY(S.map!.WORLD))
        ctx.moveTo(w2sX(0), w2sY(m)); ctx.lineTo(w2sX(S.map!.WORLD), w2sY(m))
      }
      ctx.stroke()
      if (view.ppm > 0.03) {
        for (let m = 0; m < S.map!.WORLD; m += 1000) {
          ctx.fillText(String(m / 1000).padStart(2, '0'), w2sX(m) + 3, 12)
          ctx.fillText(String(m / 1000).padStart(2, '0'), 4, w2sY(m) + 10)
        }
      }

      // town names
      ctx.font = 'bold 10px Consolas, monospace'
      ctx.fillStyle = night ? 'rgba(160,195,225,0.8)' : 'rgba(40,40,45,0.85)'
      ctx.textAlign = 'center'
      for (const t of S.map!.towns) ctx.fillText(t.name, w2sX(t.x), w2sY(t.y) - 6)
      ctx.textAlign = 'left'

      const ui = useUI.getState()

      // hover cursor
      const hover = pickAny(s2wX(mouse.x), s2wY(mouse.y))
      canvas.style.cursor = hover ? 'pointer' : 'crosshair'

      // strike targeting: for any selected weapons drone, draw its weapon-range ring so the
      // player can see where a lock will reach; left-click the map to place the lock reticle
      for (const d of selectedDrones()) {
        const spec = DRONE_TYPES[d.type]
        if (!spec || !spec.weapons) continue
        ctx.strokeStyle = 'rgba(220,60,40,0.45)'
        ctx.setLineDash([8, 5])
        ctx.beginPath()
        ctx.arc(w2sX(d.x), w2sY(d.y), spec.weapons.range * view.ppm, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
      }
      // in-flight drone strike impact reticles on the map
      for (const d of S.drones) {
        if (!d.strikeMark || S.t > d.strikeMark.until) continue
        const x = w2sX(d.strikeMark.x), y = w2sY(d.strikeMark.y)
        ctx.strokeStyle = 'rgba(255,58,40,0.9)'
        ctx.lineWidth = 1.6
        ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y)
        ctx.moveTo(x, y - 12); ctx.lineTo(x, y + 12)
        ctx.stroke()
      }
      // field-drone control range rings
      if (ui.mode.startsWith('deploy:DRONE:')) {
        const spec = (DRONE_TYPES as Record<string, DroneType | undefined>)[ui.mode.slice(13)]
        if (spec && spec.src === 'tether') {
          ctx.strokeStyle = 'rgba(120,180,220,0.5)'
          ctx.setLineDash([6, 4])
          ctx.beginPath()
          for (const s of S.structures) {
            if (s.side !== 'friend' || s.buildT > 0) continue
            if (s.kind !== 'FOB' && s.kind !== 'HQ') continue
            if (S.drones.some(d => d.tether === s.id)) continue
            ctx.moveTo(w2sX(s.x) + spec.tetherRange! * view.ppm, w2sY(s.y))
            ctx.arc(w2sX(s.x), w2sY(s.y), spec.tetherRange! * view.ppm, 0, Math.PI * 2)
          }
          ctx.stroke()
          ctx.setLineDash([])
        }
        if (spec && spec.src === 'field') {
          ctx.strokeStyle = 'rgba(120,180,220,0.5)'
          ctx.setLineDash([6, 4])
          ctx.beginPath()
          for (const u of S.units) {
            if (u.side !== 'friend') continue
            ctx.moveTo(w2sX(u.x) + spec.ctrlRange! * view.ppm, w2sY(u.y))
            ctx.arc(w2sX(u.x), w2sY(u.y), spec.ctrlRange! * view.ppm, 0, Math.PI * 2)
          }
          ctx.stroke()
          ctx.setLineDash([])
        }
      }

      // deploy / build placement rings
      if (ui.mode.startsWith('deploy:') && !ui.mode.startsWith('deploy:DRONE')) {
        ctx.strokeStyle = 'rgba(40,120,220,0.6)'
        ctx.setLineDash([6, 4])
        ctx.beginPath()
        for (const s of S.structures) {
          if (s.side !== 'friend' || s.buildT > 0 || !s.deployZone) continue
          ctx.moveTo(w2sX(s.x) + s.deployZone * view.ppm, w2sY(s.y))
          ctx.arc(w2sX(s.x), w2sY(s.y), s.deployZone * view.ppm, 0, Math.PI * 2)
        }
        ctx.stroke()
        ctx.setLineDash([])
      }
      if (ui.mode.startsWith('build:')) {
        const spec = (STRUCTURES as Record<string, StructureType | undefined>)[ui.mode.slice(6)]
        if (spec) {
          ctx.strokeStyle = 'rgba(120,180,90,0.55)'
          ctx.setLineDash([6, 4])
          ctx.beginPath()
          for (const s of S.structures) {
            if (s.side !== 'friend') continue
            if (spec.key !== 'OP' && s.buildT > 0) continue
            ctx.moveTo(w2sX(s.x) + spec.near * view.ppm, w2sY(s.y))
            ctx.arc(w2sX(s.x), w2sY(s.y), spec.near * view.ppm, 0, Math.PI * 2)
          }
          if (spec.key === 'OP') {
            for (const u of S.units) {
              if (u.side !== 'friend') continue
              ctx.moveTo(w2sX(u.x) + spec.near * view.ppm, w2sY(u.y))
              ctx.arc(w2sX(u.x), w2sY(u.y), spec.near * view.ppm, 0, Math.PI * 2)
            }
          }
          ctx.stroke()
          ctx.setLineDash([])
        }
      }
      if (ui.mode === 'bridge') {
        const eng = selectedFriendlies().find(u => UNIT_TYPES[u.type].canBridge)
        if (eng) {
          ctx.strokeStyle = 'rgba(200,150,50,0.6)'
          ctx.setLineDash([6, 4])
          ctx.beginPath()
          ctx.arc(w2sX(eng.x), w2sY(eng.y), 700 * view.ppm, 0, Math.PI * 2)
          ctx.stroke()
          ctx.setLineDash([])
        }
      }

      // fire-mission range rings: every friendly tube on the map, selected = hot
      if (ui.mode === 'target') {
        const selIds = ui.selectedIds
        ctx.setLineDash([8, 5])
        for (const u of S.units) {
          if (u.side !== 'friend') continue
          const ind = UNIT_TYPES[u.type].indirect
          if (!ind) continue
          const isSel = selIds.includes(u.id)
          const reloading = u.missionCooldown > 0
          ctx.strokeStyle = reloading
            ? 'rgba(120,120,120,0.4)'
            : isSel ? 'rgba(220,50,30,0.7)' : 'rgba(200,110,40,0.45)'
          ctx.lineWidth = isSel ? 2 : 1.2
          ctx.beginPath()
          ctx.arc(w2sX(u.x), w2sY(u.y), ind.range * view.ppm, 0, Math.PI * 2)
          ctx.stroke()
          // label the ring at the top with callsign + status
          ctx.font = '9px Consolas, monospace'
          ctx.fillStyle = reloading ? 'rgba(140,140,140,0.7)' : 'rgba(200,80,40,0.85)'
          ctx.textAlign = 'center'
          ctx.fillText(
            `${u.label} ${reloading ? 'RELOAD ' + Math.ceil(u.missionCooldown) + 'S' : 'RDY'}`,
            w2sX(u.x), w2sY(u.y) - ind.range * view.ppm - 4,
          )
          ctx.textAlign = 'left'
        }
        ctx.lineWidth = 1.5
        ctx.setLineDash([])
        ctx.strokeStyle = '#c22'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(mouse.x - 12, mouse.y); ctx.lineTo(mouse.x + 12, mouse.y)
        ctx.moveTo(mouse.x, mouse.y - 12); ctx.lineTo(mouse.x, mouse.y + 12)
        ctx.stroke()
      }

      // faint operational graphics: every moving unit's route, even unselected
      ctx.lineWidth = 1.2
      for (const u of S.units) {
        if (u.side !== 'friend' || !u.path.length || ui.selectedIds.includes(u.id)) continue
        const hostile = u.attackId != null || u.attackMove
        ctx.strokeStyle = hostile
          ? (night ? 'rgba(255,110,90,0.35)' : 'rgba(200,50,30,0.32)')
          : (night ? 'rgba(110,170,255,0.3)' : 'rgba(30,90,190,0.28)')
        ctx.beginPath()
        ctx.moveTo(w2sX(u.x), w2sY(u.y))
        for (const p of u.path) ctx.lineTo(w2sX(p.x), w2sY(p.y))
        ctx.stroke()
        const a = u.path.length > 1 ? u.path[u.path.length - 2]! : { x: u.x, y: u.y }
        const b = u.path[u.path.length - 1]!
        const ang = Math.atan2(w2sY(b.y) - w2sY(a.y), w2sX(b.x) - w2sX(a.x))
        const bx = w2sX(b.x), by = w2sY(b.y)
        ctx.fillStyle = hostile
          ? (night ? 'rgba(255,110,90,0.45)' : 'rgba(200,50,30,0.42)')
          : (night ? 'rgba(110,170,255,0.4)' : 'rgba(30,90,190,0.38)')
        ctx.beginPath()
        ctx.moveTo(bx + Math.cos(ang) * 8, by + Math.sin(ang) * 8)
        ctx.lineTo(bx + Math.cos(ang + 2.6) * 6, by + Math.sin(ang + 2.6) * 6)
        ctx.lineTo(bx + Math.cos(ang - 2.6) * 6, by + Math.sin(ang - 2.6) * 6)
        ctx.closePath()
        ctx.fill()
      }
      for (const d of S.drones) {
        if (!d.route || !d.route.length || ui.selectedIds.includes(d.id)) continue
        ctx.strokeStyle = 'rgba(74,208,192,0.25)'
        ctx.setLineDash([5, 5])
        ctx.beginPath()
        ctx.moveTo(w2sX(d.x), w2sY(d.y))
        for (const p of d.route) ctx.lineTo(w2sX(p.x), w2sY(p.y))
        ctx.stroke()
        ctx.setLineDash([])
      }

      // routes for selected units: BFT-style high-vis command graphics
      for (const u of selectedFriendlies()) {
        if (!u.path.length) continue
        const hostile = u.attackId != null || u.attackMove
        const pts = [{ x: u.x, y: u.y }, ...u.path]
        // casing + bright route line (red for attack tasks)
        for (const pass of [
          { color: night ? 'rgba(44,10,10,0.95)' : 'rgba(40,8,8,0.85)', w: 5, skip: !hostile },
          { color: night ? 'rgba(10,24,44,0.95)' : 'rgba(8,20,40,0.85)', w: 5, skip: hostile },
          { color: hostile ? '#ff5844' : '#3f9dff', w: 2.2, skip: false },
        ].filter(p => !p.skip)) {
          ctx.strokeStyle = pass.color
          ctx.lineWidth = pass.w
          ctx.lineJoin = 'round'
          ctx.beginPath()
          ctx.moveTo(w2sX(pts[0]!.x), w2sY(pts[0]!.y))
          for (let i = 1; i < pts.length; i++) ctx.lineTo(w2sX(pts[i]!.x), w2sY(pts[i]!.y))
          ctx.stroke()
        }
        // arrowhead on the final segment
        const a = pts[pts.length - 2]!, b = pts[pts.length - 1]!
        const ang = Math.atan2(w2sY(b.y) - w2sY(a.y), w2sX(b.x) - w2sX(a.x))
        const bx = w2sX(b.x), by = w2sY(b.y)
        ctx.fillStyle = hostile ? '#ff5844' : '#3f9dff'
        ctx.strokeStyle = hostile ? 'rgba(40,8,8,0.9)' : 'rgba(8,20,40,0.9)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(bx + Math.cos(ang) * 13, by + Math.sin(ang) * 13)
        ctx.lineTo(bx + Math.cos(ang + 2.5) * 10, by + Math.sin(ang + 2.5) * 10)
        ctx.lineTo(bx + Math.cos(ang - 2.5) * 10, by + Math.sin(ang - 2.5) * 10)
        ctx.closePath()
        ctx.fill(); ctx.stroke()
        // numbered waypoint pips
        u.legs.forEach((leg, i) => {
          const x = w2sX(leg.x), y = w2sY(leg.y)
          ctx.beginPath()
          ctx.arc(x, y, 8, 0, Math.PI * 2)
          ctx.fillStyle = '#0d2a4d'
          ctx.fill()
          ctx.strokeStyle = '#6cb8ff'
          ctx.lineWidth = 1.6
          ctx.stroke()
          ctx.fillStyle = '#dceeff'
          ctx.font = 'bold 9px Consolas, monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(String(i + 1), x, y + 0.5)
          ctx.textBaseline = 'alphabetic'
          ctx.textAlign = 'left'
        })
      }

      // routes for selected drones: straight flight legs + numbered pips
      for (const d of selectedDrones()) {
        if (!d.route || !d.route.length) continue
        const pts = [{ x: d.x, y: d.y }, ...d.route]
        for (const pass of [
          { color: night ? 'rgba(10,34,34,0.95)' : 'rgba(8,30,30,0.8)', w: 4 },
          { color: '#4ad0c0', w: 1.8 },
        ]) {
          ctx.strokeStyle = pass.color
          ctx.lineWidth = pass.w
          ctx.setLineDash([7, 5])
          ctx.beginPath()
          ctx.moveTo(w2sX(pts[0]!.x), w2sY(pts[0]!.y))
          for (let i = 1; i < pts.length; i++) ctx.lineTo(w2sX(pts[i]!.x), w2sY(pts[i]!.y))
          ctx.stroke()
          ctx.setLineDash([])
        }
        d.route.forEach((wp, i) => {
          const x = w2sX(wp.x), y = w2sY(wp.y)
          ctx.beginPath()
          ctx.arc(x, y, 7.5, 0, Math.PI * 2)
          ctx.fillStyle = '#0d3a36'
          ctx.fill()
          ctx.strokeStyle = '#5ae0d0'
          ctx.lineWidth = 1.4
          ctx.stroke()
          ctx.fillStyle = '#d8fff8'
          ctx.font = 'bold 9px Consolas, monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(String(i + 1), x, y + 0.5)
          ctx.textBaseline = 'alphabetic'
          ctx.textAlign = 'left'
        })
      }

      // King of the Hill objective: control zone tinted by holder, clocks above
      if (S.hill) {
        const h = S.hill
        const hx = w2sX(h.x), hy = w2sY(h.y), hr = h.r * view.ppm
        const col = h.holder === 'friend' ? '63,157,255' : h.holder === 'hostile' ? '255,88,68' : '200,200,200'
        ctx.beginPath()
        ctx.arc(hx, hy, hr, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${col},0.08)`
        ctx.fill()
        ctx.setLineDash([9, 6])
        ctx.strokeStyle = `rgba(${col},0.75)`
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.setLineDash([])
        const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
        ctx.font = 'bold 10px Consolas, monospace'
        ctx.textAlign = 'center'
        ctx.fillStyle = `rgba(${col},0.95)`
        ctx.fillText(
          `OBJ ${h.holder === 'friend' ? '— HELD' : h.holder === 'hostile' ? '— ENEMY HELD' : '— CONTESTED'}`,
          hx, hy - hr - 18)
        ctx.font = '9px Consolas, monospace'
        ctx.fillStyle = night ? 'rgba(160,200,235,0.9)' : 'rgba(30,40,60,0.85)'
        ctx.fillText(`FRND ${mmss(h.holdFriend)} / ${mmss(h.target)} · ENY ${mmss(h.holdHostile)}`, hx, hy - hr - 6)
        ctx.textAlign = 'left'
      }

      // pontoon bridges laid by engineers
      if (S.pontoons.length) {
        const GRID = S.map!.GRID
        for (const i of S.pontoons) {
          const gx = i % GRID, gy = (i / GRID) | 0
          const x = w2sX(gx * CELL), y = w2sY(gy * CELL)
          const sz = CELL * view.ppm
          ctx.fillStyle = '#b8a67e'
          ctx.fillRect(x, y, sz, sz)
          ctx.strokeStyle = '#26221c'
          ctx.lineWidth = 1
          ctx.strokeRect(x - 1, y - 1, sz + 2, sz + 2)
        }
      }

      // structures (friendly always; hostile once spotted or fog off)
      for (const s of S.structures) {
        if (s.side === 'hostile' && S.fogEnabled && !S.structContacts.has(s.id)) continue
        drawStructure(ctx, w2sX(s.x), w2sY(s.y), {
          side: s.side, kind: s.kind,
          label: s.side === 'friend' && s.kind === 'FOB'
            ? `${s.label} · S:${Math.floor(s.stock || 0)}`
            : s.label,
          building: s.buildT > 0,
          progress: s.buildT > 0 ? 1 - s.buildT / STRUCTURES[s.kind].buildTime : 1,
          hpFrac: s.hp / s.maxHp,
        })
      }

      // wrecks
      ctx.strokeStyle = night ? 'rgba(180,170,160,0.5)' : 'rgba(60,55,50,0.55)'
      ctx.lineWidth = 1.5
      for (const wk of S.wrecks) {
        const age = S.t - wk.t
        if (age > 90) continue
        const x = w2sX(wk.x), y = w2sY(wk.y)
        ctx.globalAlpha = Math.max(0.15, 1 - age / 90)
        ctx.beginPath()
        ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5)
        ctx.moveTo(x - 5, y + 5); ctx.lineTo(x + 5, y - 5)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // smoke screens
      for (const sm of S.smoke) {
        const age = S.t - sm.t
        const fade = Math.min(1, Math.max(0, (75 - age) / 15)) // fade out last 15 s
        const grow = Math.min(1, 0.4 + age / 8)
        const x = w2sX(sm.x), y = w2sY(sm.y)
        const r = sm.r * grow * view.ppm
        const grad = ctx.createRadialGradient(x, y, r * 0.2, x, y, r)
        grad.addColorStop(0, `rgba(200,200,205,${0.5 * fade})`)
        grad.addColorStop(1, `rgba(170,170,178,0)`)
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }

      // Fire-mission impacts only. A called-for-fire mission is a reported event and
      // belongs on the BFT; individual cannon strikes (im.gun) are not, and are drawn
      // in the UAS feed instead.
      for (const im of S.impacts) {
        if (im.gun) continue
        const age = S.t - im.t
        if (age > 4) continue
        ctx.strokeStyle = `rgba(200,80,30,${1 - age / 4})`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(w2sX(im.x), w2sY(im.y), 4 + age * 10 * view.ppm * 30, 0, Math.PI * 2)
        ctx.stroke()
      }

      // Rounds in flight are deliberately NOT drawn here. This is a Blue Force Tracker,
      // not a gun camera — it plots what the network reports, and individual cannon
      // rounds aren't reported. Tracers belong to the UAS feed, which is the only place
      // the player sees actual ground truth (DroneView renders them).

      // drones: orbit rings + icons
      for (const d of S.drones) {
        const spec = DRONE_TYPES[d.type]
        const sel = ui.feeds.some(f => f.droneId === d.id) || ui.selectedIds.includes(d.id)
        if (d.state === 'onstation') {
          ctx.setLineDash([4, 4])
          // the tethered aerostat holds a fixed point — no orbit ring, just its sensor arc
          if (spec.src !== 'tether') {
            ctx.strokeStyle = sel ? 'rgba(255,215,80,0.6)' : 'rgba(60,140,220,0.4)'
            ctx.beginPath()
            ctx.arc(w2sX(d.tx), w2sY(d.ty), spec.orbitR * (d.orbitMul || 1) * view.ppm, 0, Math.PI * 2)
            ctx.stroke()
          }
          ctx.strokeStyle = 'rgba(60,140,220,0.18)'
          ctx.beginPath()
          ctx.arc(w2sX(d.tx), w2sY(d.ty), spec.sight * (d.sightMul || 1) * view.ppm, 0, Math.PI * 2)
          ctx.stroke()
          ctx.setLineDash([])
        }
        // sensor lock marker: small orange target diamond at the locked point
        if (d.lock) {
          const lx = w2sX(d.lock.x), ly = w2sY(d.lock.y)
          ctx.strokeStyle = 'rgba(255,170,60,0.85)'
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(lx, ly - 7); ctx.lineTo(lx + 7, ly); ctx.lineTo(lx, ly + 7); ctx.lineTo(lx - 7, ly)
          ctx.closePath()
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(lx, ly - 3); ctx.lineTo(lx, ly + 3)
          ctx.moveTo(lx - 3, ly); ctx.lineTo(lx + 3, ly)
          ctx.stroke()
        }
        // overwatch tether to the assigned unit
        if (d.followId) {
          const fu = S.units.find(x => x.id === d.followId)
          if (fu) {
            ctx.strokeStyle = 'rgba(90,200,170,0.5)'
            ctx.setLineDash([3, 5])
            ctx.beginPath()
            ctx.moveTo(w2sX(d.x), w2sY(d.y))
            ctx.lineTo(w2sX(fu.x), w2sY(fu.y))
            ctx.stroke()
            ctx.setLineDash([])
          }
        }
        {
          const hdg = (d.state === 'transit' || d.state === 'rtb' || d.state === 'striking')
            ? Math.atan2((d.state === 'rtb' ? d.oy : d.state === 'striking' ? d.sy! : d.ty) - d.y,
                         (d.state === 'rtb' ? d.ox : d.state === 'striking' ? d.sx! : d.tx) - d.x)
            // nose points along the tangent; gunships turn the other way (left-hand orbit)
            : d.angle + (spec.gunship ? -Math.PI / 2 : Math.PI / 2)
          drawDroneIcon(ctx, w2sX(d.x), w2sY(d.y), hdg, d.label, sel, d.type)
        }
      }

      // In-contact indicator: 0 when clear, rising toward 1 on each shot fired, so the
      // symbol's ring strobes with the unit's own gunfire and settles to a steady red
      // while it's engaged but not shooting.
      const contactLevel = (u: Unit): number => {
        if (u.strength <= 0) return 0
        const engaged = S.t - Math.max(u.lastCombatT ?? -99, u.underFireT ?? -99) < 3
        if (!engaged) return 0
        const since = u.lastFiredT == null ? 99 : S.t - u.lastFiredT
        return since < 0.35 ? 1 - since / 0.35 : 0.12
      }

      // weapon-range rings, drawn under the symbols so they don't obscure them. Global
      // toggle rings every friendly unit regardless of selection; a per-unit toggle only
      // rings that unit while it's selected, so it's a focus aid, not permanent clutter.
      {
        const showAll = ui.showRanges
        const per = ui.rangeUnits || {}
        const sel = ui.selectedIds
        for (const u of S.units) {
          if (u.side !== 'friend' || u.strength <= 0) continue
          const perOn = per[u.id] && sel.includes(u.id)
          if (!showAll && !perOn) continue
          const type = UNIT_TYPES[u.type]
          const r = type.range
          if (!r) continue
          const px = w2sX(u.x), py = w2sY(u.y), rr = r * view.ppm
          ctx.beginPath()
          ctx.arc(px, py, rr, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(90,160,240,0.06)'
          ctx.fill()
          ctx.setLineDash([5, 4])
          ctx.strokeStyle = per[u.id] ? 'rgba(255,215,90,0.55)' : 'rgba(90,160,240,0.4)'
          ctx.lineWidth = 1
          ctx.stroke()
          ctx.setLineDash([])
        }
      }

      // friendly units (always shown — it's blue force tracking)
      for (const u of S.units) {
        if (u.side !== 'friend') continue
        const type = UNIT_TYPES[u.type]
        drawUnitSymbol(ctx, w2sX(u.x), w2sY(u.y), {
          side: 'friend', glyph: type.glyph, label: `${u.label} ${type.abbr}`,
          strength: u.strength, selected: ui.selectedIds.includes(u.id),
          dug: u.posture === 'dig' ? u.digT : 0, contact: contactLevel(u),
        })
      }

      // hostiles: through fog = contacts; fog off = ground truth
      if (S.fogEnabled) {
        for (const [, c] of S.contacts) {
          const type = UNIT_TYPES[c.type]
          const age = S.t - c.lastSeen
          drawUnitSymbol(ctx, w2sX(c.x), w2sY(c.y), {
            side: 'hostile', glyph: type.glyph, stale: !c.live,
            label: c.live ? type.abbr : `LKP ${Math.floor(age / 60)}M`,
            strength: c.strength ?? 100,
          })
        }
      } else {
        for (const u of S.units) {
          if (u.side !== 'hostile') continue
          const type = UNIT_TYPES[u.type]
          drawUnitSymbol(ctx, w2sX(u.x), w2sY(u.y), {
            side: 'hostile', glyph: type.glyph, label: `${u.label} ${type.abbr}`,
            strength: u.strength, contact: contactLevel(u),
          })
        }
      }

      // attack designation: pulsing red diamond on targets under deliberate attack
      {
        const targeted = new Set<number>()
        for (const u of S.units) {
          if (u.side === 'friend' && u.attackId != null) targeted.add(u.attackId)
        }
        for (const id of targeted) {
          const e2 = S.units.find(x => x.id === id)
          if (!e2) continue
          const c = S.contacts.get(id)
          const pos = (!S.fogEnabled || (c && c.live)) ? e2 : c
          if (!pos) continue
          const tx2 = w2sX(pos.x), ty2 = w2sY(pos.y)
          const pulse = 20 + Math.sin(S.t * 4) * 3
          ctx.strokeStyle = 'rgba(255,70,50,0.85)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(tx2, ty2 - pulse); ctx.lineTo(tx2 + pulse, ty2)
          ctx.lineTo(tx2, ty2 + pulse); ctx.lineTo(tx2 - pulse, ty2)
          ctx.closePath()
          ctx.stroke()
        }
      }

      // formation-spread preview while dragging
      if (lineDrag) {
        const n = Math.max(1, useUI.getState().selectedIds.length)
        const red = ui.cmdMode === 'attack'
        ctx.strokeStyle = red ? 'rgba(255,88,68,0.85)' : 'rgba(63,157,255,0.85)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(lineDrag.x0, lineDrag.y0)
        ctx.lineTo(lineDrag.x1, lineDrag.y1)
        ctx.stroke()
        ctx.fillStyle = red ? 'rgba(255,88,68,0.9)' : 'rgba(63,157,255,0.9)'
        for (let i = 0; i < n; i++) {
          const t = n > 1 ? i / (n - 1) : 0.5
          const px = lineDrag.x0 + (lineDrag.x1 - lineDrag.x0) * t
          const py = lineDrag.y0 + (lineDrag.y1 - lineDrag.y0) * t
          ctx.beginPath()
          ctx.arc(px, py, 4, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // marquee rectangle
      if (marquee) {
        const x = Math.min(marquee.x0, marquee.x1), y = Math.min(marquee.y0, marquee.y1)
        const w = Math.abs(marquee.x1 - marquee.x0), h = Math.abs(marquee.y1 - marquee.y0)
        ctx.fillStyle = 'rgba(80,160,255,0.12)'
        ctx.fillRect(x, y, w, h)
        ctx.strokeStyle = 'rgba(110,190,255,0.85)'
        ctx.lineWidth = 1.2
        ctx.setLineDash([5, 3])
        ctx.strokeRect(x, y, w, h)
        ctx.setLineDash([])
      }

      // cursor coordinates readout
      const cwx = s2wX(mouse.x), cwy = s2wY(mouse.y)
      if (cwx >= 0 && cwy >= 0 && cwx < S.map!.WORLD && cwy < S.map!.WORLD) {
        ctx.font = '10px Consolas, monospace'
        ctx.fillStyle = night ? 'rgba(160,200,235,0.85)' : 'rgba(20,30,40,0.75)'
        ctx.fillText(
          `${String(Math.floor(cwx / 100)).padStart(3, '0')} ${String(Math.floor(cwy / 100)).padStart(3, '0')}  ` +
          S.map!.terrNameAt(cwx, cwy).toUpperCase(),
          mouse.x + 14, mouse.y + 22,
        )
      }
    }
    draw()

    return () => {
      cancelAnimationFrame(raf)
      clearInterval(panTimer)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('contextmenu', noCtx)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'crosshair' }} />
}
