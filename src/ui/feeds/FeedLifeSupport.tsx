// LIFE SUPPORT FOR MIRRORED FEEDS.
//
// A mirror (ui/feeds/FeedMirror) copies the LIVE sensor canvas out of the
// docked feed — and the docked feed lives in the FEEDS rail, so shutting that
// rail unmounted it and every mirror of it went black. First a popped window
// needed the source kept alive (this logic was born in PoppedFeeds); then the
// team stations grew feed panes and needed exactly the same thing, so the
// keep-alive lives here once, for every mirror consumer there will ever be.
//
// When the rail is shut, any feed a consumer is mirroring — popped to another
// window, or paned into an open team station — renders here instead, parked
// OFF-SCREEN. Off-screen, not hidden: display:none or visibility:hidden stops
// the browser animating the canvas at all, and a source that is not drawing
// is the same black mirror by another route.
import { useUI } from '../store'
import { S } from '../../engine/state'
import { teamById, teamUnits } from '../../domains/forces/teams'
import FeedWindow from './FeedWindow'

export default function FeedLifeSupport() {
  useUI(s => s.tick)
  const ui = useUI()
  if (ui.feedsOpen) return null
  // every unit standing in an OPEN station's team — their birds' feeds are
  // being mirrored by station panes right now
  const memberIds = new Set<number>()
  for (const tid of ui.stations) {
    const t = teamById(tid)
    if (t) for (const u of teamUnits(t)) memberIds.add(u.id)
  }
  const mirrored = (droneId: number | null): boolean => {
    if (droneId == null) return false
    const d = S.drones.find(x => x.id === droneId)
    if (!d) return false
    return (d.launcherId != null && memberIds.has(d.launcherId))
      || (d.followId != null && memberIds.has(d.followId))
  }
  const need = ui.feeds.filter(f => f.popped || mirrored(f.droneId))
  if (!need.length) return null
  return (
    <div aria-hidden style={{
      position: 'fixed', left: -10000, top: 0, width: 720, height: 405,
      pointerEvents: 'none',
    }}>
      {need.map((f, i) => <FeedWindow key={f.id} feed={{ ...f, winMode: 'max' }} index={i} docked />)}
    </div>
  )
}
