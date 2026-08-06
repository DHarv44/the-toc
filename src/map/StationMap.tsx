// A TEAM'S OWN PANE — the same ground, the same symbology, locked on them.
//
// THIS IS WHAT THE DECOMPOSITION WAS FOR (CONSOLE.md step 6). Until the passes
// came out of map/MapView's mount effect, a second map pane could use no part
// of it without taking all of it — the terrain bake, every symbol pass, the
// picking, the input handlers — so the station carried a labelled empty box for
// three steps. It is a LAYER LIST now, and a short one:
//
//   terrain · grid · measures · routes · places · teams · units
//
// and no input module, which is most of what "read-only" means. There is no
// pick, no marquee, no drag, no keys. You look at it; the rows below it do the
// commanding, and the COP keeps right-click-to-move because there has to be
// exactly one place that verb lives.
//
// THE CAMERA IS NOT YOURS. It frames the team and follows them, because a pane
// that is about one grouping should never need panning to find that grouping —
// and a locked camera is also why this costs nothing to keep open: it draws one
// blit of the SHARED sheet (map/packRender bakes it once per world, not once
// per pane) and a couple of dozen symbols.
import { useEffect, useRef } from 'react'
import { S } from '../engine/state'
import type { Unit } from '../engine/GameState'
import { packLayerFor } from './packRender'
import { clampView, xform, type View } from './camera'
import { makeFrame } from './frame'
import { drawBackdrop, drawTerrain } from './layers/terrain'
import { drawGrid } from './layers/grid'
import { drawMeasures } from './layers/measures'
import { drawAmbientRoutes, drawSelectedRoutes } from './layers/routes'
import { drawStructures } from './layers/places'
import { drawFriendlies, drawHostiles, drawTeams } from './layers/units'
import { useUI } from '../ui/store'

/** How much ground to show around the team: their own spread plus a margin, and
 *  never so tight that a halted column fills the pane. */
const SPAN_MIN = 1500

export default function StationMap({ members }: { members: Unit[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  // the member ids are read fresh every frame from this ref — the effect mounts
  // once, and a team that gains or loses an element must not need a remount
  const live = useRef(members)
  live.current = members

  useEffect(() => {
    const cv = ref.current
    if (!cv || !S.map?.ground) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const sheet = packLayerFor(S.map, S.map.ground)
    const view: View = { cx: S.map.WORLD / 2, cy: S.map.WORLD / 2, ppm: 0.05 }
    const xf = xform(view, cv)
    let raf = 0

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const w = cv.clientWidth, h = cv.clientHeight
      if (w < 2 || h < 2) return                       // hidden pane: skip the frame
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h }

      const mem = live.current.filter(u => u.strength > 0)
      if (!mem.length) return
      // FRAME THE TEAM. Their bounding box plus a margin, so a column strung out
      // on a road zooms out on its own and a laager fills the pane at SPAN_MIN.
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (const u of mem) {
        x0 = Math.min(x0, u.x); x1 = Math.max(x1, u.x)
        y0 = Math.min(y0, u.y); y1 = Math.max(y1, u.y)
      }
      const span = Math.max(x1 - x0, y1 - y0, SPAN_MIN) * 1.6
      view.cx = (x0 + x1) / 2
      view.cy = (y0 + y1) / 2
      view.ppm = Math.max(0.004, Math.min(w, h) / span)
      clampView(view, cv, S.map!.WORLD, { x: view.cx, y: view.cy })

      const ui = useUI.getState()
      const frame = makeFrame({
        ctx, view, xf, canvas: cv, world: S.map!.WORLD,
        night: ui.night, alpha: ui.overlayAlpha, sel: new Set(ui.selectedIds),
      })

      // THE LIST. Same passes, same order as the COP — a station showing the
      // same ground a different way would be a second picture to reconcile.
      drawBackdrop(frame)
      drawTerrain(frame, { sheet, sat: null, patch: null, satOn: false, kickPatch: () => {} })
      drawGrid(frame)
      drawMeasures(frame)
      drawAmbientRoutes(frame)
      drawSelectedRoutes(frame, mem)
      drawStructures(frame)
      const rolled = drawTeams(frame)
      drawFriendlies(frame, rolled)
      drawHostiles(frame)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <canvas ref={ref} style={{
      display: 'block', width: '100%', height: '100%',
      // NOT a crosshair: this pane takes no orders, and a cursor that promises
      // otherwise is a lie the player only discovers by trying
      cursor: 'default',
    }} />
  )
}
