// MAP-COLUMN OVERLAYS: the fire-mission options panel, the toasts, the map
// control corner — and the SELECTION TRAY, which is the command dock.
//
// This file was fifteen hundred lines. What else lived in it now lives beside
// it, because none of it shared anything with the rest but the column it drew
// over: ui/tray (the dock's parts), ui/menus (the right-click menus), ui/feeds
// (the whole UAS window), ui/mapUtil (the two helpers both halves needed).
import { useRef, useEffect, useState, type CSSProperties } from 'react'
import { Box, Group, Text } from '@mantine/core'
import { S } from '../engine/state'
import type { Unit, Drone, Roe, WeaponsControl } from '../engine/GameState'
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
import { MARCH_INTERVAL, marchMoving, marchPlan, setMarchOrder } from '../domains/movement/march'

// The command dock's own parts — see ui/tray/.
import {
  CommandCard, Pick, Seg, btnGhost, one, optBtn, trayShell,
  type CmdSlot,
} from './tray/controls'
import TaskOrgSeg from './tray/TaskOrgSeg'
import FormSelect from './tray/FormSelect'
import ContextMenu from './menus/ContextMenu'
import { protectionInfo, winView } from './mapUtil'



export default function HUD() {
  useUI((s) => s.tick) // re-render at 10 Hz
  const ui = useUI()

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
        <MapButton active={ui.night} title={ui.night ? 'Switch to day' : 'Switch to night'}
          onClick={ui.toggleNight}>{ui.night ? '☾' : '☀'}</MapButton>
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
        ] as const).map(([kind, label, tip]) => (
          <MapButton key={kind} small active={ui.mode === `measure:${kind}`}
            title={`${tip}  Click an existing graphic to remove it.`}
            onClick={() => ui.setMode(
              ui.mode === `measure:${kind}` ? 'select' : `measure:${kind}`)}>{label}</MapButton>
        ))}
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
  const anyIndirect = units.some(u => UNIT_TYPES[u.type].indirect)
  const anyBridge = units.some(u => UNIT_TYPES[u.type].canBridge)
  // supply run is inherently one truck → one FOB, so it shows for a single logi unit
  const logiUnit = units.length === 1 && UNIT_TYPES[units[0]!.type].logi ? units[0]! : null
  const count = units.length + selDrones.length
  // THE SELECTION IS A TEAM when every element of it belongs to the same one
  // and the whole team is picked — which is what clicking a rolled-up symbol
  // gives you, and what the tray should then be about.
  const t0 = units.length ? teamOf(units[0]!) : undefined
  const selTeam = t0 && units.length === teamUnits(t0).length
    && units.every(u => t0.members.includes(u.id)) ? t0 : null
  const selCdr = selTeam ? teamCdr(selTeam) : null
  const selPlan = selTeam ? marchPlan(selTeam.id) : null
  const teamStr = selTeam && units.length
    ? Math.round(units.reduce((n, u) => n + u.strength, 0) / units.length) : 0

  // THE TWELVE CELLS, IN THIS ORDER, FOREVER. Row one is what you do this
  // bound; row two is how the element carries itself and what it can fight
  // with; row three is what it can build, fly and where it lives. An element
  // that cannot do one of them leaves the cell empty — see CommandCard.
  const eng = units.find(u => buildItems(u).length > 0)
  const carrier = units.find(u => (UNIT_TYPES[u.type].carries?.length ?? 0) > 0)
  const uas = carrier ? UNIT_TYPES[carrier.type].carries![0] : null
  const homed = units.length > 0 && units.every(u => S.org?.slots.some(sl => sl.unitId === u.id))
  const canMount = units.some(u => UNIT_TYPES[u.type].carrier && !u.mounted)
  const canDig = units.some(u => UNIT_TYPES[u.type].def)
  const build = eng ? buildItems(eng)[0] : null
  const cardSlots: CmdSlot[] = [
    { key: 'move', label: 'MOVE', hot: 'Q', show: true, active: ui.cmdMode === 'move',
      title: 'Right-click orders a move', on: () => ui.setCmdMode('move') },
    { key: 'attack', label: 'ATTACK', hot: 'E', show: true, active: ui.cmdMode === 'attack',
      tone: '#c87868', tut: TUT.attackMode,
      title: 'Right-click orders an attack', on: () => ui.setCmdMode('attack') },
    { key: 'stop', label: 'STOP', hot: 'H', show: true,
      title: 'Stop where you are', on: () => units.forEach(u => orderHold(u.id)) },
    { key: 'dig', label: '⛨ DIG IN', hot: 'T', show: canDig, tut: TUT.digIn,
      active: units.every(u => u.posture === 'dig'),
      title: 'Prepare positions here — cover in exchange for staying put',
      on: () => {
        const allDug = units.every(u => u.posture === 'dig')
        units.forEach(u => orderDefend(u.id, !allDug))
      } },
    { key: 'mount', label: 'MOUNT', hot: 'R', show: canMount,
      title: 'Get back in the vehicles', on: () => units.forEach(u => orderMount(u.id, true)) },
    { key: 'dismount', label: 'DISMOUNT', hot: 'F',
      show: units.some(u => UNIT_TYPES[u.type].carrier && u.mounted),
      title: 'Put the infantry on the ground', on: () => units.forEach(u => orderMount(u.id, false)) },
    { key: 'fire', label: 'FIRE MSN', hot: 'C', show: anyIndirect, active: ui.mode === 'target',
      title: 'Call for fire — click the target grid',
      on: () => ui.setMode(ui.mode === 'target' ? 'select' : 'target') },
    { key: 'bridge', label: 'BRIDGE', hot: 'B', show: anyBridge, active: ui.mode === 'bridge',
      title: 'Throw a pontoon bridge — click the crossing',
      on: () => ui.setMode(ui.mode === 'bridge' ? 'select' : 'bridge') },
    { key: 'uas', label: uas ? DRONE_TYPES[uas]!.name.toUpperCase() : 'UAS', hot: 'V',
      show: !!carrier && !!uas, tut: uas === 'RAVEN' ? TUT.uasRaven : undefined,
      title: carrier ? `Launch over ${carrier.label} — live feed of the ground ahead` : undefined,
      on: () => {
        if (!carrier || !uas) return
        const d = fieldUnitDrone(carrier.id, uas)
        if (d && d.id != null) ui.showDrone(d.id)
      } },
    // ORGANIC WORK — what this element makes with its own hands. An engineer
    // builds, a truck hauls; never both, so they share the cell rather than
    // each getting one that is empty for everybody else.
    logiUnit
      ? { key: 'work', label: logiUnit.convoy ? 'END RUN' : 'SUPPLY', hot: 'N', show: true,
          tut: TUT.supplyRun, active: !!logiUnit.convoy,
          title: 'Run supply from the HQ to a chosen FOB, then repeat',
          on: () => {
            if (logiUnit.convoy) orderHold(logiUnit.id)
            else ui.setMode(`convoy:${logiUnit.id}` as never)
          } }
      : { key: 'work', label: build ? `⛏ ${build.label.toUpperCase()}` : 'BUILD', hot: 'N',
          show: !!eng && !!build, tut: build?.mode === 'build:FOB' ? TUT.buildFob : undefined,
          active: !!build && ui.mode === build.mode,
          title: eng && build ? `${eng.label} builds a ${build.label} — click the map to site it` : undefined,
          on: () => {
            if (!build) return
            const m = build.mode as UiMode
            ui.setMode(ui.mode === m ? 'select' : m)
          } },
    { key: 'rtb', label: 'RTB', hot: 'Y', show: homed, tut: TUT.rtb,
      title: 'Return to this element\'s assigned garrison — stand down, refit, absorb replacements',
      on: () => units.forEach(u => orderReturnToGarrison(u.id)) },
    { key: 'garrison', label: 'GARRISON', hot: 'U', show: homed, tut: TUT.garrison,
      active: ui.mode === 'garrison',
      title: 'Reassign garrison: click a friendly base — they stand down there and it becomes home',
      on: () => ui.setMode(ui.mode === 'garrison' ? 'select' : 'garrison') },
  ]
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
      {/* WHO YOU ARE COMMANDING — one line, and for a team it is the team.
          This used to say "5 SELECTED" over five near-identical cards that
          repeated the FORCES rail verbatim and never once named the thing the
          player had actually picked. A commander looking at a company team
          wants its name, who answers for it, what it is worth and whether it
          is moving; the roster is a detail you open, not the headline. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {selTeam ? (
          <>
            <span style={{ color: '#7ec8ff', fontSize: FZ.item, letterSpacing: 0.8 }}>{selTeam.name}</span>
            <span style={{ color: '#8ba3b8', fontSize: FZ.hint }}>
              {teamUnits(selTeam).length} ELEMENTS · {teamStr}%
              {selCdr ? ` · ${selCdr.soldier?.rank ?? ''} ${selCdr.soldier?.name ?? ''}` : ''}
              {selCdr?.acting ? ' (ACTING)' : ''}
            </span>
            {selPlan && (
              <span style={{ color: '#54708a', fontSize: FZ.hint }}>
                {MARCH_INTERVAL[selPlan.column]} M · {marchMoving(selTeam.id) ? 'UNDER WAY' : 'AT THE SP'}
              </span>
            )}
          </>
        ) : (
          <span style={{ color: '#54708a', fontSize: FZ.label, letterSpacing: 1 }}>{count} SELECTED</span>
        )}
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
          what this was — makes the player sort them out every single time. */}
      {units.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          {/* ZONE 1 — WHO YOU ARE COMMANDING AND WHAT IT IS PART OF.
              Task organization first and at a fixed width, because this is a
              game about it and because a zone that resizes moves everything to
              its right. */}
          <div style={{ flex: '0 0 168px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ color: '#6d8296', fontSize: FZ.hint, letterSpacing: 0.8, fontWeight: 600 }}>
              TASK ORG
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              <TaskOrgSeg units={units} />
            </div>
          </div>

          {/* ZONE 2 — THE COMMAND CARD. Fixed grid, printed hotkeys. */}
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
            {selTeam && (
              <Pick label="INTERVAL" value={selPlan?.column ?? 'open'}
                options={[['close', 'CLOSE'], ['open', 'OPEN'], ['infiltration', 'INFIL']] as const}
                title={c => `${MARCH_INTERVAL[c]} m between vehicles`}
                onPick={c => setMarchOrder(selTeam.id, selPlan?.order ?? selTeam.members, c, {
                  ...(selPlan?.roe ? { roe: selPlan.roe } : {}),
                  ...(selPlan?.weapons ? { weapons: selPlan.weapons } : {}),
                  ...(selPlan?.disabled ? { disabled: selPlan.disabled } : {}),
                  ...(selPlan?.authored ? { authored: true } : {}),
                })} />
            )}
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



// The UAS feed window lives in ui/feeds. Re-exported because FeedsPanel and the
// tray both import it from here today; the name is what they know it by.
export { default as FeedWindow } from './feeds/FeedWindow'
