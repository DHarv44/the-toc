// THE SENSOR PICTURE, COPIED — the one part of a feed that cannot travel to
// another window.
//
// Everything else about a feed is DOM: the header, the readouts, the reticles,
// the controls. All of that renders in a popped window perfectly happily. The
// PICTURE is WebGL, and a GL context in a document the user can close is what
// killed the game (see ui/feeds/PoppedFeeds).
//
// So the live view stays in the main document and this copies it, frame by
// frame, into a plain 2D canvas. Same-origin drawImage from another document's
// canvas is allowed, and it is one blit of an image already on the GPU.
import { useEffect, useRef } from 'react'

export default function FeedMirror({ feedId }: { feedId: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const dst = ref.current
    if (!dst) return
    const ctx = dst.getContext('2d')
    if (!ctx) return
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      // THE SENSOR CANVAS, NAMED. A feed holds several canvases — the 2525
      // icons in its own header are canvases too — so taking the first one
      // found blew a 28 px unit symbol up to fill the window. Found fresh every
      // frame, because the docked feed remounts when its drone changes and a
      // held reference would point at a canvas nobody draws on any more.
      const src = document.querySelector<HTMLCanvasElement>(
        `[data-feed="${feedId}"] [data-feed-view] canvas`)
      const w = dst.clientWidth, h = dst.clientHeight
      if (w < 2 || h < 2) return
      if (dst.width !== w || dst.height !== h) { dst.width = w; dst.height = h }
      ctx.fillStyle = '#020304'
      ctx.fillRect(0, 0, w, h)
      if (!src?.width || !src.height) return
      // letterboxed: the sensor's aspect is the sensor's, not the window's
      const s = Math.min(w / src.width, h / src.height)
      const dw = src.width * s, dh = src.height * s
      ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [feedId])
  return <canvas ref={ref} style={{ display: 'block', width: '100%', height: '100%' }} />
}
