import { useRef, useEffect } from 'react'
import { S, orderHold, orderMount, orderRoe, orderDefend, orderWeapons, convertToHq, droneFollow, droneLock, droneFire, droneToggleTarget, droneClearTargets, gunshipSelectWeapon, gunshipSetMode, elemWorld, elemExposed, droneSet, droneRTB, grid } from '../game/sim.js'
import { UNIT_TYPES, STRUCTURES, DRONE_TYPES, COVER_DEF } from '../game/units.js'
import { setMuted as audioSetMuted, setFeedAmbient, clearFeedAmbient } from '../game/audio.js'
import { useUI } from './store.js'
import DroneView from '../drone/DroneView.jsx'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

const panel = {
  background: 'rgba(12,18,24,0.92)', border: '1px solid #2a3a48',
  color: '#c8d8e8', padding: 8, fontSize: 11, borderRadius: 3,
}
const btn = (active) => ({
  background: active ? '#2a5a8a' : '#16222e', color: active ? '#fff' : '#9ab8d0',
  border: '1px solid #35506a', padding: '4px 8px', cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 11, borderRadius: 2,
})

function fmtClock(t) {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}Z`
}

// combined protection readout for a unit: terrain cover × posture
function protectionInfo(u) {
  const terr = S.map.terrNameAt(u.x, u.y)
  const cover = terr === 'forest' || terr === 'urban'
  const coverMul = cover ? COVER_DEF[terr] : 1
  const def = UNIT_TYPES[u.type].def
  const digMul = (u.posture === 'dig' && u.digT && def) ? 1 - (1 - def.factor) * u.digT : 1
  const total = Math.round((1 - coverMul * digMul) * 100)
  const concealed = cover || (u.posture === 'dig' && u.digT > 0)
  return { terr, cover, total, concealed }
}

const CATS = ['MANEUVER', 'RECON', 'FIRES', 'SUPPORT']

export default function HUD() {
  useUI((s) => s.tick) // re-render at 10 Hz
  const ui = useUI()

  return (
    <>
      {/* top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 34,
        display: 'flex', alignItems: 'center', gap: 14, padding: '0 10px',
        background: 'rgba(10,14,18,0.94)', borderBottom: '1px solid #2a3a48',
        color: '#c8d8e8', fontSize: 12, zIndex: 20,
      }}>
        <b style={{ color: '#7ec8ff', letterSpacing: 2 }}>WAR OF DOTS // C2</b>
        <span>SUPPLY <b style={{ color: '#ffd67e' }}>{Math.floor(S.resources)}</b></span>
        <span>{fmtClock(S.t)}</span>
        <span style={{ display: 'flex', gap: 4 }}>
          {[0, 1, 4].map((sp) => (
            <button key={sp} style={btn(S.speed === sp)} onClick={() => { S.speed = sp }}>
              {sp === 0 ? '⏸' : sp + '×'}
            </button>
          ))}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <button style={btn(ui.night)} onClick={ui.toggleNight}>
            {ui.night ? '☾ NIGHT' : '☀ DAY'}
          </button>
          <button style={btn(ui.showNet)} onClick={ui.toggleNet}>NET</button>
          <button style={btn(!ui.muted)}
            title={ui.muted ? 'Feed audio muted' : 'Feed audio on'}
            onClick={() => { const m = !ui.muted; ui.setMuted(m); audioSetMuted(m) }}>
            {ui.muted ? '🔇' : '🔊'}
          </button>
          <button style={btn(false)} onClick={() => ui.addFeed()} disabled={ui.feeds.length >= 4}>
            + FEED ({ui.feeds.length}/4)
          </button>
          <span style={{ color: '#6a8098', fontSize: 10 }}>DEV:</span>
          <button style={btn(!S.fogEnabled)} onClick={() => { S.fogEnabled = !S.fogEnabled }}>
            {S.fogEnabled ? 'FOG ON' : 'FOG OFF'}
          </button>
          <button style={btn(false)} onClick={() => { S.resources += 10000 }}>+10K</button>
        </span>
      </div>

      {/* deploy palette */}
      <div style={{
        ...panel, position: 'absolute', top: 44, left: 10, width: 176,
        maxHeight: 'calc(100vh - 60px)', overflowY: 'auto', zIndex: 10,
      }}>
        {CATS.map((cat) => (
          <div key={cat}>
            <div style={{ color: '#54708a', fontSize: 9, letterSpacing: 2, margin: '5px 0 3px' }}>{cat}</div>
            {Object.values(UNIT_TYPES).filter(t => t.cat === cat).map((t) => (
              <PaletteRow key={t.key} label={t.name} cost={t.cost}
                active={ui.mode === 'deploy:' + t.key}
                onClick={() => ui.setMode(ui.mode === 'deploy:' + t.key ? 'select' : 'deploy:' + t.key)} />
            ))}
          </div>
        ))}
        <div style={{ color: '#54708a', fontSize: 9, letterSpacing: 2, margin: '5px 0 3px' }}>INSTALLATIONS</div>
        {Object.values(STRUCTURES).map((st) => (
          <PaletteRow key={st.key} label={st.name} cost={st.cost}
            active={ui.mode === 'build:' + st.key}
            onClick={() => ui.setMode(ui.mode === 'build:' + st.key ? 'select' : 'build:' + st.key)} />
        ))}
        <div style={{ color: '#54708a', fontSize: 9, letterSpacing: 2, margin: '5px 0 3px' }}>AVIATION — UAS</div>
        {Object.values(DRONE_TYPES).map((dt) => (
          <PaletteRow key={dt.key}
            label={`${dt.name}${dt.weapons ? ' ⚔' : dt.kamikaze ? ' ✸' : dt.gunship ? ' ✹' : ''}${dt.src === 'field' ? ' ▽' : ''}`}
            cost={dt.cost}
            active={ui.mode === 'deploy:DRONE:' + dt.key}
            onClick={() => ui.setMode(ui.mode === 'deploy:DRONE:' + dt.key ? 'select' : 'deploy:DRONE:' + dt.key)} />
        ))}
        <div style={{ color: '#5a7288', fontSize: 9, marginTop: 6, lineHeight: 1.5 }}>
          {ui.mode.startsWith('deploy:')
            ? (ui.mode.startsWith('deploy:DRONE:')
              ? (DRONE_TYPES[ui.mode.slice(13)]?.src === 'field'
                ? 'CLICK ORBIT POINT NEAR A FRIENDLY UNIT (▽ HAND-LAUNCHED)'
                : DRONE_TYPES[ui.mode.slice(13)]?.src === 'tether'
                  ? 'CLICK A FOB OR HQ TO RAISE THE AEROSTAT (1 PER SITE)'
                  : 'CLICK MAP: SET ORBIT POINT (LAUNCHES FROM AIRFIELD)')
              : 'CLICK INSIDE A DEPLOY ZONE')
            : ui.mode.startsWith('build:')
              ? (ui.mode === 'build:OP' ? 'PLACE NEAR FRIENDLY FORCES' : 'PLACE NEAR AN ACTIVE BASE')
              : ui.mode === 'bridge'
                ? 'CLICK A WATER GAP WITHIN 700M'
                : ui.mode.startsWith('follow:')
                  ? 'CLICK A FRIENDLY UNIT TO OVERWATCH'
                  : ui.mode.startsWith('lock:')
                    ? 'CLICK A UNIT OR POSITION TO LOCK THE SENSOR'
                    : ui.mode.startsWith('convoy:')
                      ? 'CLICK A FOB TO ESTABLISH THE SUPPLY ROUTE'
                      : 'L-CLICK SELECT / ORDER · SHIFT-CLICK ADD WP · L-DRAG SPREAD LINE · Q/E MOVE/ATTACK · R-CLICK DESELECT · R-DRAG PAN'}
        </div>
      </div>

      {/* selection tray */}
      <SelectionTray />

      {/* fire mission options */}
      {ui.mode === 'target' && <FireMissionPanel />}

      {/* unit context menu */}
      {ui.ctxMenu && <ContextMenu />}

      {/* toasts */}
      <div style={{
        position: 'absolute', top: 44, left: '50%', transform: 'translateX(-50%)',
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

      {/* radio net log */}
      {ui.showNet && <RadioLog />}

      {/* drone feed windows */}
      {ui.feeds.map((f, i) => <FeedWindow key={f.id} feed={f} index={i} />)}
    </>
  )
}

const NET_COLORS = {
  move: '#8fb0c8', arrive: '#7ec87e', contact: '#ff9e6a', spot: '#ffd67e',
  damage: '#ff7a6a', request: '#ffe97a', fires: '#c0a8f0', loss: '#ff5a5a', struct: '#ff9e6a',
}

function RadioLog() {
  const ui = useUI()
  const drag = useRef(null)
  function startResize(e) {
    if (e.button !== 0) return
    drag.current = { sx: e.clientX, sy: e.clientY, w: ui.netSize.w, h: ui.netSize.h }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.stopPropagation()
  }
  function onResize(e) {
    const d = drag.current
    if (!d) return
    ui.setNetSize({
      w: clamp(d.w - (e.clientX - d.sx), 220, window.innerWidth - 40),  // anchored right: grow leftward
      h: clamp(d.h + (e.clientY - d.sy), 120, window.innerHeight - 80),
    })
  }
  return (
    <div style={{
      ...panel, position: 'absolute', top: 44, right: 10, width: ui.netSize.w,
      height: ui.netSize.h, zIndex: 12, padding: 6, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ color: '#54708a', fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>
        JBC-P NET — CLICK MSG TO CENTER MAP
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
      {[...S.radio].reverse().map((e, i) => (
        <div key={S.radio.length - i}
          onClick={() => {
            const v = window.__view
            if (v && e.x != null) { v.cx = e.x; v.cy = e.y }
          }}
          style={{
            fontSize: 9.5, lineHeight: 1.45, cursor: 'pointer', padding: '1px 2px',
            color: NET_COLORS[e.kind] || '#c8d8e8',
            borderBottom: '1px solid rgba(40,58,72,0.4)',
          }}>
          <span style={{ color: '#54708a' }}>{fmtClock(e.t).slice(3)}</span>
          {' '}{e.msg}
        </div>
      ))}
      {S.radio.length === 0 && (
        <div style={{ color: '#4a6070', fontSize: 10 }}>NET QUIET</div>
      )}
      </div>
      {/* resize grip: bottom-left (panel is right-anchored) */}
      <div
        onPointerDown={startResize} onPointerMove={onResize} onPointerUp={() => { drag.current = null }}
        style={{
          position: 'absolute', left: 0, bottom: 0, width: 16, height: 16,
          cursor: 'nesw-resize', zIndex: 2,
          background: 'linear-gradient(225deg, transparent 50%, rgba(120,160,200,0.5) 50%)',
        }} />
    </div>
  )
}

const optBtn = (active) => ({
  ...btn(active), padding: '2px 7px', fontSize: 9.5,
})

function FireMissionPanel() {
  const ui = useUI()
  const o = ui.fireOpts
  const group = (title, opts, key) => (
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

function SelectionTray() {
  const ui = useUI()
  const units = ui.selectedIds.map(id => S.units.find(u => u.id === id)).filter(Boolean)
  const selDrones = ui.selectedIds.map(id => S.drones.find(d => d.id === id)).filter(Boolean)
  if (!units.length && !selDrones.length) return null
  const anyIndirect = units.some(u => UNIT_TYPES[u.type].indirect)
  const anyBridge = units.some(u => UNIT_TYPES[u.type].canBridge)
  return (
    <div style={{
      ...panel, position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
      zIndex: 14, display: 'flex', flexDirection: 'column', gap: 5, maxWidth: '70vw',
    }}>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center' }}>
        {units.map(u => {
          const type = UNIT_TYPES[u.type]
          const str = Math.max(0, Math.round(u.strength))
          return (
            <div key={u.id}
              onClick={() => {
                ui.setSelected([u.id])
                const v = window.__view
                if (v) { v.cx = u.x; v.cy = u.y }
              }}
              style={{
                background: '#12202e', border: '1px solid #35506a', borderRadius: 2,
                padding: '3px 7px', cursor: 'pointer', minWidth: 78,
              }}>
              <div style={{ color: '#7ec8ff', fontSize: 10 }}>{u.label} <span style={{ color: '#54708a' }}>{type.abbr}</span></div>
              <div style={{ fontSize: 9, color: '#9ab8d0' }}>
                {UNIT_TYPES[u.type].carrier ? (u.mounted ? 'MTD · ' : 'DSM · ') : ''}
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
              onClick={() => { ui.setSelected([d.id]); const v = window.__view; if (v) { v.cx = d.x; v.cy = d.y } }}
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
      </div>
      {units.length > 0 && (
        <div style={{ display: 'flex', gap: 3, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: '#54708a', fontSize: 9, letterSpacing: 1 }}>CMD:</span>
          <button style={optBtn(ui.cmdMode === 'move')} onClick={() => ui.setCmdMode('move')}>MOVE (Q)</button>
          <button style={{ ...optBtn(ui.cmdMode === 'attack'), color: ui.cmdMode === 'attack' ? '#fff' : '#c87868' }}
            onClick={() => ui.setCmdMode('attack')}>ATTACK (E)</button>
          <span style={{ color: '#54708a', fontSize: 9, letterSpacing: 1, marginLeft: 6 }}>ON CONTACT:</span>
          {[['push', 'PUSH'], ['halt', 'HALT'], ['break', 'BREAK']].map(([roe, label]) => (
            <button key={roe}
              style={optBtn(units.every(u => (u.roe || 'halt') === roe))}
              onClick={() => units.forEach(u => orderRoe(u.id, roe))}>
              {label}
            </button>
          ))}
          <span style={{ color: '#54708a', fontSize: 9, letterSpacing: 1, marginLeft: 6 }}>WPNS:</span>
          {[['free', 'FREE'], ['tight', 'TIGHT'], ['hold', 'HOLD']].map(([w, label]) => (
            <button key={w}
              style={optBtn(units.every(u => (u.weapons || 'free') === w))}
              onClick={() => units.forEach(u => orderWeapons(u.id, w))}>
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
  const m = ui.ctxMenu
  if (m.droneId != null) return <DroneMenu />
  if (m.structId != null) return <StructMenu />
  const u = S.units.find(x => x.id === m.unitId)
  if (!u) { ui.closeMenu(); return null }
  const type = UNIT_TYPES[u.type]
  const item = (label, fn, disabled = false) => (
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
  const x = clamp(m.x, 0, window.innerWidth - 190)
  const y = clamp(m.y, 34, window.innerHeight - 180)
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
          {[['push', 'PUSH'], ['halt', 'HALT'], ['break', 'BREAK']].map(([roe, label]) => (
            <button key={roe} style={optBtn((u.roe || 'halt') === roe)}
              onClick={() => orderRoe(u.id, roe)}>{label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 3, alignItems: 'center', padding: '4px 10px', borderBottom: '1px solid rgba(40,58,72,0.5)' }}>
          <span style={{ color: '#54708a', fontSize: 9, letterSpacing: 1 }}>WPNS</span>
          {[['free', 'FREE'], ['tight', 'TIGHT'], ['hold', 'HOLD']].map(([w, label]) => (
            <button key={w} style={optBtn((u.weapons || 'free') === w)}
              onClick={() => orderWeapons(u.id, w)}>{label}</button>
          ))}
        </div>
        {type.def && item(
          u.posture === 'dig'
            ? `ABANDON POSITIONS (${Math.round(u.digT * 100)}%)`
            : `DIG IN — ${type.def.name}`,
          () => orderDefend(u.id, u.posture !== 'dig'))}
        {type.logi && item(
          u.convoy ? 'TERMINATE SUPPLY ROUTE' : 'SUPPLY RUN — SELECT FOB…',
          () => { if (u.convoy) orderHold(u.id); else ui.setMode('convoy:' + u.id) })}
        {item('HOLD / CANCEL ORDERS', () => orderHold(u.id))}
        {type.carrier && item(u.mounted ? 'DISMOUNT TROOPS' : 'MOUNT UP',
          () => orderMount(u.id, !u.mounted), !u.mounted && !!u.targetId && false)}
        {type.indirect && item(
          u.missionCooldown > 0 ? `FIRE MISSION (RELOAD ${Math.ceil(u.missionCooldown)}S)` : 'FIRE MISSION…',
          () => ui.setMode('target'), u.missionCooldown > 0)}
        {type.canBridge && item('PONTOON BRIDGE…', () => ui.setMode('bridge'))}
        {item('CENTER MAP', () => { const v = window.__view; if (v) { v.cx = u.x; v.cy = u.y } })}
      </div>
    </>
  )
}

function StructMenu() {
  const ui = useUI()
  const m = ui.ctxMenu
  const s = S.structures.find(x => x.id === m.structId)
  if (!s) { ui.closeMenu(); return null }
  const hqExists = S.structures.some(o => o.side === 'friend' && o.kind === 'HQ')
  const x = clamp(m.x, 0, window.innerWidth - 210)
  const y = clamp(m.y, 34, window.innerHeight - 160)
  const item = (label, fn, disabled = false) => (
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
        {item('CENTER MAP', () => { const v = window.__view; if (v) { v.cx = s.x; v.cy = s.y } })}
      </div>
    </>
  )
}

function DroneMenu() {
  const ui = useUI()
  const m = ui.ctxMenu
  const d = S.drones.find(x => x.id === m.droneId)
  if (!d) { ui.closeMenu(); return null }
  const spec = DRONE_TYPES[d.type]
  const x = clamp(m.x, 0, window.innerWidth - 210)
  const y = clamp(m.y, 34, window.innerHeight - 230)
  const row = (title, opts, cur, apply) => (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center', padding: '4px 10px', borderBottom: '1px solid rgba(40,58,72,0.5)' }}>
      <span style={{ color: '#54708a', fontSize: 9, width: 40, letterSpacing: 1 }}>{title}</span>
      {opts.map(([val, label]) => (
        <button key={label} style={{ ...optBtn(Math.abs(cur - val) < 0.01) }}
          onClick={() => apply(val)}>{label}</button>
      ))}
    </div>
  )
  const item = (label, fn, disabled = false) => (
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
          {d.label} — {spec.name.toUpperCase()} · {d.state === 'rtb' ? 'RTB' : `AO ${Math.max(0, Math.ceil(d.endurance))}S`}
        </div>
        {row('ALT', [[0.6, 'LOW'], [1, 'MED'], [1.6, 'HIGH']], d.altMul || 1,
          (v) => droneSet(d.id, { altMul: v }))}
        {row('ORBIT', [[0.5, 'TIGHT'], [1, 'STD'], [1.8, 'WIDE']], d.orbitMul || 1,
          (v) => droneSet(d.id, { orbitMul: v }))}
        {d.lock && item('BREAK SENSOR LOCK', () => droneLock(d.id, null))}
        {d.followId && item('CANCEL OVERWATCH', () => droneFollow(d.id, null))}
        {item('RTB NOW', () => droneRTB(d.id), d.state === 'rtb' || d.state === 'striking')}
        {item('CENTER MAP', () => { const v = window.__view; if (v) { v.cx = d.x; v.cy = d.y } })}
      </div>
    </>
  )
}

function PaletteRow({ label, cost, active, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', justifyContent: 'space-between', padding: '3px 6px',
      cursor: 'pointer', borderRadius: 2, marginBottom: 2, fontSize: 10.5,
      background: active ? '#2a5a8a' : '#141e28',
      border: '1px solid #26384a',
    }}>
      <span>{label}</span>
      <span style={{ color: '#ffd67e' }}>{cost}</span>
    </div>
  )
}

const CAM_MODES = ['WHOT', 'BHOT', 'EO', 'NVG']
const CAM_FILTERS = {
  WHOT: 'grayscale(1) contrast(1.18) brightness(1.08)',
  BHOT: 'grayscale(1) invert(1) contrast(1.12) brightness(1.02)',
  EO: 'saturate(1.08) contrast(1.05)',
  NVG: 'grayscale(1) brightness(1.4) sepia(1) hue-rotate(55deg) saturate(3.2) contrast(1.12)',
}

// Convert a click inside a drone feed to a world ground point by raycasting the
// analytic sensor camera (matching DroneView's camera) onto the aim-point plane.
function feedRayToGround(drone, feed, cx, cy, w, h) {
  if (!S.map || !w || !h) return null
  const spec = DRONE_TYPES[drone.type]
  const camPos = { x: drone.x, y: S.map.elevAt(drone.x, drone.y) + spec.alt * (drone.altMul || 1), z: drone.y }
  const aimX = drone.lock ? drone.lock.x : drone.tx + feed.gx
  const aimY = drone.lock ? drone.lock.y : drone.ty + feed.gy
  const groundY = S.map.elevAt(aimX, aimY)
  let fwd = { x: aimX - camPos.x, y: groundY - camPos.y, z: aimY - camPos.z }
  const fl = Math.hypot(fwd.x, fwd.y, fwd.z) || 1
  fwd = { x: fwd.x / fl, y: fwd.y / fl, z: fwd.z / fl }
  // right = normalize(cross(fwd, up)), up = (0,1,0); camUp = cross(right, fwd)
  let right = { x: -fwd.z, y: 0, z: fwd.x }
  const rl = Math.hypot(right.x, right.z) || 1
  right = { x: right.x / rl, y: 0, z: right.z / rl }
  const camUp = {
    x: right.y * fwd.z - right.z * fwd.y,
    y: right.z * fwd.x - right.x * fwd.z,
    z: right.x * fwd.y - right.y * fwd.x,
  }
  const nx = (cx / w) * 2 - 1
  const ny = -((cy / h) * 2 - 1)
  const tanV = Math.tan((feed.fov * Math.PI / 180) / 2)
  const tanH = tanV * (w / h)
  let dir = {
    x: fwd.x + right.x * nx * tanH + camUp.x * ny * tanV,
    y: fwd.y + right.y * nx * tanH + camUp.y * ny * tanV,
    z: fwd.z + right.z * nx * tanH + camUp.z * ny * tanV,
  }
  const dl = Math.hypot(dir.x, dir.y, dir.z) || 1
  dir = { x: dir.x / dl, y: dir.y / dl, z: dir.z / dl }
  if (dir.y >= -1e-4) return { x: aimX, y: aimY } // ray not descending → fall back to aim
  const t = (groundY - camPos.y) / dir.y
  if (t <= 0) return { x: aimX, y: aimY }
  return {
    x: clamp(camPos.x + dir.x * t, 0, S.map.WORLD),
    y: clamp(camPos.z + dir.z * t, 0, S.map.WORLD),
  }
}

// Forward-project a world ground point to feed screen coords (inverse of the
// raycast) so a strike's impact reticle tracks the target as the drone orbits.
function feedProjectToScreen(drone, feed, wx, wy, w, h) {
  if (!S.map || !w || !h) return null
  const spec = DRONE_TYPES[drone.type]
  const camPos = { x: drone.x, y: S.map.elevAt(drone.x, drone.y) + spec.alt * (drone.altMul || 1), z: drone.y }
  const aimX = drone.lock ? drone.lock.x : drone.tx + feed.gx
  const aimY = drone.lock ? drone.lock.y : drone.ty + feed.gy
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
function StrikeReticle({ drone, feed }) {
  const mk = drone.strikeMark
  if (!mk || S.t > mk.until) return null
  const p = feedProjectToScreen(drone, feed, mk.x, mk.y, feed.w, feed.h - 22)
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
function TargetReticles({ drone, feed }) {
  if (!drone.targets || !drone.targets.length) return null
  return drone.targets.map((t, i) => {
    const u = S.units.find(x => x.id === t.unitId && x.strength > 0)
    const el = u && u.elements && u.elements[t.ei]
    if (!el || !el.alive) return null
    const wpt = elemWorld(u, el)
    const p = feedProjectToScreen(drone, feed, wpt.x, wpt.y, feed.w, feed.h - 22)
    if (!p) return null
    return (
      <div key={i} style={{ position: 'absolute', left: p.x, top: p.y, transform: 'translate(-50%,-50%)', pointerEvents: 'none' }}>
        <div style={{ width: 24, height: 24, border: '2px solid #ff3a28', boxShadow: '0 0 5px rgba(255,40,20,0.8)' }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 3, height: 3, background: '#ff3a28', transform: 'translate(-50%,-50%)' }} />
      </div>
    )
  })
}

// AC-130 fire-control strip: pick the active weapon, set a gun's fire mode, or fire
// the howitzer manually. Only the selected weapon is live.
function GunshipPanel({ drone }) {
  const g = DRONE_TYPES[drone.type].gunship
  if (!g) return null
  const w = g.weapons[drone.gunSel]
  const ammo = (drone.gunAmmo && drone.gunAmmo[drone.gunSel]) || 0
  const hasTgt = drone.targets && drone.targets.length > 0
  const tab = (active, dry) => ({
    background: active ? '#8a5a1a' : '#16222e', color: dry ? '#7a6a5a' : active ? '#fff' : '#c8b088',
    border: '1px solid ' + (active ? '#c88a30' : '#3a4a58'), borderRadius: 2, padding: '1px 5px',
    fontSize: 9, cursor: 'pointer',
  })
  const mode = (active, col) => ({
    background: active ? col : '#16222e', color: active ? '#0b1016' : col,
    border: '1px solid ' + col, borderRadius: 2, padding: '1px 5px', fontSize: 9, fontWeight: 'bold', cursor: 'pointer',
  })
  return (
    <div onPointerDown={(e) => e.stopPropagation()} style={{
      position: 'absolute', left: 6, right: 6, bottom: 6, zIndex: 3,
      display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap',
      background: 'rgba(8,12,16,0.85)', border: '1px solid #3a2a20', borderRadius: 3, padding: '3px 5px',
    }}>
      {g.order.map((k) => (
        <button key={k} style={tab(drone.gunSel === k, ((drone.gunAmmo && drone.gunAmmo[k]) || 0) <= 0)}
          onClick={() => gunshipSelectWeapon(drone.id, k)}>{g.weapons[k].short}</button>
      ))}
      <span style={{ width: 1, height: 13, background: '#3a4a58' }} />
      {w.kind === 'gun' ? (
        <>
          <button style={mode(drone.fireMode === 'will', '#ff7a52')} onClick={() => gunshipSetMode(drone.id, 'will')}>WILL</button>
          <button style={mode(drone.fireMode === 'designated', '#ffb257')} onClick={() => gunshipSetMode(drone.id, 'designated')}>DESIG</button>
          <button style={mode(!drone.fireMode || drone.fireMode === 'hold', '#7fd0b0')} onClick={() => gunshipSetMode(drone.id, 'hold')}>HOLD</button>
        </>
      ) : (
        <button
          disabled={!hasTgt || ammo <= 0}
          style={{
            background: hasTgt && ammo > 0 ? '#8a2a20' : '#16222e',
            color: hasTgt && ammo > 0 ? '#fff' : '#7a5a50',
            border: '1px solid #6a4030', borderRadius: 2, padding: '1px 8px', fontSize: 9, fontWeight: 'bold',
            cursor: hasTgt && ammo > 0 ? 'pointer' : 'default',
          }}
          title={hasTgt ? 'Fire a 105mm round on each designated vic' : 'Click vics in the feed to designate'}
          onClick={() => droneFire(drone.id)}>◎ FIRE 105</button>
      )}
      <span style={{ marginLeft: 'auto', color: ammo <= 0 ? '#ff6a52' : '#c8d8a0', fontSize: 9, letterSpacing: 1 }}>
        {w.short} · {ammo}
      </span>
    </div>
  )
}

function FeedWindow({ feed, index }) {
  const ui = useUI()
  const boxRef = useRef(null)
  const drag = useRef(null)
  const gimbal = useRef(null)

  const drone = S.drones.find(d => d.id === feed.droneId) || null
  const camMode = (drone && ui.droneModes[drone.id]) || 'WHOT'

  // platform ambient: each airframe's engine loop runs while its feed is open
  const droneType = drone ? drone.type : null
  useEffect(() => { setFeedAmbient(feed.id, droneType) }, [feed.id, droneType])
  useEffect(() => () => clearFeedAmbient(feed.id), [feed.id])

  // --- feed interaction: click = lock target, drag = slew gimbal, wheel = zoom ---
  function feedDown(e) {
    if (e.button !== 0 || !drone) return
    gimbal.current = { sx: e.clientX, sy: e.clientY, gx: feed.gx, gy: feed.gy, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function feedMove(e) {
    const g = gimbal.current
    if (!g || !drone) return
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy
    if (!g.moved && Math.hypot(dx, dy) > 6) {
      g.moved = true
      if (drone.lock) droneLock(drone.id, null) // slewing off the target breaks the lock
    }
    if (!g.moved) return
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
  function feedUp(e) {
    const g = gimbal.current
    gimbal.current = null
    // a drag slews the sensor; a clean click designates a target in the viewer
    if (!g || !drone || g.moved) return
    const spec = DRONE_TYPES[drone.type]
    if (!spec.weapons && !spec.kamikaze && !spec.gunship) return
    const rect = e.currentTarget.getBoundingClientRect()
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top
    const w = rect.width, h = rect.height
    // pick the nearest on-screen vic/troop to the click
    let best = null, bd = 32 // px hit radius
    for (const u of S.units) {
      if (u.strength <= 0 || !u.elements) continue
      if (S.fogEnabled && u.side !== 'friend') { const c = S.contacts.get(u.id); if (!c || !c.live) continue }
      for (let ei = 0; ei < u.elements.length; ei++) {
        const el = u.elements[ei]
        if (!el.alive || !elemExposed(u, el)) continue
        const wpt = elemWorld(u, el)
        const p = feedProjectToScreen(drone, feed, wpt.x, wpt.y, w, h)
        if (!p) continue
        const dd = Math.hypot(p.x - cx, p.y - cy)
        if (dd < bd) { bd = dd; best = { unitId: u.id, ei } }
      }
    }
    if (best) {
      // ctrl-click adds/removes from the target set; a plain click selects just that vic
      if (e.ctrlKey) droneToggleTarget(drone.id, best.unitId, best.ei)
      else { droneClearTargets(drone.id); droneToggleTarget(drone.id, best.unitId, best.ei) }
    } else if (!e.ctrlKey) {
      droneClearTargets(drone.id) // plain click on empty space clears the set
    }
  }
  function gimbalZoom(e) {
    ui.setFeed(feed.id, { fov: clamp(feed.fov * (e.deltaY > 0 ? 1.15 : 1 / 1.15), 5, 55) })
  }
  function gimbalReset() {
    if (drone?.lock) droneLock(drone.id, null)
    ui.setFeed(feed.id, { gx: 0, gy: 0, fov: 38 })
  }

  // default dock position: stack bottom-right
  const style = feed.x == null
    ? { right: 10 + (index % 2) * (feed.w + 8), bottom: 10 + Math.floor(index / 2) * (feed.h + 8) }
    : { left: feed.x, top: feed.y }

  function startDrag(e) {
    if (e.button !== 0) return
    const rect = boxRef.current.getBoundingClientRect()
    drag.current = { mode: 'move', dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function startResize(e) {
    if (e.button !== 0) return
    drag.current = { mode: 'resize', sx: e.clientX, sy: e.clientY, w: feed.w, h: feed.h }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.stopPropagation()
  }
  function onPointerMove(e) {
    const d = drag.current
    if (!d) return
    if (d.mode === 'move') {
      ui.setFeed(feed.id, {
        x: Math.max(0, Math.min(window.innerWidth - 120, e.clientX - d.dx)),
        y: Math.max(34, Math.min(window.innerHeight - 40, e.clientY - d.dy)),
      })
    } else {
      const rect = boxRef.current.getBoundingClientRect()
      // resizing an undocked-by-right window: pin its current left/top first
      if (feed.x == null) ui.setFeed(feed.id, { x: rect.left, y: rect.top })
      ui.setFeed(feed.id, {
        w: Math.max(280, Math.min(window.innerWidth, d.w + (e.clientX - d.sx))),
        h: Math.max(210, Math.min(window.innerHeight - 34, d.h + (e.clientY - d.sy))),
      })
    }
  }
  function endDrag() { drag.current = null }

  return (
    <div ref={boxRef} style={{
      position: 'absolute', ...style, width: feed.w, height: feed.h,
      border: '1px solid #2a3a48', borderRadius: 3, overflow: 'hidden',
      background: '#020304', zIndex: 15,
    }}>
      {/* title bar: drag handle + drone tabs + close */}
      <div
        onPointerDown={startDrag} onPointerMove={onPointerMove} onPointerUp={endDrag}
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3, height: 22,
          display: 'flex', gap: 2, background: 'rgba(8,12,16,0.92)',
          borderBottom: '1px solid #223240', padding: 2, cursor: 'grab',
          alignItems: 'center',
        }}>
        <span style={{ color: '#5a7288', fontSize: 9, padding: '0 4px', letterSpacing: 1 }}>
          FEED {index + 1}
        </span>
        {S.drones.map((d) => (
          <button key={d.id}
            style={{ ...btn(drone && drone.id === d.id), padding: '1px 5px', fontSize: 9 }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => ui.setFeed(feed.id, { droneId: d.id })}>
            {d.label} {d.state === 'transit' ? '→' : d.state === 'rtb' ? 'RTB' : d.state === 'striking' ? '✸' : !isFinite(d.endurance) ? '⚓' : Math.ceil(d.endurance) + 's'}
          </button>
        ))}
        {drone && (
          <button
            style={{ ...btn(false), padding: '1px 6px', fontSize: 9, color: '#8fd4a8', borderColor: '#2f5a40' }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              const next = CAM_MODES[(CAM_MODES.indexOf(camMode) + 1) % CAM_MODES.length]
              ui.setDroneMode(drone.id, next)
            }}>
            {camMode}
          </button>
        )}
        {drone && (drone.state === 'transit' || drone.state === 'onstation') && (
          <button
            style={{
              ...btn(ui.mode === 'follow:' + drone.id || !!drone.followId),
              padding: '1px 6px', fontSize: 9, color: '#5ac8aa', borderColor: '#2f5a4a',
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              if (drone.followId) droneFollow(drone.id, null)
              else ui.setMode(ui.mode === 'follow:' + drone.id ? 'select' : 'follow:' + drone.id)
            }}>
            {drone.followId ? 'UNFOLLOW' : 'FOLLOW'}
          </button>
        )}
        {drone && (drone.state === 'transit' || drone.state === 'onstation') && (
          <button
            style={{
              ...btn(!!drone.lock),
              padding: '1px 6px', fontSize: 9, color: '#ffb257', borderColor: '#6a4a25',
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              if (drone.lock) { droneLock(drone.id, null); return }
              // pure camera lock: freeze the sensor on the current aim point, ignore targets
              droneLock(drone.id, { x: drone.tx + feed.gx, y: drone.ty + feed.gy })
            }}>
            {drone.lock ? 'UNLOCK' : 'LOCK'}
          </button>
        )}
        {drone && (drone.state === 'onstation' || drone.state === 'transit') && (DRONE_TYPES[drone.type].weapons || DRONE_TYPES[drone.type].kamikaze) && (
          <button
            style={{
              ...btn(!!(drone.targets && drone.targets.length)), marginLeft: 'auto',
              padding: '1px 6px', fontSize: 9,
              color: (drone.targets && drone.targets.length) ? '#fff' : '#ff9e6a',
              background: (drone.targets && drone.targets.length) ? '#8a2a20' : '#16222e', borderColor: '#6a4030',
            }}
            disabled={!(drone.targets && drone.targets.length) || (DRONE_TYPES[drone.type].weapons && drone.ammo <= 0)}
            title={(drone.targets && drone.targets.length) ? 'Fire on the designated vics' : 'Click vics in the feed to designate targets'}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => droneFire(drone.id)}>
            {DRONE_TYPES[drone.type].weapons ? `FIRE (${drone.ammo})` : 'FIRE'}
          </button>
        )}
        <button
          style={{
            ...btn(false), padding: '1px 6px', fontSize: 10,
            marginLeft: drone && (DRONE_TYPES[drone.type].weapons || DRONE_TYPES[drone.type].kamikaze) ? 0 : 'auto',
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => ui.closeFeed(feed.id)}>×</button>
      </div>

      <div
        onPointerDown={feedDown} onPointerMove={feedMove} onPointerUp={feedUp}
        onWheel={gimbalZoom} onDoubleClick={gimbalReset}
        style={{
          position: 'absolute', inset: 0, top: 22,
          cursor: !drone ? 'default' : (DRONE_TYPES[drone.type].weapons || DRONE_TYPES[drone.type].kamikaze) ? 'crosshair' : 'move',
          filter: CAM_FILTERS[camMode] || CAM_FILTERS.WHOT,
        }}>
        {drone ? <DroneView droneId={drone.id} gimbal={{ gx: feed.gx, gy: feed.gy, fov: feed.fov }} mode={camMode} /> : null}
      </div>

      {drone ? (
        <>
        <div style={{ position: 'absolute', inset: 0, top: 22, zIndex: 2, pointerEvents: 'none' }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.09) 0 1px, transparent 1px 3px)',
          }} />
          <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 70px rgba(0,0,0,0.85)' }} />
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', color: 'rgba(220,235,245,0.8)', fontSize: 18 }}>┼</div>
          {[{ top: 6, left: 6, bw: '1px 0 0 1px' }, { top: 6, right: 6, bw: '1px 1px 0 0' },
            { bottom: 6, left: 6, bw: '0 0 1px 1px' }, { bottom: 6, right: 6, bw: '0 1px 1px 0' }].map((p, i) => (
            <div key={i} style={{
              position: 'absolute', width: 16, height: 16,
              borderStyle: 'solid', borderColor: 'rgba(220,235,245,0.6)',
              borderWidth: p.bw, top: p.top, left: p.left, right: p.right, bottom: p.bottom,
            }} />
          ))}
          <div style={{ position: 'absolute', top: 8, left: 26, color: '#d8e8f0', fontSize: 9, letterSpacing: 1 }}>
            {drone.label} · {camMode === 'EO' ? 'EO DAY-TV' : camMode === 'NVG' ? 'I2 NVG' : 'IR ' + camMode} · {
              drone.state === 'transit' ? 'TRANSIT' : drone.state === 'rtb' ? 'RTB'
              : drone.state === 'striking' ? 'TERMINAL' : 'ON STA'}
            {' · '}{(38 / feed.fov).toFixed(1)}×
            {(feed.gx || feed.gy) ? ' · OFFSET' : ''}
          </div>
          <div style={{ position: 'absolute', top: 20, left: 26, color: drone.state === 'rtb' || drone.endurance < 45 ? '#ff9e6a' : '#9ab8d0', fontSize: 9 }}>
            {drone.state === 'rtb'
              ? <span style={{ fontWeight: 'bold', letterSpacing: 1, opacity: ui.tick % 8 < 4 ? 1 : 0.12 }}>RTB</span>
              : !isFinite(drone.endurance) ? 'TETHERED' : `AO TIME ${Math.max(0, Math.ceil(drone.endurance))}S`}
            {DRONE_TYPES[drone.type].weapons ? ` · AGM ×${drone.ammo}` : DRONE_TYPES[drone.type].kamikaze ? ' · TERMINAL' : ''}
            {drone.followId ? ` · TRK ${(S.units.find(u => u.id === drone.followId) || {}).label || '—'}` : ''}
          </div>
          {drone.targets && drone.targets.length > 0 && (
            <>
              <div style={{ position: 'absolute', inset: 0, border: '2px solid rgba(255,60,40,0.7)', boxSizing: 'border-box' }} />
              <div style={{ position: 'absolute', top: 32, left: 0, right: 0, textAlign: 'center', color: '#ff5a44', fontSize: 9, letterSpacing: 2, fontWeight: 'bold' }}>
                ◎ {drone.targets.length} TARGET{drone.targets.length > 1 ? 'S' : ''} — CLICK FIRE
              </div>
            </>
          )}
          <TargetReticles drone={drone} feed={feed} />
          <StrikeReticle drone={drone} feed={feed} />
          {drone.lock && (
            <>
              <div style={{
                position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
                width: 42, height: 42, border: '1.5px solid rgba(255,170,60,0.85)',
              }} />
              <div style={{ position: 'absolute', left: '50%', top: 'calc(50% + 26px)', transform: 'translateX(-50%)', color: '#ffb257', fontSize: 9, letterSpacing: 1 }}>
                {drone.lock.unitId != null
                  ? 'TRACK ' + (() => { const lu = S.units.find(u => u.id === drone.lock.unitId); return lu ? (lu.side === 'friend' ? lu.label : 'HOSTILE ' + UNIT_TYPES[lu.type].abbr) : '—' })()
                  : 'LOCK GRID ' + grid(drone.lock.x, drone.lock.y)}
              </div>
            </>
          )}
          <div style={{ position: 'absolute', bottom: 8, left: 26, color: '#d8e8f0', fontSize: 9 }}>
            GRID {String(Math.floor((drone.tx ?? 0) / 100)).padStart(3, '0')} {String(Math.floor((drone.ty ?? 0) / 100)).padStart(3, '0')}
            {'  ALT '}{DRONE_TYPES[drone.type].alt}M AGL
          </div>
          <div style={{ position: 'absolute', bottom: 8, right: 26, color: '#d8e8f0', fontSize: 9 }}>
            {fmtClock(S.t)}
          </div>
        </div>
        <GunshipPanel drone={drone} feed={feed} />
        </>
      ) : (
        <div style={{
          position: 'absolute', inset: 0, top: 22, zIndex: 2, display: 'flex',
          alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
          color: '#4a6070', fontSize: 12, letterSpacing: 2, gap: 6,
        }}>
          <div>▚ NO SIGNAL ▞</div>
          <div style={{ fontSize: 9 }}>{S.drones.length ? 'SELECT A UAS ABOVE' : 'DEPLOY UAS TO ESTABLISH FEED'}</div>
        </div>
      )}

      {/* resize handle */}
      <div
        onPointerDown={startResize} onPointerMove={onPointerMove} onPointerUp={endDrag}
        style={{
          position: 'absolute', right: 0, bottom: 0, width: 16, height: 16,
          cursor: 'nwse-resize', zIndex: 4,
          background: 'linear-gradient(135deg, transparent 50%, rgba(120,160,200,0.5) 50%)',
        }} />
    </div>
  )
}
