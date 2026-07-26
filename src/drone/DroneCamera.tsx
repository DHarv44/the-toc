// The sensor-ball camera: lock / aerostat turret / orbit gimbal / transit
// look-ahead. Extracted verbatim from src/drone/DroneView.jsx.
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { PerspectiveCamera } from 'three'
import { S } from '../engine/state'
import { DRONE_TYPES } from '../domains/air/catalog'
import { easePose, type Pose } from './smoothing'

// aerostat turret depression limits: level (can't tilt above the horizon) to near-nadir
export const AEROSTAT_MIN_TILT = 0.05    // rad above 0 so the horizon look-distance stays finite
export const AEROSTAT_MAX_TILT = 1.48    // ~85°, nearly straight down

// per-feed camera state shared with the render layers (footprint centre + radius)
export interface FeedState {
  active: boolean
  cx: number
  cy: number
  viewR?: number
}

export interface Gimbal {
  gx: number
  gy: number
  fov: number
}

export function DroneCamera({ feedRef, droneId, gimbal }: {
  feedRef: { current: FeedState }
  droneId: number | null
  gimbal?: Gimbal
}) {
  // The airframe's own position and whatever the ball is looking at, both eased
  // (see ./smoothing). This matters more than smoothing the vehicles did: the
  // camera stepping at 20 Hz drags the ENTIRE picture with it, so the ground
  // itself stutters. A drone flies 40-60 m/s, so the 62 ms lag is a couple of
  // metres of standoff nobody can see.
  const eye = useRef<Pose>({ x: 0, y: 0, heading: 0 })
  const aim = useRef<Pose>({ x: 0, y: 0, heading: 0 })
  const shownId = useRef<number | null>(null)

  useFrame(({ camera: cam }, dt) => {
    const camera = cam as PerspectiveCamera
    const d = S.drones.find(d => d.id === droneId)
    const feed = feedRef.current
    if (!d) { feed.active = false; shownId.current = null; return }
    feed.active = true
    const spec = DRONE_TYPES[d.type]
    const gx = gimbal?.gx ?? 0, gy2 = gimbal?.gy ?? 0
    // a feed that just opened, or was just pointed at a different airframe,
    // cuts to the new picture instead of flying there
    if (shownId.current !== d.id) {
      shownId.current = d.id
      eye.current.x = d.x; eye.current.y = d.y
      aim.current.x = d.tx; aim.current.y = d.ty
    }
    easePose(eye.current, d.x, d.y, 0, dt, 400)
    const ex = eye.current.x, ey = eye.current.y
    const elev = S.map!.elevAt(ex, ey)
    camera.position.set(ex, elev + spec.alt * (d.altMul || 1), ey)
    // Ease the look point too, and hand the camera the eased one. A hard slew —
    // a new lock, a mode change — outruns the snap threshold and cuts, the way
    // an operator's slew does; a tracked vehicle just gets followed smoothly.
    const look = (x: number, y: number, yOff = 0) => {
      easePose(aim.current, x, y, 0, dt, 600)
      const lx = aim.current.x, ly = aim.current.y
      feed.cx = lx; feed.cy = ly
      camera.lookAt(lx, S.map!.elevAt(lx, ly) + yOff, ly)
    }
    if (d.lock && d.state !== 'striking') {
      // sensor lock: stay on the point/track no matter where the orbit takes us
      look(d.lock.x, d.lock.y)
    } else if (d.state === 'onstation' && d.tether) {
      // aerostat turret. AUTO sweeps 360° around the mast (scanAngle advances in the sim
      // tick); FREE holds the operator's hand-slewed bearing (gx/gy). LOCK is handled by
      // the lock branch above.
      // Turret is a bearing (yaw about the mast) + a depression angle. The look point is
      // where that ray hits the ground: R = alt / tan(depression), so level looks to the
      // horizon and near-nadir looks straight down. AUTO yaws the bearing for a clean
      // 360° survey at a fixed working depression; FREE holds the operator's bearing and
      // tilt. Camera stays over the mast (the aerostat never moves); world-up = level.
      camera.up.set(0, 1, 0)
      const alt = spec.alt * (d.altMul || 1)
      const bearing = d.scanAngle || 0
      // AUTO sweeps at whatever tilt the operator last left it — so switching FREE→AUTO
      // continues from exactly where they parked the camera, both bearing and depression,
      // rather than snapping to a fixed survey angle. Falls back to a working depression
      // if the turret was never hand-tilted.
      const dep = d.tilt ?? Math.atan2(alt, spec.sight * 0.45)
      const R = alt / Math.tan(Math.max(AEROSTAT_MIN_TILT, dep))
      look(d.tx + Math.cos(bearing) * R, d.ty + Math.sin(bearing) * R)
    } else if (d.state === 'onstation') {
      look(d.tx + gx, d.ty + gy2)
    } else {
      const hx = d.state === 'rtb' ? d.ox : d.state === 'striking' ? d.sx! : d.tx
      const hy = d.state === 'rtb' ? d.oy : d.state === 'striking' ? d.sy! : d.ty
      const a = Math.atan2(hy - ey, hx - ex)
      const ahead = d.state === 'striking' ? 120 : 900
      look(ex + Math.cos(a) * ahead + gx, ey + Math.sin(a) * ahead + gy2,
        d.state === 'striking' ? 0 : 30)
    }
    camera.fov = gimbal?.fov ?? 38
    camera.far = 20000
    camera.updateProjectionMatrix()
    // approximate ground footprint radius, for gating feed audio to what's on screen
    const alt = spec.alt * (d.altMul || 1)
    feed.viewR = Math.max(140, alt * Math.tan((camera.fov * Math.PI / 180) / 2) * 2.4)
  })
  return null
}
