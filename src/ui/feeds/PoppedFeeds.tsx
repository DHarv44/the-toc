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
import { MantineProvider } from '@mantine/core'
import { useUI } from '../store'
import { theme } from '../theme'
import PopOut from '../shell/PopOut'
import FeedWindow from './FeedWindow'

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
          {/* THE WHOLE FEED, not a bare picture: header, readouts, reticles,
              sensor modes, the lot. All of that is DOM and travels fine — the
              only thing that could not come is the GL context, and mirror={}
              swaps that one part for a copy of the live view. */}
          <MantineProvider theme={theme} defaultColorScheme="dark">
            <div style={{ position: 'absolute', inset: 0, background: '#020304' }}>
              <FeedWindow feed={{ ...f, winMode: 'max' }} index={i} docked mirror />
            </div>
          </MantineProvider>
        </PopOut>
      ))}
    </>
  )
}
