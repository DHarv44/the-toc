// THE TASK ORGANIZATION BAR — the force, always on screen, always one click.
//
// WHAT WAS MISSING. A team could be formed, named, given a commander and an
// order of march, and then it had no handle. The only way to command one was to
// find a member on the map and click it: the FORCES rail listed teams but could
// not select one, its header was inert, and the bottom bar's team chip opened a
// full-screen staff console instead. So the player's own task organization —
// the thing this game is about — was the one object with no way to grab it.
//
// Every RTS solves this with control groups, and the reason is not convenience.
// It is that the player must be able to switch which formation they are
// commanding without first finding it, because searching the map for your own
// units is not a decision, it is an errand. A number key is the whole idea.
//
// AND IT IS ALSO THE TOC'S BOARD. A real operations centre has the task
// organization on the wall — every team, its strength, whether it is moving,
// and what drill it is on — precisely so the staff can answer "where is
// everybody" without asking anyone. That board and an RTS control-group bar are
// the same artifact, so this is one row that is honestly both.
//
// WHAT IT REFUSES TO DO. It does not become a second place to give orders. A
// chip selects; every order still goes through the selection tray and the map,
// because two ways to say the same thing is how a UI starts lying about state.
import { useEffect } from 'react'
import { S } from '../engine/state'
import type { Team, Unit } from '../engine/GameState'
import { underPlayerCommand } from '../domains/forces/command'
import { teamCdr, teamOf, teamUnits } from '../domains/forces/teams'
import { marchMoving, marchPlan } from '../domains/movement/march'
import { centerView } from '../map/view'
import { useUI } from './store'

const UI = 'Inter, "Segoe UI", system-ui, sans-serif'
const WARN = '#e0b34e'

/** The one value the whole team shares, or null — MIXED. */
function shared<T>(vals: T[]): T | null {
  const s = new Set(vals)
  return s.size === 1 ? [...s][0]! : null
}

interface Entry {
  key: string
  /** 1-9 for a team; null for a loose element, which has no control group */
  slot: number | null
  name: string
  units: Unit[]
  team: Team | null
}

/** THE FORCE, IN THE ORDER A STAFF WOULD LIST IT: task organized groupings
 *  first, in the order they were formed, then whatever is still answering
 *  straight to this TOC. Formation order rather than alphabetical, because the
 *  number keys are muscle memory and a team must not change key because another
 *  one got renamed. */
function roster(): Entry[] {
  const out: Entry[] = []
  const claimed = new Set<number>()
  let slot = 1
  for (const t of S.teams) {
    const list = teamUnits(t).filter(underPlayerCommand)
    if (!list.length) continue
    for (const u of list) claimed.add(u.id)
    out.push({ key: `t${t.id}`, slot: slot <= 9 ? slot++ : null, name: t.name, units: list, team: t })
  }
  for (const u of S.units) {
    if (u.strength <= 0 || claimed.has(u.id) || !underPlayerCommand(u)) continue
    if (teamOf(u)) continue
    out.push({ key: `u${u.id}`, slot: null, name: u.label, units: [u], team: null })
  }
  return out
}

/** What this grouping is DOING, in the two words a commander scans for. */
function stateOf(e: Entry): { text: string; tone: string } {
  if (e.units.some(u => u.targetId || u.breaking)) return { text: 'CONTACT', tone: '#ff9e6a' }
  const moving = e.team ? marchMoving(e.team.id) : e.units.some(u => u.path.length)
  if (moving) return { text: 'MOVING', tone: '#8fb0c8' }
  if (e.units.some(u => u.posture === 'dig')) return { text: 'FIRM', tone: '#7ec87e' }
  return { text: 'HOLD', tone: '#6d7f90' }
}

function Chip({ e, active }: { e: Entry; active: boolean }) {
  const ui = useUI()
  const str = Math.round(e.units.reduce((n, u) => n + u.strength, 0) / e.units.length)
  const roe = shared(e.units.map(u => u.roe))
  const st = stateOf(e)
  const cdr = e.team ? teamCdr(e.team) : null
  const plan = e.team ? marchPlan(e.team.id) : null
  // THE EXCEPTION, SURFACED. An element on a different drill from the rest of
  // its team is the thing a TOC most needs to notice and the thing a bar like
  // this most easily hides — so it gets its own mark, on the chip, always.
  const split = !roe
  const drifted = !!plan?.roe && e.units.some(u => u.roe !== plan.roe)
  const flag = split || drifted

  const pick = () => ui.setSelected(e.units.map(u => u.id))
  const go = () => {
    pick()
    const cx = e.units.reduce((n, u) => n + u.x, 0) / e.units.length
    const cy = e.units.reduce((n, u) => n + u.y, 0) / e.units.length
    centerView({ x: cx, y: cy })
  }

  return (
    <button onClick={pick} onDoubleClick={go} title={[
      e.team ? `${e.name} — ${e.units.length} elements` : e.name,
      cdr ? `${cdr.soldier?.rank ?? ''} ${cdr.soldier?.name ?? cdr.unit.label}${cdr.acting ? ' (acting)' : ''}`.trim() : null,
      flag ? `ON CONTACT: ${e.units.map(u => `${u.label} ${u.roe.toUpperCase()}`).join(', ')}` : null,
      e.slot ? `Press ${e.slot} to select · double-click to go there` : 'Double-click to go there',
    ].filter(Boolean).join('\n')} style={{
      display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto',
      fontFamily: UI, fontSize: 10.5, letterSpacing: 0.3, padding: '2px 8px 2px 4px',
      borderRadius: 2, cursor: 'pointer',
      border: `1px solid ${active ? '#3d7cb8' : '#22303d'}`,
      background: active ? '#16304a' : 'rgba(18,26,34,0.9)',
      color: active ? '#dceeff' : '#9fb3c6',
    }}>
      <span style={{
        minWidth: 13, textAlign: 'center', fontSize: 9.5, fontWeight: 700,
        color: e.slot ? (active ? '#ffd67e' : '#5d6f80') : 'transparent',
      }}>{e.slot ?? '·'}</span>
      <span style={{ color: active ? '#dceeff' : '#c8d8e8' }}>{e.name}</span>
      {e.team && <span style={{ fontSize: 9, color: '#5d6f80' }}>×{e.units.length}</span>}
      <span style={{
        fontSize: 9, color: str >= 85 ? '#6d7f90' : str >= 60 ? '#c9a24a' : '#e07a6a',
      }}>{str}%</span>
      <span style={{ fontSize: 9, color: st.tone }}>{st.text}</span>
      <span style={{ fontSize: 9, color: flag ? WARN : '#5d6f80' }}>
        {roe ? roe.toUpperCase() : 'SPLIT'}
      </span>
    </button>
  )
}

/** A LAYOUT ROW under the map, not an overlay — same as the selection tray, and
 *  for the same reason: it must never cover the ground it is describing. */
export default function TaskOrgBar() {
  useUI((s) => s.tick)
  const ui = useUI()
  const list = roster()

  // THE NUMBER KEYS. Bound here rather than in the map so they work with the
  // focus anywhere that is not a text field — a commander pressing 3 while the
  // S3 console is open means "give me Team Charlie", every time.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return
      const el = ev.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const n = Number(ev.key)
      if (!Number.isInteger(n) || n < 1 || n > 9) return
      const e = roster().find(x => x.slot === n)
      if (!e) return
      ev.preventDefault()
      useUI.getState().setSelected(e.units.map(u => u.id))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const sel = new Set(ui.selectedIds)
  return (
    <div style={{
      flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 5,
      height: 24, padding: '0 10px', overflowX: 'auto', overflowY: 'hidden',
      background: 'rgba(8,12,16,0.96)', borderTop: '1px solid #1e2c3a',
    }}>
      <span style={{
        fontFamily: UI, fontSize: 8.5, letterSpacing: 1, color: '#3d4f60', flex: '0 0 auto',
      }}>TASK ORG</span>
      {list.length
        ? list.map(e => (
            <Chip key={e.key} e={e}
              active={e.units.length === sel.size && e.units.every(u => sel.has(u.id))} />
          ))
        : (
          <span style={{ fontFamily: UI, fontSize: 9.5, color: '#3d4f60' }}>
            NOTHING IN THE FIELD
          </span>
        )}
    </div>
  )
}
