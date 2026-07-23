// Map-column overlays: selection tray, fire-mission options, context menus,
// toasts, fit-to-screen, and the draggable UAV feed windows.
// Ported verbatim from src/ui/HUD.jsx. Two deliberate changes, both flagged:
// - the dead feedRayToGround helper (never called) was dropped;
// - HeaderMenu's "Lock sensor" referenced FeedWindow's lookPoint out of scope
//   (a latent ReferenceError in the old code) — it now receives it as a prop.
import { useRef, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Box, Group, Button, ActionIcon, Menu, Text, Divider } from '@mantine/core'
import { useElementSize } from '@mantine/hooks'
import { S } from '../engine/state'
import type { Unit, Drone, GunFireMode, Roe, WeaponsControl } from '../engine/GameState'
import type { Vec2 } from '../world/WorldMap'
import {
  orderHold, orderMount, orderRoe, orderDefend, orderWeapons,
} from '../domains/forces/orders'
import { convertToHq } from '../domains/installations/orders'
import {
  droneFollow, droneLock, droneSensorMode, droneFire, droneToggleTarget,
  droneClearTargets, droneSet, droneRTB,
} from '../domains/air/orders'
import { gunshipSelectWeapon, gunshipSetMode } from '../domains/air/gunship'
import { revealContact } from '../domains/intel/sensing'
import { elemWorld, elemExposed } from '../domains/forces/elements'
import { grid } from '../lib/format'
import { UNIT_TYPES, COVER_DEF } from '../domains/forces/catalog'
import { STRUCTURES } from '../domains/installations/catalog'
import { DRONE_TYPES } from '../domains/air/catalog'
import { setFeedAmbient, clearFeedAmbient } from '../audio/audio'
import { useUI, ROUTE_MODES, type Feed } from './store'
import { PaletteIcon } from './palette'
import { clamp, panel, btn, fmtClock, mapColumnSize } from './styles'
import DroneView, { AEROSTAT_MIN_TILT, AEROSTAT_MAX_TILT } from '../drone/DroneView'

// compact toggle used in the selection tray / fire-mission rows
const optBtn = (active: boolean): CSSProperties => ({
  ...btn(active), padding: '2px 7px', fontSize: 9.5,
})

const winView = () => (window as unknown as { __view?: { cx: number; cy: number; ppm: number } }).__view

// combined protection readout for a unit: terrain cover × posture
function protectionInfo(u: Unit) {
  const terr = S.map!.terrNameAt(u.x, u.y)
  const cover = terr === 'forest' || terr === 'urban'
  const coverMul = cover ? COVER_DEF[terr] : 1
  const def = UNIT_TYPES[u.type].def
  const digMul = (u.posture === 'dig' && u.digT && def) ? 1 - (1 - def.factor) * u.digT : 1
  const total = Math.round((1 - coverMul * digMul) * 100)
  const concealed = cover || (u.posture === 'dig' && u.digT > 0)
  return { terr, cover, total, concealed }
}


export default function HUD() {
  useUI((s) => s.tick) // re-render at 10 Hz
  const ui = useUI()

  // overlays that belong to the map column; the top bar and the two side rails are
  // laid out by App as real siblings of the map
  return (
    <>
      {/* selection tray */}
      <SelectionTray />

      {/* fire mission options */}
      {ui.mode === 'target' && <FireMissionPanel />}

      {/* unit context menu */}
      {ui.ctxMenu && <ContextMenu />}

      {/* fit-to-screen: a map control at the map column's bottom-right, so it sits
          just left of the net rail */}
      <button
        title="Fit map to screen"
        onClick={() => {
          const v = winView()
          if (v && S.map) { v.cx = S.map.WORLD / 2; v.cy = S.map.WORLD / 2; v.ppm = 1e-5 } // clamps to whole-map fit
        }}
        style={{
          position: 'absolute', right: 10, bottom: 10, zIndex: 16,
          width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 0, fontSize: 16, lineHeight: 1, cursor: 'pointer',
          background: 'rgba(16,26,36,0.9)', color: '#9ab8d0',
          border: '1px solid #35506a', borderRadius: 3,
        }}>⛶</button>

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

      {/* drone feed windows */}
      {ui.feeds.map((f, i) => <FeedWindow key={f.id} feed={f} index={i} />)}
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

// How move orders route. AUTO infers from where you clicked; the rest override it.
function RouteSelect() {
  const ui = useUI()
  const cur = ROUTE_MODES.find((m) => m.val === ui.routeMode) || ROUTE_MODES[0]!
  return (
    <Menu shadow="md" width={230} position="top-start" withArrow={false}>
      <Menu.Target>
        <Button size="compact-xs" variant={ui.routeMode === 'auto' ? 'default' : 'filled'}
          styles={{ label: { fontSize: 9.5, letterSpacing: 0.5 } }}>{cur.label} ▾</Button>
      </Menu.Target>
      <Menu.Dropdown>
        {ROUTE_MODES.map((m) => (
          <Menu.Item key={m.val} onClick={() => ui.setRouteMode(m.val)}
            style={{ background: m.val === ui.routeMode ? 'var(--mantine-color-toc-8)' : undefined }}>
            <Text fz={10} fw={m.val === ui.routeMode ? 700 : 400}>{m.label}</Text>
            <Text fz={8.5} c="dark.3">{m.hint}</Text>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  )
}

function SelectionTray() {
  const ui = useUI()
  const [min, setMin] = useState(false)
  const units = ui.selectedIds.map(id => S.units.find(u => u.id === id)).filter((u): u is Unit => !!u)
  const selDrones = ui.selectedIds.map(id => S.drones.find(d => d.id === id)).filter((d): d is Drone => !!d)
  if (!units.length && !selDrones.length) return null
  const anyIndirect = units.some(u => UNIT_TYPES[u.type].indirect)
  const anyBridge = units.some(u => UNIT_TYPES[u.type].canBridge)
  const count = units.length + selDrones.length

  // minimized: the footer goes away, leaving a small restore tab flush at the bottom
  if (min) {
    return (
      <button onClick={() => setMin(false)} title="Show selection"
        style={{
          position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', zIndex: 14,
          background: 'rgba(10,14,18,0.94)', color: '#9ab8d0', border: '1px solid #2a3a48', borderBottom: 'none',
          borderRadius: '3px 3px 0 0', padding: '2px 14px', fontSize: 10, letterSpacing: 1,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>▲ {count} SELECTED</button>
    )
  }

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 14,
      background: 'rgba(10,14,18,0.94)', borderTop: '1px solid #2a3a48', color: '#c8d8e8',
      padding: '6px 10px 8px', display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center' }}>
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
              <div style={{ color: '#7ec8ff', fontSize: 10 }}>{u.label}</div>
              <div style={{ fontSize: 9, color: '#9ab8d0' }}>
                {type.carrier ? (u.mounted ? 'MTD · ' : 'DSM · ') : ''}
                {u.posture === 'dig' ? `DUG ${Math.round(u.digT * 100)}% · ` : ''}
                {u.weapons === 'hold' ? 'W-HOLD · ' : u.weapons === 'tight' ? 'W-TIGHT · ' : ''}
                {u.convoy ? `LOG ${u.convoy.phase.toUpperCase()}${u.convoy.carrying ? ' ' + u.convoy.carrying : ''} · ` : ''}
                {u.state.toUpperCase()}{u.targetId ? ' ⚔' : ''}{u.bridging ? ` ${Math.ceil(u.bridging.t)}S` : ''}
              </div>
              {(() => {
                const p = protectionInfo(u)
                if (!p.total && !p.cover) return null
                return (
                  <div style={{ fontSize: 8.5, color: '#7ea87e' }}>
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
              <div style={{ color: '#5ac8aa', fontSize: 10 }}>{d.label} <span style={{ color: '#3a6a5a' }}>{DRONE_TYPES[d.type].abbr}</span></div>
              <div style={{ fontSize: 9, color: '#8ab8a8' }}>
                {d.state === 'rtb' ? 'RTB' : d.state.toUpperCase()}
                {d.state !== 'rtb' ? ` · ${Math.max(0, Math.ceil(d.endurance))}S` : ''}
                {d.lock ? ' ◆' : ''}
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: '#54708a', fontSize: 9, alignSelf: 'center' }}>{units.length + selDrones.length} SELECTED</span>
        <button style={btn(false)} onClick={() => units.forEach(u => orderHold(u.id))}>HOLD</button>
        {units.length > 0 && (
          <button style={btn(units.every(u => ui.rangeUnits[u.id]))}
            title="Show this unit's weapon range on the map"
            onClick={() => {
              const on = units.every(u => ui.rangeUnits[u.id])
              units.forEach(u => { if (!!ui.rangeUnits[u.id] === on) ui.toggleUnitRange(u.id) })
            }}>RANGE</button>
        )}
        {units.some(u => UNIT_TYPES[u.type].carrier && !u.mounted) && (
          <button style={btn(false)} onClick={() => units.forEach(u => orderMount(u.id, true))}>MOUNT</button>
        )}
        {units.some(u => UNIT_TYPES[u.type].carrier && u.mounted) && (
          <button style={btn(false)} onClick={() => units.forEach(u => orderMount(u.id, false))}>DISMOUNT</button>
        )}
        {anyIndirect && (
          <button style={btn(ui.mode === 'target')}
            onClick={() => ui.setMode(ui.mode === 'target' ? 'select' : 'target')}>
            FIRE MISSION
          </button>
        )}
        {anyBridge && (
          <button style={btn(ui.mode === 'bridge')}
            onClick={() => ui.setMode(ui.mode === 'bridge' ? 'select' : 'bridge')}>
            PONTOON BRIDGE
          </button>
        )}
        <button style={btn(false)} onClick={() => ui.setSelected([])}>CLEAR</button>
        <button style={{ ...btn(false), marginLeft: 6 }} title="Minimize" onClick={() => setMin(true)}>—</button>
      </div>
      {units.length > 0 && (
        <div style={{ display: 'flex', gap: 3, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: '#54708a', fontSize: 9, letterSpacing: 1 }}>CMD:</span>
          <button style={optBtn(ui.cmdMode === 'move')} onClick={() => ui.setCmdMode('move')}>MOVE (Q)</button>
          <button style={{ ...optBtn(ui.cmdMode === 'attack'), color: ui.cmdMode === 'attack' ? '#fff' : '#c87868' }}
            onClick={() => ui.setCmdMode('attack')}>ATTACK (E)</button>
          <span style={{ color: '#54708a', fontSize: 9, letterSpacing: 1, marginLeft: 6 }}>ROUTE:</span>
          <RouteSelect />
          <span style={{ color: '#54708a', fontSize: 9, letterSpacing: 1, marginLeft: 6 }}>ON CONTACT:</span>
          {([['push', 'PUSH'], ['halt', 'HALT'], ['break', 'BREAK']] as const).map(([roe, label]) => (
            <button key={roe}
              style={optBtn(units.every(u => (u.roe || 'halt') === roe))}
              onClick={() => units.forEach(u => orderRoe(u.id, roe as Roe))}>
              {label}
            </button>
          ))}
          <span style={{ color: '#54708a', fontSize: 9, letterSpacing: 1, marginLeft: 6 }}>WPNS:</span>
          {([['free', 'FREE'], ['tight', 'TIGHT'], ['hold', 'HOLD']] as const).map(([w, label]) => (
            <button key={w}
              style={optBtn(units.every(u => (u.weapons || 'free') === w))}
              onClick={() => units.forEach(u => orderWeapons(u.id, w as WeaponsControl))}>
              {label}
            </button>
          ))}
          {units.some(u => UNIT_TYPES[u.type].def) && (
            <button
              style={{ ...optBtn(units.every(u => u.posture === 'dig')), marginLeft: 6 }}
              onClick={() => {
                const allDug = units.every(u => u.posture === 'dig')
                units.forEach(u => orderDefend(u.id, !allDug))
              }}>
              ⛨ DIG IN
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ContextMenu() {
  const ui = useUI()
  const m = ui.ctxMenu!
  if (m.structId != null) return <StructMenu />
  const u = S.units.find(x => x.id === m.unitId)
  if (!u) { ui.closeMenu(); return null }
  const type = UNIT_TYPES[u.type]
  const item = (label: string, fn: () => void, disabled = false) => (
    <div key={label}
      onClick={() => { if (!disabled) { fn(); ui.closeMenu() } }}
      style={{
        padding: '4px 10px', cursor: disabled ? 'default' : 'pointer', fontSize: 10.5,
        color: disabled ? '#4a6070' : '#c8d8e8', whiteSpace: 'nowrap',
        borderBottom: '1px solid rgba(40,58,72,0.5)',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = '#1c3450' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
      {label}
    </div>
  )
  const col = mapColumnSize(ui.leftOpen, ui.netOpen)
  const x = clamp(m.x, 0, col.w - 190)
  const y = clamp(m.y, 0, col.h - 180)
  return (
    <>
      {/* backdrop to catch outside clicks */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 24 }}
        onMouseDown={() => ui.closeMenu()} onContextMenu={(e) => { e.preventDefault(); ui.closeMenu() }} />
      <div style={{
        position: 'absolute', left: x, top: y, zIndex: 25, minWidth: 180,
        background: 'rgba(12,18,24,0.97)', border: '1px solid #35506a', borderRadius: 3,
        overflow: 'hidden',
      }}>
        <div style={{ padding: '5px 10px', background: '#16283a', color: '#7ec8ff', fontSize: 10.5 }}>
          {u.label} — {type.name.toUpperCase()} · STR {Math.max(0, Math.round(u.strength))}%
          {(() => {
            const p = protectionInfo(u)
            return (p.total > 0 || p.cover)
              ? <span style={{ color: '#7ea87e' }}> · {p.cover ? p.terr.toUpperCase() : 'PREPARED'} −{p.total}%</span>
              : null
          })()}
        </div>
        <div style={{ display: 'flex', gap: 3, alignItems: 'center', padding: '4px 10px', borderBottom: '1px solid rgba(40,58,72,0.5)' }}>
          <span style={{ color: '#54708a', fontSize: 9, letterSpacing: 1 }}>DRILL</span>
          {([['push', 'PUSH'], ['halt', 'HALT'], ['break', 'BREAK']] as const).map(([roe, label]) => (
            <button key={roe} style={optBtn((u.roe || 'halt') === roe)}
              onClick={() => orderRoe(u.id, roe as Roe)}>{label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 3, alignItems: 'center', padding: '4px 10px', borderBottom: '1px solid rgba(40,58,72,0.5)' }}>
          <span style={{ color: '#54708a', fontSize: 9, letterSpacing: 1 }}>WPNS</span>
          {([['free', 'FREE'], ['tight', 'TIGHT'], ['hold', 'HOLD']] as const).map(([w, label]) => (
            <button key={w} style={optBtn((u.weapons || 'free') === w)}
              onClick={() => orderWeapons(u.id, w as WeaponsControl)}>{label}</button>
          ))}
        </div>
        {type.def && item(
          u.posture === 'dig'
            ? `ABANDON POSITIONS (${Math.round(u.digT * 100)}%)`
            : `DIG IN — ${type.def.name}`,
          () => orderDefend(u.id, u.posture !== 'dig'))}
        {type.logi && item(
          u.convoy ? 'TERMINATE SUPPLY ROUTE' : 'SUPPLY RUN — SELECT FOB…',
          () => { if (u.convoy) orderHold(u.id); else ui.setMode(`convoy:${u.id}` as never) })}
        {item('HOLD / CANCEL ORDERS', () => orderHold(u.id))}
        {type.carrier && item(u.mounted ? 'DISMOUNT TROOPS' : 'MOUNT UP',
          () => orderMount(u.id, !u.mounted), !u.mounted && !!u.targetId && false)}
        {type.indirect && item(
          u.missionCooldown > 0 ? `FIRE MISSION (RELOAD ${Math.ceil(u.missionCooldown)}S)` : 'FIRE MISSION…',
          () => ui.setMode('target'), u.missionCooldown > 0)}
        {type.canBridge && item('PONTOON BRIDGE…', () => ui.setMode('bridge'))}
        {item('CENTER MAP', () => { const v = winView(); if (v) { v.cx = u.x; v.cy = u.y } })}
      </div>
    </>
  )
}

function StructMenu() {
  const ui = useUI()
  const m = ui.ctxMenu!
  const s = S.structures.find(x => x.id === m.structId)
  if (!s) { ui.closeMenu(); return null }
  const hqExists = S.structures.some(o => o.side === 'friend' && o.kind === 'HQ')
  const col = mapColumnSize(ui.leftOpen, ui.netOpen)
  const x = clamp(m.x, 0, col.w - 210)
  const y = clamp(m.y, 0, col.h - 160)
  const item = (label: string, fn: () => void, disabled = false) => (
    <div key={label}
      onClick={() => { if (!disabled) { fn(); ui.closeMenu() } }}
      style={{
        padding: '4px 10px', cursor: disabled ? 'default' : 'pointer', fontSize: 10.5,
        color: disabled ? '#4a6070' : '#c8d8e8', whiteSpace: 'nowrap',
        borderBottom: '1px solid rgba(40,58,72,0.5)',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = '#1c3450' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
      {label}
    </div>
  )
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, zIndex: 24 }}
        onMouseDown={() => ui.closeMenu()} onContextMenu={(e) => { e.preventDefault(); ui.closeMenu() }} />
      <div style={{
        position: 'absolute', left: x, top: y, zIndex: 25, minWidth: 200,
        background: 'rgba(12,18,24,0.97)', border: '1px solid #35506a', borderRadius: 3,
        overflow: 'hidden',
      }}>
        <div style={{ padding: '5px 10px', background: '#16283a', color: '#7ec8ff', fontSize: 10.5 }}>
          {s.label} — {STRUCTURES[s.kind].name.toUpperCase()} · {Math.round(s.hp / s.maxHp * 100)}%
          {s.kind === 'FOB' ? ` · STOCK ${Math.floor(s.stock || 0)}` : ''}
        </div>
        {s.kind === 'FOB' && item(
          hqExists ? 'CONVERT TO HQ (HQ EXISTS)' : 'CONVERT TO COMMAND POST (300)',
          () => convertToHq(s.id), hqExists || s.buildT > 0)}
        {item('CENTER MAP', () => { const v = winView(); if (v) { v.cx = s.x; v.cy = s.y } })}
      </div>
    </>
  )
}

const CAM_MODES = ['WHOT', 'BHOT', 'EO', 'NVG'] as const
const CAM_FILTERS: Record<string, string> = {
  WHOT: 'grayscale(1) contrast(1.18) brightness(1.08)',
  BHOT: 'grayscale(1) invert(1) contrast(1.12) brightness(1.02)',
  EO: 'saturate(1.08) contrast(1.05)',
  NVG: 'grayscale(1) brightness(1.4) sepia(1) hue-rotate(55deg) saturate(3.2) contrast(1.12)',
}

// Where the sensor is actually looking — must match DroneCamera exactly, or feed clicks
// and reticles land in the wrong place. The aerostat's look point is on its sweep ring
// (bearing + tilt), NOT tx+gimbal, so it needs its own case; every other state uses the
// orbit aim point. The projection helper below shares this so it can't drift from the
// camera.
function feedAimPoint(drone: Drone, feed: Feed): Vec2 {
  if (drone.lock) return { x: drone.lock.x, y: drone.lock.y }
  if (drone.tether && drone.state === 'onstation') {
    const spec = DRONE_TYPES[drone.type]
    const alt = spec.alt * (drone.altMul || 1)
    const dep = drone.tilt ?? Math.atan2(alt, spec.sight * 0.45)
    const R = alt / Math.tan(Math.max(AEROSTAT_MIN_TILT, dep))
    const a = drone.scanAngle || 0
    return { x: drone.tx + Math.cos(a) * R, y: drone.ty + Math.sin(a) * R }
  }
  return { x: drone.tx + feed.gx, y: drone.ty + feed.gy }
}

// Forward-project a world ground point to feed screen coords (matching the analytic
// sensor camera) so a strike's impact reticle tracks the target as the drone orbits.
function feedProjectToScreen(drone: Drone, feed: Feed, wx: number, wy: number, w: number, h: number): Vec2 | null {
  if (!S.map || !w || !h) return null
  const spec = DRONE_TYPES[drone.type]
  const camPos = { x: drone.x, y: S.map.elevAt(drone.x, drone.y) + spec.alt * (drone.altMul || 1), z: drone.y }
  const aim = feedAimPoint(drone, feed)
  const aimX = aim.x, aimY = aim.y
  let fwd = { x: aimX - camPos.x, y: S.map.elevAt(aimX, aimY) - camPos.y, z: aimY - camPos.z }
  const fl = Math.hypot(fwd.x, fwd.y, fwd.z) || 1
  fwd = { x: fwd.x / fl, y: fwd.y / fl, z: fwd.z / fl }
  let right = { x: -fwd.z, y: 0, z: fwd.x }
  const rl = Math.hypot(right.x, right.z) || 1
  right = { x: right.x / rl, y: 0, z: right.z / rl }
  const camUp = {
    x: right.y * fwd.z - right.z * fwd.y,
    y: right.z * fwd.x - right.x * fwd.z,
    z: right.x * fwd.y - right.y * fwd.x,
  }
  const rel = { x: wx - camPos.x, y: S.map.elevAt(wx, wy) - camPos.y, z: wy - camPos.z }
  const depth = rel.x * fwd.x + rel.y * fwd.y + rel.z * fwd.z
  if (depth <= 1) return null
  const tanV = Math.tan((feed.fov * Math.PI / 180) / 2)
  const tanH = tanV * (w / h)
  const nx = (rel.x * right.x + rel.y * right.y + rel.z * right.z) / depth / tanH
  const ny = (rel.x * camUp.x + rel.y * camUp.y + rel.z * camUp.z) / depth / tanV
  if (Math.abs(nx) > 1.4 || Math.abs(ny) > 1.4) return null
  return { x: (nx + 1) / 2 * w, y: (1 - ny) / 2 * h }
}

// red impact reticle shown in the feed while this drone's strike is inbound
function StrikeReticle({ drone, feed, w, h }: { drone: Drone; feed: Feed; w: number; h: number }) {
  const mk = drone.strikeMark
  if (!mk || S.t > mk.until || !w || !h) return null
  const p = feedProjectToScreen(drone, feed, mk.x, mk.y, w, h)
  if (!p) return null
  const ttg = Math.max(0, mk.until - S.t)
  return (
    <div style={{ position: 'absolute', left: p.x, top: p.y, transform: 'translate(-50%,-50%)', pointerEvents: 'none' }}>
      <div style={{ width: 26, height: 26, border: '2px solid #ff3a28', borderRadius: '50%', boxShadow: '0 0 6px rgba(255,40,20,0.9)' }} />
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 34, height: 2, background: '#ff3a28', transform: 'translate(-50%,-50%)' }} />
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 2, height: 34, background: '#ff3a28', transform: 'translate(-50%,-50%)' }} />
      <div style={{ position: 'absolute', left: '50%', top: 18, transform: 'translateX(-50%)', color: '#ff6a52', fontSize: 8, whiteSpace: 'nowrap' }}>SPLASH {ttg.toFixed(0)}S</div>
    </div>
  )
}

// designated (not-yet-fired) per-vic target boxes, projected into the sensor image
function TargetReticles({ drone, feed, w, h }: { drone: Drone; feed: Feed; w: number; h: number }) {
  if (!drone.targets || !drone.targets.length || !w || !h) return null
  return drone.targets.map((t, i) => {
    const u = S.units.find(x => x.id === t.unitId && x.strength > 0)
    const el = u && u.elements && u.elements[t.ei]
    if (!u || !el || !el.alive) return null
    const wpt = elemWorld(u, el)
    const p = feedProjectToScreen(drone, feed, wpt.x, wpt.y, w, h)
    if (!p) return null
    return (
      <div key={i} style={{ position: 'absolute', left: p.x, top: p.y, transform: 'translate(-50%,-50%)', pointerEvents: 'none' }}>
        <div style={{ width: 24, height: 24, border: '2px solid #ff3a28', boxShadow: '0 0 5px rgba(255,40,20,0.8)' }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 3, height: 3, background: '#ff3a28', transform: 'translate(-50%,-50%)' }} />
      </div>
    )
  })
}

// Footer bar: flight controls + gunship fire-control, and the window resize grip at
// its right edge. It renders even with no drone bound so the grip is always reachable.
function FeedFooter({ drone, resizable, onResizeDown, onResizeMove, onResizeUp }: {
  drone: Drone | null
  resizable: boolean
  onResizeDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onResizeMove: (e: React.PointerEvent<HTMLDivElement>) => void
  onResizeUp: () => void
}) {
  const spec = drone && DRONE_TYPES[drone.type]
  const g = spec && spec.gunship
  const w = g && drone!.gunSel != null ? g.weapons[drone!.gunSel] : undefined
  const ammo = g ? ((drone!.gunAmmo && drone!.gunAmmo[drone!.gunSel!]) || 0) : 0
  const hasTgt = !!(drone && drone.targets && drone.targets.length > 0)
  const lbl: CSSProperties = { letterSpacing: 1 }
  return (
    <Group gap={7} wrap="nowrap" pl={10} pr={resizable ? 20 : 10} py={5} onPointerDown={(e) => e.stopPropagation()}
      style={{ flex: '0 0 auto', position: 'relative', background: 'rgba(8,12,16,0.92)', borderTop: '1px solid #223240', overflow: 'hidden' }}>
      {drone && spec && (<>
      <Text span fz={8} c="dark.2" style={lbl}>ALT</Text>
      <FeedSelect title="Altitude" value={drone.altMul || 1}
        options={[{ val: 0.6, label: 'LOW' }, { val: 1, label: 'MED' }, { val: 1.6, label: 'HIGH' }]}
        onSelect={(v) => droneSet(drone.id, { altMul: v })} color="#8fb0c8" minWidth={52} />
      {spec.src !== 'tether' && (
        <>
          <Text span fz={8} c="dark.2" style={lbl}>ORBIT</Text>
          <FeedSelect title="Orbit width" value={drone.orbitMul || 1}
            options={[{ val: 0.5, label: 'TIGHT' }, { val: 1, label: 'STD' }, { val: 1.8, label: 'WIDE' }]}
            onSelect={(v) => droneSet(drone.id, { orbitMul: v })} color="#8fb0c8" minWidth={58} />
        </>
      )}
      {g && w && (
        <>
          <Box style={{ width: 1, height: 14, background: '#3a4a58' }} />
          <Text span fz={8} c="dark.2" style={lbl}>WPN</Text>
          <FeedSelect title="Weapon" value={drone.gunSel!}
            options={g.order.map((k) => ({ val: k, label: g.weapons[k]!.short }))}
            onSelect={(k) => gunshipSelectWeapon(drone.id, k)} color="#c8b088" minWidth={56} />
          {w.kind === 'gun' ? (
            <>
              <Text span fz={8} c="dark.2" style={lbl}>MODE</Text>
              <FeedSelect title="Fire mode" value={(drone.fireMode || 'hold') as GunFireMode}
                options={[{ val: 'will' as GunFireMode, label: 'WILL' }, { val: 'designated' as GunFireMode, label: 'DESIG' }, { val: 'hold' as GunFireMode, label: 'HOLD' }]}
                onSelect={(m) => gunshipSetMode(drone.id, m)} color="#ffb257" minWidth={62} />
            </>
          ) : (
            <Button size="compact-xs" color="red.9" disabled={!hasTgt || ammo <= 0} ml="auto"
              styles={{ label: { fontSize: 9, fontWeight: 700 } }}
              title={hasTgt ? 'Fire a 105mm round on each designated vic' : 'Click vics in the feed to designate'}
              onClick={() => droneFire(drone.id)}>◎ FIRE 105</Button>
          )}
        </>
      )}
      </>)}
      {/* resize grip — in the footer rather than over the imagery */}
      {resizable && (
        <Box onPointerDown={onResizeDown} onPointerMove={onResizeMove} onPointerUp={onResizeUp}
          title="Resize feed window"
          style={{
            position: 'absolute', right: 0, top: 0, bottom: 0, width: 18, zIndex: 3,
            cursor: 'nwse-resize', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <Box style={{ width: 9, height: 9, background: 'linear-gradient(135deg, transparent 45%, rgba(120,160,200,0.8) 45%)' }} />
        </Box>
      )}
    </Group>
  )
}

// Compact Mantine dropdown used across the UAV window (sensor mode, weapon, fire
// mode): the target button shows the current value; opening lists the options;
// picking one applies it and closes. Mantine's Menu handles positioning (auto-flips
// up near the bottom footer), click-outside, and portalling out of the feed's clip.
interface FeedOption<V> { val: V; label: string; icon?: ReactNode }
function FeedSelect<V extends string | number | null>({ value, options, onSelect, color = 'dark.1', minWidth = 48, title, placeholder }: {
  value: V
  options: ReadonlyArray<FeedOption<V>>
  onSelect: (v: V) => void
  color?: string
  minWidth?: number
  title?: string
  placeholder?: string
}) {
  const cur = options.find((o) => o.val === value)
  const withIcons = options.some((o) => o.icon)
  const nowrap: CSSProperties = { whiteSpace: 'nowrap' }
  return (
    <Menu shadow="md" width={withIcons ? 'auto' : Math.max(minWidth, 80)}
      position="bottom-start" withArrow={false} trapFocus={false}>
      <Menu.Target>
        <Button size="compact-xs" variant="default" c={color} title={title}
          leftSection={cur?.icon}
          rightSection={<Text span fz={8} c="dimmed">▾</Text>}
          onPointerDown={(e) => e.stopPropagation()}
          styles={{
            root: { minWidth, paddingInline: 6, fontWeight: 400 },
            label: { fontSize: 9, ...nowrap },
            section: { marginInlineEnd: 4 },
          }}>
          {cur ? cur.label : (placeholder ?? value)}
        </Button>
      </Menu.Target>
      <Menu.Dropdown onPointerDown={(e) => e.stopPropagation()}>
        {options.map((o) => (
          <Menu.Item key={String(o.val)} onClick={() => onSelect(o.val)}
            leftSection={o.icon}
            bg={o.val === value ? 'toc.7' : undefined}
            styles={{ item: { padding: '3px 10px' }, itemLabel: { fontSize: 10, ...nowrap }, itemSection: { marginInlineEnd: 6 } }}>
            {o.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  )
}

// Collapsed header controls (hamburger) shown when the header is too narrow for the
// full button row: sensor mode + follow / lock / center / rtb / fire.
// `lookPoint` comes from FeedWindow (the old code referenced it out of scope — a
// latent crash on this path, fixed by the prop).
function HeaderMenu({ feed, drone, camMode, lookPoint }: {
  feed: Feed
  drone: Drone
  camMode: string
  lookPoint: () => Vec2
}) {
  const ui = useUI()
  const spec = DRONE_TYPES[drone.type]
  const armed = spec.weapons || spec.kamikaze
  const hasTargets = !!(drone.targets && drone.targets.length > 0)
  const onStation = drone.state === 'onstation'
  const flying = onStation || drone.state === 'transit'
  return (
    <Menu shadow="md" width={210} position="bottom-end" withArrow={false} trapFocus={false}>
      <Menu.Target>
        <ActionIcon size="md" variant="default" title="Drone controls" style={{ fontSize: 14 }}
          onPointerDown={(e) => e.stopPropagation()}>☰</ActionIcon>
      </Menu.Target>
      <Menu.Dropdown onPointerDown={(e) => e.stopPropagation()}>
        <Group gap={4} wrap="nowrap" px="xs" py={5}>
          <Text span fz={9} c="dark.3" w={44} style={{ letterSpacing: 1 }}>SENSOR</Text>
          <Button.Group>
            {CAM_MODES.map((m) => (
              <Button key={m} size="compact-xs" variant={camMode === m ? 'filled' : 'default'}
                onClick={() => ui.setDroneMode(drone.id, m)} styles={{ label: { fontSize: 9 } }}>{m}</Button>
            ))}
          </Button.Group>
        </Group>
        <Menu.Divider />
        {flying && (
          <Menu.Item color="teal" disabled={!drone.followId && !hasTargets}
            onClick={() => { if (drone.followId) { droneFollow(drone.id, null); return } const t = (drone.targets || [])[0]; if (t) droneFollow(drone.id, t.unitId) }}>
            {drone.followId ? 'Unfollow' : 'Follow contact'}
          </Menu.Item>
        )}
        {onStation && (
          <Menu.Item color="orange"
            onClick={() => { if (drone.lock) { droneLock(drone.id, null); return } droneLock(drone.id, lookPoint()) }}>
            {drone.lock ? 'Unlock sensor' : 'Lock sensor'}
          </Menu.Item>
        )}
        <Menu.Item onClick={() => { const v = winView(); if (v) { v.cx = drone.x; v.cy = drone.y } }}>Center map on UAV</Menu.Item>
        <Menu.Item onClick={() => ui.setFeed(feed.id, { muted: !feed.muted })}>
          {feed.muted ? 'Unmute this feed' : 'Mute this feed'}
        </Menu.Item>
        {drone.state !== 'rtb' && drone.state !== 'striking' && (
          <Menu.Item color="orange" onClick={() => droneRTB(drone.id)}>RTB now</Menu.Item>
        )}
        {flying && armed && (
          <Menu.Item color="red" disabled={!hasTargets || (!!spec.weapons && drone.ammo <= 0)}
            onClick={() => droneFire(drone.id)}>{spec.weapons ? `Fire (${drone.ammo})` : 'Fire'}</Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  )
}

function FeedWindow({ feed, index }: { feed: Feed; index: number }) {
  const ui = useUI()
  const boxRef = useRef<HTMLDivElement>(null)
  const drag = useRef<
    | { mode: 'move'; dx: number; dy: number }
    | { mode: 'resize'; sx: number; sy: number; w: number; h: number }
    | null
  >(null)
  const gimbal = useRef<{ sx: number; sy: number; gx: number; gy: number; a0: number; t0: number; moved: boolean } | null>(null)
  const drone = S.drones.find(d => d.id === feed.droneId) || null
  // where the sensor is currently looking — for the aerostat that's a point on its
  // sweep, not the mast, so LOCK grabs what's on screen rather than straight down
  const lookPoint = (): Vec2 => {
    if (drone!.tether) {
      const scanR = DRONE_TYPES[drone!.type].sight * 0.45
      const a = drone!.scanAngle || 0
      return { x: drone!.tx + Math.cos(a) * scanR + feed.gx, y: drone!.ty + Math.sin(a) * scanR + feed.gy }
    }
    return { x: drone!.tx + feed.gx, y: drone!.ty + feed.gy }
  }
  const camMode = (drone && ui.droneModes[drone.id]) || 'WHOT'
  // measure the actual sensor-view region so target reticles stay accurate at any
  // window size / mode (the view flexes between the header and footer)
  const { ref: contentRef, width: cw, height: ch } = useElementSize<HTMLDivElement>()
  // measure the header; when it can't fit the full control row, collapse the feed
  // tabs into a dropdown and the action buttons into a hamburger menu
  const { ref: headerRef, width: headerW } = useElementSize<HTMLDivElement>()
  const needFull = 130 + S.drones.length * 62 + (drone ? 330 : 0)
  const compact = headerW > 0 && headerW < needFull

  // platform ambient: each airframe's engine loop runs while its feed is open
  const droneType = drone ? drone.type : null
  useEffect(() => {
    if (feed.muted) clearFeedAmbient(feed.id)
    else setFeedAmbient(feed.id, droneType)
  }, [feed.id, droneType, feed.muted])
  useEffect(() => () => clearFeedAmbient(feed.id), [feed.id])

  // --- feed interaction: click = lock target, drag = slew gimbal, wheel = zoom ---
  function feedDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !drone) return
    gimbal.current = { sx: e.clientX, sy: e.clientY, gx: feed.gx, gy: feed.gy, a0: drone.scanAngle || 0, t0: drone.tilt ?? AEROSTAT_MIN_TILT, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function feedMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gimbal.current
    if (!g || !drone) return
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy
    if (!g.moved && Math.hypot(dx, dy) > 6) {
      g.moved = true
      if (drone.lock) droneLock(drone.id, null) // slewing off the target breaks the lock
    }
    if (!g.moved) return
    // aerostat FREE look: horizontal drag pans the turret bearing, vertical drag tilts it.
    // Both inverted (drag the view, not the camera). Tilt is clamped between level — the
    // highest it goes — and near-nadir, so the operator can only look down from horizontal.
    if (drone.tether) {
      if (drone.sensorMode !== 'free') droneSensorMode(drone.id, 'free')
      const tilt = clamp((g.t0 ?? drone.tilt ?? AEROSTAT_MIN_TILT) + dy * 0.004, AEROSTAT_MIN_TILT, AEROSTAT_MAX_TILT)
      droneSet(drone.id, { scanAngle: (g.a0 ?? drone.scanAngle ?? 0) + dx * 0.006, tilt })
      return
    }
    const lx = drone.tx + g.gx, ly = drone.ty + g.gy
    let fx = lx - drone.x, fy = ly - drone.y
    const fl = Math.hypot(fx, fy) || 1
    fx /= fl; fy /= fl
    const rx = -fy, ry = fx
    const scale = (feed.fov / 38) * 2.0
    ui.setFeed(feed.id, {
      gx: clamp(g.gx + rx * dx * scale - fx * dy * 2 * scale, -1800, 1800),
      gy: clamp(g.gy + ry * dx * scale - fy * dy * 2 * scale, -1800, 1800),
    })
  }
  function feedUp(e: React.PointerEvent<HTMLDivElement>) {
    const g = gimbal.current
    gimbal.current = null
    // a drag slews the sensor; a clean click designates a target in the viewer
    if (!g || !drone || g.moved) return
    // any drone can designate a contact in its feed — armed drones FIRE on it,
    // every drone can FOLLOW it
    const rect = e.currentTarget.getBoundingClientRect()
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top
    const w = rect.width, h = rect.height
    // The aerostat designates by direct observation: whatever the operator can see in the
    // sweep is fair game, revealed on the spot. Every other drone still requires the vic to
    // already be a live contact (its passive spotting handles that as it flies).
    const byDirectSight = !!drone.tether
    // pick the nearest on-screen vic/troop to the click
    let best: { unitId: number; ei: number } | null = null, bd = 32 // px hit radius
    for (const u of S.units) {
      if (u.strength <= 0 || !u.elements) continue
      if (!byDirectSight && S.fogEnabled && u.side !== 'friend') { const c = S.contacts.get(u.id); if (!c || !c.live) continue }
      for (let ei = 0; ei < u.elements.length; ei++) {
        const el = u.elements[ei]!
        if (!el.alive || !elemExposed(u, el)) continue
        const wpt = elemWorld(u, el)
        const p = feedProjectToScreen(drone, feed, wpt.x, wpt.y, w, h)
        if (!p) continue
        const dd = Math.hypot(p.x - cx, p.y - cy)
        if (dd < bd) { bd = dd; best = { unitId: u.id, ei } }
      }
    }
    if (best) {
      if (byDirectSight) revealContact(best.unitId) // the feed IS the sensor — put it on the BFT
      // ctrl-click adds/removes from the target set; a plain click selects just that vic
      if (e.ctrlKey) droneToggleTarget(drone.id, best.unitId, best.ei)
      else { droneClearTargets(drone.id); droneToggleTarget(drone.id, best.unitId, best.ei) }
    } else if (!e.ctrlKey) {
      droneClearTargets(drone.id) // plain click on empty space clears the set
    }
  }
  function gimbalZoom(e: React.WheelEvent<HTMLDivElement>) {
    ui.setFeed(feed.id, { fov: clamp(feed.fov * (e.deltaY > 0 ? 1.15 : 1 / 1.15), 5, 55) })
  }
  function gimbalReset() {
    if (drone?.lock) droneLock(drone.id, null)
    ui.setFeed(feed.id, { gx: 0, gy: 0, fov: 38 })
  }

  // default dock position: stack bottom-right
  const style: CSSProperties = feed.x == null
    // dock above the reserved map-control strip (the ⛶ corner), so feeds never bury it
    ? { right: 10 + (index % 2) * (feed.w + 8), bottom: 50 + Math.floor(index / 2) * (feed.h + 8) }
    : { left: feed.x, top: feed.y! }

  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    const rect = boxRef.current!.getBoundingClientRect()
    drag.current = { mode: 'move', dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    drag.current = { mode: 'resize', sx: e.clientX, sy: e.clientY, w: feed.w, h: feed.h }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.stopPropagation()
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d) return
    // feeds live inside the map column, not the viewport: measure the host so drag
    // and resize stay bounded by the map area when the side rails are open
    const host = boxRef.current?.offsetParent?.getBoundingClientRect()
    const hw = host ? host.width : window.innerWidth
    const hh = host ? host.height : window.innerHeight
    const hx = host ? host.left : 0
    const hy = host ? host.top : 0
    if (d.mode === 'move') {
      ui.setFeed(feed.id, {
        x: Math.max(0, Math.min(hw - 120, e.clientX - d.dx - hx)),
        y: Math.max(0, Math.min(hh - 40, e.clientY - d.dy - hy)),
      })
    } else {
      const rect = boxRef.current!.getBoundingClientRect()
      // resizing an undocked-by-right window: pin its current left/top first
      if (feed.x == null) ui.setFeed(feed.id, { x: rect.left - hx, y: rect.top - hy })
      ui.setFeed(feed.id, {
        w: Math.max(280, Math.min(hw, d.w + (e.clientX - d.sx))),
        h: Math.max(210, Math.min(hh, d.h + (e.clientY - d.sy))),
      })
    }
  }
  function endDrag() { drag.current = null }

  // window mode: 'win' (draggable/resizable) | 'max' (fill screen) | 'min' (title only)
  const winMode = feed.winMode || 'win'
  const boxStyle: CSSProperties = winMode === 'max'
    // edge-to-edge below the top bar — no margin, footer flush to the screen bottom
    ? { position: 'fixed', left: 0, top: 34, right: 0, bottom: 0 }
    : winMode === 'min'
      ? { position: 'absolute', ...style, width: feed.w }        // height auto = header only
      : { position: 'absolute', ...style, width: feed.w, height: feed.h }

  const armed = drone && (DRONE_TYPES[drone.type].weapons || DRONE_TYPES[drone.type].kamikaze)
  const hasTargets = !!(drone && drone.targets && drone.targets.length > 0)
  const winIcon: CSSProperties = { fontSize: 12, lineHeight: 1 }

  return (
    <Box ref={boxRef} style={{
      ...boxStyle, display: 'flex', flexDirection: 'column',
      border: '1px solid #2a3a48', borderRadius: winMode === 'max' ? 0 : 3, overflow: 'hidden',
      background: '#020304', zIndex: 40, // UAV window sits above the map controls / other HUD
    }}>
      {/* ---- HEADER (drag handle) ---- */}
      <Group ref={headerRef as React.RefObject<HTMLDivElement>} gap={5} wrap="nowrap" pl={8} pr={12} py={4} align="center"
        onPointerDown={startDrag} onPointerMove={onPointerMove} onPointerUp={endDrag}
        style={{ flex: '0 0 auto', background: 'rgba(8,12,16,0.92)', borderBottom: '1px solid #223240', cursor: 'grab', overflow: 'hidden' }}>
        <Text span fz={9} c={feed.muted ? 'orange.5' : 'dark.2'} style={{ letterSpacing: 1, whiteSpace: 'nowrap' }}>
          FEED {index + 1}
        </Text>
        {/* feed tabs — collapse to a dropdown when the header is tight */}
        {compact ? (
          <FeedSelect title="Feed source" value={feed.droneId} placeholder="— SELECT —" minWidth={84}
            options={S.drones.map((d) => ({
              val: d.id as number | null,
              label: `${d.label} ${d.state === 'transit' ? '→' : d.state === 'rtb' ? 'RTB' : d.state === 'striking' ? '✸' : !isFinite(d.endurance) ? '⚓' : Math.ceil(d.endurance) + 's'}`,
              icon: <PaletteIcon drone={DRONE_TYPES[d.type]} w={26} h={16} scale={0.6} />,
            }))}
            onSelect={(id) => ui.setFeed(feed.id, { droneId: id })} />
        ) : (
          S.drones.map((d) => (
            <Button key={d.id} size="compact-xs" variant={drone && drone.id === d.id ? 'filled' : 'default'}
              onPointerDown={(e) => e.stopPropagation()} onClick={() => ui.setFeed(feed.id, { droneId: d.id })}
              styles={{ label: { fontSize: 9 } }} style={{ flex: '0 0 auto' }}>
              {d.label} {d.state === 'transit' ? '→' : d.state === 'rtb' ? 'RTB' : d.state === 'striking' ? '✸' : !isFinite(d.endurance) ? '⚓' : Math.ceil(d.endurance) + 's'}
            </Button>
          ))
        )}
        {/* everything past the feed tabs is right-aligned */}
        <Group gap={5} wrap="nowrap" ml="auto" style={{ flex: '0 0 auto' }}>
          {/* action controls — collapse to a hamburger when the header is tight */}
          {compact ? (
            drone && <HeaderMenu feed={feed} drone={drone} camMode={camMode} lookPoint={lookPoint} />
          ) : (
            <>
              {drone && (
                <FeedSelect title="Sensor mode" value={camMode}
                  options={CAM_MODES.map((m) => ({ val: m as string, label: m }))}
                  onSelect={(m) => ui.setDroneMode(drone.id, m)} color="#8fd4a8" minWidth={52} />
              )}
              {drone && (drone.state === 'transit' || drone.state === 'onstation') && (
                <Button size="compact-xs" variant={drone.followId ? 'filled' : 'default'} c="#5ac8aa"
                  disabled={!drone.followId && !hasTargets}
                  title={drone.followId ? 'Stop tracking the contact' : hasTargets ? 'Track the designated contact' : 'Click a contact in the feed to designate it first'}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => { if (drone.followId) { droneFollow(drone.id, null); return } const t = (drone.targets || [])[0]; if (t) droneFollow(drone.id, t.unitId) }}
                  styles={{ label: { fontSize: 9 } }} style={{ flex: '0 0 auto' }}>
                  {drone.followId ? 'UNFOLLOW' : 'FOLLOW'}
                </Button>
              )}
              {/* tethered aerostat: AUTO sweep vs FREE hand-slew. Non-tether drones keep
                  the point-lock. FOLLOW (above) handles pointing the sensor at a contact. */}
              {drone && drone.state === 'onstation' && drone.tether && !drone.followId && (
                <FeedSelect title="Turret" value={drone.sensorMode || 'auto'}
                  options={[{ val: 'auto' as const, label: 'AUTO SWEEP' }, { val: 'free' as const, label: 'FREE LOOK' }]}
                  onSelect={(m) => droneSensorMode(drone.id, m)} color="#8fd4a8" minWidth={72} />
              )}
              {drone && drone.state === 'onstation' && drone.tether && !drone.followId && (drone.sensorMode || 'auto') === 'auto' && (
                <FeedSelect title="Sweep speed" value={drone.scanMul || 1}
                  options={[{ val: 0.5, label: 'SLOW' }, { val: 1, label: 'MED' }, { val: 2, label: 'FAST' }]}
                  onSelect={(v) => droneSet(drone.id, { scanMul: v })} color="#8fd4a8" minWidth={52} />
              )}
              {drone && drone.state === 'onstation' && !drone.tether && (
                <Button size="compact-xs" variant={drone.lock ? 'filled' : 'default'} c="#ffb257"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => { if (drone.lock) { droneLock(drone.id, null); return } droneLock(drone.id, lookPoint()) }}
                  styles={{ label: { fontSize: 9 } }} style={{ flex: '0 0 auto' }}>
                  {drone.lock ? 'UNLOCK' : 'LOCK'}
                </Button>
              )}
              {drone && (
                <Button size="compact-xs" variant="default" c="#8fb0c8" title="Center map on UAV"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => { const v = winView(); if (v) { v.cx = drone.x; v.cy = drone.y } }}
                  styles={{ label: { fontSize: 15, lineHeight: 1 } }} style={{ flex: '0 0 auto' }}>⌖</Button>
              )}
              {drone && drone.state !== 'rtb' && drone.state !== 'striking' && (
                <Button size="compact-xs" variant="default" color="orange" title="Return to base"
                  onPointerDown={(e) => e.stopPropagation()} onClick={() => droneRTB(drone.id)}
                  styles={{ label: { fontSize: 9 } }} style={{ flex: '0 0 auto' }}>RTB</Button>
              )}
              {drone && (drone.state === 'onstation' || drone.state === 'transit') && armed && (
                <Button size="compact-xs" color="red.9" variant={hasTargets ? 'filled' : 'default'}
                  disabled={!hasTargets || (!!DRONE_TYPES[drone.type].weapons && drone.ammo <= 0)}
                  title={hasTargets ? 'Fire on the designated vics' : 'Click vics in the feed to designate targets'}
                  onPointerDown={(e) => e.stopPropagation()} onClick={() => droneFire(drone.id)}
                  styles={{ label: { fontSize: 9, fontWeight: 700 } }} style={{ flex: '0 0 auto' }}>
                  {DRONE_TYPES[drone.type].weapons ? `FIRE (${drone.ammo})` : 'FIRE'}
                </Button>
              )}
            </>
          )}
          {drone && <Divider orientation="vertical" color="dark.4" style={{ height: 18, alignSelf: 'center', marginInline: 4 }} />}
          <Group gap={3} wrap="nowrap" style={{ flex: '0 0 auto' }}>
            <ActionIcon size="md" variant={feed.muted ? 'filled' : 'default'} color={feed.muted ? 'orange' : undefined}
              title={feed.muted ? 'Unmute this feed' : 'Mute this feed'} style={winIcon}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => ui.setFeed(feed.id, { muted: !feed.muted })}>{feed.muted ? '🔇' : '🔊'}</ActionIcon>
            {winMode !== 'min' && (
              <ActionIcon size="md" variant="default" title="Minimize" style={winIcon}
                onPointerDown={(e) => e.stopPropagation()} onClick={() => ui.setFeed(feed.id, { winMode: 'min' })}>—</ActionIcon>
            )}
            {winMode !== 'max' && (
              <ActionIcon size="md" variant="default" title="Maximize" style={winIcon}
                onPointerDown={(e) => e.stopPropagation()} onClick={() => ui.setFeed(feed.id, { winMode: 'max' })}>▢</ActionIcon>
            )}
            {winMode !== 'win' && (
              <ActionIcon size="md" variant="default" title="Restore to window" style={winIcon}
                onPointerDown={(e) => e.stopPropagation()} onClick={() => ui.setFeed(feed.id, { winMode: 'win' })}>❐</ActionIcon>
            )}
            <ActionIcon size="md" variant="default" title="Close" style={winIcon}
              onPointerDown={(e) => e.stopPropagation()} onClick={() => ui.closeFeed(feed.id)}>×</ActionIcon>
          </Group>
        </Group>
      </Group>

      {/* ---- CONTENT (flexes between header and footer; the sensor view) ---- */}
      {winMode !== 'min' && (
        <Box ref={contentRef as React.RefObject<HTMLDivElement>}
          onPointerDown={feedDown} onPointerMove={feedMove} onPointerUp={feedUp}
          onWheel={gimbalZoom} onDoubleClick={gimbalReset}
          style={{
            flex: '1 1 auto', position: 'relative', minHeight: 0, overflow: 'hidden',
            cursor: !drone ? 'default' : armed ? 'crosshair' : 'move',
          }}>
          {drone && (
            <Box style={{ position: 'absolute', inset: 0, filter: CAM_FILTERS[camMode] || CAM_FILTERS['WHOT'] }}>
              <DroneView droneId={drone.id} gimbal={{ gx: feed.gx, gy: feed.gy, fov: feed.fov }} mode={camMode} muted={!!feed.muted} />
            </Box>
          )}
          {drone ? (
            <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.09) 0 1px, transparent 1px 3px)' }} />
              <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 70px rgba(0,0,0,0.85)' }} />
              <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', color: 'rgba(220,235,245,0.8)', fontSize: 18 }}>┼</div>
              {([{ top: 6, left: 6, bw: '1px 0 0 1px' }, { top: 6, right: 6, bw: '1px 1px 0 0' },
                { bottom: 6, left: 6, bw: '0 0 1px 1px' }, { bottom: 6, right: 6, bw: '0 1px 1px 0' }] as
                Array<{ top?: number; left?: number; right?: number; bottom?: number; bw: string }>).map((p, i) => (
                <div key={i} style={{ position: 'absolute', width: 16, height: 16, borderStyle: 'solid', borderColor: 'rgba(220,235,245,0.6)', borderWidth: p.bw, top: p.top, left: p.left, right: p.right, bottom: p.bottom }} />
              ))}
              <div style={{ position: 'absolute', top: 8, left: 26, color: '#d8e8f0', fontSize: 9, letterSpacing: 1 }}>
                {drone.label} · {camMode === 'EO' ? 'EO DAY-TV' : camMode === 'NVG' ? 'I2 NVG' : 'IR ' + camMode} · {
                  drone.state === 'transit' ? 'TRANSIT' : drone.state === 'rtb' ? 'RTB' : drone.state === 'striking' ? 'TERMINAL' : 'ON STA'}
                {' · '}{(38 / feed.fov).toFixed(1)}×{(feed.gx || feed.gy) ? ' · OFFSET' : ''}
              </div>
              {/* gunship: selected weapon + remaining rounds, read off the imagery */}
              {DRONE_TYPES[drone.type].gunship && (() => {
                const g = DRONE_TYPES[drone.type].gunship!
                const gw = drone.gunSel != null ? g.weapons[drone.gunSel] : undefined
                const gammo = (drone.gunAmmo && drone.gunAmmo[drone.gunSel!]) || 0
                return gw ? (
                  <div style={{ position: 'absolute', top: 8, right: 26, color: gammo <= 0 ? '#ff6a52' : '#c8d8a0', fontSize: 9, letterSpacing: 1, fontWeight: 'bold' }}>
                    {gw.short} · {gammo}
                  </div>
                ) : null
              })()}
              <div style={{ position: 'absolute', top: 20, left: 26, color: drone.state === 'rtb' || drone.endurance < 45 ? '#ff9e6a' : '#9ab8d0', fontSize: 9 }}>
                {drone.state === 'rtb'
                  ? <span style={{ fontWeight: 'bold', letterSpacing: 1, opacity: ui.tick % 8 < 4 ? 1 : 0.12 }}>RTB</span>
                  : !isFinite(drone.endurance) ? 'TETHERED' : `AO TIME ${Math.max(0, Math.ceil(drone.endurance))}S`}
                {DRONE_TYPES[drone.type].weapons ? ` · AGM ×${drone.ammo}` : DRONE_TYPES[drone.type].kamikaze ? ' · TERMINAL' : ''}
                {drone.followId ? ` · TRK ${(() => { const tu = S.units.find(u => u.id === drone.followId); return tu ? (tu.side === 'friend' ? tu.label : 'HOSTILE ' + UNIT_TYPES[tu.type].abbr) : '—' })()}` : ''}
              </div>
              {hasTargets && (() => {
                const isArmed = DRONE_TYPES[drone.type].weapons || DRONE_TYPES[drone.type].kamikaze || DRONE_TYPES[drone.type].gunship
                const col = isArmed ? '#ff5a44' : '#5ac8aa'
                const rgba = isArmed ? 'rgba(255,60,40,0.7)' : 'rgba(90,200,170,0.6)'
                return (
                  <>
                    <div style={{ position: 'absolute', inset: 0, border: `2px solid ${rgba}`, boxSizing: 'border-box' }} />
                    <div style={{ position: 'absolute', top: 32, left: 0, right: 0, textAlign: 'center', color: col, fontSize: 9, letterSpacing: 2, fontWeight: 'bold' }}>
                      ◎ {drone.targets!.length} {isArmed ? 'TARGET' : 'CONTACT'}{drone.targets!.length > 1 ? 'S' : ''}
                      {drone.followId ? ' — TRACKING' : isArmed ? ' — CLICK FIRE' : ' — CLICK FOLLOW'}
                    </div>
                  </>
                )
              })()}
              <TargetReticles drone={drone} feed={feed} w={cw} h={ch} />
              <StrikeReticle drone={drone} feed={feed} w={cw} h={ch} />
              {drone.lock && (
                <>
                  <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 42, height: 42, border: '1.5px solid rgba(255,170,60,0.85)' }} />
                  <div style={{ position: 'absolute', left: '50%', top: 'calc(50% + 26px)', transform: 'translateX(-50%)', color: '#ffb257', fontSize: 9, letterSpacing: 1 }}>
                    {drone.lock.unitId != null
                      ? 'TRACK ' + (() => { const lu = S.units.find(u => u.id === drone.lock!.unitId); return lu ? (lu.side === 'friend' ? lu.label : 'HOSTILE ' + UNIT_TYPES[lu.type].abbr) : '—' })()
                      : 'LOCK GRID ' + grid(drone.lock.x, drone.lock.y)}
                  </div>
                </>
              )}
              <div style={{ position: 'absolute', bottom: 8, left: 26, color: '#d8e8f0', fontSize: 9 }}>
                GRID {String(Math.floor((drone.tx ?? 0) / 100)).padStart(3, '0')} {String(Math.floor((drone.ty ?? 0) / 100)).padStart(3, '0')}{'  ALT '}{DRONE_TYPES[drone.type].alt}M AGL
              </div>
              <div style={{ position: 'absolute', bottom: 8, right: 26, color: '#d8e8f0', fontSize: 9 }}>{fmtClock(S.t)}</div>
            </div>
          ) : (
            <Box style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6, color: '#4a6070' }}>
              <Text fz={12} style={{ letterSpacing: 2 }}>▚ NO SIGNAL ▞</Text>
              <Text fz={9} style={{ letterSpacing: 2 }}>{S.drones.length ? 'SELECT A UAS ABOVE' : 'DEPLOY UAS TO ESTABLISH FEED'}</Text>
            </Box>
          )}
        </Box>
      )}

      {/* ---- FOOTER (flight + fire-control, and the resize grip) ---- */}
      {winMode !== 'min' && (
        <FeedFooter drone={drone} resizable={winMode === 'win'}
          onResizeDown={startResize} onResizeMove={onPointerMove} onResizeUp={endDrag} />
      )}
    </Box>
  )
}
