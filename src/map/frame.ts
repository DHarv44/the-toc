// ONE FRAME'S WORTH OF CONTEXT — everything a drawing pass needs, built once
// per frame and handed to each.
//
// CONSOLE.md step 6. The passes in map/MapView are closures inside one mount
// effect, so each of them silently depends on a dozen locals: the canvas, the
// view, four transforms, whether it is night, what is selected. A pass that
// takes those as an ARGUMENT can live in its own file and be drawn by any
// surface — which is the whole point, because the team station needs a subset
// of these same passes over the same ground.
//
// It is a plain object rebuilt every frame rather than a class or a context:
// the view mutates in place, the canvas resizes under it, and the honest way
// to describe that is "here is what is true right now".
import type { View, Xform } from './camera'

export interface Frame extends Xform {
  ctx: CanvasRenderingContext2D
  view: View
  /** canvas size in device pixels — the canvas is 1:1 with CSS pixels here */
  w: number
  h: number
  /** the square world's side, in metres */
  world: number
  night: boolean
  /** the commander's overlay intensity, for passes that draw over the ground */
  alpha: number
  /** selected ids — units, drones and structures share one id space */
  sel: Set<number>
}

export function makeFrame(o: {
  ctx: CanvasRenderingContext2D
  view: View
  xf: Xform
  canvas: HTMLCanvasElement
  world: number
  night: boolean
  alpha: number
  sel: Set<number>
}): Frame {
  return {
    ctx: o.ctx,
    view: o.view,
    w: o.canvas.width,
    h: o.canvas.height,
    world: o.world,
    night: o.night,
    alpha: o.alpha,
    sel: o.sel,
    ...o.xf,
  }
}
