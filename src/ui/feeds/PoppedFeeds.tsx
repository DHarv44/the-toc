// THE FEEDS THAT HAVE LEFT THE BUILDING.
//
// CONSOLE.md step 5, first consumer. Mounted by App rather than by the FEEDS
// rail, because a popped-out feed must survive the rail being SHUT — the whole
// point is that the picture lives on another screen while the commander works
// the map on this one.
//
// It shares the JS context with the opener, so the feed in the other window is
// reading the same `S` and the same store as everything else. No sync layer, no
// serialisation, no second copy of the world.
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
        <PopOut key={f.id} title={`TOC · FEED ${i + 1}`} w={760} h={520}
          onClose={() => ui.setFeed(f.id, { popped: false })}>
          {/* the other document needs its own provider — Mantine's context does
              not cross the portal by itself, and the theme is what makes this
              window look like the console it came out of */}
          <MantineProvider theme={theme} defaultColorScheme="dark">
            {/* MAXIMISED, ALWAYS. A window whose entire job is to hold one
                picture should not also contain a smaller draggable copy of that
                picture with empty space around it. */}
            <FeedWindow feed={{ ...f, winMode: 'max' }} index={i} docked />
          </MantineProvider>
        </PopOut>
      ))}
    </>
  )
}
