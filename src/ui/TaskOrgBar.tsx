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
import { useEffect, useRef, useState } from 'react'
import { S } from '../engine/state'
import type { Team, Unit } from '../engine/GameState'
import { commandsStructure, underPlayerCommand } from '../domains/forces/command'
import { UNIT_TYPES } from '../domains/forces/catalog'
import { STRUCTURES, type StructureTypeKey } from '../domains/installations/catalog'
import { PaletteIcon, garrisonSlots } from './palette'
import { teamCdr, teamOf, teamUnits } from '../domains/forces/teams'
import { groupState, groupStrength, strengthTone } from './forces/state'
import { marchPlan } from '../domains/movement/march'
import { centerView } from '../map/view'
import { useUI } from './store'
import { FZ } from './styles'

const UI = 'Inter, "Segoe UI", system-ui, sans-serif'
const WARN = '#e0b34e'
// the order a staff lists its installations: the command post, then what it
// has pushed forward, then the strip, then the observation posts
const BASE_ORDER: readonly StructureTypeKey[] = ['HQ', 'FOB', 'AFLD', 'OP']

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

function Chip({ e, active, compact }: { e: Entry; active: boolean; compact?: boolean }) {
  const ui = useUI()
  const str = groupStrength(e.units)
  const roe = shared(e.units.map(u => u.roe))
  // one status ladder for the whole console — see ui/forces/state
  const st = groupState(e.units, e.team?.id)
  const cdr = e.team ? teamCdr(e.team) : null
  const plan = e.team ? marchPlan(e.team.id) : null
  // A TEAM IS NAMED FOR AND BUILT AROUND ITS BASE ELEMENT, so the base is what
  // its symbol wears — the same rule the map's roll-up uses, so the icon in the
  // bar and the icon on the sheet are the same icon.
  const baseUnit = e.team ? e.units.find(u => u.id === e.team!.baseId) ?? e.units[0] : null
  const base = baseUnit ? UNIT_TYPES[baseUnit.type] : null
  // THE EXCEPTION, SURFACED. An element on a different drill from the rest of
  // its team is the thing a TOC most needs to notice and the thing a bar like
  // this most easily hides — so it gets its own mark, on the chip, always.
  const split = !roe
  const drifted = !!plan?.roe && e.units.some(u => u.roe !== plan.roe)
  const flag = split || drifted

  // A CLICK TAKES YOU THERE. This bar is a LOCATOR, not a list you read down —
  // the rails deliberately separate select from go, because reading a roster
  // top to bottom while the camera jumps to each row is unusable. Nobody reads
  // this bar; they reach into it for one element and the next thing they want
  // is to see it.
  const pick = () => {
    ui.setSelected(e.units.map(u => u.id))
    centerView({
      x: e.units.reduce((n, u) => n + u.x, 0) / e.units.length,
      y: e.units.reduce((n, u) => n + u.y, 0) / e.units.length,
    })
  }

  return (
    <button onClick={pick} title={[
      e.team ? `${e.name} — ${e.units.length} elements` : e.name,
      cdr ? `${cdr.soldier?.rank ?? ''} ${cdr.soldier?.name ?? cdr.unit.label}${cdr.acting ? ' (acting)' : ''}`.trim() : null,
      flag ? `ON CONTACT: ${e.units.map(u => `${u.label} ${u.roe.toUpperCase()}`).join(', ')}` : null,
      `${str}% · ${st.text}${roe ? ` · ${roe.toUpperCase()}` : ' · SPLIT DRILL'}`,
      e.slot ? `Press ${e.slot} to select · click to go there` : 'Click to go there',
    ].filter(Boolean).join('\n')} style={{
      display: 'flex', alignItems: 'center', gap: compact ? 4 : 6, flex: '0 0 auto',
      fontFamily: UI, fontSize: FZ.label, letterSpacing: 0.3,
      padding: compact ? '2px 7px' : '2px 8px 2px 4px',
      borderRadius: 2, cursor: 'pointer',
      border: `1px solid ${active ? '#3d7cb8' : '#22303d'}`,
      background: active ? '#16304a' : 'rgba(18,26,34,0.9)',
      color: active ? '#dceeff' : '#9fb3c6',
    }}>
      {/* WORDS FOR THE FEW, COLOUR FOR THE MANY.
          A loose element genuinely has less to say than a team: no aggregate,
          no order of march, no commander of its own to name. Giving it the
          same five columns anyway is what put thirteen platoons behind a
          horizontal scrollbar with no teams formed at all — the bar failed on
          an ordinary force before the player had organized anything.
          So a loose element carries its name, and its state and health ride
          the TEXT COLOUR and a dot instead of two more words. Everything the
          words were saying is still one hover away. */}
      {!compact && (
        <span style={{
          minWidth: 15, textAlign: 'center', fontSize: FZ.label, fontWeight: 700,
          color: e.slot ? (active ? '#ffd67e' : '#5d6f80') : 'transparent',
        }}>{e.slot ?? '·'}</span>
      )}
      {/* THE SAME SYMBOL THE SHEET DRAWS. A team's rolled-up icon carries what
          its name cannot — the base element's branch, and the company echelon
          bar that says this is a company team and not the platoon it is named
          for. One visual language across the bar and the map.
          The loose elements get their TYPE instead: thirteen platoon symbols in
          a row stop resolving at this size and cost three hundred pixels, and
          what the player actually wants from that list is which one is the
          engineer, which is two characters. */}
      {!compact && base && (
        <PaletteIcon unit={base} w={20} h={15} scale={0.52} echelon="co" />
      )}
      <span style={{ color: compact ? st.tone : (active ? '#dceeff' : '#c8d8e8') }}>{e.name}</span>
      {compact ? (
        <>
          <span style={{ fontSize: FZ.hint, color: '#5d6f80' }}>
            {UNIT_TYPES[e.units[0]!.type]?.abbr ?? ''}
          </span>
          {str < 85 && (
            <span style={{ fontSize: FZ.hint, color: strengthTone(str) }}>{str}%</span>
          )}
          {flag && <span style={{ fontSize: FZ.hint, color: WARN }}>•</span>}
        </>
      ) : (
        <>
          {e.team && <span style={{ fontSize: FZ.hint, color: '#5d6f80' }}>×{e.units.length}</span>}
          <span style={{ fontSize: FZ.hint, color: strengthTone(str) }}>{str}%</span>
          <span style={{ fontSize: FZ.hint, color: st.tone }}>{st.text}</span>
          <span style={{ fontSize: FZ.hint, color: flag ? WARN : '#5d6f80' }}>
            {roe ? roe.toUpperCase() : 'SPLIT'}
          </span>
        </>
      )}
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
  const on = (e: Entry) => e.units.length === sel.size && e.units.every(u => sel.has(u.id))
  const loose = list.filter(e => !e.team)
  return (
    <div style={{
      flex: '0 0 auto', display: 'flex', flexDirection: 'column', position: 'relative',
      background: 'rgba(8,12,16,0.96)', borderTop: '1px solid #1e2c3a',
    }}>
      {/* WHAT YOU HAVE LOOSE, AND WHERE THE REST OF IT IS STANDING.
          The teams used to be the second row. They are tabs on the right wall
          now, each with a station behind it, so this bar stopped being a task
          org board and became what it should have been: everything that is
          available to COMMIT. Loose elements on the ground, and the bases the
          rest of the battalion is still sitting in. */}
      <Scroller label={`INDEPENDENT (${loose.length})`} empty={!loose.length}
        hint="EVERY ELEMENT IS TASK ORGANIZED">
        {loose.map(e => <Chip key={e.key} e={e} active={on(e)} compact />)}
      </Scroller>
      <div style={{ height: 1, background: '#16222e' }} />
      <InstallRow />
    </div>
  )
}

/** THE INSTALLATIONS ROW. Every base you command, and one click into what it
 *  can do — see ui/install/InstallMenu, which drops out of the chip.
 *
 *  A base is not a unit and its chip does not pretend to be one: what a
 *  commander wants off it at a glance is whether anybody is still in it, and
 *  whether it has a reaction force standing. */
function InstallRow() {
  const ui = useUI()
  const sites = S.structures
    .filter(s => s.side === 'friend' && commandsStructure(s))
    .sort((a, b) => BASE_ORDER.indexOf(a.kind) - BASE_ORDER.indexOf(b.kind))

  const hqId = sites.find(s => s.kind === 'HQ')?.id
  const homedHere = (sl: { garrisonAt?: number | null }, id: number) =>
    (S.structures.some(s => s.id === sl.garrisonAt && s.side === 'friend')
      ? sl.garrisonAt : hqId) === id

  return (
    <Scroller label={`INSTALLATIONS (${sites.length})`} empty={!sites.length}
      hint="NONE ESTABLISHED">
      {sites.map(s => {
        const slots = garrisonSlots(true).filter(sl => homedHere(sl, s.id))
        const qrf = slots.filter(sl => sl.qrf).length
        const building = s.buildT > 0
        const active = ui.selectedIds.length === 1 && ui.selectedIds[0] === s.id
        return (
          // A CHIP SELECTS AND GOES THERE. Nothing else — what the base can DO
          // is the selection tray's job, the same way it is for an element.
          // This bar is the roster; the tray is the card for whatever is
          // selected. That is the whole shape of an RTS bottom panel and it was
          // being fought by a chip that opened its own panel over the map.
            <button key={s.id}
              onClick={() => { ui.select(s.id); centerView(s) }}
              title={[
                `${s.label} · ${STRUCTURES[s.kind].name.toUpperCase()}`,
                building ? `UNDER CONSTRUCTION — ${Math.ceil(s.buildT)}s` : null,
                `${slots.length} IN GARRISON · ${qrf ? `${qrf} ON QRF` : 'NO QRF STANDING'}`,
                'Click to go there and open what it can do',
              ].filter(Boolean).join('\n')}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, flex: '0 0 auto',
                fontFamily: UI, fontSize: FZ.label, letterSpacing: 0.3,
                padding: '2px 8px', borderRadius: 2, cursor: 'pointer',
                border: `1px solid ${active ? '#3d7cb8' : '#22303d'}`,
                background: active ? '#16304a' : 'rgba(18,26,34,0.9)',
                color: active ? '#dceeff' : '#9fb3c6',
              }}>
              {/* the kind, unless the label already says it — a pack names its
                  command post 'HQ COBALT', and 'HQ HQ COBALT' is what happens
                  when a chip decorates a label it did not read */}
              {!s.label.toUpperCase().startsWith(s.kind) && (
                <span style={{ color: '#5d6f80', fontSize: FZ.hint }}>{s.kind}</span>
              )}
              <span>{s.label}</span>
              {building
                ? <span style={{ fontSize: FZ.hint, color: WARN }}>⛏{Math.ceil(s.buildT)}s</span>
                : (
                  <>
                    <span style={{ fontSize: FZ.hint, color: slots.length ? '#6d8296' : '#3d4f60' }}>
                      ⌂{slots.length}
                    </span>
                    {/* NO QRF IS THE FACT WORTH SEEING. A base with a reaction
                        force says so quietly; one without says so in amber. */}
                    <span style={{ fontSize: FZ.hint, color: qrf ? '#7ec87e' : WARN }}>
                      {qrf ? `⚡${qrf}` : '⚡0'}
                    </span>
                  </>
                )}
            </button>
        )
      })}
    </Scroller>
  )
}

/** ONE ROW OF THE BAR, WITH ARROWS INSTEAD OF A SCROLLBAR.
 *
 *  A horizontal scrollbar in a 26-pixel strip is a 6-pixel drag target sitting
 *  under the row it scrolls, and it steals height from the row to draw itself.
 *  Arrows are a real target, they only appear when there is somewhere to go,
 *  and they leave the strip its full height.
 *
 *  Shift and the wheel does the same thing for anyone who already has the
 *  habit — the browser's own shift-scroll needs a visible overflow to act on,
 *  and this row deliberately has none, so it is done by hand. */
function Scroller({ label, hint, empty, children }: {
  label: string
  hint?: string
  empty?: boolean
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [ends, setEnds] = useState({ left: false, right: false })

  // Measured every render rather than on an event: the roster changes as
  // elements are formed, lost and renamed, and a stale reading leaves an arrow
  // pointing at nothing or hides one that is needed.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const l = el.scrollLeft > 2
    const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
    setEnds(p => (p.left === l && p.right === r ? p : { left: l, right: r }))
  })

  const by = (d: number) => ref.current?.scrollBy({ left: d, behavior: 'smooth' })
  const arrow = (dir: -1 | 1, live: boolean) => (
    <button onClick={() => by(dir * 180)} disabled={!live}
      title={dir < 0 ? 'Scroll left (shift + wheel)' : 'Scroll right (shift + wheel)'}
      style={{
        flex: '0 0 auto', width: 15, alignSelf: 'stretch', border: 'none', padding: 0,
        background: live ? 'rgba(22,34,46,0.9)' : 'transparent',
        color: live ? '#8fb0c8' : '#22303d',
        cursor: live ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: FZ.hint,
      }}>{dir < 0 ? '‹' : '›'}</button>
  )

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: 26 }}>
      <span style={{
        fontFamily: UI, fontSize: FZ.hint, letterSpacing: 0.8, color: '#3d4f60',
        flex: '0 0 auto', padding: '0 8px 0 10px', alignSelf: 'center', whiteSpace: 'nowrap',
      }}>{label}</span>
      {arrow(-1, ends.left)}
      <div ref={ref}
        onWheel={e => { if (e.shiftKey) ref.current?.scrollBy({ left: e.deltaY }) }}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0,
          padding: '0 6px',
          // HIDDEN, NOT AUTO. An overflow the browser draws a bar for is a bar
          // in a 26 px strip; hidden still scrolls under scrollBy and scrollLeft,
          // so the arrows and shift-wheel drive it and nothing draws itself.
          overflowX: 'hidden', overflowY: 'hidden',
        }}>
        {empty
          ? <span style={{ fontFamily: UI, fontSize: FZ.hint, color: '#2f4152' }}>
              {hint ?? 'NONE'}
            </span>
          : children}
      </div>
      {arrow(1, ends.right)}
    </div>
  )
}
