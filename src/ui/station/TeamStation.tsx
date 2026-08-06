// A TEAM'S STATION — the column you command one grouping from.
//
// THE CUT THIS IS THE OTHER HALF OF. The dock at the bottom of the screen
// commands ELEMENTS: a platoon digs in, mounts, calls for fire. A team is a
// COLUMN, and the things that belong to a column are exactly the things that
// belong to no platoon in it — the order of march, the interval, who answers
// for the whole of it. Those were spread between a rail that listed teams, a
// staff console that owned the movement order, and a dock that grew a special
// case whenever the selection happened to be a whole team. This is their home.
//
// WHY A FULL-HEIGHT COLUMN AND NOT A PANE. A team is read top to bottom: who
// it is, where it is, in what order it is driving, on what drill, and what it
// has said on the net. That is a list, and a list wants height. Stacking two
// teams as half-height panes would give each of them a scrollbar to say the
// same things in.
//
// AND IT IS NOT A SECOND MAP. The station's map is READ-ONLY — you look at it,
// and the rows below it do the commanding. The COP keeps right-click-to-move,
// because there has to be exactly one place that verb lives.
import { useUI } from '../store'
import { S } from '../../engine/state'
import type { Roe, WeaponsControl } from '../../engine/GameState'
import { orderRoe, orderWeapons } from '../../domains/forces/orders'
import { teamById, teamCdr, teamUnits } from '../../domains/forces/teams'
import { MARCH_INTERVAL, marchMoving, marchPlan, setMarchOrder } from '../../domains/movement/march'
import { centerView } from '../../map/view'
import { FZ, NET_COLORS, fmtClock } from '../styles'
import { Pick, one } from '../tray/controls'
import MarchList from '../forces/MarchList'

const UI = 'Inter, "Segoe UI", system-ui, sans-serif'

/** A captioned block. The station is four of these stacked, and the captions
 *  are what let the eye jump to the one it wants without reading the rest. */
function Section({ label, note, children, grow }: {
  label: string
  note?: string
  children: React.ReactNode
  grow?: boolean
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', minHeight: 0,
      ...(grow ? { flex: 1 } : { flex: '0 0 auto' }),
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 6, padding: '6px 10px 3px',
        flex: '0 0 auto',
      }}>
        <span style={{
          fontFamily: UI, fontSize: FZ.hint, letterSpacing: 1.2, color: '#3d4f60',
        }}>{label}</span>
        {note && (
          <span style={{ fontFamily: UI, fontSize: FZ.hint, color: '#2f4152' }}>{note}</span>
        )}
        <div style={{ flex: 1, height: 1, background: '#16222e' }} />
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  )
}

export default function TeamStation({ teamId }: { teamId: number }) {
  const ui = useUI()
  const team = teamById(teamId)
  // a team that has been destroyed or disbanded takes its column with it
  if (!team) return null
  const units = teamUnits(team)
  if (!units.length) return null

  const cdr = teamCdr(team)
  const plan = marchPlan(team.id)
  const str = Math.round(units.reduce((n, u) => n + u.strength, 0) / units.length)
  const contact = units.some(u => u.targetId || u.breaking)
  const state = contact ? { text: 'IN CONTACT', tone: '#ff9e6a' }
    : marchMoving(team.id) ? { text: 'UNDER WAY', tone: '#8fb0c8' }
    : units.some(u => u.posture === 'dig') ? { text: 'FIRM', tone: '#7ec87e' }
    : { text: 'HALTED', tone: '#6d7f90' }
  const held = units.every(u => ui.selectedIds.includes(u.id))
    && ui.selectedIds.length === units.length

  const centre = () => centerView({
    x: units.reduce((n, u) => n + u.x, 0) / units.length,
    y: units.reduce((n, u) => n + u.y, 0) / units.length,
  })

  // THE INBOARD EDGE IS THE ONE YOU DRAG, because it is the edge whose position
  // the commander is actually trading against the map.
  const startResize = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    const startX = e.clientX, startW = ui.stationW
    const move = (ev: PointerEvent) => ui.setStationW(startW - (ev.clientX - startX))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // THE TEAM'S OWN TRAFFIC. Everything it has said, and everything its elements
  // have said, and nothing anybody else has — which is the whole reason to have
  // it here rather than sending the commander to the battalion net to find it.
  const calls = new Set([team.name, ...units.map(u => u.label)])
  const log = S.radio.filter(e => calls.has(e.callsign)).slice(-60).reverse()

  const icon = (glyph: string, title: string, on: () => void) => (
    <button onClick={on} title={title} style={{
      flex: '0 0 auto', width: 22, height: 20, cursor: 'pointer', borderRadius: 2,
      border: '1px solid #22303d', background: 'rgba(18,26,34,0.9)', color: '#8fb0c8',
      fontFamily: 'inherit', fontSize: FZ.label, lineHeight: 1, padding: 0,
    }}>{glyph}</button>
  )

  return (
    <div style={{
      flex: '0 0 auto', width: ui.stationW, position: 'relative',
      display: 'flex', flexDirection: 'column', minHeight: 0,
      background: 'rgba(10,14,18,0.97)', borderLeft: '1px solid #22303d',
      fontFamily: 'Consolas, "Courier New", monospace', color: '#c8d8e8',
    }}>
      {/* WHO THIS IS — and the way to take hold of them. A panel about a team
          that cannot select the team is the dead end the FORCES rail had. */}
      <div style={{
        flex: '0 0 auto', padding: '6px 8px 7px', borderBottom: '1px solid #1e2c3a',
        background: held ? 'rgba(22,48,74,0.55)' : 'rgba(14,20,27,0.9)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => ui.setSelected(units.map(u => u.id))}
            onDoubleClick={() => { ui.setSelected(units.map(u => u.id)); centre() }}
            title="Command this team — select every element in it (double-click to go there)"
            style={{
              flex: 1, minWidth: 0, textAlign: 'left', cursor: 'pointer', padding: 0,
              background: 'none', border: 'none', fontFamily: UI,
              fontSize: FZ.item, fontWeight: 700, letterSpacing: 0.6,
              color: held ? '#dceeff' : '#9fc4e0',
              overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
            }}>{team.name}</button>
          {icon('⌖', 'Centre the map on this team', centre)}
          {icon('✕', 'Close this station', () => ui.closeStation(team.id))}
        </div>
        <div style={{ fontFamily: UI, fontSize: FZ.hint, color: '#6d8296', marginTop: 2 }}>
          {units.length} ELEMENTS · <span style={{
            color: str >= 85 ? '#6d8296' : str >= 60 ? '#c9a24a' : '#e07a6a',
          }}>{str}%</span> · <span style={{ color: state.tone }}>{state.text}</span>
        </div>
        {/* WHO ANSWERS FOR IT, and whether they are supposed to. An acting
            commander is a fact about the fight, not a footnote. */}
        <div style={{
          fontFamily: UI, fontSize: FZ.hint, marginTop: 1,
          color: cdr?.acting ? '#e0b34e' : '#54708a',
        }}>
          {cdr
            ? `${cdr.soldier?.rank ?? ''} ${cdr.soldier?.name ?? cdr.unit.label} · ${cdr.unit.label}${
              cdr.acting ? ' · ACTING' : ''}`.replace(/\s+/g, ' ')
            : 'NO COMMANDER'}
        </div>
      </div>

      {/* PLACEHOLDER. The station's map is a second view of the same ground, and
          the COP's renderer cannot serve one yet: map/MapView is a single mount
          effect with every pass, transform and input handler in closures inside
          it, so a second pane can use no part of it without taking all of it.
          Breaking it into layers is CONSOLE.md step 6, deliberately AFTER the
          console is functional — and a stand-in that had to be undone would be
          worse than an empty box that says what it is waiting for. */}
      {/* AND IT HOLDS ITS SHAPE. A map pane is a WINDOW ONTO GROUND: widen it
          at a fixed height and it stops being a view of the same picture and
          starts being a different one — the ground you can see changes with the
          panel's width alone. 16:9 is the COP's own proportion, so the station
          frames the world the way the map beside it does. */}
      <div style={{
        flex: '0 0 auto', aspectRatio: '16 / 9', margin: '8px 8px 2px',
        border: '1px dashed #2a3a48', borderRadius: 3,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, background: 'rgba(14,20,27,0.6)', textAlign: 'center', padding: '0 14px',
      }}>
        <span style={{ fontFamily: UI, fontSize: FZ.label, letterSpacing: 1.4, color: '#3d4f60' }}>
          MAP — PLACEHOLDER
        </span>
        <span style={{ fontFamily: UI, fontSize: FZ.hint, color: '#2f4152', lineHeight: 1.5 }}>
          A locked, read-only view of this team lands here once the COP renderer
          is split into layers.
        </span>
      </div>

      {/* THE COLUMN. Drag a grip to change the order of march — see
          ui/forces/MarchList, which is the same list the FORCES rail draws and
          moves here whole in step 3. */}
      <Section label="ORDER OF MARCH"
        note={plan ? `${MARCH_INTERVAL[plan.column]} M` : 'NO ORDER'}>
        <MarchList gid={team.id} members={units} />
      </Section>

      {/* NOT THINGS YOU DO — THINGS THAT STAY TRUE. What the team does when
          somebody shoots at it, whether it may shoot first, how far apart it
          drives. The interval is the team's alone; the two drills are given to
          every element, which is why MIXED is worth showing. */}
      <Section label="STANDING ORDERS">
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4, padding: '2px 10px 8px',
          alignItems: 'flex-start',
        }}>
          <Pick label="ON CONTACT"
            value={one(units.map(u => (u.roe || 'halt') as Roe))}
            options={[['push', 'PUSH'], ['halt', 'HALT'], ['break', 'BREAK']] as const}
            onPick={roe => units.forEach(u => orderRoe(u.id, roe))} />
          <Pick label="WEAPONS"
            value={one(units.map(u => (u.weapons || 'free') as WeaponsControl))}
            options={[['free', 'FREE'], ['tight', 'TIGHT'], ['hold', 'HOLD']] as const}
            onPick={w => units.forEach(u => orderWeapons(u.id, w))} />
          <Pick label="INTERVAL" value={plan?.column ?? 'open'}
            options={[['close', 'CLOSE'], ['open', 'OPEN'], ['infiltration', 'INFIL']] as const}
            title={c => `${MARCH_INTERVAL[c]} m between vehicles`}
            onPick={c => setMarchOrder(team.id, plan?.order ?? team.members, c, {
              ...(plan?.roe ? { roe: plan.roe } : {}),
              ...(plan?.weapons ? { weapons: plan.weapons } : {}),
              ...(plan?.disabled ? { disabled: plan.disabled } : {}),
              ...(plan?.authored ? { authored: true } : {}),
            })} />
        </div>
      </Section>

      {/* THIS TEAM'S NET, and only this team's. The battalion net is a rail of
          its own and is the right place to hear everything at once; a station
          exists to be the one place where everything is about one grouping. */}
      <Section label="NET" note={log.length ? undefined : 'QUIET'} grow>
        <div style={{ flex: 1, minHeight: 60, overflowY: 'auto' }}>
          {log.map((e, i) => (
            <button key={`${e.t}-${i}`}
              onClick={() => { if (e.x != null) centerView({ x: e.x, y: e.y! }) }}
              title={e.x != null ? 'Centre the map on this transmission' : undefined}
              style={{
                display: 'flex', gap: 6, width: '100%', textAlign: 'left', padding: '2px 10px',
                background: 'none', border: 'none', borderBottom: '1px solid #131e28',
                cursor: e.x != null ? 'pointer' : 'default', fontFamily: 'inherit',
              }}>
              <span style={{
                flex: '0 0 auto', fontSize: FZ.hint, color: '#3d4f60',
                fontVariantNumeric: 'tabular-nums',
              }}>{fmtClock(e.t).slice(3, 8)}</span>
              <span style={{
                flex: 1, minWidth: 0, fontSize: FZ.hint, lineHeight: 1.45,
                color: NET_COLORS[e.kind] ?? '#9ab8d0',
              }}>{e.msg}</span>
            </button>
          ))}
        </div>
      </Section>

      <div onPointerDown={startResize} title="Drag to resize"
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 5,
          cursor: 'ew-resize', zIndex: 5,
        }} />
    </div>
  )
}
