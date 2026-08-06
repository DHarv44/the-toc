// THE CAMERA — where the map is looking, and how that turns into pixels.
//
// FIRST CUT OF THE MONOLITH (CONSOLE.md step 6). map/MapView is one mount
// effect with every pass, transform, pick and input handler in closures inside
// it, which is why a second pane — the team station's map — can use no part of
// it without taking all of it. This is the piece with the fewest ties: a view
// is three numbers, clamping is arithmetic against the world's edges, and the
// transforms are four one-liners. None of it knows what a unit is.
//
// It changes no behaviour. The functions are the ones that were in the effect,
// with `canvas` passed instead of captured — which is exactly the difference
// between "the map's transform" and "a transform any surface can have".
import type { Vec2 } from '../world/WorldMap'

/** WHERE THE MAP IS LOOKING: a world point under the middle of the pane, and
 *  the scale. Deliberately three plain numbers — the view is mutated in place
 *  every frame by pan, zoom and camera lock, and a class would only be a place
 *  to hide that. */
export interface View {
  cx: number
  cy: number
  ppm: number   // pixels per metre
}

/** WORLD ↔ SCREEN for one pane. Reads `canvas.width` on every call rather than
 *  closing over it: the canvas is resized every frame to whatever the rails
 *  have left it, and a transform holding a stale width draws the whole picture
 *  in the wrong place for exactly one frame after every panel opens. */
export interface Xform {
  w2sX: (x: number) => number
  w2sY: (y: number) => number
  s2wX: (px: number) => number
  s2wY: (py: number) => number
}

export const xform = (view: View, cv: HTMLCanvasElement): Xform => ({
  w2sX: (x) => (x - view.cx) * view.ppm + cv.width / 2,
  w2sY: (y) => (y - view.cy) * view.ppm + cv.height / 2,
  s2wX: (px) => (px - cv.width / 2) / view.ppm + view.cx,
  s2wY: (py) => (py - cv.height / 2) / view.ppm + view.cy,
})

/** KEEP THE PANE ON THE MAP.
 *
 *  The zoom floor is "the whole square map fits", so it letterboxes on the
 *  longer axis, where the off-map backdrop shows. On an axis the map no longer
 *  fills, the view CENTRES; on one it does, the view is clamped so no gap can
 *  open at the edge.
 *
 *  `home` is where a view that has gone non-finite is put back to — which does
 *  happen, because ppm is divided by in a dozen places and a zero gets in
 *  eventually. Recovering to the command post is better than a blank canvas. */
export function clampView(view: View, cv: HTMLCanvasElement, world: number, home: Vec2): void {
  if (cv.width < 2 || cv.height < 2) return   // hidden pane: nothing to clamp to
  if (!isFinite(view.cx) || !isFinite(view.cy) || !isFinite(view.ppm) || view.ppm <= 0) {
    view.cx = home.x; view.cy = home.y
    view.ppm = Math.max(0.02, Math.min(cv.width, cv.height) / 9000)
  }
  const minPpm = Math.min(cv.width / world, cv.height / world)
  view.ppm = Math.max(minPpm, Math.min(1.2, view.ppm))
  const hw = cv.width / 2 / view.ppm
  const hh = cv.height / 2 / view.ppm
  view.cx = hw * 2 >= world ? world / 2 : Math.max(hw, Math.min(world - hw, view.cx))
  view.cy = hh * 2 >= world ? world / 2 : Math.max(hh, Math.min(world - hh, view.cy))
}
