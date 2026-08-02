// The battlefield as seen through a UAS sensor ball. The scene is built in two
// palettes: IR luminance (WHOT/BHOT/NVG derive from it via CSS filters) and
// EO natural color.
//
// The GROUND is the Groundwork engine's (P7, GROUNDWORK.md): buildTerrain
// turns the pack's native heightfield into a mesh in real metres — the same
// export the BFT draws and the sim prices — and TOC's sensor-palette textures
// (painted from the pack's own polygons and road vectors, whole box) drape
// over it. Vertical placement samples the pack too (./ground), so the camera,
// hulls and effects sit on the surface you can see. Instanced trees in
// woodland and buildings in built-up areas ride on top, shared per map.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { buildTerrain } from '@dharv44/groundwork-engine'
import { ROAD_WIDTH_METRES } from '@dharv44/groundwork-core'
import type { PackRoad } from '@dharv44/groundwork-core'
import { S } from '../engine/state'
import type { WorldMap } from '../world/WorldMap'
import { elemWorld, elemExposed, elemHeading } from '../domains/forces/elements'
import { UNIT_TYPES, type UnitTypeKey } from '../domains/forces/catalog'
import { STRUCTURES, type StructureTypeKey } from '../domains/installations/catalog'
import { T_FOREST, T_URBAN } from '../world/WorldMap'
import { hash01 } from '../lib/math'
import { DroneCamera, type FeedState, type Gimbal } from './DroneCamera'
import { groundAt, groundCtx } from './ground'
import { boxImagery } from '../world/pack/imagery'
import { getSatSurface, satSurfaceFrame } from './satSurface'
import { playFeedAudio } from './feedAudio'
import { COMPOSITIONS } from '../domains/forces/composition'
import { loadFeedVehicleModels } from './vehicle-models'
import { makePoseCache, makeElemPoses } from './smoothing'

export { AEROSTAT_MIN_TILT, AEROSTAT_MAX_TILT } from './DroneCamera'
export { groundAt } from './ground'

// mesh vertices across the box's long side — capped at the DEM's own
// resolution by buildTerrain, so small boxes render at native detail
const MESH_DETAIL = 1024

type SensorMode = 'WHOT' | 'BHOT' | 'NVG' | 'EO' | string

interface Detail {
  map: WorldMap
  geo: THREE.BufferGeometry
  /** engine box-centred coords → sim world coords (pure translation) */
  offX: number
  offZ: number
  /** flat surround under the box edge, so edge orbits never stare into void */
  skirtY: number
  texIR: THREE.CanvasTexture
  texEO: THREE.CanvasTexture
  trees: Array<{ x: number; y: number; h: number; s: number; n: number }>
  bldgs: Array<{ x: number; y: number; h: number; w: number; d: number; bh: number; rot: number; n: number }>
}

let cache: Detail | null = null
function getDetail(): Detail {
  if (cache && cache.map === S.map) return cache
  const map = S.map!
  const g = map.ground!
  const { terr, GRID, CELL } = map
  const man = g.files.manifest
  const Wm = man.widthMetres, Hm = man.heightMetres

  const elevAtBilinear = groundAt

  // --- the engine's terrain: the pack heightfield as a mesh in real metres
  // (X east, Z south, Y up — exaggeration 1 is the true shape of the ground),
  // with analytic normals so lighting carries the relief. Engine geometry is
  // centred on the BOX; sim world coords hang off the frame's NW corner — and
  // because spanX·widthMetres = WORLD the difference is a pure translation.
  const build = buildTerrain(g.hf, { detail: MESH_DETAIL, exaggeration: 1 })
  const { f } = groundCtx()
  const offX = (0.5 - f.x0) * Wm
  const offZ = (0.5 - f.y0) * Hm

  // --- ground color lives on a painted TEXTURE draped over the mesh ---
  // Painted from the PACK's own data, whole box, in each sensor palette: the
  // observed polygons (water/wood/built, even-odd so islands and clearings
  // survive) over an open-ground base, grain so nothing reads as plastic, and
  // the real road vectors at true widths on top — the feed and the BFT draw
  // the same geometry. Hillshade is NOT baked: the mesh normals light it.

  const ROAD_DRAW: readonly PackRoad['cls'][] = ['track', 'minor', 'secondary', 'primary', 'motorway']
  const ROAD_TONE: Record<'IR' | 'EO', Record<PackRoad['cls'], string>> = {
    IR: {
      track: 'rgb(112,112,112)', minor: 'rgb(124,124,124)', secondary: 'rgb(132,132,132)',
      primary: 'rgb(138,138,138)', motorway: 'rgb(144,144,144)',
    },
    EO: {
      track: 'rgb(84,71,51)', minor: 'rgb(80,68,51)', secondary: 'rgb(77,66,51)',
      primary: 'rgb(82,71,55)', motorway: 'rgb(87,77,59)',
    },
  }
  const makeGroundTex = (palette: 'IR' | 'EO'): THREE.CanvasTexture => {
    // target ~6 m/px (the exact BFT's fidelity), long side capped at 4096
    const long = Math.max(Wm, Hm)
    const texLong = Math.min(4096, Math.max(1024, Math.round(long / 6)))
    const TW = Math.max(256, Math.round(texLong * (Wm / long)))
    const TH = Math.max(256, Math.round(texLong * (Hm / long)))
    const cv = document.createElement('canvas')
    cv.width = TW; cv.height = TH
    const ctx = cv.getContext('2d')!
    const pxm = TW / Wm // texture px per metre

    // open-ground base
    ctx.fillStyle = palette === 'IR' ? 'rgb(79,79,79)' : 'rgb(88,84,46)'
    ctx.fillRect(0, 0, TW, TH)

    // the pack's own polygons (norm coords → px), even-odd
    const areaPath = (kind: string): Path2D => {
      const path = new Path2D()
      for (const a of g.vectors.areas) {
        if (a.kind !== kind) continue
        for (const rings of [a.outer, a.inner]) {
          for (const ring of rings) {
            for (let i = 0; i + 1 < ring.length; i += 2) {
              const x = ring[i]! * TW, y = ring[i + 1]! * TH
              if (i === 0) path.moveTo(x, y)
              else path.lineTo(x, y)
            }
            path.closePath()
          }
        }
      }
      return path
    }
    if (palette === 'IR') {
      ctx.fillStyle = 'rgb(46,46,46)'; ctx.fill(areaPath('wood'), 'evenodd')
      ctx.fillStyle = 'rgb(118,118,118)'; ctx.fill(areaPath('built'), 'evenodd')
      ctx.fillStyle = 'rgb(15,15,17)'; ctx.fill(areaPath('water'), 'evenodd')
    } else {
      ctx.fillStyle = 'rgb(28,54,22)'; ctx.fill(areaPath('wood'), 'evenodd')
      ctx.fillStyle = 'rgb(101,98,92)'; ctx.fill(areaPath('built'), 'evenodd')
      ctx.fillStyle = 'rgb(33,60,79)'; ctx.fill(areaPath('water'), 'evenodd')
    }

    // grain so flat ground doesn't read as plastic (feed-only texture noise)
    const nz = document.createElement('canvas')
    nz.width = nz.height = 256
    const nctx = nz.getContext('2d')!
    const nimg = nctx.createImageData(256, 256)
    for (let i = 0; i < 256 * 256; i++) {
      const v = 96 + Math.random() * 64
      const o = i * 4
      nimg.data[o] = v; nimg.data[o + 1] = v; nimg.data[o + 2] = v; nimg.data[o + 3] = 255
    }
    nctx.putImageData(nimg, 0, 0)
    ctx.globalCompositeOperation = 'overlay'
    ctx.globalAlpha = 0.16
    for (let ty = 0; ty < TH; ty += 256) for (let tx = 0; tx < TW; tx += 256) ctx.drawImage(nz, tx, ty)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1

    // the real road vectors at true widths (over water = the crossing deck)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const cls of ROAD_DRAW) {
      const path = new Path2D()
      for (const r of g.vectors.roads) {
        if (r.cls !== cls) continue
        for (let i = 0; i + 1 < r.pts.length; i += 2) {
          const x = r.pts[i]! * TW, y = r.pts[i + 1]! * TH
          if (i === 0) path.moveTo(x, y)
          else path.lineTo(x, y)
        }
      }
      ctx.strokeStyle = ROAD_TONE[palette][cls]
      ctx.lineWidth = Math.max(0.6, ROAD_WIDTH_METRES[cls] * pxm)
      ctx.stroke(path)
    }

    const tex = new THREE.CanvasTexture(cv)
    tex.flipY = false // uv v runs north→south, canvas row order (engine UVs match)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    return tex
  }
  const texIR = makeGroundTex('IR')
  const texEO = makeGroundTex('EO')

  const geo = build.geometry
  const skirtY = g.hf.min - 1.5

  // --- trees: one per ~2/3 forest cells, jittered ---
  const trees: Detail['trees'] = []
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const ci = gy * GRID + gx
      if (terr[ci] !== T_FOREST) continue
      const hsh = hash01(gx * 3, gy * 7)
      if (hsh > 0.66) continue
      const x = (gx + 0.15 + hash01(gx, gy) * 0.7) * CELL
      const y = (gy + 0.15 + hash01(gy, gx) * 0.7) * CELL
      trees.push({ x, y, h: elevAtBilinear(x, y), s: 0.75 + hsh, n: hsh })
      if (trees.length >= 14000) break
    }
    if (trees.length >= 14000) break
  }

  // --- buildings: boxes in urban cells ---
  const bldgs: Detail['bldgs'] = []
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const ci = gy * GRID + gx
      if (terr[ci] !== T_URBAN) continue
      const hsh = hash01(gx * 11, gy * 5)
      if (hsh > 0.72) continue
      const x = (gx + 0.2 + hash01(gx + 9, gy) * 0.6) * CELL
      const y = (gy + 0.2 + hash01(gx, gy + 9) * 0.6) * CELL
      bldgs.push({
        x, y, h: elevAtBilinear(x, y),
        w: 9 + hsh * 9, d: 8 + hash01(gx, gy + 3) * 10, bh: 5 + hsh * 9,
        rot: hash01(gx + 1, gy + 1) * 0.5 - 0.25, n: hsh,
      })
      if (bldgs.length >= 3000) break
    }
    if (bldgs.length >= 3000) break
  }

  cache = { map, geo, offX, offZ, skirtY, texIR, texEO, trees, bldgs }
  return cache
}

// SAT is a daylight ortho drape: everything that isn't the ground texture —
// vehicle tints, tree/building colors, lighting, fog — reads as EO.
const eoLike = (m: SensorMode): boolean => m === 'EO' || m === 'SAT'

// The satellite drape for the CURRENT map, one GPU texture per session.
// Fetched through the builder's imagery intake on first request (whole box —
// the engine mesh's UVs span it natively); null until the mosaic lands, and
// the feed falls back to the painted EO drape meanwhile.
let satTex: { map: WorldMap; tex: THREE.CanvasTexture | null } | null = null
let satTexKicked: WorldMap | null = null
function getSatTex(): THREE.CanvasTexture | null {
  if (satTex && satTex.map === S.map) return satTex.tex
  return null
}
function kickSatTex(onReady: () => void): void {
  if (satTexKicked === S.map) return
  const map = S.map!
  satTexKicked = map
  boxImagery(map.ground!)
    .then(cv => {
      const tex = new THREE.CanvasTexture(cv)
      tex.flipY = false // canvas rows run north→south, same as the engine UVs
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 8
      satTex = { map, tex }
      onReady()
    })
    .catch(e => { satTexKicked = null; console.error('satellite imagery failed', e) })
}

function TerrainMesh({ mode, feedRef }: { mode: SensorMode; feedRef: { current: FeedState } }) {
  const detail = useMemo(getDetail, [])
  const [, bump] = useState(0)
  useEffect(() => {
    // the base mosaic is only fetched for a map that shipped satellite —
    // a terrain-mode world's SAT drape needs no imagery at all
    if (mode === 'SAT' && S.map!.sat && !getSatTex()) kickSatTex(() => bump(n => n + 1))
  }, [mode])
  // SAT rides the ENGINE surface — its shader runs the imagery clipmap
  // (nested close-up rings under the look-point, eased swaps). IR/EO keep
  // the painted palette drape on the plain mesh.
  const surface = mode === 'SAT' ? getSatSurface() : null
  useFrame((_, dt) => {
    if (mode !== 'SAT') return
    const feed = feedRef.current
    satSurfaceFrame(dt, feed.cx, feed.cy, getSatTex())
  })
  const tex = eoLike(mode) ? detail.texEO : detail.texIR
  return (
    <>
      {surface ? (
        <primitive object={surface.mesh} position={[detail.offX, 0, detail.offZ]} />
      ) : (
        <mesh geometry={detail.geo} position={[detail.offX, 0, detail.offZ]}>
          <meshLambertMaterial map={tex} />
        </mesh>
      )}
      {/* flat surround just below the box floor — an edge orbit looks out at
          ground tone falling into fog, never into the void */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[detail.offX, detail.skirtY, detail.offZ]}>
        <planeGeometry args={[120000, 120000]} />
        <meshLambertMaterial color={eoLike(mode) ? '#4a472e' : '#3a3a3a'} />
      </mesh>
    </>
  )
}

function SceneDetail({ mode }: { mode: SensorMode }) {
  const detail = useMemo(getDetail, [])
  const treeRef = useRef<THREE.InstancedMesh>(null)
  const bldgRef = useRef<THREE.InstancedMesh>(null)

  // static matrices once
  useEffect(() => {
    const tm = treeRef.current, bm = bldgRef.current
    if (!tm || !bm) return
    for (let i = 0; i < detail.trees.length; i++) {
      const t = detail.trees[i]!
      dummy.position.set(t.x, t.h + 4.5 * t.s, t.y)
      dummy.scale.set(4 * t.s, 9 * t.s, 4 * t.s)
      dummy.rotation.set(0, t.n * 6.28, 0)
      dummy.updateMatrix()
      tm.setMatrixAt(i, dummy.matrix)
    }
    tm.count = detail.trees.length
    tm.instanceMatrix.needsUpdate = true
    for (let i = 0; i < detail.bldgs.length; i++) {
      const b = detail.bldgs[i]!
      dummy.position.set(b.x, b.h + b.bh / 2, b.y)
      dummy.scale.set(b.w, b.bh, b.d)
      dummy.rotation.set(0, b.rot, 0)
      dummy.updateMatrix()
      bm.setMatrixAt(i, dummy.matrix)
    }
    bm.count = detail.bldgs.length
    bm.instanceMatrix.needsUpdate = true
  }, [detail])

  // per-mode colors
  useEffect(() => {
    const tm = treeRef.current, bm = bldgRef.current
    if (!tm || !bm) return
    const c = new THREE.Color()
    for (let i = 0; i < detail.trees.length; i++) {
      const n = detail.trees[i]!.n
      if (eoLike(mode)) c.setRGB(0.08 + n * 0.06, 0.20 + n * 0.10, 0.06 + n * 0.04)
      else c.setRGB(0.10 + n * 0.05, 0.10 + n * 0.05, 0.10 + n * 0.05) // cool canopy
      tm.setColorAt(i, c)
    }
    if (tm.instanceColor) tm.instanceColor.needsUpdate = true
    for (let i = 0; i < detail.bldgs.length; i++) {
      const n = detail.bldgs[i]!.n
      if (eoLike(mode)) c.setRGB(0.45 + n * 0.15, 0.43 + n * 0.14, 0.40 + n * 0.13)
      else c.setRGB(0.45 + n * 0.2, 0.45 + n * 0.2, 0.44 + n * 0.2) // warm structures
      bm.setColorAt(i, c)
    }
    if (bm.instanceColor) bm.instanceColor.needsUpdate = true
  }, [mode, detail])

  return (
    <>
      <instancedMesh ref={treeRef} args={[undefined, undefined, 14000]} frustumCulled={false}>
        <coneGeometry args={[1, 2, 6]} />
        <meshLambertMaterial />
      </instancedMesh>
      <instancedMesh ref={bldgRef} args={[undefined, undefined, 3000]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial />
      </instancedMesh>
    </>
  )
}

// --- procedural vehicle models: primitive parts merged into one geometry ---
// per-vertex shade (grayscale) bakes part definition; instance color tints it.
type VehClass = 'tank' | 'ifv' | 'truck' | 'spg' | 'eng'
const VEH_CLASS: Partial<Record<UnitTypeKey, VehClass>> = {
  ARM: 'tank', MECH: 'ifv', STRY: 'ifv', CAV: 'ifv', SCT: 'truck', SIG: 'truck',
  INF: 'truck', LOG: 'truck', ENG: 'eng', ARTY: 'spg',
}
const classOf = (type: UnitTypeKey | StructureTypeKey): VehClass =>
  VEH_CLASS[type as UnitTypeKey] || 'tank'

// --- pack art ---------------------------------------------------------------
// The five shapes above are the FALLBACK — every unit type has one and always
// will. On top of that, a pack may assign a real model to a PLATFORM (ABRAMS,
// BRADLEY, HMMWV...), and a unit rides whatever its composition says it rides.
// So the platform a unit type puts on the ground is the vehicle it fields most
// of: a mech company is Bradleys with a couple of trucks behind it.
const primaryVeh = (type: UnitTypeKey | StructureTypeKey): string | undefined => {
  const vs = COMPOSITIONS[type as UnitTypeKey]?.vehicles
  if (!vs?.length) return undefined
  return vs.reduce((a, b) => (b.n > a.n ? b : a)).type
}

// How long a model of this platform should be: exactly the length of the
// procedural shape it stands in for, so the two are interchangeable and a
// model authored at any scale lands right without anyone measuring it.
function modelTargets(): Record<string, number> {
  const geos = getVehicleGeos()
  const out: Record<string, number> = {}
  for (const [type, comp] of Object.entries(COMPOSITIONS)) {
    const k = primaryVeh(type as UnitTypeKey)
    if (!k || k in out) continue
    const g = geos[classOf(comp.unit)]
    g.computeBoundingBox()
    out[k] = g.boundingBox!.max.x - g.boundingBox!.min.x
  }
  return out
}

// Models load asynchronously and the feed cannot wait for them: it draws the
// procedural shapes from the first frame and swaps a platform over the moment
// its art is ready. One load for the life of the page.
let modelsOnce: Promise<Record<string, THREE.BufferGeometry>> | null = null
function useVehicleModels(): Record<string, THREE.BufferGeometry> {
  const [geos, setGeos] = useState<Record<string, THREE.BufferGeometry>>({})
  useEffect(() => {
    let live = true
    const t = modelTargets()
    modelsOnce ??= loadFeedVehicleModels(k => t[k] ?? 7)
    modelsOnce.then(g => { if (live && Object.keys(g).length) setGeos(g) })
    return () => { live = false }
  }, [])
  return geos
}

interface PartOpts { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number; c?: number }
function P(gIn: THREE.BufferGeometry, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, c = 1 }: PartOpts = {}) {
  const g = gIn.toNonIndexed()
  if (rx) g.rotateX(rx)
  if (ry) g.rotateY(ry)
  if (rz) g.rotateZ(rz)
  g.translate(x, y, z)
  const n = g.attributes.position!.count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { col[i * 3] = c; col[i * 3 + 1] = c; col[i * 3 + 2] = c }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}
function mergeParts(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let total = 0
  for (const g of list) total += g.attributes.position!.count
  const pos = new Float32Array(total * 3)
  const nor = new Float32Array(total * 3)
  const col = new Float32Array(total * 3)
  let o = 0
  for (const g of list) {
    pos.set(g.attributes.position!.array as Float32Array, o * 3)
    nor.set(g.attributes.normal!.array as Float32Array, o * 3)
    col.set(g.attributes.color!.array as Float32Array, o * 3)
    o += g.attributes.position!.count
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  out.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return out
}

type VehGeos = Record<VehClass | 'soldier', THREE.BufferGeometry>
let vehGeoCache: VehGeos | null = null
function getVehicleGeos(): VehGeos {
  if (vehGeoCache) return vehGeoCache
  const B = (a: number, b: number, c: number) => new THREE.BoxGeometry(a, b, c)
  const C = (r: number, l: number) => new THREE.CylinderGeometry(r, r, l, 8)
  vehGeoCache = {
    // MBT: tracks, hull, turret, long gun
    tank: mergeParts([
      P(B(7.4, 1.2, 1.15), { y: 0.6, z: 1.5, c: 0.5 }),
      P(B(7.4, 1.2, 1.15), { y: 0.6, z: -1.5, c: 0.5 }),
      P(B(6.8, 1.3, 2.7), { y: 1.5, c: 0.92 }),
      P(B(3.4, 1.1, 2.3), { x: -0.4, y: 2.7, c: 1.08 }),
      P(C(0.18, 4.6), { rz: Math.PI / 2, x: 3.4, y: 2.75, c: 0.72 }),
    ]),
    // IFV: tracks, tall hull, small turret + autocannon
    ifv: mergeParts([
      P(B(6.4, 1.1, 1.05), { y: 0.55, z: 1.35, c: 0.5 }),
      P(B(6.4, 1.1, 1.05), { y: 0.55, z: -1.35, c: 0.5 }),
      P(B(6.2, 1.7, 2.5), { y: 1.7, c: 0.92 }),
      P(B(1.9, 0.9, 1.7), { x: 0.6, y: 3.0, c: 1.08 }),
      P(C(0.1, 2.6), { rz: Math.PI / 2, x: 2.6, y: 3.05, c: 0.72 }),
    ]),
    // wheeled truck: wheels, cab, cargo bed
    truck: mergeParts([
      P(B(0.95, 0.95, 0.5), { x: 1.9, y: 0.5, z: 1.25, c: 0.35 }),
      P(B(0.95, 0.95, 0.5), { x: 1.9, y: 0.5, z: -1.25, c: 0.35 }),
      P(B(0.95, 0.95, 0.5), { x: -1.7, y: 0.5, z: 1.25, c: 0.35 }),
      P(B(0.95, 0.95, 0.5), { x: -1.7, y: 0.5, z: -1.25, c: 0.35 }),
      P(B(1.9, 1.6, 2.3), { x: 2.0, y: 1.75, c: 1.08 }),
      P(B(3.9, 1.4, 2.4), { x: -1.0, y: 1.65, c: 0.85 }),
    ]),
    // SP howitzer: tracks, hull, boxy turret, long elevated tube
    spg: mergeParts([
      P(B(7.2, 1.2, 1.15), { y: 0.6, z: 1.55, c: 0.5 }),
      P(B(7.2, 1.2, 1.15), { y: 0.6, z: -1.55, c: 0.5 }),
      P(B(7.0, 1.5, 2.9), { y: 1.65, c: 0.92 }),
      P(B(3.8, 1.7, 2.6), { x: -1.0, y: 3.2, c: 1.08 }),
      P(C(0.17, 5.6), { rz: Math.PI / 2 - 0.2, x: 2.7, y: 3.9, c: 0.72 }),
    ]),
    // engineer vehicle: ifv hull with dozer blade
    eng: mergeParts([
      P(B(6.4, 1.1, 1.05), { y: 0.55, z: 1.35, c: 0.5 }),
      P(B(6.4, 1.1, 1.05), { y: 0.55, z: -1.35, c: 0.5 }),
      P(B(6.0, 1.8, 2.5), { y: 1.75, c: 0.92 }),
      P(B(0.55, 1.4, 3.2), { x: 3.5, y: 1.15, c: 0.7 }),
    ]),
    // dismount: body + head
    soldier: mergeParts([
      P(C(0.34, 1.25), { y: 0.72, c: 0.95 }),
      P(new THREE.SphereGeometry(0.27, 6, 5), { y: 1.62, c: 1.08 }),
    ]),
  }
  return vehGeoCache
}

type StructGeos = Record<StructureTypeKey, THREE.BufferGeometry>
let structGeoCache: StructGeos | null = null
function getStructGeos(): StructGeos {
  if (structGeoCache) return structGeoCache
  const B = (a: number, b: number, c: number) => new THREE.BoxGeometry(a, b, c)
  const C = (r: number, l: number) => new THREE.CylinderGeometry(r, r, l, 8)
  structGeoCache = {
    // FOB: HESCO perimeter, tents, containers, comms mast
    FOB: mergeParts([
      P(B(110, 4, 5), { z: 55, y: 2, c: 0.75 }),
      P(B(110, 4, 5), { z: -55, y: 2, c: 0.75 }),
      P(B(5, 4, 110), { x: 55, y: 2, c: 0.78 }),
      P(B(5, 4, 110), { x: -55, y: 2, c: 0.78 }),
      P(B(18, 6, 10), { x: -20, y: 3, z: -15, c: 1.08 }),
      P(B(14, 5, 9), { x: 15, y: 2.5, z: 10, c: 0.95 }),
      P(B(10, 4, 8), { x: 25, y: 2, z: -25, c: 0.9 }),
      P(B(8, 3.5, 8), { x: -28, y: 1.75, z: 20, c: 0.9 }),
      P(C(0.5, 18), { y: 9, z: 38, c: 0.6 }),
    ]),
    // Command post: TOC tent cluster, antenna farm, barriers
    HQ: mergeParts([
      P(B(16, 5.5, 11), { y: 2.75, c: 1.08 }),
      P(B(9, 4, 7), { x: 14, y: 2, z: 6, c: 0.92 }),
      P(B(7, 3.5, 6), { x: -13, y: 1.75, z: 7, c: 0.9 }),
      P(C(0.35, 16), { x: -8, y: 8, z: -6, c: 0.6 }),
      P(C(0.25, 12), { x: 10, y: 6, z: -8, c: 0.6 }),
      P(B(30, 1.6, 2), { z: -14, y: 0.8, c: 0.72 }),
      P(B(30, 1.6, 2), { z: 14, y: 0.8, c: 0.72 }),
    ]),
    // Observation post: sandbag U, bunker, whip antenna
    OP: mergeParts([
      P(B(8, 1.8, 1.3), { z: 3.4, y: 0.9, c: 0.72 }),
      P(B(1.3, 1.8, 7), { x: 3.4, y: 0.9, c: 0.72 }),
      P(B(1.3, 1.8, 7), { x: -3.4, y: 0.9, c: 0.72 }),
      P(B(4.5, 2.4, 3.2), { z: -0.8, y: 1.2, c: 1.02 }),
      P(C(0.18, 7), { x: 2.2, y: 3.5, z: -2, c: 0.6 }),
    ]),
    // Airfield: runway, hangar, ops hut, mast
    AFLD: mergeParts([
      P(B(320, 0.8, 18), { y: 0.4, c: 1.18 }),
      P(B(24, 8, 20), { x: -60, y: 4, z: 32, c: 0.95 }),
      P(B(10, 5, 8), { x: 40, y: 2.5, z: 28, c: 0.9 }),
      P(B(40, 0.6, 14), { x: -55, y: 0.3, z: 14, c: 1.05 }),
      P(C(0.4, 12), { x: 80, y: 6, z: 34, c: 0.6 }),
    ]),
  }
  return structGeoCache
}

const STRUCT_KINDS: readonly StructureTypeKey[] = ['FOB', 'HQ', 'OP', 'AFLD']

function StructuresLayer({ feedRef, mode }: { feedRef: { current: FeedState }; mode: SensorMode }) {
  // React 19: useRef<T>(null) is RefObject<T | null> — the ref is genuinely
  // null until the mesh mounts, and the type says so now
  const refs: Record<StructureTypeKey, React.RefObject<THREE.InstancedMesh | null>> = {
    FOB: useRef<THREE.InstancedMesh>(null), HQ: useRef<THREE.InstancedMesh>(null),
    OP: useRef<THREE.InstancedMesh>(null), AFLD: useRef<THREE.InstancedMesh>(null),
  }
  const geos = useMemo(getStructGeos, [])
  useFrame(() => {
    const eo = eoLike(mode)
    const feed = feedRef.current
    const cnt: Record<StructureTypeKey, number> = { FOB: 0, HQ: 0, OP: 0, AFLD: 0 }
    if (feed.active) {
      for (const s of S.structures) {
        const mesh = refs[s.kind] && refs[s.kind].current
        if (!mesh || cnt[s.kind] >= 12) continue
        if (Math.hypot(s.x - feed.cx, s.y - feed.cy) > 2800) continue
        const building = s.buildT > 0
        const prog = building ? 1 - s.buildT / STRUCTURES[s.kind].buildTime : 1
        dummy.position.set(s.x, groundAt(s.x, s.y), s.y)
        dummy.rotation.set(0, ((s.id * 0.73) % 1.2) - 0.6, 0)
        dummy.scale.set(1, building ? 0.35 + 0.65 * prog : 1, 1)
        dummy.updateMatrix()
        mesh.setMatrixAt(cnt[s.kind], dummy.matrix)
        const dim = building ? 0.55 + 0.45 * prog : 1
        if (eo) mesh.setColorAt(cnt[s.kind], cTmp.setRGB(0.52 * dim, 0.48 * dim, 0.4 * dim))
        else mesh.setColorAt(cnt[s.kind], cTmp.setRGB(dim, dim, dim * 0.97))
        cnt[s.kind]++
      }
    }
    for (const k of STRUCT_KINDS) {
      const mesh = refs[k].current
      if (!mesh) continue
      mesh.count = cnt[k]
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  })
  return (
    <>
      {STRUCT_KINDS.map(k => (
        <instancedMesh key={k} ref={refs[k]} args={[undefined, undefined, 12]}
          geometry={geos[k]} frustumCulled={false}>
          <meshLambertMaterial vertexColors />
        </instancedMesh>
      ))}
    </>
  )
}

const MAXT = 512, MAXSEG = 64
const dummy = new THREE.Object3D()
const cTmp = new THREE.Color()

const VEH_CLASSES: readonly VehClass[] = ['tank', 'ifv', 'truck', 'spg', 'eng']
const MAXC = 96 // instances per vehicle class

// half-hull, metres — how far apart the ground is sampled to tip a vehicle to
// the slope it is standing on. One set for every class: the difference between
// a tank and a truck is well inside the terrain's own resolution.
const HULL_L = 3.5, HULL_W = 1.6
// no vehicle sits at more than ~26°; past that the terrain read is noise, not
// ground, and a hull standing on its nose looks worse than one slightly flat
const clampTilt = (a: number) => Math.max(-0.45, Math.min(0.45, a))

function UnitsLayer({ feedRef, mode, muted = false }: {
  feedRef: { current: FeedState }
  mode: SensorMode
  muted?: boolean
}) {
  // One instanced mesh per BUCKET. A bucket is either one of the five
  // procedural classes or one platform wearing pack art ('m:ABRAMS'); both are
  // drawn the same way, so the draw loop never has to know which it is.
  const vehGeos = useMemo(getVehicleGeos, [])
  const models = useVehicleModels()
  const buckets = useMemo(
    () => [
      ...VEH_CLASSES.map(c => ({ id: c, geo: vehGeos[c] })),
      ...Object.entries(models).map(([k, geo]) => ({ id: `m:${k}`, geo })),
    ],
    [vehGeos, models],
  )
  const meshRefs = useRef<Record<string, THREE.InstancedMesh | null>>({})
  const poses = useRef(makePoseCache()).current
  const elems = useRef(makeElemPoses()).current
  const trpRef = useRef<THREE.InstancedMesh>(null)
  const flashRef = useRef<THREE.InstancedMesh>(null)
  const smokeRef = useRef<THREE.InstancedMesh>(null)
  const tracerRef = useRef<THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>>(null)
  const fireRef = useRef<THREE.InstancedMesh>(null)
  const plumeRef = useRef<THREE.InstancedMesh>(null)
  const tracerGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXSEG * 6), 3))
    return g
  }, [])

  useFrame((_, dt) => {
    const eo = eoLike(mode)
    const feed = feedRef.current
    const trp = trpRef.current
    const meshes = meshRefs.current
    if (!trp || !meshes.tank || !feed.active) {
      for (const b of buckets) { const m = meshes[b.id]; if (m) m.count = 0 }
      if (trp) trp.count = 0
      return
    }
    const { cx, cy } = feed
    playFeedAudio(feed, muted)
    const cnt: Record<string, number> = {}
    for (const b of buckets) cnt[b.id] = 0
    let ti = 0
    const groundY = groundAt
    // a unit's platform wears its pack model where there is one, and falls back
    // to the class shape for everything else
    const bucketOf = (type: UnitTypeKey | StructureTypeKey): string => {
      const k = primaryVeh(type)
      return k && models[k] ? `m:${k}` : classOf(type)
    }
    // A hull sits ON the ground, not above an averaged point of it: sample the
    // surface fore/aft and either side of the vic and tip it to match. Vehicles
    // drawn level on a slope are the single loudest tell that a feed is fake —
    // you are looking down at terrain, so the mismatch is unmissable. Euler
    // order is YZX so the rotations compose in the model's own frame: roll
    // about the hull axis (+X), pitch about the lateral (+Z), then yaw into the
    // world. `extra` is the wrecks' dumped-in-the-dirt cant, on top of the lie
    // of the land.
    const putVehicle = (cls: string, x: number, y: number, heading: number, extra: number, color: THREE.Color) => {
      const mesh = meshes[cls]
      const n = cnt[cls] ?? 0
      if (!mesh || n >= MAXC) return
      const c = Math.cos(heading), s = Math.sin(heading)
      const hF = groundY(x + c * HULL_L, y + s * HULL_L)
      const hB = groundY(x - c * HULL_L, y - s * HULL_L)
      const hL = groundY(x - s * HULL_W, y + c * HULL_W)
      const hR = groundY(x + s * HULL_W, y - c * HULL_W)
      const pitch = clampTilt(Math.atan2(hF - hB, HULL_L * 2))
      const roll = clampTilt(Math.atan2(hR - hL, HULL_W * 2))
      dummy.position.set(x, (hF + hB + hL + hR) / 4 + 0.3, y)
      dummy.rotation.set(roll, -heading, pitch + extra, 'YZX')
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      mesh.setMatrixAt(n, dummy.matrix)
      mesh.setColorAt(n, color)
      cnt[cls] = n + 1
    }

    // Render each live, exposed element at the position combat uses — a
    // pinpoint strike destroys the specific vic you can see. The pose is eased
    // toward that position rather than snapped to it (see ./smoothing): the sim
    // steps at 20 Hz and this draws at 60, so the raw value would step three
    // frames at a time. The formation offsets ride on the eased pose, so a
    // platoon stays rigid while it moves.
    for (const u of S.units) {
      if (Math.hypot(u.x - cx, u.y - cy) > 2800) continue
      const cls = bucketOf(u.type)
      // The unit pose carries the formation FRAME — where the platoon is and
      // which way it is oriented, rate-limited so a waypoint corner swings the
      // axis of advance over a second or so instead of one 50 ms tick.
      const p = poses.pose(u.id, u.x, u.y, u.heading, dt)
      // Running hot: an engine that has been under load reads warmer than one
      // idling, and no two vics in a platoon are the same temperature anyway.
      const hot = u.state === 'moving' ? 1 : 0.9
      for (let i = 0; i < u.elements.length; i++) {
        const el = u.elements[i]!
        if (!el.alive || !elemExposed(u, el)) continue
        // ...and the element pose is the individual vehicle. Once the unit has
        // moved, that comes from the sim — the vic drives its own odometer
        // along the unit's route (domains/movement/station.ts) and this only
        // bridges 20 Hz to 60. Until then it is the rigid body-frame layout.
        const w = elemWorld(p, el)
        const e = elems.pose(u.id * 256 + i, w.x, w.y, elemHeading(p, el), dt)
        const v = 0.9 + hash01(u.id, i) * 0.2
        if (el.kind === 'veh') {
          const t = hot * v
          putVehicle(cls, e.x, e.y, e.heading, 0,
            eo ? cTmp.setRGB(0.24 * v, 0.27 * v, 0.19 * v) : cTmp.setRGB(t, t, t))
        } else if (ti < MAXT) {
          dummy.position.set(e.x, groundY(e.x, e.y) + 0.1, e.y)
          dummy.rotation.set(0, -e.heading, 0)
          dummy.scale.setScalar(1.15)
          dummy.updateMatrix()
          trp.setMatrixAt(ti, dummy.matrix)
          trp.setColorAt(ti, eo ? cTmp.setRGB(0.18 * v, 0.17 * v, 0.14 * v)
            : cTmp.setRGB(0.85 * v, 0.85 * v, 0.85 * v))
          ti++
        }
      }
    }
    // wrecks: cooling hulks / charred hulls, tilted into the dirt
    for (const wk of S.wrecks) {
      if (Math.hypot(wk.x - cx, wk.y - cy) > 2800) continue
      const age = S.t - wk.t
      if (age > 240) continue
      const spec = (UNIT_TYPES as Record<string, typeof UNIT_TYPES[UnitTypeKey] | undefined>)[wk.type]
      if (spec && !(spec.carrier ? spec.carrier.veh : spec.veh)) continue
      let color: THREE.Color
      if (eo) color = cTmp.setRGB(0.07, 0.06, 0.05)
      else {
        const heat = Math.max(0.3, 1 - age / 240)
        color = cTmp.setRGB(heat, heat * 0.95, heat * 0.9)
      }
      putVehicle(spec ? bucketOf(wk.type) : 'tank', wk.x, wk.y, (wk.x % 3), 0.22, color)
    }
    for (const b of buckets) {
      const m = meshes[b.id]
      if (!m) continue
      m.count = cnt[b.id] ?? 0
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
    trp.count = ti
    trp.instanceMatrix.needsUpdate = true
    if (trp.instanceColor) trp.instanceColor.needsUpdate = true
    poses.sweep()
    elems.sweep()

    // flashes: arty impacts, muzzle flashes, impact sparks, kill explosions
    const fl = flashRef.current
    if (fl) {
      let fi = 0
      const flash = (x: number, y: number, h: number, scale: number, bright: number) => {
        if (fi >= 40) return
        dummy.position.set(x, groundY(x, y) + h, y)
        dummy.scale.setScalar(scale)
        dummy.rotation.set(0, 0, 0)
        dummy.updateMatrix()
        fl.setMatrixAt(fi, dummy.matrix)
        if (eo) fl.setColorAt(fi, cTmp.setRGB(bright * 1.1, bright * 0.75, bright * 0.3))
        else fl.setColorAt(fi, cTmp.setRGB(bright, bright, bright * 0.92))
        fi++
      }
      for (const im of S.impacts) {
        const age = S.t - im.t
        if (im.gun) {
          // small, brief cannon-round spark
          if (age > 0.4) continue
          flash(im.x, im.y, 1.2, (1.6 + age * 6) * (im.sz || 1), Math.max(0, 1 - age / 0.4) * 1.5)
        } else {
          if (age > 2.5) continue
          flash(im.x, im.y, 3, 6 + age * 30, Math.max(0, 1 - age / 2.5) * 2)
        }
      }
      for (const u of S.units) {
        if (!u.targetId) continue
        if (Math.hypot(u.x - cx, u.y - cy) > 2800) continue
        const tgt = S.units.find(x => x.id === u.targetId)
        if (!tgt) continue
        if (((S.t * 6.3 + u.id * 1.7) % 1) < 0.22) {
          flash(u.x + Math.sin(u.formSeed) * 8, u.y + Math.cos(u.formSeed) * 8, 2.5, 2.6, 1.8)
        }
        if (((S.t * 5.1 + u.id * 2.3) % 1) < 0.3) {
          const jx = Math.sin(u.formSeed * 3 + Math.floor(S.t * 4)) * 20
          const jy = Math.cos(u.formSeed * 5 + Math.floor(S.t * 4)) * 20
          flash(tgt.x + jx, tgt.y + jy, 1.5, 1.6, 1.3)
        }
      }
      for (const wk of S.wrecks) {
        const age = S.t - wk.t
        if (age > 1.6) continue
        if (Math.hypot(wk.x - cx, wk.y - cy) > 2800) continue
        flash(wk.x, wk.y, 4, 8 + age * 26, Math.max(0, 1 - age / 1.6) * 2.2)
      }
      fl.count = fi
      fl.instanceMatrix.needsUpdate = true
      if (fl.instanceColor) fl.instanceColor.needsUpdate = true
    }

    // tracers
    const tr = tracerRef.current
    if (tr) {
      tr.material.color.set(eo ? '#ffcf7d' : '#ffffff')
      const pos = tracerGeo.attributes.position!.array as Float32Array
      let segs = 0, vi2 = 0
      for (const u of S.units) {
        if (!u.targetId || segs >= MAXSEG) continue
        if (Math.hypot(u.x - cx, u.y - cy) > 2800) continue
        const tgt = S.units.find(x => x.id === u.targetId)
        if (!tgt) continue
        for (let k = 0; k < 3 && segs < MAXSEG; k++) {
          if (((S.t * 1.9 + u.id * 0.71 + k * 0.53) % 1.7) > 1.1) continue
          const phase = (S.t * (2.2 + (u.id % 4) * 0.23) + k * 0.37 + u.formSeed) % 1
          const jig = Math.floor(S.t * 3) + k * 11
          const ex = tgt.x + Math.sin(u.formSeed * 9 + jig) * 22
          const ey = tgt.y + Math.cos(u.formSeed * 7 + jig) * 22
          const dx = ex - u.x, dy = ey - u.y
          const L = Math.hypot(dx, dy) || 1
          const px = u.x + dx * phase, py = u.y + dy * phase
          const qx = px + (dx / L) * 55, qy = py + (dy / L) * 55
          pos[vi2++] = px; pos[vi2++] = groundY(px, py) + 2.5; pos[vi2++] = py
          pos[vi2++] = qx; pos[vi2++] = groundY(qx, qy) + 2.5; pos[vi2++] = qy
          segs++
        }
      }
      // gunship cannon rounds in flight: a short tracer dash at the round's position,
      // streaking from the (moving) aircraft muzzle to its impact point
      for (const r of S.gunRounds) {
        if (segs >= MAXSEG) break
        if (Math.hypot(r.x - cx, r.y - cy) > 3400) continue
        const life = r.impactT - r.t0
        const f = life > 0 ? Math.min(1, (S.t - r.t0) / life) : 1
        const f2 = Math.max(0, f - 0.03)
        const mx = r.fromX, mz = r.fromY, my = groundY(r.fromX, r.fromY) + r.mAlt
        const gx = r.x, gz = r.y, gy = groundY(r.x, r.y) + 1.5
        pos[vi2++] = mx + (gx - mx) * f;  pos[vi2++] = my + (gy - my) * f;  pos[vi2++] = mz + (gz - mz) * f
        pos[vi2++] = mx + (gx - mx) * f2; pos[vi2++] = my + (gy - my) * f2; pos[vi2++] = mz + (gz - mz) * f2
        segs++
      }
      tracerGeo.setDrawRange(0, segs * 2)
      tracerGeo.attributes.position!.needsUpdate = true
    }

    // burning wrecks: fire + rising smoke plumes
    const fr = fireRef.current, pl = plumeRef.current
    if (fr && pl) {
      let fi2 = 0, pi = 0
      for (const wk of S.wrecks) {
        const age = S.t - wk.t
        if (age > 75) continue
        if (Math.hypot(wk.x - cx, wk.y - cy) > 2800) continue
        const spec = (UNIT_TYPES as Record<string, typeof UNIT_TYPES[UnitTypeKey] | undefined>)[wk.type]
        if (spec && !(spec.carrier ? spec.carrier.veh : spec.veh)) continue
        const big = !spec ? 2 : 1
        const gy0 = groundY(wk.x, wk.y)
        const dieOff = Math.max(0.25, 1 - age / 75)
        if (fi2 < 32) {
          const flick = (0.75 + 0.45 * Math.sin(S.t * 13 + wk.x * 0.7) * Math.sin(S.t * 7.3 + wk.y)) * dieOff
          dummy.position.set(wk.x, gy0 + 2.2 * big, wk.y)
          dummy.scale.set(3.4 * big * flick + 1, 4.6 * big * flick + 1, 3.4 * big * flick + 1)
          dummy.rotation.set(0, 0, 0)
          dummy.updateMatrix()
          fr.setMatrixAt(fi2, dummy.matrix)
          fr.setColorAt(fi2, eo ? cTmp.setRGB(2, 1.1, 0.25) : cTmp.setRGB(2, 1.9, 1.7))
          fi2++
        }
        for (let k = 0; k < 4 && pi < 96; k++) {
          const h = (S.t * 6.5 + k * 13 + (wk.x % 9) * 3) % 52
          const grow = 3.5 * big + h * 0.34
          const drift = 2 + h * 0.14
          dummy.position.set(
            wk.x + Math.sin(k * 2.1 + S.t * 0.35 + wk.y) * drift,
            gy0 + 5 + h,
            wk.y + Math.cos(k * 1.7 + S.t * 0.3 + wk.x) * drift,
          )
          dummy.scale.setScalar(grow)
          dummy.rotation.set(0, 0, 0)
          dummy.updateMatrix()
          pl.setMatrixAt(pi, dummy.matrix)
          const v = (0.05 + 0.05 * ((k + h) % 2 === 0 ? 1 : 0.4)) * dieOff + 0.03
          if (eo) pl.setColorAt(pi, cTmp.setRGB(v + 0.12, v + 0.11, v + 0.1))
          else pl.setColorAt(pi, cTmp.setRGB(v, v, v * 1.06))
          pi++
        }
      }
      fr.count = fi2; pl.count = pi
      fr.instanceMatrix.needsUpdate = true
      pl.instanceMatrix.needsUpdate = true
      if (fr.instanceColor) fr.instanceColor.needsUpdate = true
      if (pl.instanceColor) pl.instanceColor.needsUpdate = true
    }

    // artillery smoke screens: cold domes (IR) / white-gray clouds (EO)
    const sk = smokeRef.current
    if (sk) {
      let si = 0
      for (const sm of S.smoke) {
        if (si >= 24) break
        const age = S.t - sm.t
        const grow = Math.min(1, 0.35 + age / 8)
        dummy.position.set(sm.x, groundY(sm.x, sm.y) + 12, sm.y)
        dummy.scale.set(sm.r * grow, sm.r * grow * 0.35, sm.r * grow)
        dummy.rotation.set(0, sm.x % 6.28, 0)
        dummy.updateMatrix()
        sk.setMatrixAt(si, dummy.matrix)
        if (eo) {
          const v = 0.72 + 0.06 * Math.sin(sm.x + age)
          sk.setColorAt(si, cTmp.setRGB(v, v, v))
        } else {
          const v = 0.1 + 0.04 * Math.sin(sm.x + age)
          sk.setColorAt(si, cTmp.setRGB(v, v, v * 1.05))
        }
        si++
      }
      sk.count = si
      sk.instanceMatrix.needsUpdate = true
      if (sk.instanceColor) sk.instanceColor.needsUpdate = true
    }
  })

  return (
    <>
      {buckets.map((b) => (
        <instancedMesh key={b.id} ref={m => { meshRefs.current[b.id] = m }}
          args={[undefined, undefined, MAXC]}
          geometry={b.geo} frustumCulled={false}>
          <meshBasicMaterial vertexColors toneMapped={false} />
        </instancedMesh>
      ))}
      <instancedMesh ref={trpRef} args={[undefined, undefined, MAXT]}
        geometry={vehGeos.soldier} frustumCulled={false}>
        <meshBasicMaterial vertexColors toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={flashRef} args={[undefined, undefined, 40]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={0.85} />
      </instancedMesh>
      <instancedMesh ref={smokeRef} args={[undefined, undefined, 24]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 7]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={0.82} />
      </instancedMesh>
      <lineSegments ref={tracerRef} geometry={tracerGeo} frustumCulled={false}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.9} toneMapped={false} />
      </lineSegments>
      <instancedMesh ref={fireRef} args={[undefined, undefined, 32]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={0.9} />
      </instancedMesh>
      <instancedMesh ref={plumeRef} args={[undefined, undefined, 96]} frustumCulled={false}>
        <sphereGeometry args={[1, 9, 7]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={0.7} />
      </instancedMesh>
    </>
  )
}

export default function DroneView({ droneId, gimbal, mode = 'WHOT', muted = false }: {
  droneId: number | null
  gimbal?: Gimbal
  mode?: SensorMode
  muted?: boolean
}) {
  const feedRef = useRef<FeedState>({ active: false, cx: 0, cy: 0 })
  const eo = eoLike(mode)
  return (
    <Canvas
      gl={{ antialias: true }}
      camera={{ fov: 38, near: 5, far: 20000, position: [0, 1000, 0] }}
      style={{ background: eo ? '#8fa3ae' : '#050607' }}
    >
      <ambientLight intensity={eo ? 0.85 : 0.55} />
      <directionalLight position={[3000, 4000, 2000]} intensity={eo ? 1.1 : 0.9} />
      <fog attach="fog" args={[eo ? '#9aacb8' : '#0a0c0d', 3500, eo ? 11000 : 9000]} />
      <TerrainMesh mode={mode} feedRef={feedRef} />
      <SceneDetail mode={mode} />
      <StructuresLayer feedRef={feedRef} mode={mode} />
      <UnitsLayer feedRef={feedRef} mode={mode} muted={muted} />
      <DroneCamera feedRef={feedRef} droneId={droneId} gimbal={gimbal} />
    </Canvas>
  )
}
