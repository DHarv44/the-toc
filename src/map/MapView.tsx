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
  orderMove, orderGroupMove, orderGroupAttack, removeLastWaypoint, removeWaypoint, orderConvoy, orderBridge,
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
import {
  commissionRoute, distToMsr, msrLabel, orderClearRoute, removeMsr,
} from '../domains/control/routes'
import { orderBuildRoad } from '../domains/forces/roadworks'
import { toast } from '../domains/comms/radio'
import { leaveTeam, teamOf } from '../domains/forces/teams'
import { runTaskOrganize } from '../ui/forces/actions'
import { useUI } from '../ui/store'
import { clampView as clamp2d, xform, type View } from './camera'
import { makeFrame } from './frame'
import { drawGrid, drawSubGrid } from './layers/grid'
import { drawGazetteer, drawTowns } from './layers/gazetteer'
import { drawCredit, drawFeatures } from './layers/features'
import { drawMeasures } from './layers/measures'
import { drawBackdrop, drawControlField, drawTerrain } from './layers/terrain'
import {
  drawAmbientDroneRoutes, drawAmbientRoutes, drawMarchTable, drawMsrs,
  drawRuntimeRoads, drawSelectedDroneRoutes, drawSelectedRoutes,
} from './layers/routes'
import { drawDebris, drawHill, drawPontoons, drawStructures } from './layers/places'
import { drawDrones, drawEvacBirds, drawImpacts } from './layers/air'
import { drawRanges } from './layers/ranges'
import { drawDustwun, drawFriendlies, drawHostiles, drawTargeted, drawTeams } from './layers/units'
import { drawCursorReadout, drawMarquee, drawSpreadPreview } from './layers/cursor'
import { drawFireMissionAim, drawPlacement, drawStrikeAim } from './layers/aim'

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

    // The camera lives in map/camera now — the view type, the clamp and the
    // four transforms, which is the first piece of this file that a second pane
    // can use without taking the rest of it (CONSOLE.md step 6).
    const clampView = () =>
      clamp2d(view, canvas, S.map!.WORLD, { x: S.map!.fob.x, y: S.map!.fob.y - 2000 })
    const { w2sX, w2sY, s2wX, s2wY } = xform(view, canvas)

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
    function pickMsr(wx: number, wy: number) {
      const r = 26 / view.ppm
      let best = null as (typeof S.msrs)[number] | null, bd = Infinity
      for (const m of S.msrs) {
        const d = distToMsr(m, wx, wy)
        if (d < r && d < bd) { bd = d; best = m }
      }
      return best
    }

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
        //
        // A unit already IN the selection keeps the selection: the menu's task-org
        // rows act on it (form, attach-with-counts), and collapsing to one unit
        // here was silently making every one of those rows unreachable.
        const fu = pickUnit(wx, wy)
        if (fu) {
          if (!ui.selectedIds.includes(fu.id)) ui.setSelected([fu.id])
          ui.openMenu({ x: mX(e), y: mY(e), unitId: fu.id })
          return
        }

        // issue orders to the current selection: hostile under the cursor = attack,
        // otherwise move. Shift appends a waypoint.
        const sel = selectedFriendlies()
        const selD = selectedDrones()
        if (!sel.length && !selD.length) return
        const enemy = pickEnemy(wx, wy)
        // a formation attack closes in march order (task #59) — one call, one
        // column, assault release at close range; a single element pursues
        if (enemy && sel.length) { orderGroupAttack(sel.map(u => u.id), enemy.id); return }
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
        // the graphic takes the PEN as armed — colour and weight are the
        // author's choice, remembered until changed (HUD's style row)
        const pen = (m: ReturnType<typeof addMeasure>) => {
          if (!m) return
          if (ui.markStyle.color) m.color = ui.markStyle.color
          m.weight = ui.markStyle.weight
          toast(`${measureLabel(m)} ON THE GRAPHIC`)
        }
        if (isLine(kind)) {
          if (!wasDown) return
          const ax = s2wX(wasDown.x), ay = s2wY(wasDown.y)
          if (Math.hypot(wx - ax, wy - ay) > 60) {
            pen(addMeasure(kind, [{ x: ax, y: ay }, { x: wx, y: wy }]))
          }
        } else {
          pen(addMeasure(kind, [{ x: wx, y: wy }]))
        }
        return
      }

      // COMMISSIONING AN MSR: drag start → end and the ROUTER solves it along
      // the real roads — you approve a solved route, you never freehand one.
      // Click an existing route to decommission it. (domains/control/routes)
      if (ui.mode === 'msr') {
        lineDrag = null
        const hit = pickMsr(wx, wy)
        if (hit) {
          removeMsr(hit.id)
          toast(`${msrLabel(hit)} DECOMMISSIONED`)
          return
        }
        if (!wasDown) return
        const ax = s2wX(wasDown.x), ay = s2wY(wasDown.y)
        if (Math.hypot(wx - ax, wy - ay) > 200) {
          const r = commissionRoute({ x: ax, y: ay }, { x: wx, y: wy })
          if (!r) toast('NO ROAD ROUTE BETWEEN THOSE POINTS')
        }
        return
      }
      // ROUTE CLEARANCE: click the route the selected engineer element sweeps
      if (ui.mode === 'clearroute') {
        const hit = pickMsr(wx, wy)
        if (!hit) return
        const eng = selectedFriendlies().find(u => UNIT_TYPES[u.type]?.eod)
        if (!eng) { toast('SELECT AN ENGINEER ELEMENT FIRST'); return }
        orderClearRoute(eng.id, hit.id)
        useUI.setState({ mode: 'select' })
        return
      }
      // ROAD BUILDING: click where the new road should reach — the selected
      // engineer element crawls a dry planned line there, leaving real road
      // behind it as it works (domains/forces/roadworks)
      if (ui.mode === 'roadbuild') {
        const eng = selectedFriendlies().find(u => UNIT_TYPES[u.type]?.roadworks)
        if (!eng) { toast('SELECT AN ENGINEER ELEMENT FIRST'); return }
        orderBuildRoad(eng.id, wx, wy)
        useUI.setState({ mode: 'select' })
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
        runTaskOrganize(sel.map(u => u.id))
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
      const { night, sat, overlayAlpha, selectedIds } = useUI.getState()
      if (sat) kickSat()
      const W = canvas.width, H = canvas.height
      // EVERYTHING A PASS NEEDS, BUILT ONCE (CONSOLE.md step 6). The layers
      // that have moved out of this effect take this instead of closing over
      // the effect's locals; the ones still in here go on using the locals
      // until their turn comes.
      const frame = makeFrame({
        ctx, view, xf: { w2sX, w2sY, s2wX, s2wY }, canvas,
        world: S.map!.WORLD, night, alpha: overlayAlpha, sel: new Set(selectedIds),
      })
      // off-map backdrop: shows wherever the square map doesn't fill the viewport.
      // Mirrors the splash screen (radial wash + faint grid) so fit-to-screen reads
      // as a framed view rather than a clipped one.
      const bg = ctx.createRadialGradient(W * 0.5, H * 0.3, 0, W * 0.5, H * 0.3, Math.max(W, H) * 0.8)
      bg.addColorStop(0, night ? '#232427' : '#2f3033')
      // THE GROUND is a layer — map/layers/terrain. Backdrop, then the sheet or
      // the imagery over it and the AO's edge, then the campaign control field.
      drawBackdrop(frame)
      const showSat = drawTerrain(frame, {
        sheet: terrainLayer, sat: satLayer, patch: satPatch, satOn: sat, kickPatch,
      })
      drawControlField(frame)

      // THE GRATICULE is a layer now — map/layers/grid, drawn from the frame
      // built above. Same two passes in the same order: the 100 m mesh under
      // the kilometre lines.
      drawSubGrid(frame)
      drawGrid(frame)

      // THE NAMES ARE A LAYER — map/layers/gazetteer. The sim's towns first,
      // then everything else the ground knows, in the same order as before.
      drawTowns(frame)
      drawGazetteer(frame, packLabels)

      // THE SHEET'S OWN MARKINGS are a layer — map/layers/features. The credit
      // line, then the named terrain and infrastructure, in the same order.
      drawCredit(frame, attribution, showSat, IMAGERY_CREDIT)
      drawFeatures(frame)
      ctx.textAlign = 'left'

      const ui = useUI.getState()

      // hover cursor
      const hover = pickAny(s2wX(mouse.x), s2wY(mouse.y))
      canvas.style.cursor = hover ? 'pointer' : 'crosshair'

      // WHAT THE ARMED MODE IS ABOUT TO DO is a layer — map/layers/aim. Strike
      // reach, then whatever the current mode says is allowed where, then the
      // call-for-fire picture when a mission is being placed.
      drawStrikeAim(frame, selectedDrones())
      drawPlacement(frame, ui.mode, selectedFriendlies())
      if (ui.mode === 'target') drawFireMissionAim(frame, mouse.x, mouse.y)

      // ROUTES are a layer — map/layers/routes. The faint traces first, so the
      // command graphics and the control measures draw over them.
      drawRuntimeRoads(frame)   // spurs/pontoons/engineer roads: real ground first
      drawMsrs(frame)
      drawAmbientRoutes(frame)
      // CONTROL MEASURES are a layer — map/layers/measures. Still drawn here,
      // under the units and over the terrain, which is the whole convention.
      drawMeasures(frame)

      drawMarchTable(frame)
      drawAmbientDroneRoutes(frame)

      drawSelectedRoutes(frame, selectedFriendlies())
      drawSelectedDroneRoutes(frame, selectedDrones())

      // THE SHEET'S FURNITURE is a layer — map/layers/places. Nothing here
      // moves: the objective, the bridges, higher's CP, the authored graphics,
      // the installations, and what the fight has left on the ground.
      drawHill(frame)
      drawPontoons(frame)
      drawStructures(frame)
      drawDebris(frame)

      // THE AIR PICTURE is a layer — map/layers/air. Impacts, then the aircraft
      // with their orbits, locks and overwatch tethers.
      drawImpacts(frame)
      drawDrones(frame, new Set(ui.feeds.map(fd => fd.droneId).filter((x): x is number => x != null)))
      drawEvacBirds(frame)

      // THE RANGE OVERLAYS are a layer — map/layers/ranges.
      drawRanges(frame, { ...ui.overlays, per: ui.rangeUnits || {} })

      // THE SYMBOLOGY is a layer — map/layers/units. DUSTWUN sites first, then
      // the task organization, then whatever a rolled-up team is not standing
      // for, then the enemy picture and the attack designations.
      drawDustwun(frame)
      const rolled = drawTeams(frame)
      drawFriendlies(frame, rolled)
      drawHostiles(frame)
      drawTargeted(frame)

      // WHAT THE POINTER IS DOING is the last layer — map/layers/cursor. It is
      // the only one that draws INPUT rather than the world, which is exactly
      // why a read-only pane mounts none of it.
      drawSpreadPreview(frame, lineDrag, useUI.getState().selectedIds.length,
        ui.cmdMode === 'attack')
      drawMarquee(frame, marquee)
      drawCursorReadout(frame, mouse.x, mouse.y)
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
