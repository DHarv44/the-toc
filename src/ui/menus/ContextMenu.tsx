// RIGHT-CLICK MENUS on the map: one for an element, one for an installation.
//
// Split out of ui/HUD, which held these alongside the map overlay, the command
// dock and the whole drone-feed window. They are the same shape as each other
// and nothing else in the HUD uses them.
//
// Both are a fixed list rather than a command card: a context menu is READ, not
// pressed from muscle memory, so it may name the whole verb ("ABANDON POSITIONS
// (40%)") at whatever length that takes. The card in the dock is the opposite
// case, and the two should not be made to look alike.
import { S } from '../../engine/state'
import type { Roe, Team, Unit, WeaponsControl } from '../../engine/GameState'
import { orderHold, orderMount, orderRoe, orderDefend, orderWeapons } from '../../domains/forces/orders'
import { underPlayerCommand } from '../../domains/forces/command'
import {
  disbandTeam, formTeam, joinTeam, leaveTeam, teamById, teamOf, teamUnits,
} from '../../domains/forces/teams'
import { toast } from '../../domains/comms/radio'
import { convertToHq } from '../../domains/installations/orders'
import { UNIT_TYPES } from '../../domains/forces/catalog'
import { STRUCTURES } from '../../domains/installations/catalog'
import { FZ, clamp, mapColumnSize } from '../styles'
import { TUT } from '../tutTargets'
import { useUI } from '../store'
import { optBtn } from '../tray/controls'
import { protectionInfo, winView } from '../mapUtil'

/** One row of a menu. Shared by both because they are the same control. */
function item(label: string, fn: () => void, close: () => void, disabled = false) {
  return (
    <div key={label}
      onClick={() => { if (!disabled) { fn(); close() } }}
      style={{
        padding: '5px 11px', cursor: disabled ? 'default' : 'pointer', fontSize: FZ.label,
        color: disabled ? '#4a6070' : '#c8d8e8', whiteSpace: 'nowrap',
        borderBottom: '1px solid rgba(40,58,72,0.5)',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = '#1c3450' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
      {label}
    </div>
  )
}

const backdrop = (close: () => void) => (
  <div style={{ position: 'absolute', inset: 0, zIndex: 24 }}
    onMouseDown={close} onContextMenu={(e) => { e.preventDefault(); close() }} />
)

const shell = (x: number, y: number, minWidth: number) => ({
  position: 'absolute' as const, left: x, top: y, zIndex: 25, minWidth,
  background: 'rgba(12,18,24,0.97)', border: '1px solid #35506a', borderRadius: 3,
  overflow: 'hidden' as const,
})

const head: React.CSSProperties = {
  padding: '6px 11px', background: '#16283a', color: '#7ec8ff', fontSize: FZ.label,
}

const segRow: React.CSSProperties = {
  display: 'flex', gap: 4, alignItems: 'center', padding: '5px 11px',
  borderBottom: '1px solid rgba(40,58,72,0.5)',
}

export default function ContextMenu() {
  const ui = useUI()
  const m = ui.ctxMenu!
  if (m.structId != null) return <StructMenu />
  const u = S.units.find(x => x.id === m.unitId)
  if (!u) { ui.closeMenu(); return null }
  const type = UNIT_TYPES[u.type]
  const close = () => ui.closeMenu()
  // the left wall is a console at its own width now, not a fixed rail
  const col = mapColumnSize(ui.console != null && !ui.consoleFull, ui.netOpen)
  const x = clamp(m.x, 0, col.w - 190)
  const y = clamp(m.y, 0, col.h - 180)
  return (
    <>
      {/* backdrop to catch outside clicks */}
      {backdrop(close)}
      <div style={shell(x, y, 190)}>
        <div style={head}>
          {u.label} — {type.name.toUpperCase()} · STR {Math.max(0, Math.round(u.strength))}%
          {(() => {
            const p = protectionInfo(u)
            return (p.total > 0 || p.cover)
              ? <span style={{ color: '#7ea87e' }}> · {p.cover ? p.terr.toUpperCase() : 'PREPARED'} −{p.total}%</span>
              : null
          })()}
          {u.lineage && (
            <div style={{ fontSize: FZ.hint, color: '#54708a', letterSpacing: 0.4 }}>
              {u.lineage}{u.attFrom ? ` · ATT ${u.attFrom}` : ''}
            </div>
          )}
        </div>
        <div style={segRow}>
          <span style={{ color: '#54708a', fontSize: FZ.hint, letterSpacing: 1 }}>DRILL</span>
          {([['push', 'PUSH'], ['halt', 'HALT'], ['break', 'BREAK']] as const).map(([roe, label]) => (
            <button key={roe} data-tut={roe === 'break' ? TUT.roeBreak : undefined}
              style={optBtn((u.roe || 'halt') === roe)}
              onClick={() => orderRoe(u.id, roe as Roe)}>{label}</button>
          ))}
        </div>
        <div style={segRow}>
          <span style={{ color: '#54708a', fontSize: FZ.hint, letterSpacing: 1 }}>WPNS</span>
          {([['free', 'FREE'], ['tight', 'TIGHT'], ['hold', 'HOLD']] as const).map(([w, label]) => (
            <button key={w} style={optBtn((u.weapons || 'free') === w)}
              onClick={() => orderWeapons(u.id, w as WeaponsControl)}>{label}</button>
          ))}
        </div>
        {type.def && item(
          u.posture === 'dig'
            ? `ABANDON POSITIONS (${Math.round(u.digT * 100)}%)`
            : `DIG IN — ${type.def.name}`,
          () => orderDefend(u.id, u.posture !== 'dig'), close)}
        {type.logi && item(
          u.convoy ? 'TERMINATE SUPPLY ROUTE' : 'SUPPLY RUN — SELECT FOB…',
          () => { if (u.convoy) orderHold(u.id); else ui.setMode(`convoy:${u.id}` as never) }, close)}
        {item('HOLD / CANCEL ORDERS', () => orderHold(u.id), close)}
        {type.carrier && item(u.mounted ? 'DISMOUNT TROOPS' : 'MOUNT UP',
          () => orderMount(u.id, !u.mounted), close)}
        {type.indirect && item(
          (u.ammo ?? 0) < 1 ? 'FIRE MISSION (WINCHESTER — RESUPPLY)'
            : u.missionCooldown > 0 ? `FIRE MISSION (RELOAD ${Math.ceil(u.missionCooldown)}S)`
            : `FIRE MISSION… (${Math.floor(u.ammo ?? 0)} RDS)`,
          () => ui.setMode('target'), close, u.missionCooldown > 0 || (u.ammo ?? 0) < 1)}
        {type.canBridge && item('PONTOON BRIDGE…', () => ui.setMode('bridge'), close)}
        {u.soldiers.length > 0 && item('PERSONNEL ROSTER…', () => ui.openRoster(u.id), close)}
        {item('CENTER MAP', () => { const v = winView(); if (v) { v.cx = u.x; v.cy = u.y } }, close)}
        <TaskOrgBlock clicked={u} close={close} />
      </div>
    </>
  )
}

/** TASK ORGANIZING FROM THE MAP, WITH THE CONSEQUENCE ON THE LABEL.
 *
 *  `G` does the obvious case instantly — loose elements become a team, loose
 *  elements beside exactly one team join it. It deliberately REFUSES the
 *  ambiguous case: grab three of BRAVO and three of ALPHA and "most members
 *  here" has no answer, and resolving it by whichever the loop counted first is
 *  a silent coin flip that merges two companies.
 *
 *  This is where that case gets answered. A menu is READ rather than fired from
 *  muscle memory, so it can afford to be explicit: every row names its
 *  destination, and the counts say which way a merge runs and how much of that
 *  team you have hold of. A consolidation is never a surprise.
 *
 *  It acts on the SELECTION. Right-clicking something you have not selected
 *  falls back to that one element, because acting on a selection the player is
 *  not looking at is the other way to be surprising. */
function TaskOrgBlock({ clicked, close }: { clicked: Unit; close: () => void }) {
  const ui = useUI()
  const sel = ui.selectedIds.includes(clicked.id)
    ? ui.selectedIds
      .map(id => S.units.find(x => x.id === id))
      .filter((x): x is Unit => !!x && x.strength > 0 && underPlayerCommand(x))
    : [clicked]
  if (!sel.length) return null

  // how much of each team is in hand, and how much of it exists
  const held = new Map<number, number>()
  for (const u of sel) {
    const t = teamOf(u)
    if (t) held.set(t.id, (held.get(t.id) ?? 0) + 1)
  }
  const free = sel.filter(u => !teamOf(u))
  const teams = [...held.keys()].map(id => teamById(id)).filter((t): t is Team => !!t)
  // the selection IS one whole team — the only case where disbanding is a
  // description of what you are holding rather than a guess at what you meant
  const whole = teams.length === 1 && free.length === 0
    && held.get(teams[0]!.id) === teamUnits(teams[0]!).length ? teams[0]! : null

  const rows: React.ReactNode[] = []
  if (sel.length >= 2) {
    const detaches = sel.length - free.length
    rows.push(item(
      detaches
        ? `FORM NEW TEAM — DETACHES ${detaches} FROM ${teams.length} TEAM${teams.length === 1 ? '' : 'S'}`
        : 'FORM NEW TEAM',
      () => {
        const t = formTeam(sel.map(u => u.id))
        if (t) toast(`${t.name} TASK ORGANIZED`)
      }, close))
  }
  for (const t of teams) {
    const joining = sel.filter(u => teamOf(u)?.id !== t.id)
    if (!joining.length) continue
    rows.push(item(
      `ATTACH ALL TO ${t.name} (${held.get(t.id)} OF ${teamUnits(t).length} HERE)`,
      () => {
        for (const u of joining) joinTeam(t.id, u.id)
        toast(`${joining.length} ATTACHED TO ${t.name}`)
      }, close))
  }
  if (teams.length) {
    const inTeams = sel.filter(u => teamOf(u))
    rows.push(item(
      `DETACH ${inTeams.length === 1 ? inTeams[0]!.label : `ALL ${inTeams.length}`} FROM THEIR TEAM${teams.length === 1 ? '' : 'S'}`,
      () => {
        for (const u of inTeams) leaveTeam(u.id)
        toast(`${inTeams.length} DETACHED`)
      }, close))
  }
  if (whole) {
    rows.push(item(`DISBAND ${whole.name}`, () => {
      ui.closeStation(whole.id)
      disbandTeam(whole.id)
      toast(`${whole.name} DISBANDED`)
    }, close))
  }
  if (!rows.length) return null

  return (
    <>
      <div style={{
        padding: '5px 11px 3px', color: '#54708a', fontSize: FZ.hint, letterSpacing: 1,
        background: 'rgba(10,16,22,0.9)',
      }}>
        TASK ORG · {sel.length} SELECTED
      </div>
      {rows}
    </>
  )
}

function StructMenu() {
  const ui = useUI()
  const m = ui.ctxMenu!
  const s = S.structures.find(x => x.id === m.structId)
  if (!s) { ui.closeMenu(); return null }
  const hqExists = S.structures.some(o => o.side === 'friend' && o.kind === 'HQ')
  const close = () => ui.closeMenu()
  // the left wall is a console at its own width now, not a fixed rail
  const col = mapColumnSize(ui.console != null && !ui.consoleFull, ui.netOpen)
  const x = clamp(m.x, 0, col.w - 210)
  const y = clamp(m.y, 0, col.h - 160)
  return (
    <>
      {backdrop(close)}
      <div style={shell(x, y, 210)}>
        <div style={head}>
          {s.label} — {STRUCTURES[s.kind].name.toUpperCase()} · {Math.round(s.hp / s.maxHp * 100)}%
          {s.kind === 'FOB' ? ` · STOCK ${Math.floor(s.stock || 0)}` : ''}
        </div>
        {s.kind === 'FOB' && item(
          hqExists ? 'CONVERT TO HQ (HQ EXISTS)' : 'CONVERT TO COMMAND POST (300)',
          () => convertToHq(s.id), close, hqExists || s.buildT > 0)}
        {item('CENTER MAP', () => { const v = winView(); if (v) { v.cx = s.x; v.cy = s.y } }, close)}
      </div>
    </>
  )
}
