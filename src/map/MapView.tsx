// The BFT command map: canvas terrain + 2525 symbology + all map-space input.
// Control scheme (Total War style): LEFT = selection only (click a unit/
// structure to select, click empty ground to deselect, drag = marquee box,
// ctrl = add/toggle). RIGHT = orders (click ground = move, click a hostile =
// attack, drag = formation line with a live preview, release to lay the
// formation; shift = append waypoint; right-click a route pip deletes it).
// Pan with the middle-mouse drag or WASD (no edge-scroll — the camera never
// moves unless the player deliberately moves it). Right-clicking
// directly ON a friendly unit opens its context menu (per-unit orders); those
// orders also live on the bottom selection tray, and deploys on the left
// command panel.
import { useEffect, useRef } from 'react'
import { S } from '../engine/state'
import type { ControlMeasure, MeasureKind, Unit, Drone, Structure } from '../engine/GameState'
import {
  orderMove, orderGroupMove, orderAttack, removeLastWaypoint, removeWaypoint, orderConvoy, orderBridge,
} from '../domains/forces/orders'
import { deployUnit, deployStructure, orderReturnToGarrison } from '../domains/installations/orders'
import { deployDrone, orderDroneMove, droneDropWp, removeDroneWaypoint } from '../domains/air/orders'
import { fireMission } from '../domains/fires/orders'
import { UNIT_TYPES, type UnitTypeKey } from '../domains/forces/catalog'
import { underPlayerCommand } from '../domains/forces/command'
import { playerPack } from '../packs'
import { markOf, patchOf } from '../packs/orgquery'
import { STRUCTURES, type StructureType, type StructureTypeKey } from '../domains/installations/catalog'
import { DRONE_TYPES, type DroneType, type DroneTypeKey } from '../domains/air/catalog'
import { packLayerFor, packPlaceLabels, TERRAIN_PX } from './packRender'
import { frameOf } from '../world/pack/frame'
import { frameImagery, rawImagery, worldRectBounds, IMAGERY_CREDIT } from '../world/pack/imagery'
import { terrainOrtho } from './terrainOrtho'
import { controlField } from '../engine/frontline'
import { drawUnitSymbol, drawDroneIcon, drawStructure, drawPlace } from './symbols'
import { MARCH_INTERVAL, marchPlan } from '../domains/movement/march'
import { addMeasure, isLine, measureLabel, removeMeasure } from '../domains/control/measures'
import { toast } from '../domains/comms/radio'
import { leaveTeam, taskOrganize, teamById, teamOf } from '../domains/forces/teams'
import { useUI } from '../ui/store'

interface View { cx: number; cy: number; ppm: number }
type Pick2 = { kind: 'unit'; obj: Unit } | { kind: 'drone'; obj: Drone }

export default function MapView() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef<View | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    // the exact renderer — the export drawn directly, roads and all baked
    // into the sheet once; the per-frame cost is a blit (GROUNDWORK.md P4)
    const ground = S.map!.ground!
    // shared across panes — see packLayerFor. A station's map is a second
    // MapView and must not bake a second 64 MB copy of the same sheet.
    const terrainLayer = packLayerFor(S.map!, ground)
    // SAT underlay: for a map that shipped satellite (map.json `sat`),
    // orthoimagery of the frame, fetched lazily on first toggle. For a
    // terrain-mode world, the engine's procedural ground baked top-down —
    // that world's own orthoimagery. Null until ready; the sheet keeps
    // drawing meanwhile.
    const frame = frameOf(ground.files.manifest)
    let satLayer: HTMLCanvasElement | null = null
    let satKicked = false
    const kickSat = () => {
      if (satKicked) return
      satKicked = true
      if (!S.map!.sat) {
        try { satLayer = terrainOrtho(S.map!) } catch (e) { satKicked = false; console.error('terrain ortho bake failed', e) }
        return
      }
      frameImagery(ground, frame)
        .then(cv => { satLayer = cv })
        .catch(e => { satKicked = false; console.error('satellite imagery failed', e) })
    }
    // High-fidelity follow-patch: the base mosaic is budget-capped and lands
    // coarse over a battalion box, but a WINDOW-sized box fetches deep — so
    // once the view outzooms the base, a padded patch of the visible ground
    // is fetched and blitted over it. One patch, refetched when the view
    // leaves it; the tile cache underneath makes revisited ground cheap.
    let satPatch: { cv: HTMLCanvasElement; x0: number; y0: number; x1: number; y1: number } | null = null
    let patchKey = ''
    let patchBusy = false
    const kickPatch = (x0: number, y0: number, x1: number, y1: number) => {
      const key = [x0, y0, x1, y1].map(v => Math.round(v / 250)).join(':')
      if (patchBusy || key === patchKey) return
      patchBusy = true
      patchKey = key
      rawImagery(worldRectBounds(ground, frame, x0, y0, x1, y1))
        .then(cv => { satPatch = { cv, x0, y0, x1, y1 }; patchBusy = false })
        .catch(() => { patchBusy = false; patchKey = '' })
    }
    // the full gazetteer + the licence line the ODbL requires on the sheet
    const packLabels = packPlaceLabels(S.map!, ground)
    const attribution = ground.files.manifest.attribution.map(a => `${a.source} — ${a.licence}`).join('  ·  ')
    // THE FIRST THING A COMMANDER SEES IS THEIR OWN FORCE.
    //
    // The game opened on nine kilometres of ground centred two klicks north of
    // the FOB, so a battalion occupying a kilometre and a half of it arrived as
    // an illegible smudge in one corner — every icon overlapping, no label
    // readable, and the player's first act was to hunt for their own units and
    // zoom in. Frame the force instead: its bounding box plus a margin, floored
    // so a tightly-laagered battalion does not open at street level.
    const vpMin = Math.min(window.innerWidth || 1280, window.innerHeight || 720)
    const mine = S.units.filter(u => u.side === 'friend' && u.strength > 0)
    let view: View
    if (mine.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (const u of mine) {
        x0 = Math.min(x0, u.x); x1 = Math.max(x1, u.x)
        y0 = Math.min(y0, u.y); y1 = Math.max(y1, u.y)
      }
      const span = Math.max(x1 - x0, y1 - y0, 900) * 2.2
      view = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, ppm: Math.max(0.02, vpMin / span) }
    } else {
      // no force yet (the map editor's preview, an empty scenario): fall back to
      // the map's authored framing, then to the base
      const dv = S.map!.devView
      view = dv
        ? { cx: dv.cx, cy: dv.cy, ppm: Math.max(0.02, vpMin / dv.fit) }
        : { cx: S.map!.fob.x, cy: S.map!.fob.y - 2000, ppm: Math.max(0.02, vpMin / 9000) }
    }
    viewRef.current = view
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
      const x0 = 0, y0 = 0
      const x1 = S.map!.WORLD, y1 = S.map!.WORLD
      const spanX = x1 - x0, spanY = y1 - y0
      // floor = zoomed out just enough to fit the AO (can't scroll past its edge)
      const minPpm = Math.min(canvas.width / spanX, canvas.height / spanY)
      view.ppm = Math.max(minPpm, Math.min(1.2, view.ppm))
      const hw = canvas.width / 2 / view.ppm
      const hh = canvas.height / 2 / view.ppm
      view.cx = hw * 2 >= spanX ? (x0 + x1) / 2 : Math.max(x0 + hw, Math.min(x1 - hw, view.cx))
      view.cy = hh * 2 >= spanY ? (y0 + y1) / 2 : Math.max(y0 + hh, Math.min(y1 - hh, view.cy))
    }

    const w2sX = (x: number) => (x - view.cx) * view.ppm + canvas.width / 2
    const w2sY = (y: number) => (y - view.cy) * view.ppm + canvas.height / 2
    const s2wX = (sx: number) => (sx - canvas.width / 2) / view.ppm + view.cx
    const s2wY = (sy: number) => (sy - canvas.height / 2) / view.ppm + view.cy

    function pickUnit(wx: number, wy: number): Unit | null {
      const pickR = 18 / view.ppm
      let picked: Unit | null = null, pd = Infinity
      for (const u of S.units) {
        // only what you command: a sister formation's platoon is a symbol on
        // your map, not a unit you can pick up and order
        if (!underPlayerCommand(u)) continue
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

    /** The measure under the cursor: nearest point for a marker, nearest point
     *  ON the segment for a line — you grab a phase line by the line, not by
     *  its ends. */
    function pickMeasure(wx: number, wy: number): ControlMeasure | null {
      const r = 22 / view.ppm
      let best: ControlMeasure | null = null, bd = Infinity
      for (const m of S.measures) {
        let d: number
        if (isLine(m.kind) && m.pts.length > 1) {
          const a = m.pts[0]!, b = m.pts[1]!
          const dx = b.x - a.x, dy = b.y - a.y
          const len2 = dx * dx + dy * dy
          let t = len2 > 0 ? ((wx - a.x) * dx + (wy - a.y) * dy) / len2 : 0
          t = t < 0 ? 0 : t > 1 ? 1 : t
          d = Math.hypot(wx - (a.x + dx * t), wy - (a.y + dy * t))
        } else {
          const p = m.pts[0]!
          d = Math.hypot(wx - p.x, wy - p.y)
        }
        if (d < r && d < bd) { bd = d; best = m }
      }
      return best
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
    let leftDown: { x: number; y: number; ctrl: boolean } | null = null   // select / marquee
    let rightDown: { x: number; y: number } | null = null                 // order / formation line
    let marquee: { x0: number; y0: number; x1: number; y1: number } | null = null  // screen coords
    let lineDrag: { x0: number; y0: number; x1: number; y1: number } | null = null // formation spread
    let pointerOver = false   // cursor is over the map canvas (gates edge-scroll)
    // starts OFF-canvas: (0,0) would sit inside the edge-scroll band and pan
    // the camera before any real cursor movement has ever been seen
    const mouse = { x: -1, y: -1 }

    function onDown(e: MouseEvent) {
      useUI.getState().closeMenu()
      if (e.button === 1) {                 // middle = pan
        panDrag = true; dragMoved = false
        lastMx = mX(e); lastMy = mY(e)
        e.preventDefault()
      } else if (e.button === 0) {          // left = select
        leftDown = { x: mX(e), y: mY(e), ctrl: e.ctrlKey }
      } else if (e.button === 2) {          // right = order / formation
        rightDown = { x: mX(e), y: mY(e) }
      }
    }
    function onMove(e: MouseEvent) {
      mouse.x = mX(e); mouse.y = mY(e)
      if (panDrag) {
        const dx = mX(e) - lastMx, dy = mY(e) - lastMy
        if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true
        if (dragMoved) {
          // taking the map by hand releases the camera lock
          if (useUI.getState().track) useUI.setState({ track: false })
          view.cx -= dx / view.ppm
          view.cy -= dy / view.ppm
          lastMx = mX(e); lastMy = mY(e)
        }
        return
      }
      const mode = useUI.getState().mode
      // the drawn-line drag reuses the formation-line rubber band so the
      // commander can see the line they are laying before they commit it
      if (leftDown && (mode === 'measure:phaseline' || mode === 'measure:boundary')) {
        lineDrag = { x0: leftDown.x, y0: leftDown.y, x1: mX(e), y1: mY(e) }
      }
      if (leftDown && mode === 'select') {
        // left-drag over the map: marquee selection box
        const moved = Math.hypot(mX(e) - leftDown.x, mY(e) - leftDown.y)
        if (marquee || moved > 6) marquee = { x0: leftDown.x, y0: leftDown.y, x1: mX(e), y1: mY(e) }
      } else if (rightDown && mode === 'select') {
        // right-drag with a selection: lay a formation line (preview → release)
        const hasSel = useUI.getState().selectedIds.length > 0
        const moved = Math.hypot(mX(e) - rightDown.x, mY(e) - rightDown.y)
        if (hasSel && (lineDrag || moved > 18)) {
          lineDrag = { x0: rightDown.x, y0: rightDown.y, x1: mX(e), y1: mY(e) }
        }
      }
    }
    function onUp(e: MouseEvent) {
      if (e.button === 1) { panDrag = false; return }   // middle = pan
      const ui = useUI.getState()

      // ---- RIGHT BUTTON: orders (move / attack / formation / route edit) ----
      if (e.button === 2) {
        const wasLine = lineDrag
        lineDrag = null; rightDown = null
        // right-click in a modal placement mode cancels it (like Escape)
        if (ui.mode !== 'select') { useUI.setState({ mode: 'select' }); return }
        const wx = s2wX(mX(e)), wy = s2wY(mY(e))

        // formation line: distribute the selection evenly along the dragged line
        if (wasLine) {
          const sel: Array<Unit | Drone> = [...selectedFriendlies(), ...selectedDrones()]
          if (sel.length) {
            const wx0 = s2wX(wasLine.x0), wy0 = s2wY(wasLine.y0)
            const wx1 = s2wX(wasLine.x1), wy1 = s2wY(wasLine.y1)
            const ldx = wx1 - wx0, ldy = wy1 - wy0
            const attack = ui.cmdMode === 'attack'
            const gid = null // an ad-hoc selection isn't a formation, so no shared pace cap
            const app = e.shiftKey // shift-drag appends the fan-out as the next waypoint
            // Slots go by projection along the line, so nobody crosses anybody.
            // On an APPEND that projection has to be taken from where the leg
            // STARTS — the unit's route end, its slot in the previous fan — not
            // from where the platoon happens to be parked. They have not driven
            // any of this yet, so live positions are all the same point and the
            // lanes come out shuffled: the left platoon gets the right slot and
            // the fans cross. A fresh fan discards the route, so there the
            // origin really is the live position.
            const from = (o: Unit | Drone) => {
              if (!app) return { x: o.x, y: o.y }
              const r = (o as Unit).path?.length ? (o as Unit).path : (o as Drone).route
              const last = r && r.length ? r[r.length - 1] : null
              return last ? { x: last.x, y: last.y } : { x: o.x, y: o.y }
            }
            const proj = (o: Unit | Drone) => {
              const p = from(o)
              return (p.x - wx0) * ldx + (p.y - wy0) * ldy
            }
            const sorted = [...sel].sort((a, b) => proj(a) - proj(b))
            // NO converge. Each unit appends from its OWN last route point
            // (orderMove: `from = u.path[u.path.length-1]`), so fan N+1 grows
            // out of fan N — the spread widens instead of being funnelled back
            // through one shared point and re-fanned. The router's one clock
            // handles the rest: short spread legs go direct because the road
            // detour loses on time.
            sorted.forEach((o, i) => {
              const t = sorted.length > 1 ? i / (sorted.length - 1) : 0.5
              const px = wx0 + ldx * t, py = wy0 + ldy * t
              if ((S.drones as Array<Unit | Drone>).includes(o)) orderDroneMove(o.id, px, py, app)
              else orderMove(o.id, px, py, app, attack, gid)
            })
          }
          return
        }

        // right-click a waypoint pip of the selection deletes it (mid-route
        // waypoints re-path the gap) — checked before issuing a move
        const pipR = 12 / view.ppm
        for (const u of selectedFriendlies()) {
          const i = u.legs.findIndex(l => Math.hypot(l.x - wx, l.y - wy) <= pipR)
          if (i >= 0) { removeWaypoint(u.id, i); return }
        }
        for (const d of selectedDrones()) {
          const i = (d.route || []).findIndex(p => Math.hypot(p.x - wx, p.y - wy) <= pipR)
          if (i >= 0) { removeDroneWaypoint(d.id, i); return }
        }

        // right-click ON a friendly unit opens its context menu (per-unit orders),
        // as it did before — the unit is a thing you interact with, not an order
        // target. Ground / hostiles below are the move / attack targets.
        const fu = pickUnit(wx, wy)
        if (fu) {
          ui.setSelected([fu.id])
          ui.openMenu({ x: mX(e), y: mY(e), unitId: fu.id })
          return
        }

        // issue orders to the current selection: hostile under the cursor = attack,
        // otherwise move. Shift appends a waypoint.
        const sel = selectedFriendlies()
        const selD = selectedDrones()
        if (!sel.length && !selD.length) return
        const enemy = pickEnemy(wx, wy)
        if (enemy && sel.length) { sel.forEach(u => orderAttack(u.id, enemy.id, null)); return }
        issueMoves(sel, wx, wy, e.shiftKey, ui.cmdMode === 'attack')
        selD.forEach((d, k) => {
          orderDroneMove(d.id, wx + (k % 2) * 300 - 150 * (k > 0 ? 1 : 0), wy + Math.floor(k / 2) * 300, e.shiftKey)
        })
        return
      }

      if (e.button !== 0) return
      // ---- LEFT BUTTON: selection (and modal placement) ----
      const wasMarquee = marquee
      const wasDown = leftDown
      marquee = null; leftDown = null
      const wx = s2wX(mX(e)), wy = s2wY(mY(e))

      // DRAWING CONTROL MEASURES. A phase line is DRAGGED across the axis of
      // advance; a checkpoint and an objective are CLICKED down, because that
      // is the shape of the thing in each case. The tool stays armed so a
      // commander lays PL BLUE, AMBER and GREEN in three strokes rather than
      // re-arming between each; Escape or the button ends it, like every other
      // modal placement here.
      //
      // Clicking an existing measure REMOVES it — a graphic you can put down
      // and not take up is a graphic nobody will risk drawing.
      if (ui.mode.startsWith('measure:')) {
        lineDrag = null
        const kind = ui.mode.slice(8) as MeasureKind
        const hit = pickMeasure(wx, wy)
        if (hit) {
          removeMeasure(hit.id)
          toast(`${measureLabel(hit)} OFF THE GRAPHIC`)
          return
        }
        if (isLine(kind)) {
          if (!wasDown) return
          const ax = s2wX(wasDown.x), ay = s2wY(wasDown.y)
          if (Math.hypot(wx - ax, wy - ay) > 60) {
            const m = addMeasure(kind, [{ x: ax, y: ay }, { x: wx, y: wy }])
            if (m) toast(`${measureLabel(m)} ON THE GRAPHIC`)
          }
        } else {
          const m = addMeasure(kind, [{ x: wx, y: wy }])
          if (m) toast(`${measureLabel(m)} ON THE GRAPHIC`)
        }
        return
      }

      // modal placement modes place on left-click
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
      if (ui.mode === 'garrison') {
        // reassign garrison: click a friendly base — the selected elements
        // drive there, stand down, and it becomes their HOME (RTB target)
        const st = pickStructure(wx, wy)
        if (st && st.side === 'friend' && (st.kind === 'HQ' || st.kind === 'FOB') && st.buildT <= 0) {
          for (const u of selectedFriendlies()) orderReturnToGarrison(u.id, st.id)
        }
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

      // marquee box selection
      if (wasMarquee) {
        const wx0 = s2wX(Math.min(wasMarquee.x0, wasMarquee.x1))
        const wx1 = s2wX(Math.max(wasMarquee.x0, wasMarquee.x1))
        const wy0 = s2wY(Math.min(wasMarquee.y0, wasMarquee.y1))
        const wy1 = s2wY(Math.max(wasMarquee.y0, wasMarquee.y1))
        const ids = S.units
          .filter(u => underPlayerCommand(u) && u.x >= wx0 && u.x <= wx1 && u.y >= wy0 && u.y <= wy1)
          .map(u => u.id)
        const dIds = S.drones
          .filter(d => d.x >= wx0 && d.x <= wx1 && d.y >= wy0 && d.y <= wy1)
          .map(d => d.id)
        ids.push(...dIds)
        ui.setSelected(e.ctrlKey ? [...new Set([...ui.selectedIds, ...ids])] : ids)
        return
      }

      // plain left click: select what's under the cursor, else deselect. Never
      // issues a move — orders are the right button's job.
      const picked = pickAny(wx, wy)
      if (picked) {
        if (picked.kind === 'drone') {
          // drones are flown from their feed window — selecting one opens its feed
          if (e.ctrlKey) ui.toggleSelect(picked.obj.id)
          else { ui.setSelected([picked.obj.id]); ui.bindDrone(picked.obj.id) }
          return
        }
        // CLICKING A SYMBOL SELECTS THAT ELEMENT. It used to select the whole
        // team, which made sense while the dock was the only place a team
        // existed at all — you clicked a platoon and got its company because
        // there was nowhere else to get one. There is now: every team has a tab
        // and a station on the right wall, and 1-9 pick one without looking.
        //
        // So the map went back to meaning what it draws. You clicked THAT
        // symbol; you get THAT element. And ALT-CLICK IS DELETED with it — it
        // existed only to isolate one platoon out of the team a plain click had
        // swept up, which is now just what a plain click does.
        if (e.ctrlKey) ui.toggleSelect(picked.obj.id)
        else ui.setSelected([picked.obj.id])
        return
      }
      const st = pickStructure(wx, wy)
      if (st) { ui.setSelected([st.id]); return }
      // empty ground: deselect (ctrl-click leaves the current selection alone)
      if (!e.ctrlKey) ui.setSelected([])
    }

    // A TEAM MOVES AS A COLUMN. Anything else is several units given the same
    // order, each pathing independently at its own speed.
    //
    // This used to be the second thing unconditionally: every move the player
    // issued went out as individual orderMove calls with groupId null, so there
    // was no shared route, no pace cap and no station-keeping — for ANY
    // selection, task organized or not. The comment that stood here said column
    // behaviour "belongs to real combat groups, which don't exist yet". They do
    // now, and nothing had told this. The whole march-order, order-of-march and
    // interval apparatus was unreachable from the game: the fast elements ran
    // ahead, the slow ones were left, and the designated lead ended up in the
    // middle of its own column, exactly as reported.
    function issueMoves(units: Unit[], wx: number, wy: number, append: boolean, attack = false) {
      // partition by task organization, preserving selection order within each
      const byTeam = new Map<number, Unit[]>()
      const loose: Unit[] = []
      for (const u of units) {
        const t = teamOf(u)
        if (!t) { loose.push(u); continue }
        const g = byTeam.get(t.id) ?? []
        g.push(u); byTeam.set(t.id, g)
      }
      for (const [, g] of byTeam) {
        // a lone member of a team is not a column — give it its own order
        if (g.length < 2) { loose.push(g[0]!); continue }
        orderGroupMove(g.map(u => u.id), wx, wy, append, attack)
      }
      if (!loose.length) return
      const cols = Math.ceil(Math.sqrt(loose.length))
      const rows = Math.ceil(loose.length / cols)
      // A new waypoint NEVER touches an earlier one — orderMove appends from
      // the end of the existing route and leaves everything before it alone.
      loose.forEach((u, k) => {
        const ox = ((k % cols) - (cols - 1) / 2) * 90
        const oy = (Math.floor(k / cols) - (rows - 1) / 2) * 90
        orderMove(u.id, wx + ox, wy + oy, append, attack, null)
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
    let lastSpeed = 1 // restored on unpause
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        useUI.setState({ mode: 'select', selectedIds: [], ctxMenu: null })
      }
      if (e.key === ' ') {
        // spacebar toggles pause/unpause (preventDefault so it doesn't scroll
        // the page or re-trigger the last focused button)
        e.preventDefault()
        if (S.speed > 0) { lastSpeed = S.speed; S.speed = 0 }
        else S.speed = lastSpeed || 1
      }
      if (e.key === 'Delete') {
        for (const u of selectedFriendlies()) removeLastWaypoint(u.id)
        for (const d of selectedDrones()) droneDropWp(d.id)
      }
      const k = e.key.toLowerCase()
      if ('wasd'.includes(k)) heldKeys.add(k)
      if (k === 'q') useUI.getState().setCmdMode('move')
      if (k === 'e') useUI.getState().setCmdMode('attack')
      // TASK ORGANIZE WITHOUT LOOKING AWAY. G is the group key in every RTS
      // ever made, and task organizing is the decision this game is about — it
      // should not require dropping your eyes to a button rail while the
      // elements you mean are under the cursor. Shift+G breaks the grouping.
      if (k === 'g' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        const sel = selectedFriendlies()
        if (!sel.length) return
        if (e.shiftKey) {
          const held = sel.filter(u => teamOf(u))
          if (!held.length) return toast('NOTHING IN THE SELECTION IS TASK ORGANIZED')
          for (const u of held) leaveTeam(u.id)
          toast(`${held.length} DETACHED`)
          return
        }
        const r = taskOrganize(sel.map(u => u.id))
        if (r.kind === 'formed') toast(`${r.team!.name} TASK ORGANIZED`)
        else if (r.kind === 'joined') toast(`${r.n} ATTACHED TO ${r.team!.name}`)
        else if (r.kind === 'ambiguous') {
          const names = (r.teams ?? []).map(id => teamById(id)?.name ?? '?').join(' AND ')
          toast(`SELECTION SPANS ${names} — RIGHT-CLICK TO CHOOSE`)
        } else toast('ALREADY ONE TEAM — ADD WHAT IS JOINING IT, OR SHIFT+G TO DETACH')
      }
    }
    function onKeyUp(e: KeyboardEvent) { heldKeys.delete(e.key.toLowerCase()) }
    function onBlur() { heldKeys.clear() }
    // WASD + cursor edge-scroll pan: constant screen-speed regardless of zoom
    const onEnter = () => { pointerOver = true }
    const onLeave = () => { pointerOver = false }
    const panTimer = setInterval(() => {
      const step = 700 * 0.04 / view.ppm // 700 px/s in world meters
      let moved = false
      if (heldKeys.has('w')) { view.cy -= step; moved = true }
      if (heldKeys.has('s')) { view.cy += step; moved = true }
      if (heldKeys.has('a')) { view.cx -= step; moved = true }
      if (heldKeys.has('d')) { view.cx += step; moved = true }
      // (edge-scroll removed 2026-07-25: the camera moves ONLY on deliberate
      // input — middle-mouse drag or WASD — never because the cursor happened
      // to rest near the map edge)
      if (moved) clampView()
    }, 40)
    canvas.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    canvas.addEventListener('mouseup', onUp)
    canvas.addEventListener('mouseenter', onEnter)
    canvas.addEventListener('mouseleave', onLeave)
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
      // camera lock: the selection's centroid owns the center while it lives;
      // zoom stays the player's. Selection dead or empty = lock releases.
      if (useUI.getState().track) {
        const tracked = [...selectedFriendlies(), ...selectedDrones()]
        if (tracked.length) {
          let cx = 0, cy = 0
          for (const t of tracked) { cx += t.x; cy += t.y }
          view.cx = cx / tracked.length
          view.cy = cy / tracked.length
        } else {
          useUI.setState({ track: false })
        }
      }
      clampView()
      const { night, sat } = useUI.getState()
      if (sat) kickSat()
      const W = canvas.width, H = canvas.height
      // off-map backdrop: shows wherever the square map doesn't fill the viewport.
      // Mirrors the splash screen (radial wash + faint grid) so fit-to-screen reads
      // as a framed view rather than a clipped one.
      const bg = ctx.createRadialGradient(W * 0.5, H * 0.3, 0, W * 0.5, H * 0.3, Math.max(W, H) * 0.8)
      bg.addColorStop(0, night ? '#232427' : '#2f3033')
      bg.addColorStop(1, night ? '#1a1b1d' : '#242528')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)
      ctx.save()
      ctx.globalAlpha = night ? 0.12 : 0.09
      ctx.strokeStyle = '#4a4d52'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let gx = 0; gx <= W; gx += 48) { ctx.moveTo(gx + 0.5, 0); ctx.lineTo(gx + 0.5, H) }
      for (let gy = 0; gy <= H; gy += 48) { ctx.moveTo(0, gy + 0.5); ctx.lineTo(W, gy + 0.5) }
      ctx.stroke()
      ctx.restore()

      // terrain (dimmed + desaturated at night) — the exact sheet, or the
      // orthoimagery of the same frame when SAT is on (symbology stays on top)
      const mpp = S.map!.CELL / TERRAIN_PX
      const showSat = sat && satLayer != null
      ctx.imageSmoothingEnabled = showSat || view.ppm * mpp < 1
      if (night) ctx.filter = 'brightness(0.42) saturate(0.5) contrast(1.05)'
      if (showSat) {
        // the sat canvas covers exactly the frame window, whatever its px size
        ctx.drawImage(satLayer!, w2sX(0), w2sY(0),
          S.map!.WORLD * view.ppm, S.map!.WORLD * view.ppm)
        // past the base mosaic's own resolution, sharpen where the view is
        // (real imagery only — the terrain bake has nothing sharper to fetch)
        const basePpm = satLayer!.width / S.map!.WORLD
        if (S.map!.sat && view.ppm > basePpm * 1.3) {
          const pad = 1.35
          const hw = (canvas.width / 2 / view.ppm) * pad, hh = (canvas.height / 2 / view.ppm) * pad
          kickPatch(
            Math.max(0, view.cx - hw), Math.max(0, view.cy - hh),
            Math.min(S.map!.WORLD, view.cx + hw), Math.min(S.map!.WORLD, view.cy + hh),
          )
        }
        if (satPatch && view.ppm > basePpm * 1.15) {
          const p = satPatch
          ctx.drawImage(p.cv, w2sX(p.x0), w2sY(p.y0),
            (p.x1 - p.x0) * view.ppm, (p.y1 - p.y0) * view.ppm)
        }
      } else {
        ctx.drawImage(
          terrainLayer,
          w2sX(0), w2sY(0),
          terrainLayer.width * mpp * view.ppm,
          terrainLayer.height * mpp * view.ppm,
        )
      }
      ctx.filter = 'none'

      // frame the map edge so the off-map backdrop reads as "outside the AO"
      ctx.strokeStyle = night ? 'rgba(120,150,180,0.35)' : 'rgba(40,55,70,0.55)'
      ctx.lineWidth = 2
      ctx.strokeRect(w2sX(0), w2sY(0), S.map!.WORLD * view.ppm, S.map!.WORLD * view.ppm)

      // (Roads are baked into the sheet — real geography carries 50k+
      // polylines and a per-frame walk of them is exactly why the map
      // crawled before the exact renderer landed.)

      // campaign COP: enemy-controlled territory wash + the FLOT trace. The
      // control field recomputes on its own slow cadence; drawing it is just a
      // scaled image blit (soft edges via smoothing) and a dashed contour.
      {
        const cf = controlField(S)
        if (cf) {
          ctx.save()
          ctx.imageSmoothingEnabled = true
          ctx.globalAlpha = night ? 0.85 : 0.7
          ctx.drawImage(cf.tint, w2sX(0), w2sY(0), S.map!.WORLD * view.ppm, S.map!.WORLD * view.ppm)
          ctx.restore()
          // TWO traces like a real battle map: the friendly forward line (blue)
          // and the enemy line (red) — the gap between them is uncontested
          ctx.save()
          ctx.lineJoin = 'round'
          const trace = (paths: typeof cf.blue, color: string) => {
            ctx.strokeStyle = color
            ctx.lineWidth = Math.max(1.6, 2.6 * Math.min(1, view.ppm * 12))
            ctx.setLineDash([9, 6])
            ctx.beginPath()
            for (const p of paths) {
              ctx.moveTo(w2sX(p[0]!.x), w2sY(p[0]!.y))
              for (let i = 1; i < p.length; i++) ctx.lineTo(w2sX(p[i]!.x), w2sY(p[i]!.y))
            }
            ctx.stroke()
            ctx.setLineDash([])
          }
          trace(cf.red, night ? 'rgba(255,96,96,0.85)' : 'rgba(190,34,34,0.8)')
          trace(cf.blue, night ? 'rgba(96,160,255,0.85)' : 'rgba(30,90,190,0.8)')
          ctx.restore()
        }
      }

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

      // the rest of the gazetteer (pack maps): every named place the ground
      // knows, gated by zoom rank so the chart declutters itself — cities
      // always, hamlets only up close. Screen-space like all symbology.
      if (packLabels) {
        const ppm = view.ppm
        for (const p of packLabels) {
          if (ppm < p.minPpm) continue
          const x = w2sX(p.x), y = w2sY(p.y)
          if (x < -80 || y < -20 || x > canvas.clientWidth + 80 || y > canvas.clientHeight + 20) continue
          if (p.kind === 'peak') {
            ctx.fillStyle = night ? 'rgba(170,150,120,0.5)' : 'rgba(96,72,44,0.7)'
            ctx.font = '9px Consolas, monospace'
            ctx.fillText('▲', x, y + 3)
            ctx.font = '8.5px Consolas, monospace'
            ctx.fillText(p.name, x, y - 5)
          } else if (p.kind === 'water') {
            ctx.fillStyle = night ? 'rgba(120,170,215,0.55)' : 'rgba(36,88,138,0.7)'
            ctx.font = 'italic 9px Consolas, monospace'
            ctx.fillText(p.name, x, y - 4)
          } else {
            const major = p.kind === 'city' || p.kind === 'town'
            ctx.fillStyle = night
              ? `rgba(160,195,225,${major ? 0.75 : 0.55})`
              : `rgba(40,40,45,${major ? 0.8 : 0.6})`
            ctx.font = `${major ? 'bold 10px' : '8.5px'} Consolas, monospace`
            ctx.fillText(p.name, x, y - 5)
          }
        }
        ctx.font = 'bold 10px Consolas, monospace'
      }

      // the data credit, printed on the sheet like a real map carries it —
      // ODbL requires the attribution be SHOWN, and the map is where it's true
      if (attribution) {
        ctx.save()
        ctx.font = '8px Consolas, monospace'
        ctx.textAlign = 'right'
        ctx.fillStyle = night ? 'rgba(150,170,190,0.45)' : showSat ? 'rgba(210,220,230,0.6)' : 'rgba(40,50,60,0.5)'
        // Esri's credit joins the line only when its pixels are on the sheet
        const esri = showSat && S.map!.sat
        ctx.fillText(esri ? `${attribution}  ·  ${IMAGERY_CREDIT}` : attribution,
          canvas.clientWidth - 8, canvas.clientHeight - 6)
        ctx.restore()
      }

      // named terrain: hills (spot-elevation style), rivers (blue italic), and
      // authored INFRASTRUCTURE (glyph + name — places, not assets). Fainter
      // than town names — reference marks, not objectives.
      if (view.ppm > 0.03) {
        // infra glyphs: distinctive single characters until real icon art
        const INFRA_GLYPH: Record<string, string> = {
          dam: '▓', power: '⚡', rail: '▤', depot: '◫', comm: '📡', ford: '≈', camp: '⛺',
        }
        for (const f of S.map!.features) {
          const fx = w2sX(f.x), fy = w2sY(f.y)
          if (f.kind === 'hill') {
            ctx.fillStyle = night ? 'rgba(170,150,120,0.55)' : 'rgba(96,72,44,0.75)'
            ctx.font = '9px Consolas, monospace'
            ctx.fillText('▲', fx, fy + 3)
            ctx.font = '8.5px Consolas, monospace'
            ctx.fillText(f.name, fx, fy - 6)
          } else if (f.kind === 'river') {
            ctx.fillStyle = night ? 'rgba(120,170,215,0.6)' : 'rgba(36,88,138,0.8)'
            ctx.font = 'italic 9px Consolas, monospace'
            ctx.fillText(f.name, fx, fy - 5)
          } else {
            ctx.fillStyle = night ? 'rgba(190,180,150,0.7)' : 'rgba(70,60,40,0.85)'
            ctx.font = '10px Consolas, monospace'
            ctx.fillText(INFRA_GLYPH[f.kind] ?? '■', fx, fy + 3)
            ctx.font = '8.5px Consolas, monospace'
            ctx.fillText(f.name, fx, fy - 7)
          }
        }
      }
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
      // CONTROL MEASURES. Drawn under the units and over the terrain, in the
      // conventional way: a phase line is a plain line with its name at BOTH
      // ends, because a staff reads it from whichever side they are on; a
      // checkpoint is a small triangle with its number; an objective is a
      // labelled blob. Nothing here is decorative — a measure a unit has passed
      // dims, so the sheet shows the operation's progress and not just its plan.
      for (const m of S.measures) {
        // a boundary never "completes" — it divides ground, it is not progress
        const done = m.kind !== 'boundary' && m.crossed.length > 0
        ctx.save()
        ctx.strokeStyle = m.kind === 'boundary' ? 'rgba(215,170,70,0.9)'
          : done ? 'rgba(120,170,140,0.55)' : 'rgba(60,180,120,0.85)'
        ctx.fillStyle = ctx.strokeStyle
        ctx.lineWidth = 1.6
        ctx.font = '600 10px Inter, system-ui, sans-serif'
        ctx.textAlign = 'center'
        const label = m.kind === 'phaseline' ? `PL ${m.name}`
          : m.kind === 'checkpoint' ? `CP ${m.name}` : m.name
        if (m.kind === 'boundary' && m.pts.length > 1) {
          // A BOUNDARY IS LABELLED BY WHOSE GROUND LIES EITHER SIDE OF IT —
          // that IS the graphic. A line with a name on it would be a phase
          // line; what a staff reads off a boundary is "us here, them there",
          // so the team names go out to their own side of the line.
          const a = m.pts[0]!, b = m.pts[1]!
          const ax = w2sX(a.x), ay = w2sY(a.y), bx = w2sX(b.x), by = w2sY(b.y)
          ctx.lineWidth = 2.4
          ctx.setLineDash([14, 7])
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke()
          ctx.setLineDash([])
          // Offsets are worked out in WORLD space and converted, not measured on
          // the screen: the sign that names a sector comes from the world
          // geometry, and screen Y runs the other way — doing it in pixels puts
          // each team's name on the far side of its own boundary.
          const wdx = b.x - a.x, wdy = b.y - a.y
          const wl = Math.hypot(wdx, wdy) || 1
          const wnx = -wdy / wl, wny = wdx / wl
          const wmx = (a.x + b.x) / 2, wmy = (a.y + b.y) / 2
          const nSide = Math.sign(wdx * (wmy + wny - a.y) - wdy * (wmx + wnx - a.x))
          const off = 26 / view.ppm
          for (const [id, s] of [[m.owners?.neg ?? null, -1], [m.owners?.pos ?? null, 1]] as const) {
            const t = id == null ? null : S.teams.find(x => x.id === id)
            const dir = s === nSide ? 1 : -1
            ctx.fillText(t?.name ?? 'UNASSIGNED',
              w2sX(wmx + wnx * off * dir), w2sY(wmy + wny * off * dir) + 3)
          }
          ctx.restore()
          continue
        }
        if (m.kind === 'phaseline' && m.pts.length > 1) {
          const a = m.pts[0]!, b = m.pts[1]!
          const ax = w2sX(a.x), ay = w2sY(a.y), bx = w2sX(b.x), by = w2sY(b.y)
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke()
          // tick the ends so a phase line is not mistaken for a route
          const ang = Math.atan2(by - ay, bx - ax) + Math.PI / 2
          for (const [ex, ey] of [[ax, ay], [bx, by]] as const) {
            ctx.beginPath()
            ctx.moveTo(ex - Math.cos(ang) * 7, ey - Math.sin(ang) * 7)
            ctx.lineTo(ex + Math.cos(ang) * 7, ey + Math.sin(ang) * 7)
            ctx.stroke()
          }
          ctx.fillText(label, ax, ay - 11)
          ctx.fillText(label, bx, by - 11)
        } else if (m.pts.length) {
          const p = m.pts[0]!
          const px = w2sX(p.x), py = w2sY(p.y)
          if (m.kind === 'checkpoint') {
            ctx.beginPath()
            ctx.moveTo(px, py - 9); ctx.lineTo(px + 8, py + 6); ctx.lineTo(px - 8, py + 6)
            ctx.closePath(); ctx.stroke()
          } else {
            ctx.beginPath(); ctx.arc(px, py, 14, 0, Math.PI * 2); ctx.stroke()
          }
          ctx.fillText(label, px, py - 14)
        }
        ctx.restore()
      }

      // THE MARCH TABLE, ON THE ROUTE. A column's route was a blue line and
      // nothing else: no distance, no time, no depth. Those three numbers are
      // what a march order IS, and reading them meant opening a console — so
      // the sheet could show you a route without telling you anything about it.
      //
      // Drawn for the SELECTED team only. This is detail you inspect, not
      // clutter every column carries around; the whole point of the roll-up is
      // that the map stays readable until you ask it a question.
      for (const t of S.teams) {
        if (!t.members.some(id => ui.selectedIds.includes(id))) continue
        const plan = marchPlan(t.id)
        const mem = t.members
          .map(id => S.units.find(u => u.id === id))
          .filter((u): u is Unit => !!u && u.strength > 0 && u.path.length > 0)
        if (mem.length < 2) continue
        const rank = new Map((plan?.order ?? t.members).map((id, i) => [id, i]))
        const head = mem.slice().sort((a, b) =>
          (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99))[0]!
        // distance still to run, and the pace the COLUMN can actually hold —
        // the slowest element's, because that is what a column moves at
        let togo = 0, px = head.x, py = head.y
        for (const p of head.path) { togo += Math.hypot(p.x - px, p.y - py); px = p.x; py = p.y }
        const pace = Math.min(...mem.map(u => u._spd || 0).filter(v => v > 0.2))
        const eta = isFinite(pace) && pace > 0 ? togo / pace : Infinity
        const gap = MARCH_INTERVAL[plan?.column ?? 'open']
        const depth = gap * Math.max(0, mem.length - 1)
        const rp = head.path[head.path.length - 1]!
        const hx = w2sX(head.x), hy = w2sY(head.y)
        const rx = w2sX(rp.x), ry = w2sY(rp.y)

        ctx.save()
        // SP where the head is now, RP at the objective — the two ends every
        // march table names
        ctx.strokeStyle = 'rgba(126,200,255,0.8)'
        ctx.lineWidth = 2
        for (const [mx, my] of [[hx, hy], [rx, ry]] as const) {
          ctx.beginPath(); ctx.arc(mx, my, 7, 0, Math.PI * 2); ctx.stroke()
        }
        ctx.font = '600 9px Inter, system-ui, sans-serif'
        ctx.fillStyle = 'rgba(126,200,255,0.9)'
        ctx.textAlign = 'center'
        ctx.fillText('SP', hx, hy - 11)
        ctx.fillText('RP', rx, ry - 11)

        // the readout, on the route near the objective
        const km = togo >= 1000 ? `${(togo / 1000).toFixed(1)} KM` : `${Math.round(togo)} M`
        const mins = isFinite(eta) ? Math.round(eta / 60) : null
        const line = `${t.name} · ${km} TO RP · ${
          mins == null ? 'HALTED' : mins >= 60
            ? `ETA ${Math.floor(mins / 60)}H ${String(mins % 60).padStart(2, '0')}M`
            : `ETA ${mins} MIN`} · ${Math.round(depth)} M DEEP`
        ctx.font = '600 10px Inter, system-ui, sans-serif'
        const w = ctx.measureText(line).width
        ctx.fillStyle = 'rgba(10,20,30,0.78)'
        ctx.fillRect(rx - w / 2 - 6, ry + 12, w + 12, 15)
        ctx.strokeStyle = 'rgba(126,200,255,0.35)'
        ctx.lineWidth = 1
        ctx.strokeRect(rx - w / 2 - 6, ry + 12, w + 12, 15)
        ctx.fillStyle = 'rgba(190,225,255,0.95)'
        ctx.fillText(line, rx, ry + 23)
        ctx.restore()
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
        const { GRID, CELL } = S.map!
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

      // DIVISION MAIN — higher HQ as a place on the map (campaign, inert).
      // Deep rear, bottom-left: it does nothing, it is simply there.
      if (S.campaign?.divHq) {
        const d = S.campaign.divHq
        drawStructure(ctx, w2sX(d.x), w2sY(d.y), {
          side: 'friend', kind: 'HQ', label: 'DIV MAIN · 1CD',
          building: false, progress: 1, hpFrac: 1,
        })
      }

      // structures (friendly always; hostile once spotted or fog off)
      // CONTROL MEASURES the scenario authored — the same operational graphic
      // the builder drew, under the symbols where a graphic belongs
      if (S.scenarioPlaces) {
        for (const [name, p] of S.scenarioPlaces) {
          drawPlace(ctx, w2sX(p.x), w2sY(p.y), {
            name, dim: true,
            ...(p.r != null ? { rPx: p.r * view.ppm } : {}),
          })
        }
      }
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
          // a division main and your own CP are the same box until the size
          // marker says otherwise — mark anything that is not yours
          echelon: s.side === 'friend' && s.formation && s.formation !== S.chair
            ? markOf(playerPack(), s.formation) : undefined,
          patch: s.side === 'friend' && s.formation && s.formation !== S.chair
            ? patchOf(playerPack(), s.formation) : undefined,
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

      // ROLE-BASED RANGE OVERLAYS (map-corner toggles), drawn under the symbols.
      // FIRES = the call-for-fire picture: every indirect shooter's max-range
      // ring, labeled — the commander sees at a glance what ground his guns can
      // service. SNSR = collection coverage: recon sight, drone footprints, SIG
      // direction-finding. WPN = direct-fire range of the SELECTED units (a
      // focus aid, not wall-to-wall clutter); the per-unit tray toggle latches
      // the same ring for a unit while it's selected.
      {
        const ov = ui.overlays
        const per = ui.rangeUnits || {}
        const sel = ui.selectedIds
        ctx.save()
        ctx.globalAlpha = ui.overlayAlpha // the commander's intensity dial
        const ring = (px: number, py: number, rM: number, stroke: string, fill: string, dash: number[], w = 2) => {
          const rr = rM * view.ppm
          ctx.beginPath()
          ctx.arc(px, py, rr, 0, Math.PI * 2)
          if (fill) { ctx.fillStyle = fill; ctx.fill() }
          ctx.setLineDash(dash)
          ctx.strokeStyle = stroke
          ctx.lineWidth = w
          ctx.stroke()
          ctx.setLineDash([])
          return rr
        }
        for (const u of S.units) {
          if (u.side !== 'friend' || u.strength <= 0) continue
          const type = UNIT_TYPES[u.type]
          const px = w2sX(u.x), py = w2sY(u.y)
          // FIRES: indirect shooters — max range ring + gunline label
          if (ov.fires && type.indirect) {
            const rr = ring(px, py, type.indirect.range,
              '#ff6e46', 'rgba(232,82,60,0.10)', [12, 7], 3)
            if (rr > 46) {
              ctx.font = 'bold 11px Consolas, monospace'
              ctx.textAlign = 'center'
              ctx.fillStyle = '#ffa078'
              ctx.fillText(`${u.label} · ${(type.indirect.range / 1000).toFixed(1)} KM`, px, py - rr - 6)
            }
          }
          // SNSR: dedicated collection — recon sight + SIG DF reach
          if (ov.snsr) {
            if (type.cat === 'RECON') {
              ring(px, py, type.sight, '#6ee6c3', 'rgba(110,220,190,0.07)', [4, 5], 2.2)
            }
            if (type.df) {
              ring(px, py, type.df, '#c896fa', '', [2, 6], 2.2)
            }
          }
          // WPN: direct-fire engagement range, selected units only
          if (type.range && ((ov.wpn && sel.includes(u.id)) || (per[u.id] && sel.includes(u.id)))) {
            ring(px, py, type.range,
              per[u.id] ? '#ffd75a' : '#6eb4ff', 'rgba(90,160,240,0.10)', [5, 4], 2.6)
          }
        }
        // SNSR: airborne footprints — every friendly bird's sensor reach
        if (ov.snsr) {
          for (const d of S.drones) {
            if (d.state === 'rtb') continue
            ring(w2sX(d.x), w2sY(d.y), DRONE_TYPES[d.type].sight,
              '#6ee6c3', 'rgba(110,220,190,0.05)', [3, 6], 1.8)
          }
        }
        ctx.restore()
      }

      // DUSTWUN sites: a downed platoon's LKP, dim like a stale contact —
      // status unknown until somebody secures the ground (recovery.ts)
      for (const site of S.downed) {
        if (site.side !== 'friend') continue
        const age = Math.floor((S.t - site.t) / 60)
        drawUnitSymbol(ctx, w2sX(site.x), w2sY(site.y), {
          side: 'friend', glyph: UNIT_TYPES[site.type].glyph, stale: true,
          label: `${site.label} DUSTWUN ${age}M`, showStrength: false,
        })
      }

      // THE TASK ORGANIZATION, ON THE SHEET, AT THE RIGHT ECHELON.
      //
      // Five platoons in one place drew five overlapping icons and five labels
      // on top of each other, which is unreadable and is also the wrong answer:
      // a battalion commander looking at a company team wants to see A COMPANY
      // TEAM. So a team ROLLS UP into one symbol — the base element's branch
      // with the company echelon bar over it, carrying the team's name, its
      // aggregate strength and how many elements are in it.
      //
      // It EXPANDS when you select it, or when you are zoomed in far enough
      // that the elements are legibly apart. That is the BFT convention and the
      // RTS one: the icon you command at, and the detail you inspect at.
      const rolled = new Set<number>()
      for (const t of S.teams) {
        const mem = t.members
          .map(id => S.units.find(u => u.id === id))
          .filter((u): u is Unit => !!u && u.strength > 0)
        if (mem.length < 2) continue
        const plan = marchPlan(t.id)
        const rank = new Map((plan?.order ?? t.members).map((id, i) => [id, i]))
        const line = mem.slice().sort((a, b) =>
          (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99))
        const head = line[0]!, tail = line[line.length - 1]!
        const picked = mem.some(u => ui.selectedIds.includes(u.id))
        // how far apart the column actually is on screen — a team strung over
        // two kilometres of road at high zoom is not one icon, it is a column
        const spreadPx = Math.hypot(
          w2sX(head.x) - w2sX(tail.x), w2sY(head.y) - w2sY(tail.y))
        const expand = picked || spreadPx > 110

        // AN ELEMENT ON A DIFFERENT DRILL FROM ITS TEAM IS THE EXCEPTION A TOC
        // EXISTS TO NOTICE, and the map is where the commander is looking. It
        // rides the team plate as a mark rather than waiting in a console.
        const split = new Set(mem.map(u => u.roe)).size > 1
          || (!!plan?.roe && mem.some(u => u.roe !== plan.roe))

        ctx.save()
        // THE TIE THROUGH THE COLUMN, in march order, under everything.
        //
        // This was 1 px at 20% alpha, which is to say invisible: a team could be
        // formed, named and given a commander and the sheet looked exactly as it
        // had before. The task organization is the most important structure on
        // this map and it was the faintest thing drawn on it. A grouping the
        // player made is worth as much ink as a road.
        ctx.strokeStyle = picked ? 'rgba(255,214,126,0.75)'
          : expand ? 'rgba(126,200,255,0.5)' : 'rgba(126,200,255,0.34)'
        ctx.lineWidth = picked ? 2.2 : 1.6
        ctx.setLineDash(picked ? [] : [6, 4])
        ctx.beginPath()
        line.forEach((u, i) => {
          const sx = w2sX(u.x), sy = w2sY(u.y)
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy)
        })
        ctx.stroke()
        ctx.setLineDash([])
        ctx.restore()

        if (expand) {
          // THE NAME RIDES THE HEAD OF THE COLUMN, on a plate. Bare text at 78%
          // alpha over hillshade and roads is unreadable exactly where the map
          // is busiest, which is where the units are — so it gets a background,
          // like every label on a real overlay.
          const hx = w2sX(head.x), hy = w2sY(head.y) - 30
          ctx.save()
          ctx.font = '600 10px Inter, system-ui, sans-serif'
          ctx.textAlign = 'left'
          const label = `${t.name} ×${mem.length}`
          const tw = ctx.measureText(label).width
          const pad = 5, dot = split ? 9 : 0
          const bw = tw + pad * 2 + dot, bx = hx - bw / 2
          ctx.fillStyle = picked ? 'rgba(46,38,14,0.92)' : 'rgba(10,20,30,0.82)'
          ctx.strokeStyle = picked ? 'rgba(255,214,126,0.9)' : 'rgba(126,200,255,0.45)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.rect(bx, hy - 8, bw, 14)
          ctx.fill(); ctx.stroke()
          ctx.fillStyle = picked ? '#ffd67e' : 'rgba(160,215,255,0.95)'
          ctx.fillText(label, bx + pad, hy + 2)
          if (split) {
            ctx.fillStyle = '#e0b34e'
            ctx.beginPath()
            ctx.arc(bx + bw - pad - 1, hy - 1, 2.6, 0, Math.PI * 2)
            ctx.fill()
          }
          // the trail is the element everyone else goes firm for
          ctx.strokeStyle = picked ? 'rgba(255,214,126,0.6)' : 'rgba(126,200,255,0.45)'
          ctx.beginPath()
          ctx.arc(w2sX(tail.x), w2sY(tail.y), 13, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
          continue
        }

        // ROLLED UP. One symbol, at the head of the column where the commander
        // is, wearing the BASE element's branch — a team is named for and built
        // around a company, and it is drawn as that company with whatever is
        // cross-attached to it. Strength is the aggregate.
        for (const u of mem) rolled.add(u.id)
        const base = mem.find(u => u.id === t.baseId) ?? head
        const str = mem.reduce((n, u) => n + u.strength, 0) / mem.length
        drawUnitSymbol(ctx, w2sX(head.x), w2sY(head.y), {
          side: 'friend', glyph: UNIT_TYPES[base.type].glyph, echelon: 'co',
          label: `${t.name} ×${mem.length}`,
          strength: str, selected: picked,
          contact: Math.max(...mem.map(contactLevel)),
        })
        if (split) {
          ctx.save()
          ctx.fillStyle = '#e0b34e'
          ctx.beginPath()
          ctx.arc(w2sX(head.x) + 15, w2sY(head.y) - 13, 2.8, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }
      }

      // friendly units (always shown — it's blue force tracking), except the
      // ones currently represented by their team's rolled-up symbol
      for (const u of S.units) {
        if (u.side !== 'friend' || rolled.has(u.id)) continue
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
          // intel-seeded contacts of unidentified composition draw as a "?" —
          // scouts turn them into typed tracks by actually spotting them
          drawUnitSymbol(ctx, w2sX(c.x), w2sY(c.y), {
            side: 'hostile', glyph: c.unknown ? 'unk' : type.glyph, stale: !c.live,
            label: c.unknown ? 'UNK' : c.live ? type.abbr : `LKP ${Math.floor(age / 60)}M`,
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
