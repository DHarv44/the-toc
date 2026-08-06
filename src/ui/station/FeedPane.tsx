// THE TEAM'S EYES — its supporting feed, paned into the station.
//
// One column, one fight: the team's map above, the team's sensor picture
// below it. The pane is a MIRROR, never a second GL context — the rule
// pop-out taught us (a GL context's lifetime must belong to the main
// document; ui/feeds/PoppedFeeds has the full story) applies here for a
// different reason: stations multiply, four feeds already render in the
// rail, and every pane being a fresh 3D scene is how a TOC becomes a slide
// show. The live DroneView stays in the FEEDS rail (kept alive off-screen by
// FeedLifeSupport when the rail is shut) and this blits its picture.
//
// PICTURE ONLY, deliberately. The sensor controls stay on the rail's feed —
// a station column is dense already, and the pane's job is situational
// awareness, not a second cockpit. Clicking the pane focuses the real feed.
import { useState } from 'react'
import { useUI } from '../store'
import { S } from '../../engine/state'
import type { Unit } from '../../engine/GameState'
import FeedMirror from '../feeds/FeedMirror'
import { FZ } from '../styles'

const UI = 'Inter, "Segoe UI", system-ui, sans-serif'

export default function FeedPane({ members }: { members: Unit[] }) {
  const ui = useUI()
  const [pick, setPick] = useState<number | null>(null)
  const ids = new Set(members.map(u => u.id))
  // the team's birds: launched by a member, or flying FOLLOW on one
  const drones = S.drones.filter(d =>
    (d.launcherId != null && ids.has(d.launcherId))
    || (d.followId != null && ids.has(d.followId)))
  if (!drones.length) return null

  const feeds = ui.feeds.filter(f => f.droneId != null && drones.some(d => d.id === f.droneId))
  // a team bird with no feed open yet: the pane is the button that opens one
  const unfed = drones.filter(d => !ui.feeds.some(f => f.droneId === d.id))
  const sel = feeds.find(f => f.id === pick) ?? feeds[0]

  return (
    <div style={{ flex: '0 0 auto', margin: '6px 8px 2px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 2px 3px' }}>
        <span style={{ fontFamily: UI, fontSize: FZ.hint, letterSpacing: 1.2, color: '#3d4f60' }}>
          TEAM FEED
        </span>
        {/* which bird, when the team flies more than one */}
        {feeds.length > 1 && feeds.map(f => {
          const d = S.drones.find(x => x.id === f.droneId)
          const on = sel?.id === f.id
          return (
            <button key={f.id} onClick={() => setPick(f.id)}
              style={{
                fontFamily: UI, fontSize: 9, letterSpacing: 1, cursor: 'pointer',
                padding: '1px 6px', borderRadius: 2,
                color: on ? '#9fd0f5' : '#54708a',
                background: on ? '#14212e' : 'transparent',
                border: `1px solid ${on ? '#2a4a66' : '#22303e'}`,
              }}>{d?.label ?? `FEED ${f.id}`}</button>
          )
        })}
        <div style={{ flex: 1, height: 1, background: '#16222e' }} />
      </div>
      {sel ? (
        <div
          title="The live feed and its controls are in the FEEDS rail — click to focus it"
          onClick={() => { if (sel.droneId != null) ui.showDrone(sel.droneId) }}
          style={{
            aspectRatio: '16 / 9', border: '1px solid #2a3a48', borderRadius: 3,
            overflow: 'hidden', background: '#020304', cursor: 'pointer',
          }}>
          <FeedMirror feedId={sel.id} />
        </div>
      ) : (
        // birds up, no feed open — one row per bird, click opens its feed
        unfed.map(d => (
          <button key={d.id} onClick={() => ui.showDrone(d.id)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
              fontFamily: UI, fontSize: FZ.label, letterSpacing: 0.5,
              padding: '6px 8px', marginBottom: 3, borderRadius: 3,
              color: '#9ab8d0', background: 'rgba(14,20,27,0.6)', border: '1px solid #22303e',
            }}>
            ▶ {d.label} AIRBORNE — OPEN FEED
          </button>
        ))
      )}
    </div>
  )
}
