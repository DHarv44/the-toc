// MAP-COLUMN OVERLAYS: the fire-mission options panel, the toasts, the map
// control corner — and the SELECTION TRAY, which is the command dock.
//
// This file was fifteen hundred lines. What else lived in it now lives beside
// it, because none of it shared anything with the rest but the column it drew
// over: ui/tray (the dock's parts), ui/menus (the right-click menus), ui/feeds
// (the whole UAS window), ui/mapUtil (the two helpers both halves needed).
import { useRef, useEffect, useState, type CSSProperties } from 'react'
import { Box, Group, Popover, Text } from '@mantine/core'
import { S } from '../engine/state'
import { isNight } from '../engine/sun'
import type { Structure, Unit, Drone, Roe, WeaponsControl } from '../engine/GameState'
import { commandsStructure } from '../domains/forces/command'
import { STRUCTURES } from '../domains/installations/catalog'
import ComponentDrop, { garrisonAt, installComponents } from './install/InstallComponents'
import {
  orderHold, orderMount, orderRoe, orderDefend, orderWeapons,
} from '../domains/forces/orders'
import { orderReturnToGarrison } from '../domains/installations/orders'
import { fieldUnitDrone } from '../domains/air/orders'
import { FORMATION } from '../domains/forces/elements'
import { grid } from '../lib/format'
import { UNIT_TYPES } from '../domains/forces/catalog'
import { DRONE_TYPES } from '../domains/air/catalog'
import { useUI, type UiMode } from './store'
import { buildItems } from './palette'
import { FZ, clamp, panel, btn, mapColumnSize } from './styles'
import { MapButton, MapControlStack } from './MapControls'
import { TUT, fieldTarget } from './tutTargets'
import { teamCdr, teamOf, teamUnits } from '../domains/forces/teams'
import { MARCH_INTERVAL, marchMoving, marchPlan } from '../domains/movement/march'

// The command dock's own parts — see ui/tray/.
import {
  CommandCard, Pick, Seg, btnGhost, one, optBtn, trayShell,
  type CmdSlot,
} from './tray/controls'
import TaskOrgSeg from './tray/TaskOrgSeg'
import FormSelect from './tray/FormSelect'
import ContextMenu from './menus/ContextMenu'
import { elementActions } from './forces/actions'
import { protectionInfo, winView } from './mapUtil'



export default function HUD() {
  useUI((s) => s.tick) // re-render at 10 Hz
  const ui = useUI()

  // AUTO NIGHT: the sheet follows the SUN (engine/sun) unless the commander
  // has overridden it — riding the 10 Hz pump, set only on actual change
  useEffect(() => {
    if (ui.nightMode !== 'auto' || !S.map) return
    const n = isNight()
    if (n !== ui.night) ui.setNight(n)
  })

  // overlays that belong to the map column; the top bar and the two side rails
  // are laid out by App as real siblings of the map. The corner control stack
  // is the SHARED MapControls primitives — the scenario builder composes the
  // same ones over its sheet.
  return (
    <>
      {/* the selection tray is a layout row BELOW the map — App mounts it */}

      {/* fire mission options */}
      {ui.mode === 'target' && <FireMissionPanel />}

      {/* unit context menu */}
      {ui.ctxMenu && <ContextMenu />}

      {/* map controls: a stack at the map column's bottom-right — display
          toggles live ON the map they affect (day/night, range rings, fit) */}
      <MapControlStack>
        <MapButton active={ui.night}
          title={`Sheet lighting — ${ui.nightMode === 'auto'
            ? `AUTO, following the sun (currently ${ui.night ? 'night' : 'day'})`
            : `overridden to ${ui.nightMode}`}. Click cycles auto → day → night.`}
          onClick={ui.cycleNight}>
          {(ui.night ? '☾' : '☀') + (ui.nightMode === 'auto' ? '' : '·')}
        </MapButton>
        <MapButton small active={ui.sat}
          title={S.map?.sat
            ? 'Satellite underlay — orthoimagery of this ground (Esri World Imagery; fetched on first use)'
            : "Satellite underlay — this world's own ground, rendered top-down"}
          onClick={ui.toggleSat}>SAT</MapButton>
        {/* CONTROL MEASURES. The one thing the commander puts on the sheet that
            is neither a unit nor an order — coordination, written down. Armed
            here because they are MAP tools, and each stays armed so a plan goes
            down in a few strokes rather than a few round trips. Clicking an
            existing graphic while armed takes it back off. */}
        {([
          ['phaseline', 'PL', 'Phase line — DRAG across the axis. Elements report crossing it.'],
          ['checkpoint', 'CP', 'Checkpoint — click to drop one. Elements report reaching it.'],
          ['objective', 'OBJ', 'Objective — click to drop one. Elements report arriving on it.'],
          ['boundary', 'BDY', "Boundary — DRAG between two teams. Divides whose ground is whose: crossing it is reported, and fires into the far side need the owner's clearance."],
          ['arrow', 'AXS', 'Axis of advance — DRAG along the intended direction of attack. A named arrow on the graphic (AXIS SABER); visual only.'],
          ['poi', 'POI', 'Point of interest — click to mark a place worth eyes. Visual only.'],
        ] as const).map(([kind, label, tip]) => (
          <MapButton key={kind} small active={ui.mode === `measure:${kind}`}
            title={`${tip}  Click an existing graphic to remove it.`}
            onClick={() => ui.setMode(
              ui.mode === `measure:${kind}` ? 'select' : `measure:${kind}`)}>{label}</MapButton>
        ))}
        {/* NAMED ROUTES: commission an MSR (the router solves the drag along
            real roads; RED until an engineer proofs it) and send the sweep */}
        <MapButton small active={ui.mode === 'msr'}
          title="Route — DRAG start to end and the router solves it along real roads. Commissioned RED until an engineer proofs it; convoys between its ends follow it, and hold when it is red. Click an existing route to decommission."
          onClick={() => ui.setMode(ui.mode === 'msr' ? 'select' : 'msr')}>RTE</MapButton>
        <MapButton small active={ui.mode === 'clearroute'}
          title="Route clearance — select an engineer element, then click the route. They sweep it end to end and it goes GREEN."
          onClick={() => ui.setMode(ui.mode === 'clearroute' ? 'select' : 'clearroute')}>CLR</MapButton>
        {/* THE PEN — colour and weight for the next graphics, shown while a
            draw tool is armed (the commander's own markup style) */}
        {ui.mode.startsWith('measure:') && (
          <>
            {([['', 'default'], ['#e8c547', 'amber'], ['#4a9de0', 'blue'], ['#e0524a', 'red']] as const)
              .map(([c, name]) => (
                <MapButton key={name} small active={(ui.markStyle.color ?? '') === c}
                  title={`Pen colour — ${name}`}
                  onClick={() => ui.setMarkStyle({ color: c || null })}>
                  <span style={{
                    display: 'inline-block', width: 10, height: 10, borderRadius: 2,
                    background: c || '#40c480', border: '1px solid rgba(255,255,255,0.35)',
                  }} />
                </MapButton>
              ))}
            <MapButton small active={false}
              title={`Pen weight — cycles thin / medium / bold (now ${ui.markStyle.weight <= 2 ? 'thin' : ui.markStyle.weight <= 3 ? 'medium' : 'bold'})`}
              onClick={() => ui.setMarkStyle({
                weight: ui.markStyle.weight <= 2 ? 2.6 : ui.markStyle.weight <= 3 ? 4.2 : 1.8,
              })}>{ui.markStyle.weight <= 2 ? '─' : ui.markStyle.weight <= 3 ? '━' : '▬'}</MapButton>
          </>
        )}
        <MapButton small active={ui.overlays.fires}
          title="Fires overlay — indirect max-range rings (the call-for-fire picture)"
          onClick={() => ui.toggleOverlay('fires')}>FIRES</MapButton>
        <MapButton small active={ui.overlays.snsr}
          title="Sensor overlay — recon sight, drone footprints, SIG direction-finding"
          onClick={() => ui.toggleOverlay('snsr')}>SNSR</MapButton>
        <MapButton small active={ui.overlays.wpn}
          title="Weapon overlay — direct-fire range of the selected units"
          onClick={() => ui.toggleOverlay('wpn')}>WPN</MapButton>
        <MapButton small active={ui.overlayAlpha < 1}
          title="Overlay intensity (cycles 100 / 70 / 45%)"
          onClick={ui.cycleOverlayAlpha}>{Math.round(ui.overlayAlpha * 100)}%</MapButton>
        <MapButton small active={ui.track}
          title="Lock the camera to the selected unit or group — stays centered as they move (pan to release)"
          onClick={ui.toggleTrack}>LOCK</MapButton>
        <MapButton title="Fit map to screen"
          onClick={() => {
            if (ui.track) ui.toggleTrack() // fit takes the camera back
            const v = winView()
            if (v && S.map) { v.cx = S.map.WORLD / 2; v.cy = S.map.WORLD / 2; v.ppm = 1e-5 } // clamps to whole-map fit
          }}>⛶</MapButton>
      </MapControlStack>

      {/* toasts */}
      <div style={{
        position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center',
        pointerEvents: 'none', zIndex: 30,
      }}>
        {S.toasts.filter((t) => S.t - t.t < 6).map((t, i) => (
          <div key={i} style={{
            ...panel, padding: '3px 12px', color: '#ffd67e',
            border: '1px solid #4a4020',
          }}>{t.msg}</div>
        ))}
      </div>

      {/* drone feeds live in the FEEDS rail now (P5) — see ui/FeedsPanel */}
    </>
  )
}

function FireMissionPanel() {
  const ui = useUI()
  const o = ui.fireOpts
  const group = (title: string, opts: ReadonlyArray<readonly [string | number, string]>, key: 'shell' | 'rounds' | 'sheaf') => (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      <span style={{ color: '#54708a', fontSize: 9, width: 40, letterSpacing: 1 }}>{title}</span>
      {opts.map(([val, label]) => (
        <button key={String(val)} style={optBtn(o[key] === val)}
          onClick={() => ui.setFireOpts({ [key]: val })}>{label}</button>
      ))}
    </div>
  )
  return (
    <div style={{
      ...panel, position: 'absolute', bottom: 118, left: '50%', transform: 'translateX(-50%)',
      zIndex: 15, display: 'flex', flexDirection: 'column', gap: 4, padding: 8,
      border: '1px solid #6a4030',
    }}>
      <div style={{ color: '#ff9e6a', fontSize: 10, letterSpacing: 2 }}>CALL FOR FIRE — CLICK TARGET GRID</div>
      {group('SHELL', [['HE', 'HE'], ['ICM', 'ICM ⛨'], ['SMOKE', 'SMOKE ▒']], 'shell')}
      {group('ROUNDS', [[0, 'DFLT'], [2, '2'], [4, '4'], [6, '6'], [8, '8']], 'rounds')}
      {group('SHEAF', [['POINT', 'POINT'], ['STD', 'STD'], ['AREA', 'AREA']], 'sheaf')}
      <div style={{ color: '#5a7288', fontSize: 8.5 }}>
        {o.shell === 'ICM' ? 'ANTI-ARMOR SUBMUNITIONS — WEAK VS INF/BLDG'
          : o.shell === 'SMOKE' ? 'SCREENING SMOKE — BLOCKS OBSERVATION AND DIRECT FIRE ~75S'
          : 'HIGH EXPLOSIVE — GENERAL PURPOSE'}
        {' · MORE ROUNDS = LONGER RELOAD'}
      </div>
    </div>
  )
}



// The selection tray is a LAYOUT ROW below the map (P5), not a map overlay —
// App mounts it as a sibling under the map wrapper.
export function SelectionTray() {
  useUI((s) => s.tick)
  const ui = useUI()
  const [min, setMin] = useState(false)
  // THE PRINTED KEY HAS TO WORK. A face that says H and does nothing when you
  // press H is worse than a face with nothing on it — the player tries it once,
  // it fails, and now none of the other eleven are trusted either. The card is
  // the source of truth for both: the same slot list draws the letters and
  // answers them, so they cannot disagree.
  //
  // Held in a ref and bound once, because the slot list is built AFTER this
  // component's early returns and a hook cannot live down there.
  const slotsRef = useRef<CmdSlot[]>([])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const k = e.key.toUpperCase()
      const slot = slotsRef.current.find(s => s.show && s.hot === k)
      if (!slot) return
      e.preventDefault()
      slot.on()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // the roster starts SHUT for a team — the headline is the team, not its parts
  const [roster, setRoster] = useState(false)
  const units = ui.selectedIds.map(id => S.units.find(u => u.id === id)).filter((u): u is Unit => !!u)
  const selDrones = ui.selectedIds.map(id => S.drones.find(d => d.id === id)).filter((d): d is Drone => !!d)
  // A BASE IS A SELECTED OBJECT TOO, and this row is the card for whatever is
  // selected — which is what a bottom panel is in every real-time strategy game
  // ever made. Picking an installation used to leave the dock saying "SELECT AN
  // ELEMENT OR A TEAM" while a separate panel opened over the map.
  const st = ui.selectedIds.length === 1
    ? S.structures.find(s => s.id === ui.selectedIds[0] && commandsStructure(s))
    : undefined
  if (st) return <StructureTray st={st} />

  // THE GROUND MUST NOT MOVE WHEN YOU CLICK ON IT. The tray is a layout row, so
  // appearing on the first selection used to shrink the map and shift every
  // symbol up sixty pixels — under a cursor that was mid-click, on a battlefield
  // the player was reading. The space is reserved whether or not anything is in
  // it: an empty command dock is what a real console looks like anyway.
  if (!units.length && !selDrones.length) {
    return (
      <div style={{ ...trayShell, alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#2f4152', fontSize: FZ.label, letterSpacing: 1.2 }}>
          SELECT AN ELEMENT OR A TEAM — 1-9 PICKS A TEAM
        </span>
      </div>
    )
  }
  const count = units.length + selDrones.length
  // THE TWELVE CELLS, IN THIS ORDER, FOREVER — see ui/tray CommandCard for why
  // the order and the holes matter, and ui/forces/actions for the definitions.
  // They moved out because the TEAM STATION offers the same verbs to a whole
  // team, and two lists of what a force can do would drift the first time one
  // of them gained a row.
  const cardSlots: CmdSlot[] = elementActions(units, ui)
  // what the keyboard answers, kept in step with what the card draws
  slotsRef.current = cardSlots

  // minimized: the body goes away, leaving a slim restore row under the map
  if (min) {
    return (
      <button onClick={() => setMin(false)} title="Show selection"
        style={{
          flex: '0 0 auto', width: '100%',
          background: 'rgba(10,14,18,0.94)', color: '#9ab8d0', border: 'none', borderTop: '1px solid #2a3a48',
          padding: '2px 14px', fontSize: 10, letterSpacing: 1,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>▲ {count} SELECTED</button>
    )
  }

  return (
    <div style={trayShell}>
      {/* WHAT YOU HAVE HOLD OF, AND NOTHING ABOUT WHOSE TEAM IT IS.
          This used to become a team headline whenever the selection happened to
          be a whole one — name, commander, interval, whether the column was
          under way. Every word of that is the station's now, and a dock that
          re-labels itself depending on what you picked is a dock the player has
          to read before they can use it. It commands ELEMENTS. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#54708a', fontSize: FZ.label, letterSpacing: 1 }}>{count} SELECTED</span>
        <div style={{ flex: 1, height: 1, background: '#1e2c3a' }} />
        <button style={{ ...optBtn(roster), color: '#7c92a6' }}
          title={roster ? 'Hide the roster' : 'Show the elements'}
          onClick={() => setRoster(r => !r)}>{roster ? '▾' : '▸'} ROSTER</button>
        <button style={{ ...optBtn(false), color: '#7c92a6' }} title="Clear selection"
          onClick={() => ui.setSelected([])}>CLEAR</button>
        <button style={{ ...optBtn(false), color: '#7c92a6' }} title="Minimize"
          onClick={() => setMin(true)}>—</button>
      </div>
      <div style={{
        display: roster ? 'flex' : 'none',
        gap: 5, flexWrap: 'wrap', justifyContent: 'center',
      }}>
        {units.map(u => {
          const type = UNIT_TYPES[u.type]
          const str = Math.max(0, Math.round(u.strength))
          return (
            <div key={u.id}
              onClick={() => {
                ui.setSelected([u.id])
                const v = winView()
                if (v) { v.cx = u.x; v.cy = u.y }
              }}
              style={{
                background: '#12202e', border: '1px solid #35506a', borderRadius: 2,
                padding: '3px 7px', cursor: 'pointer', minWidth: 78,
              }}>
              <div style={{ color: '#7ec8ff', fontSize: FZ.label }}>
                {u.label}{u.attFrom ? <span style={{ color: '#c8a25f', fontSize: FZ.hint }}> ATT</span> : null}
              </div>
              {u.lineage && (
                <div style={{ fontSize: FZ.hint, color: '#54708a', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>
                  {u.lineage}{u.attFrom ? ` · ${u.attFrom}` : ''}
                </div>
              )}
              <div style={{ fontSize: FZ.hint, color: '#9ab8d0' }}>
                {type.carrier ? (u.mounted ? 'MTD · ' : 'DSM · ') : ''}
                {u.posture === 'dig' ? `DUG ${Math.round(u.digT * 100)}% · ` : ''}
                {u.weapons === 'hold' ? 'W-HOLD · ' : u.weapons === 'tight' ? 'W-TIGHT · ' : ''}
                {u.convoy ? `LOG ${u.convoy.phase.toUpperCase()}${u.convoy.carrying ? ' ' + u.convoy.carrying : ''} · ` : ''}
                {type.indirect ? `${Math.floor(u.ammo ?? 0)} RDS · ` : ''}
                {u.state.toUpperCase()}{u.targetId ? ' ⚔' : ''}{u.bridging ? ` ${Math.ceil(u.bridging.t)}S` : ''}
              </div>
              {(() => {
                const p = protectionInfo(u)
                if (!p.total && !p.cover) return null
                return (
                  <div style={{ fontSize: FZ.hint, color: '#7ea87e' }}>
                    {p.cover ? p.terr.toUpperCase() + ' COVER' : 'PREPARED'}
                    {p.total > 0 ? ` · −${p.total}% DMG` : ''}
                    {p.concealed ? ' · LOW-VIS' : ''}
                  </div>
                )
              })()}
              <div style={{ height: 3, background: '#0a1218', marginTop: 2 }}>
                <div style={{
                  height: 3, width: `${str}%`,
                  background: str > 60 ? '#39d353' : str > 30 ? '#e8c547' : '#e8524a',
                }} />
              </div>
            </div>
          )
        })}
      </div>
      {selDrones.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center' }}>
          {selDrones.map(d => (
            <div key={d.id}
              onClick={() => { ui.setSelected([d.id]); const v = winView(); if (v) { v.cx = d.x; v.cy = d.y } }}
              style={{
                background: '#0e2420', border: '1px solid #2f5a4a', borderRadius: 2,
                padding: '3px 7px', cursor: 'pointer', minWidth: 78,
              }}>
              <div style={{ color: '#5ac8aa', fontSize: FZ.label }}>{d.label} <span style={{ color: '#3a6a5a' }}>{DRONE_TYPES[d.type].abbr}</span></div>
              <div style={{ fontSize: FZ.hint, color: '#8ab8a8' }}>
                {d.state === 'rtb' ? 'RTB' : d.state.toUpperCase()}
                {d.state !== 'rtb' ? ` · ${Math.max(0, Math.ceil(d.endurance))}S` : ''}
                {d.lock ? ' ◆' : ''}
              </div>
            </div>
          ))}
        </div>
      )}
      {/* THE ORDER YOU ARE GIVING, AT THE ECHELON YOU ARE GIVING IT.
          This row is about the FORMATION: where it goes, how it marches, who
          is in it. It exists separately because a battalion commander moving a
          company team and a platoon leader picking a wedge are not the same
          act, and putting both in one strip of identical buttons — which is
          what this was — makes the player sort them out every single time.

          AND IT WRAPS. A DOCK THAT LOSES ITS CONTROLS IS NOT A DOCK: two team
          stations open take six hundred pixels off this row's width, and
          everything past the command card — the whole of the standing orders —
          was clipped off the end of it, captions on screen and the pickers they
          labelled not. A row of height is the cheaper of the two. */}
      {units.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          {/* THE TASK ORG ZONE IS GONE. FORM / JOIN / DETACH and the door to a
              team lived here because the dock was once the only surface that
              knew about teams. Forming is `G` or the right-click menu, which is
              where the elements you mean are; everything else about a team is
              its station. A dock that grows a column of buttons whenever the
              selection happens to be organised is the dock re-labelling itself,
              which is the thing the fixed card exists to prevent. */}

          {/* ZONE 1 — THE COMMAND CARD. Fixed grid, printed hotkeys. */}
          <CommandCard slots={cardSlots} />

          {/* ZONE 3 — STANDING ORDERS. Not things you do, things that stay
              true: what this element does when somebody shoots at it, whether
              it may shoot first, how it is arranged, how far apart it drives.
              They are stacked and right-aligned at a fixed width so the pickers
              line up in a column instead of drifting with the card's width. */}
          <div style={{
            marginLeft: 'auto', flex: '0 0 auto',
            display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end',
          }}>
            <div data-tut={TUT.roeBreak}>
              <Pick label="ON CONTACT"
                value={one(units.map(u => (u.roe || 'halt') as Roe))}
                options={[['push', 'PUSH'], ['halt', 'HALT'], ['break', 'BREAK']] as const}
                onPick={roe => units.forEach(u => orderRoe(u.id, roe))} />
            </div>
            <Pick label="WEAPONS"
              value={one(units.map(u => (u.weapons || 'free') as WeaponsControl))}
              options={[['free', 'FREE'], ['tight', 'TIGHT'], ['hold', 'HOLD']] as const}
              onPick={w => units.forEach(u => orderWeapons(u.id, w))} />
            {/* INTERVAL IS NOT HERE ANY MORE. How far apart a column drives is
                a property of the COLUMN, not of the elements in it, and the
                column has a home: its station. It stayed in the dock while the
                dock was the only place a team existed, and having it in both
                would be two controls writing one march plan. */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {/* RANGE draws a ring; it does not tell anybody to do anything,
                  so it is not on the command card. */}
              <Seg label="VIEW">
                <button style={btnGhost(units.every(u => ui.rangeUnits[u.id]))}
                  title="Show this unit's weapon range on the map"
                  onClick={() => {
                    const on = units.every(u => ui.rangeUnits[u.id])
                    units.forEach(u => { if (!!ui.rangeUnits[u.id] === on) ui.toggleUnitRange(u.id) })
                  }}>RANGE</button>
              </Seg>
              <Seg label="FORM"><FormSelect units={units} /></Seg>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}



/** THE BASE'S CARD. Same row, same job: what is selected, and what it can do.
 *
 *  An installation's verbs are LISTS rather than buttons — nineteen elements in
 *  barracks, eight things division might send — so each one is a picker that
 *  drops its list against its own chip and closes when you have chosen. A
 *  button that opens a panel over the map is not a picker; it is a mode. */
function StructureTray({ st }: { st: Structure }) {
  const ui = useUI()
  const [open, setOpen] = useState<string | null>(null)
  const comps = installComponents(st)
  const gar = garrisonAt(st)
  const building = st.buildT > 0

  return (
    <div style={trayShell}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#7ec8ff', fontSize: FZ.item, letterSpacing: 0.8 }}>{st.label}</span>
        <span style={{ color: '#8ba3b8', fontSize: FZ.hint }}>
          {STRUCTURES[st.kind].name.toUpperCase()}
          {building ? ` · BUILDING ${Math.ceil(st.buildT)}S` : ''}
          {` · ${gar.length} IN GARRISON`}
          {st.kind === 'FOB' ? ` · ${Math.floor(st.stock || 0).toLocaleString()} STOCK` : ''}
        </span>
        <div style={{ flex: 1, height: 1, background: '#1e2c3a' }} />
        <button style={{ ...optBtn(false), color: '#7c92a6' }} title="Clear selection"
          onClick={() => ui.setSelected([])}>CLEAR</button>
      </div>
      {building ? (
        <span style={{ color: '#54708a', fontSize: FZ.label }}>
          UNDER CONSTRUCTION — NOTHING CAN BE WORKED FROM HERE YET
        </span>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {comps.map(c => (
            <Popover key={c.key} opened={open === c.key} position="top-start" withinPortal
              offset={4} shadow="md" radius={3} onDismiss={() => setOpen(null)}
              styles={{ dropdown: {
                background: 'rgba(9,13,18,0.985)', border: '1px solid #2a3a48', padding: 4,
              } }}>
              <Popover.Target>
                <button onClick={() => setOpen(o => (o === c.key ? null : c.key))}
                  title={`${c.label} — ${c.note ?? c.n}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: FZ.label, letterSpacing: 0.3,
                    padding: '4px 10px', borderRadius: 2,
                    border: `1px solid ${open === c.key ? '#4d90c8' : '#2f4356'}`,
                    background: open === c.key ? '#255a8c' : 'rgba(22,30,40,0.95)',
                    color: open === c.key ? '#eaf4ff' : '#b3c6d8',
                  }}>
                  <span style={{ fontWeight: 700 }}>{c.label}</span>
                  <span style={{ fontSize: FZ.hint, color: c.tone ?? '#6d8296' }}>
                    {c.note ?? c.n}
                  </span>
                  <span style={{ fontSize: FZ.hint, color: '#54708a' }}>▾</span>
                </button>
              </Popover.Target>
              <Popover.Dropdown>
                <ComponentDrop st={st} kind={c.key} onClose={() => setOpen(null)} />
              </Popover.Dropdown>
            </Popover>
          ))}
        </div>
      )}
    </div>
  )
}

// The UAS feed window lives in ui/feeds. Re-exported because FeedsPanel and the
// tray both import it from here today; the name is what they know it by.
export { default as FeedWindow } from './feeds/FeedWindow'
