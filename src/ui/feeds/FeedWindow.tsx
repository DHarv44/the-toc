// THE UAS FEED WINDOW — the sensor picture, its reticles, and the controls that
// fly the aircraft and point the ball.
//
// Split out of ui/HUD, where it was two thirds of a fifteen-hundred-line file
// that also held the map overlay, the command dock and the context menus. It
// shares nothing with them but the map column it floats in.
//
// A NOTE ON THE TYPE IN HERE. The 8–9 px readouts are deliberate and are NOT
// the drift ui/styles warns about: this is sensor OSD burned over imagery, and
// it is small for the same reason the real thing is small — it must not cover
// the picture it annotates. The command dock, which is chrome rather than
// overlay, is on the scale.
import { useRef, useEffect, type CSSProperties, type ReactNode } from 'react'
import { Box, Group, Button, ActionIcon, Menu, Text, Divider } from '@mantine/core'
import { useElementSize } from '@mantine/hooks'
import { S } from '../../engine/state'
import type { Drone, GunFireMode } from '../../engine/GameState'
import type { Vec2 } from '../../world/WorldMap'
import {
  droneFollow, droneLock, droneSensorMode, droneFire, droneToggleTarget,
  droneClearTargets, droneSet, droneRTB,
} from '../../domains/air/orders'
import { gunshipSelectWeapon, gunshipSetMode } from '../../domains/air/gunship'
import { revealContact } from '../../domains/intel/sensing'
import { elemWorld, elemExposed } from '../../domains/forces/elements'
import { grid } from '../../lib/format'
import { UNIT_TYPES } from '../../domains/forces/catalog'
import { DRONE_TYPES } from '../../domains/air/catalog'
import { setFeedAmbient, clearFeedAmbient } from '../../audio/audio'
import { useUI, type Feed } from '../store'
import { PaletteIcon } from '../palette'
import { clamp, fmtClock, TOPBAR_H } from '../styles'
import DroneView, { AEROSTAT_MIN_TILT, AEROSTAT_MAX_TILT } from '../../drone/DroneView'
import { groundAt } from '../../drone/ground'
import { IMAGERY_CREDIT } from '../../world/pack/imagery'
import { winView } from '../mapUtil'
import { usePortalTarget } from '../shell/PopOut'

const CAM_MODES = ['WHOT', 'BHOT', 'EO', 'NVG', 'SAT'] as const
const CAM_FILTERS: Record<string, string> = {
  WHOT: 'grayscale(1) contrast(1.18) brightness(1.08)',
  BHOT: 'grayscale(1) invert(1) contrast(1.12) brightness(1.02)',
  EO: 'saturate(1.08) contrast(1.05)',
  NVG: 'grayscale(1) brightness(1.4) sepia(1) hue-rotate(55deg) saturate(3.2) contrast(1.12)',
  SAT: 'saturate(1.04) contrast(1.03)', // orthoimagery drape — near-raw
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
  // groundAt, NOT elevAt: the sensor camera flies the pack's real-metre
  // surface (P7) and this projection must match it exactly or reticles drift
  const camPos = { x: drone.x, y: groundAt(drone.x, drone.y) + spec.alt * (drone.altMul || 1), z: drone.y }
  const aim = feedAimPoint(drone, feed)
  const aimX = aim.x, aimY = aim.y
  let fwd = { x: aimX - camPos.x, y: groundAt(aimX, aimY) - camPos.y, z: aimY - camPos.z }
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
  const rel = { x: wx - camPos.x, y: groundAt(wx, wy) - camPos.y, z: wy - camPos.z }
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
  const portal = usePortalTarget()
  return (
    // portalProps: on a popped-out feed the dropdown has to mount into THAT
    // window's body, not the opener's — see ui/shell/PopOut
    <Menu shadow="md" width={withIcons ? 'auto' : Math.max(minWidth, 80)}
      position="bottom-start" withArrow={false} trapFocus={false}
      portalProps={portal}>
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
  const portal = usePortalTarget()
  return (
    <Menu shadow="md" width={210} position="bottom-end" withArrow={false} trapFocus={false}
      portalProps={portal}>
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

export default function FeedWindow({ feed, index, docked }: { feed: Feed; index: number; docked?: boolean }) {
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
    if (e.button !== 0 || docked) return // docked feeds don't float — they stack
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
      if (docked) return
      ui.setFeed(feed.id, {
        x: Math.max(0, Math.min(hw - 120, e.clientX - d.dx - hx)),
        y: Math.max(0, Math.min(hh - 40, e.clientY - d.dy - hy)),
      })
    } else if (docked) {
      // stacked in the feeds rail: the panel owns the width — only height resizes
      ui.setFeed(feed.id, { h: Math.max(180, Math.min(hh, d.h + (e.clientY - d.sy))) })
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

  // window mode: 'win' (draggable/resizable) | 'max' (fill screen) | 'min' (title only).
  // DOCKED (in the feeds rail) every mode is PANEL-relative: min = a title bar
  // in the stack, max = fills the panel, win = a stacked block at feed.h.
  const winMode = feed.winMode || 'win'
  const boxStyle: CSSProperties = docked
    ? winMode === 'max'
      ? { position: 'absolute', inset: 0, zIndex: 45 }
      : winMode === 'min'
        ? { position: 'relative', width: '100%' }
        : { position: 'relative', width: '100%', height: feed.h, flex: '0 0 auto' }
    : winMode === 'max'
      // edge-to-edge below the top bar — no margin, footer flush to the screen bottom
      ? { position: 'fixed', left: 0, top: TOPBAR_H, right: 0, bottom: 0 }
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
      <Group ref={headerRef} gap={5} wrap="nowrap" pl={8} pr={12} py={4} align="center"
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
            {/* OUT ONTO ITS OWN SCREEN. A sensor picture is a 16:9 object and
                the rail is a 340 px column — on one monitor that is a trade the
                commander makes knowingly, on two it is not a trade at all.
                KNOWN FAULT: closing the popped window with the OS titlebar X
                crashes the renderer. A station survives that because it is a 2D
                canvas; this is WebGL, and its GPU context has to be released
                BEFORE its document dies, which that button gives nobody the
                chance to do. Closing it with the ✕ in the window itself is the
                safe path. Unresolved — see CONSOLE.md step 5. */}
            {!feed.popped && (
              <ActionIcon size="md" variant="default" title="Pop out to its own window" style={winIcon}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => ui.setFeed(feed.id, { popped: true, winMode: 'win' })}>⧉</ActionIcon>
            )}
            <ActionIcon size="md" variant="default" title="Close" style={winIcon}
              onPointerDown={(e) => e.stopPropagation()} onClick={() => ui.closeFeed(feed.id)}>×</ActionIcon>
          </Group>
        </Group>
      </Group>

      {/* ---- CONTENT (flexes between header and footer; the sensor view) ---- */}
      {winMode !== 'min' && (
        <Box ref={contentRef}
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
                {drone.label} · {camMode === 'EO' ? 'EO DAY-TV' : camMode === 'SAT' ? 'SAT ORTHO' : camMode === 'NVG' ? 'I2 NVG' : 'IR ' + camMode} · {
                  drone.state === 'transit' ? 'TRANSIT' : drone.state === 'rtb' ? 'RTB' : drone.state === 'striking' ? 'TERMINAL' : 'ON STA'}
                {' · '}{(38 / feed.fov).toFixed(1)}×{(feed.gx || feed.gy) ? ' · OFFSET' : ''}
              </div>
              {/* the imagery credit rides the picture it applies to — a
                  terrain-mode SAT view shows no Esri pixels, so no credit */}
              {camMode === 'SAT' && S.map?.sat && (
                <div style={{ position: 'absolute', bottom: 8, left: 26, color: 'rgba(216,232,240,0.55)', fontSize: 8, letterSpacing: 0.5 }}>
                  {IMAGERY_CREDIT}
                </div>
              )}
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
