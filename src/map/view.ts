// Map-view utility: center (and optionally zoom) the COP on a world point.
// ONE way to move the camera — the rails, net panel, and tutorial all use
// this instead of poking window.__view themselves. The live view object is
// shared with MapView via window.__view; mutations take effect next frame.
import type { Vec2 } from '../world/WorldMap'

interface View { cx: number; cy: number; ppm: number }
const view = (): View | null => (window as unknown as { __view?: View }).__view ?? null

// pixels-per-meter that fits `spanMeters` across the viewport's short side
export function zoomFor(spanMeters: number): number {
  const vpMin = Math.min(window.innerWidth || 1280, window.innerHeight || 720)
  return Math.max(0.02, vpMin / spanMeters)
}

// Center the view on a point. No opts = center only (current zoom kept).
// `zoom` sets an exact pixels-per-meter; `minZoom` only zooms IN if the view
// is currently wider than that (never zooms the player back out).
export function centerView(p: Vec2, opts?: { zoom?: number; minZoom?: number }): void {
  const v = view()
  if (!v) return
  v.cx = p.x
  v.cy = p.y
  if (opts?.zoom != null) v.ppm = opts.zoom
  else if (opts?.minZoom != null && v.ppm < opts.minZoom) v.ppm = opts.minZoom
}
