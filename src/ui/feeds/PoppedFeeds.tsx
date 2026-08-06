// A FEED ON THE SECOND SCREEN — AS A MIRROR, NOT AS A SECOND VIEW.
//
// The obvious build was to render the feed into the popped window. It crashed
// the game every time that window was closed, and no amount of sequencing the
// teardown fixed it: unmount first, defer the remount, force the context loss
// synchronously — all still died. The reason is not the order, it is the
// OWNERSHIP. A WebGL context is a GPU-process resource with a compositor
// surface behind it, and putting one in a document whose lifetime belongs to a
// window the user can close means handing the GPU process a use-after-free.
// That surfaces as STATUS_ACCESS_VIOLATION: the renderer dying, not an
// exception anyone can catch.
//
// A station pops out safely because it is a 2D canvas — memory the page owns,
// which dies with its document and harms nothing.
//
// So the feed does not go to the other screen. Its PICTURE does. The GL context
// stays in this document where its lifetime is ours, and the popped window
// holds a plain 2D canvas that copies the live one every frame. Same-origin
// drawImage from another document's canvas is allowed, and it is cheap: one
// blit of an image already on the GPU.
//
// What the other window loses is the controls — they stay on the docked feed,
// which is where the commander is anyway. What it gains is that closing it
// destroys a 2D canvas and nothing else.
import { useEffect, useRef } from 'react'
import { useUI } from '../store'
import PopOut from '../shell/PopOut'

/** Copies one docked feed's canvas into this window, every frame. */
function FeedMirror({ feedId }: { feedId: number }) {
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
      // found blew a 28 px unit symbol up to fill the window. Found fresh each
      // frame, because the docked feed remounts when its drone changes and a
      // held reference would point at a canvas nobody draws on any more.
      const src = document.querySelector<HTMLCanvasElement>(`[data-feed="${feedId}"] [data-feed-view] canvas`)
      const w = dst.clientWidth, h = dst.clientHeight
      if (w < 2 || h < 2) return
      if (dst.width !== w || dst.height !== h) { dst.width = w; dst.height = h }
      if (!src || !src.width || !src.height) {
        ctx.fillStyle = '#020304'
        ctx.fillRect(0, 0, w, h)
        return
      }
      // letterbox: the sensor's aspect is the sensor's, not the window's
      const s = Math.min(w / src.width, h / src.height)
      const dw = src.width * s, dh = src.height * s
      ctx.fillStyle = '#020304'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [feedId])
  return <canvas ref={ref} style={{ display: 'block', width: '100%', height: '100%' }} />
}

export default function PoppedFeeds() {
  useUI(s => s.tick)
  const ui = useUI()
  const out = ui.feeds.filter(f => f.popped)
  if (!out.length) return null
  return (
    <>
      {out.map((f, i) => (
        <PopOut key={f.id} title={`TOC · FEED ${i + 1}`} w={860} h={520}
          onClose={() => ui.setFeed(f.id, { popped: false })}>
          {/* no Mantine, no controls, no context — a black page and a picture.
              Nothing in this window can fail in a way that reaches the game. */}
          <div style={{ position: 'absolute', inset: 0, background: '#020304' }}>
            <FeedMirror feedId={f.id} />
          </div>
        </PopOut>
      ))}
    </>
  )
}
