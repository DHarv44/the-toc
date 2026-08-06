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
import { useEffect, useRef, useState } from 'react'
import { useUI } from '../store'
import { S } from '../../engine/state'
import type { NetEntry, Roe, Unit, WeaponsControl } from '../../engine/GameState'
import StationMap from '../../map/StationMap'
import { orderRoe, orderWeapons } from '../../domains/forces/orders'
import { underPlayerCommand } from '../../domains/forces/command'
import { UNIT_TYPES } from '../../domains/forces/catalog'
import {
  designateCdr, disbandTeam, joinTeam, renameTeam, teamById, teamCdr, teamOf, teamUnits,
} from '../../domains/forces/teams'
import { seniorOf } from '../../packs/ranks'
import { MARCH_INTERVAL, marchPlan, setMarchOrder } from '../../domains/movement/march'
import { groupState, groupStrength, strengthTone } from '../forces/state'
import { centerView } from '../../map/view'
import { FZ, NET_COLORS, fmtClock } from '../styles'
import { Pick, one } from '../tray/controls'
import { PaletteIcon, PaletteRow, garrisonSections } from '../palette'
import { QrfWarning, guardedFieldSlot, proceedFieldSlot } from '../forces/callup'
import MarchList from '../forces/MarchList'
import { buildChoices, elementActions } from '../forces/actions'
import Column from '../shell/Column'

const UI = 'Inter, "Segoe UI", system-ui, sans-serif'
// About eight transmissions — enough to hold a contact from the first spot
// report to the consolidation, and not so much that it crowds the column out.
const NET_H = 190

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

/** THE TEAM'S PANE — the real one, at last.
 *
 *  This was a labelled empty box for three steps, because the COP's renderer
 *  could not serve a second pane: every pass lived in one mount effect and you
 *  could take none of it without taking all of it. It is a layer list now
 *  (map/StationMap), locked on the team, with no input mounted.
 *
 *  IT HOLDS ITS SHAPE. A map pane is a WINDOW ONTO GROUND: widen it at a fixed
 *  height and it stops being a view of the same picture and starts being a
 *  different one — the ground you can see changes with the panel's width alone.
 *  16:9 is the COP's own proportion, so the station frames the world the way
 *  the map beside it does. */
function MapPane({ members }: { members: Unit[] }) {
  return (
    <div style={{
      flex: '0 0 auto', aspectRatio: '16 / 9', margin: '8px 8px 2px',
      border: '1px solid #2a3a48', borderRadius: 3, overflow: 'hidden',
      background: 'rgba(14,20,27,0.6)',
    }}>
      <StationMap members={members} />
    </div>
  )
}

/** THE TEAM'S NET — A FIXED PANE AT THE FOOT OF THE COLUMN.
 *
 *  Fixed, because a log that grows takes its height from how much has been said,
 *  which is the one input a layout must never take: the standing orders above it
 *  would sit at a different place on the screen in a quiet minute than in a
 *  loud one, and those are exactly the controls a commander reaches for without
 *  looking.
 *
 *  BOTTOM ALIGNED, like every radio log and every chat window: oldest at the
 *  top, the newest transmission on the last line, and a short log hugging the
 *  bottom rather than floating at the top of an empty box. The eye lives on
 *  that last line, so it does not move.
 *
 *  Its own component so it can own the hook that keeps it there — the station
 *  returns early for a dead team, and a hook cannot live after that. */
function TeamNet({ log }: { log: NetEntry[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const seen = useRef(0)
  // FOLLOW ONLY WHEN THE COMMANDER IS ALREADY AT THE BOTTOM. Yanking the pane
  // back down while somebody is reading back through a contact report is the
  // one thing an auto-scroller must not do — and this re-renders ten times a
  // second, so it would do it constantly.
  useEffect(() => {
    const el = ref.current
    if (!el || log.length === seen.current) return
    const wasAtEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 24
    seen.current = log.length
    if (wasAtEnd || !seen.current) el.scrollTop = el.scrollHeight
  })
  return (
    <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 6, padding: '6px 10px 3px',
        borderTop: '1px solid #16222e',
      }}>
        <span style={{ fontFamily: UI, fontSize: FZ.hint, letterSpacing: 1.2, color: '#3d4f60' }}>
          NET
        </span>
        {!log.length && (
          <span style={{ fontFamily: UI, fontSize: FZ.hint, color: '#2f4152' }}>QUIET</span>
        )}
        <div style={{ flex: 1, height: 1, background: '#16222e' }} />
      </div>
      <div ref={ref} style={{
        height: NET_H, overflowY: 'auto',
        // the short-log case: the traffic sits on the floor of the pane, not
        // at the top of an empty one
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}>
        <div style={{ flex: '0 0 auto' }}>
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
      </div>
    </div>
  )
}

export default function TeamStation({ teamId, popped }: {
  teamId: number
  /** drawn in its own window: it fills that window instead of being a column
   *  of the right wall, and there is nothing to resize against */
  popped?: boolean
}) {
  const ui = useUI()
  // THE TEAM'S OWN ADMINISTRATION, one drawer at a time. Attaching, handing
  // over command, renaming and breaking the team up are all rare and all
  // consequential, so none of them is a button that just fires: each opens
  // something that names what it is about to do.
  const [drawer, setDrawer] = useState<'attach' | 'cdr' | 'disband' | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState('')
  const [qrfPending, setQrfPending] = useState<string | null>(null)
  const team = teamById(teamId)
  // a team that has been destroyed or disbanded takes its column with it
  if (!team) return null
  const units = teamUnits(team)
  if (!units.length) return null

  const cdr = teamCdr(team)
  const plan = marchPlan(team.id)
  const str = groupStrength(units)
  // one status ladder for the whole console — see ui/forces/state
  const state = groupState(units, team.id)
  const held = units.every(u => ui.selectedIds.includes(u.id))
    && ui.selectedIds.length === units.length

  const centre = () => centerView({
    x: units.reduce((n, u) => n + u.x, 0) / units.length,
    y: units.reduce((n, u) => n + u.y, 0) / units.length,
  })

  // THE TEAM'S OWN TRAFFIC. Everything the team has said and everything its
  // elements have said, and nothing anybody else has — which is the whole
  // reason to have it here rather than sending the commander to the battalion
  // net to pick this team's calls out of everyone's.
  //
  // OLDEST FIRST, NEWEST AT THE BOTTOM, like a radio log and like every chat
  // window ever built. The battalion net is a REVIEW — you open it to find the
  // report you half heard, so newest-first is right there. This is a WATCH:
  // it is open because you are following this team right now, and the next
  // thing they say is the thing you are waiting for.
  const calls = new Set([team.name, ...units.map(u => u.label)])
  const log = S.radio.filter(e => calls.has(e.callsign)).slice(-60)

  /** everything of the player's that is not already spoken for */
  const free = S.units.filter(u => underPlayerCommand(u) && u.strength > 0 && !teamOf(u))
  // MOVE and ATTACK are not here: they are what a RIGHT-CLICK means, and the
  // right-click happens on the map. A button that only changes what the next
  // map click does belongs beside the map, which is where the dock is.
  const acts = elementActions(units, ui).filter(a => a.show && a.key !== 'move' && a.key !== 'attack')
  const builds = buildChoices(units)

  const adm = (label: string, title: string, active: boolean, on: () => void, tone?: string) => (
    <button onClick={on} title={title} style={{
      flex: '0 0 auto', padding: '2px 8px', borderRadius: 2, cursor: 'pointer',
      fontFamily: UI, fontSize: FZ.hint, letterSpacing: 0.4,
      border: `1px solid ${active ? '#3d7cb8' : '#22303d'}`,
      background: active ? '#16304a' : 'rgba(18,26,34,0.9)',
      color: active ? '#dceeff' : (tone ?? '#8fb0c8'),
    }}>{label}</button>
  )

  const icon = (glyph: string, title: string, on: () => void) => (
    <button onClick={on} title={title} style={{
      flex: '0 0 auto', width: 22, height: 20, cursor: 'pointer', borderRadius: 2,
      border: '1px solid #22303d', background: 'rgba(18,26,34,0.9)', color: '#8fb0c8',
      fontFamily: 'inherit', fontSize: FZ.label, lineHeight: 1, padding: 0,
    }}>{glyph}</button>
  )

  const shell = (kids: React.ReactNode) => popped ? (
    // ITS OWN WINDOW: fill it. A column with a drag handle would be measuring
    // itself against a right wall that is not there.
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      minHeight: 0, background: 'rgba(10,14,18,0.97)',
      fontFamily: 'Consolas, "Courier New", monospace', color: '#c8d8e8',
    }}>{kids}</div>
  ) : (
    <Column side="right" width={ui.stationW} setWidth={ui.setStationW}
      style={{
        background: 'rgba(10,14,18,0.97)', borderLeftColor: '#22303d',
        fontFamily: 'Consolas, "Courier New", monospace', color: '#c8d8e8',
      }}>{kids}</Column>
  )

  return shell(<>

      {/* WHO THIS IS — and the way to take hold of them. A panel about a team
          that cannot select the team is the dead end the FORCES rail had. */}
      <div style={{
        flex: '0 0 auto', padding: '6px 8px 7px', borderBottom: '1px solid #1e2c3a',
        background: held ? 'rgba(22,48,74,0.55)' : 'rgba(14,20,27,0.9)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {renaming ? (
            // A NAME IS WHAT THE NET CALLS THEM. Renaming in place, because the
            // name is the headline and typing over the headline is the least
            // ambiguous thing a rename can look like.
            <input autoFocus value={draft}
              onChange={e => setDraft(e.currentTarget.value)}
              onBlur={() => { renameTeam(team.id, draft); setRenaming(false) }}
              onKeyDown={e => {
                if (e.key === 'Enter') { renameTeam(team.id, draft); setRenaming(false) }
                if (e.key === 'Escape') setRenaming(false)
              }}
              style={{
                flex: 1, minWidth: 0, fontFamily: UI, fontSize: FZ.item, fontWeight: 700,
                letterSpacing: 0.6, padding: '1px 4px', borderRadius: 2,
                background: '#0e141a', border: '1px solid #3d7cb8', color: '#dceeff',
              }} />
          ) : (
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
          )}
          {/* RENAME BELONGS TO THE NAME, not to the row of team administration
              below — it is the only one of those verbs that changes the thing
              it sits next to, and moving it up here is also what keeps the
              other three on one line at the narrowest column width. */}
          {icon('✎', 'Rename the team — what the net calls them', () => {
            setDraft(team.name); setRenaming(true); setDrawer(null)
          })}
          {icon('⌖', 'Centre the map on this team', centre)}
          {/* ONTO THE SECOND MONITOR. The whole fight on one screen, the team
              you are worried about on the other — which is what a real
              operations centre looks like and what a single viewport cannot be.
              Sending it out MINIMISES this column; the tab is untouched, so the
              wall behaves as it always has and clicking the tab brings the
              column back with the window still up. See ui/shell/PopOut. */}
          {!popped && icon('⧉', 'Pop this station out to its own window',
            () => ui.popStation(team.id, true))}
          {icon('✕', popped ? 'Close this window' : 'Close this station',
            () => popped ? ui.popStation(team.id, false) : ui.closeStation(team.id))}
        </div>
        <div style={{ fontFamily: UI, fontSize: FZ.hint, color: '#6d8296', marginTop: 2 }}>
          {units.length} ELEMENTS · <span style={{ color: strengthTone(str) }}>{str}%</span>
          {' · '}<span style={{ color: state.tone }}>{state.text}</span>
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

      {/* THE MAP COMES FIRST. After the name and the state of the team, the
          next thing a commander wants is WHERE — before any control, because
          every control below is answered differently depending on it. */}
      <MapPane members={units} />

      {/* THE TEAM'S ADMINISTRATION, UNDER THE MAP. Attaching, handing over
          command and breaking the team up were spread across the FORCES rail
          and the S3's task-org board — two places to do the same things to the
          same object. A team's home is its station, so they live here, and they
          sit under the picture because they are acts, not facts. */}
      <div style={{
        flex: '0 0 auto', display: 'flex', gap: 4, flexWrap: 'wrap',
        padding: '6px 8px', borderBottom: drawer ? 'none' : '1px solid #16222e',
      }}>
        {adm('＋ ATTACH', 'Attach an element — one already fielded, or called up from garrison',
          drawer === 'attach', () => setDrawer(d => d === 'attach' ? null : 'attach'))}
        {adm('★ COMMAND', 'Hand the team to a named element',
          drawer === 'cdr', () => setDrawer(d => d === 'cdr' ? null : 'cdr'))}
        {adm('✕ DISBAND', 'Break the team up', drawer === 'disband',
          () => setDrawer(d => d === 'disband' ? null : 'disband'), '#e0968a')}
      </div>

      {/* THE DRAWERS. One at a time, opening under the row that owns them, and
          every one of them names its consequence before it acts.
          CAPPED, because a drawer that takes the whole column takes the order
          of march with it — and the column is what you are attaching TO. */}
      {drawer === 'attach' && (
        <div style={{ flex: '0 0 auto', maxHeight: 240, overflowY: 'auto', borderBottom: '1px solid #16222e' }}>
          {qrfPending && (
            <QrfWarning slotId={qrfPending}
              onProceed={() => {
                proceedFieldSlot(qrfPending, u => { joinTeam(team.id, u.id) })
                setQrfPending(null); setDrawer(null)
              }}
              onCancel={() => setQrfPending(null)} />
          )}
          {free.length > 0 && (
            <div style={{ fontFamily: UI, fontSize: FZ.hint, color: '#3d4f60', padding: '5px 10px 2px', letterSpacing: 1 }}>
              ALREADY FIELDED
            </div>
          )}
          {free.map(u => {
            const t = UNIT_TYPES[u.type]
            return (
              <PaletteRow key={u.id} icon={<PaletteIcon unit={t} w={34} h={24} scale={0.9} />}
                label={`${u.label} · ${t.abbr}`} tag={u.lineage ?? null} cost=""
                onClick={() => { joinTeam(team.id, u.id); setDrawer(null) }} />
            )
          })}
          <div style={{ fontFamily: UI, fontSize: FZ.hint, color: '#3d4f60', padding: '5px 10px 2px', letterSpacing: 1 }}>
            FROM GARRISON — FIELDED AND ATTACHED IN ONE
          </div>
          {garrisonSections(true).flatMap(sec => sec.items).filter(it => !it.disabled).map(it => (
            <PaletteRow key={it.key} icon={it.icon} label={it.label} tag={it.tag ?? null} cost=""
              onClick={() => guardedFieldSlot(it.key!, setQrfPending, u => {
                joinTeam(team.id, u.id); setDrawer(null)
              })} />
          ))}
        </div>
      )}
      {drawer === 'cdr' && (
        <div style={{ flex: '0 0 auto', borderBottom: '1px solid #16222e', padding: '4px 0 6px' }}>
          <div style={{ fontFamily: UI, fontSize: FZ.hint, color: '#3d4f60', padding: '2px 10px', letterSpacing: 1 }}>
            WHO HAS THE TEAM
          </div>
          {units.map(u => {
            const lead = seniorOf(u.soldiers, true)
            const isCdr = cdr?.unit.id === u.id
            return (
              <button key={u.id} onClick={() => { designateCdr(team.id, u.id); setDrawer(null) }}
                title={`Give ${team.name} to ${u.label}`}
                style={{
                  display: 'flex', gap: 6, alignItems: 'baseline', width: '100%', textAlign: 'left',
                  padding: '3px 10px', cursor: 'pointer', fontFamily: 'inherit',
                  background: isCdr ? 'rgba(22,48,74,0.5)' : 'none', border: 'none',
                }}>
                <span style={{ flex: '0 0 auto', fontSize: FZ.label, color: isCdr ? '#ffd67e' : '#3d4f60' }}>★</span>
                <span style={{ flex: '0 0 auto', fontSize: FZ.label, color: '#9fc4e0' }}>{u.label}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: FZ.hint, color: '#54708a', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {lead ? `${lead.rank} ${lead.name}` : 'NO FIT LEADER'}
                </span>
              </button>
            )
          })}
          {/* BACK TO THE BASE ELEMENT — which is also what happens on its own
              when a designated commander goes down, so it is worth being able
              to ask for deliberately. */}
          <button onClick={() => { designateCdr(team.id, null); setDrawer(null) }}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '3px 10px',
              cursor: 'pointer', fontFamily: 'inherit', background: 'none', border: 'none',
              fontSize: FZ.hint, color: '#6d8296',
            }}>RETURN IT TO THE BASE ELEMENT</button>
        </div>
      )}
      {drawer === 'disband' && (
        <div style={{
          flex: '0 0 auto', margin: '4px 6px', padding: '6px 8px', borderRadius: 3,
          border: '1px solid #6a4a2a', borderLeft: '3px solid #e8b34a',
          background: 'rgba(40,28,14,0.45)',
        }}>
          <div style={{ fontFamily: UI, fontSize: FZ.hint, color: '#c8d8e8', lineHeight: 1.5 }}>
            Disbanding returns {units.length} elements to independent and throws away
            this team's order of march. The station closes with it.
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
            <button onClick={() => { ui.closeStation(team.id); disbandTeam(team.id) }}
              style={{
                padding: '3px 10px', borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit',
                fontSize: FZ.hint, letterSpacing: 1,
                border: '1px solid #6a4a2a', background: 'rgba(16,26,36,0.85)', color: '#e8b34a',
              }}>DISBAND {team.name}</button>
            <button onClick={() => setDrawer(null)}
              style={{
                padding: '3px 10px', borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit',
                fontSize: FZ.hint, letterSpacing: 1,
                border: '1px solid #2a3a48', background: 'rgba(16,26,36,0.85)', color: '#dceeff',
              }}>CANCEL</button>
          </div>
        </div>
      )}

      {/* WHAT THIS TEAM CAN DO, AND WHO IN IT WOULD DO IT.
          The dock offers these to whatever is selected, which meant that to put
          a Raven up you had to know which platoon carried it, find it, select
          it alone and press V. A battalion commander does not task a carrier —
          he tells the team to put its bird up. So the same verbs (ui/forces/
          actions, one list for both surfaces) are offered to the whole team,
          each naming the element that would execute it. */}
      <Section label="TEAM ACTIONS" note={acts.length ? undefined : 'NOTHING ORGANIC'}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 3, padding: '2px 8px 8px',
        }}>
          {acts.map(a => (
            <button key={a.key} onClick={a.on} title={a.title}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                padding: '3px 7px', borderRadius: 2, cursor: 'pointer', fontFamily: UI,
                border: `1px solid ${a.active ? '#4d90c8' : '#2f4356'}`,
                background: a.active ? '#255a8c' : 'rgba(22,30,40,0.95)',
                color: a.active ? '#eaf4ff' : (a.tone ?? '#b3c6d8'),
              }}>
              <span style={{ fontSize: FZ.label, fontWeight: 700, letterSpacing: 0.3 }}>
                {a.label}
              </span>
              {/* WHOSE JOB IT IS. Blank when it is the whole team's — halting
                  and digging in are not delegated to anybody. */}
              <span style={{ fontSize: FZ.hint, color: a.active ? '#cfe6ff' : '#54708a' }}>
                {a.who ? a.who.label : 'THE TEAM'}
              </span>
            </button>
          ))}
          {/* THE CARD HAS ONE CELL FOR WORK, so an engineer's second and third
              structures are unreachable from the dock. Siting a FOB is exactly
              the deliberate act a station is for, so they are all here. */}
          {builds.slice(1).map(b => (
            <button key={b.mode} onClick={() => ui.setMode(
              ui.mode === b.mode ? 'select' : b.mode as typeof ui.mode)}
              title={`${b.who.label} builds a ${b.label} — click the map to site it`}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                padding: '3px 7px', borderRadius: 2, cursor: 'pointer', fontFamily: UI,
                border: `1px solid ${ui.mode === b.mode ? '#4d90c8' : '#2f4356'}`,
                background: ui.mode === b.mode ? '#255a8c' : 'rgba(22,30,40,0.95)',
                color: ui.mode === b.mode ? '#eaf4ff' : '#b3c6d8',
              }}>
              <span style={{ fontSize: FZ.label, fontWeight: 700, letterSpacing: 0.3 }}>
                ⛏ {b.label.toUpperCase()}
              </span>
              <span style={{ fontSize: FZ.hint, color: ui.mode === b.mode ? '#cfe6ff' : '#54708a' }}>
                {b.who.label}
              </span>
            </button>
          ))}
        </div>
      </Section>

      {/* THE COLUMN, AND THE ONLY PART OF THIS PANEL THAT GROWS. A team can be
          two elements or nine, so the list is the one thing here whose height
          is not the designer's to choose — it takes the slack and scrolls when
          it runs out. Everything under it stays where the eye left it. Drag a
          grip to change the order of march; see ui/forces/MarchList. */}
      <Section label="ORDER OF MARCH" grow
        note={plan ? `${MARCH_INTERVAL[plan.column]} M` : 'NO ORDER'}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <MarchList gid={team.id} members={units} />
        </div>
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
      <TeamNet log={log} />
    </>)
}
