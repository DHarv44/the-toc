import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { S, elemWorld, elemExposed } from '../game/sim.js'
import { muzzle, rumble, audioReady } from '../game/audio.js'
import { UNIT_TYPES, DRONE_TYPES, STRUCTURES } from '../game/units.js'
import { GRID, CELL, WORLD, T_FIELD, T_FOREST, T_URBAN, T_WATER } from '../game/mapgen.js'

// The battlefield as seen through a UAS sensor ball. The scene is built in two
// palettes: IR luminance (WHOT/BHOT/NVG derive from it via CSS filters) and
// EO natural color. Detail layer: 512² micro-displaced terrain, instanced
// trees in forests and buildings in towns, shared per map.

const RES = 512 // terrain vertices per side

const hash01 = (a, b) => {
  let h = (a * 374761393 + b * 668265263) | 0
  h = (h ^ (h >> 13)) * 1274126177
  return (((h ^ (h >> 16)) >>> 0) % 1000) / 1000
}

let cache = null
function getDetail() {
  if (cache && cache.map === S.map) return cache
  const map = S.map
  const { elev, terr, road, waterSurf } = map

  const elevAtBilinear = (x, y) => {
    const cx = x / CELL - 0.5, cy = y / CELL - 0.5
    let gx0 = Math.floor(cx), gy0 = Math.floor(cy)
    const wx = cx - gx0, wy = cy - gy0
    gx0 = Math.max(0, Math.min(GRID - 1, gx0)); gy0 = Math.max(0, Math.min(GRID - 1, gy0))
    const gx1 = Math.min(GRID - 1, gx0 + 1), gy1 = Math.min(GRID - 1, gy0 + 1)
    const a = elev[gy0 * GRID + gx0], b = elev[gy0 * GRID + gx1]
    const c = elev[gy1 * GRID + gx0], d = elev[gy1 * GRID + gx1]
    return a * (1 - wx) * (1 - wy) + b * wx * (1 - wy) + c * (1 - wx) * wy + d * wx * wy
  }

  // --- terrain geometry: RES², micro-displacement, dual color attributes ---
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(RES * RES * 3)
  const colIR = new Float32Array(RES * RES * 3)
  const colEO = new Float32Array(RES * RES * 3)
  const step = WORLD / (RES - 1)
  for (let j = 0; j < RES; j++) {
    for (let i = 0; i < RES; i++) {
      const vi = j * RES + i
      const x = i * step, y = j * step
      const gx = Math.max(0, Math.min(GRID - 1, Math.floor(x / CELL)))
      const gy = Math.max(0, Math.min(GRID - 1, Math.floor(y / CELL)))
      const ci = gy * GRID + gx
      const t = terr[ci]
      const n = hash01(i, j)
      let h
      if (t === T_WATER) h = waterSurf[ci]
      else h = elevAtBilinear(x, y) + (n - 0.5) * 1.1
      pos[vi * 3] = x; pos[vi * 3 + 1] = h; pos[vi * 3 + 2] = y

      // IR luminance
      let v
      if (t === T_WATER) v = 0.045 + n * 0.015
      else if (t === T_FOREST) v = 0.15 + n * 0.06
      else if (t === T_URBAN) v = 0.40 + n * 0.14
      else v = 0.28 + n * 0.07
      if (road[ci]) v = 0.53 + n * 0.05
      colIR[vi * 3] = v; colIR[vi * 3 + 1] = v; colIR[vi * 3 + 2] = v

      // EO natural color
      let r, g, b
      if (t === T_WATER) { r = 0.13; g = 0.22 + n * 0.03; b = 0.30 + n * 0.04 }
      else if (t === T_FOREST) { r = 0.10 + n * 0.05; g = 0.22 + n * 0.08; b = 0.08 + n * 0.03 }
      else if (t === T_URBAN) { r = 0.38 + n * 0.1; g = 0.37 + n * 0.1; b = 0.35 + n * 0.09 }
      else {
        const dry = hash01(gx, gy)
        r = 0.32 + dry * 0.14 + n * 0.05; g = 0.32 + dry * 0.08 + n * 0.05; b = 0.16 + dry * 0.05
      }
      if (road[ci]) { r = 0.30 + n * 0.05; g = 0.26 + n * 0.04; b = 0.20 }
      colEO[vi * 3] = r; colEO[vi * 3 + 1] = g; colEO[vi * 3 + 2] = b
    }
  }
  const idx = new Uint32Array((RES - 1) * (RES - 1) * 6)
  let k = 0
  for (let j = 0; j < RES - 1; j++) {
    for (let i = 0; i < RES - 1; i++) {
      const a = j * RES + i, b = a + 1, c = a + RES, d = c + 1
      idx[k++] = a; idx[k++] = c; idx[k++] = b
      idx[k++] = b; idx[k++] = c; idx[k++] = d
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('colorIR', new THREE.BufferAttribute(colIR, 3))
  geo.setAttribute('colorEO', new THREE.BufferAttribute(colEO, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colIR, 3))
  geo.setIndex(new THREE.BufferAttribute(idx, 1))
  geo.computeVertexNormals()

  // --- trees: one per ~2/3 forest cells, jittered ---
  const trees = []
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
  const bldgs = []
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

  cache = { map, geo, trees, bldgs }
  return cache
}

function TerrainMesh({ mode }) {
  const detail = useMemo(getDetail, [])
  const matRef = useRef()
  useEffect(() => {
    const src = mode === 'EO' ? detail.geo.attributes.colorEO : detail.geo.attributes.colorIR
    detail.geo.attributes.color.array = src.array
    detail.geo.attributes.color.needsUpdate = true
  }, [mode, detail])
  return (
    <mesh geometry={detail.geo}>
      <meshLambertMaterial ref={matRef} vertexColors />
    </mesh>
  )
}

function SceneDetail({ mode }) {
  const detail = useMemo(getDetail, [])
  const treeRef = useRef()
  const bldgRef = useRef()

  // static matrices once
  useEffect(() => {
    const tm = treeRef.current, bm = bldgRef.current
    if (!tm || !bm) return
    for (let i = 0; i < detail.trees.length; i++) {
      const t = detail.trees[i]
      dummy.position.set(t.x, t.h + 4.5 * t.s, t.y)
      dummy.scale.set(4 * t.s, 9 * t.s, 4 * t.s)
      dummy.rotation.set(0, t.n * 6.28, 0)
      dummy.updateMatrix()
      tm.setMatrixAt(i, dummy.matrix)
    }
    tm.count = detail.trees.length
    tm.instanceMatrix.needsUpdate = true
    for (let i = 0; i < detail.bldgs.length; i++) {
      const b = detail.bldgs[i]
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
      const n = detail.trees[i].n
      if (mode === 'EO') c.setRGB(0.08 + n * 0.06, 0.20 + n * 0.10, 0.06 + n * 0.04)
      else c.setRGB(0.10 + n * 0.05, 0.10 + n * 0.05, 0.10 + n * 0.05) // cool canopy
      tm.setColorAt(i, c)
    }
    if (tm.instanceColor) tm.instanceColor.needsUpdate = true
    for (let i = 0; i < detail.bldgs.length; i++) {
      const n = detail.bldgs[i].n
      if (mode === 'EO') c.setRGB(0.45 + n * 0.15, 0.43 + n * 0.14, 0.40 + n * 0.13)
      else c.setRGB(0.45 + n * 0.2, 0.45 + n * 0.2, 0.44 + n * 0.2) // warm structures
      bm.setColorAt(i, c)
    }
    if (bm.instanceColor) bm.instanceColor.needsUpdate = true
  }, [mode, detail])

  return (
    <>
      <instancedMesh ref={treeRef} args={[null, null, 14000]} frustumCulled={false}>
        <coneGeometry args={[1, 2, 6]} />
        <meshLambertMaterial />
      </instancedMesh>
      <instancedMesh ref={bldgRef} args={[null, null, 3000]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial />
      </instancedMesh>
    </>
  )
}

// --- procedural vehicle models: primitive parts merged into one geometry ---
// per-vertex shade (grayscale) bakes part definition; instance color tints it.
const VEH_CLASS = { ARM: 'tank', MECH: 'ifv', STRY: 'ifv', CAV: 'ifv', SCT: 'truck', SIG: 'truck', INF: 'truck', LOG: 'truck', ENG: 'eng', ARTY: 'spg' }
const classOf = (type) => VEH_CLASS[type] || 'tank'

function P(g, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, c = 1 } = {}) {
  g = g.toNonIndexed()
  if (rx) g.rotateX(rx)
  if (ry) g.rotateY(ry)
  if (rz) g.rotateZ(rz)
  g.translate(x, y, z)
  const n = g.attributes.position.count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { col[i * 3] = c; col[i * 3 + 1] = c; col[i * 3 + 2] = c }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}
function mergeParts(list) {
  let total = 0
  for (const g of list) total += g.attributes.position.count
  const pos = new Float32Array(total * 3)
  const nor = new Float32Array(total * 3)
  const col = new Float32Array(total * 3)
  let o = 0
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3)
    nor.set(g.attributes.normal.array, o * 3)
    col.set(g.attributes.color.array, o * 3)
    o += g.attributes.position.count
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  out.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return out
}

let vehGeoCache = null
function getVehicleGeos() {
  if (vehGeoCache) return vehGeoCache
  const B = (a, b, c) => new THREE.BoxGeometry(a, b, c)
  const C = (r, l) => new THREE.CylinderGeometry(r, r, l, 8)
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

let structGeoCache = null
function getStructGeos() {
  if (structGeoCache) return structGeoCache
  const B = (a, b, c) => new THREE.BoxGeometry(a, b, c)
  const C = (r, l) => new THREE.CylinderGeometry(r, r, l, 8)
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

const STRUCT_KINDS = ['FOB', 'HQ', 'OP', 'AFLD']

function StructuresLayer({ feedRef, mode }) {
  const refs = { FOB: useRef(), HQ: useRef(), OP: useRef(), AFLD: useRef() }
  const geos = useMemo(getStructGeos, [])
  useFrame(() => {
    const eo = mode === 'EO'
    const feed = feedRef.current
    const cnt = { FOB: 0, HQ: 0, OP: 0, AFLD: 0 }
    if (feed.active) {
      for (const s of S.structures) {
        const mesh = refs[s.kind] && refs[s.kind].current
        if (!mesh || cnt[s.kind] >= 12) continue
        if (Math.hypot(s.x - feed.cx, s.y - feed.cy) > 2800) continue
        const building = s.buildT > 0
        const prog = building ? 1 - s.buildT / STRUCTURES[s.kind].buildTime : 1
        dummy.position.set(s.x, S.map.elevAt(s.x, s.y), s.y)
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
        <instancedMesh key={k} ref={refs[k]} args={[null, null, 12]}
          geometry={geos[k]} frustumCulled={false}>
          <meshLambertMaterial vertexColors />
        </instancedMesh>
      ))}
    </>
  )
}

// wedge formation offsets for the Nth element of a platoon
function formationOffset(n, seed) {
  const row = Math.ceil(n / 2)
  const side = n === 0 ? 0 : (n % 2 === 1 ? -1 : 1)
  return {
    fwd: -row * 28 - (seed % 7),
    lat: side * (22 + row * 14) + ((seed * 13) % 9) - 4,
  }
}

const MAXV = 256, MAXT = 512, MAXSEG = 64
const dummy = new THREE.Object3D()
const cTmp = new THREE.Color()

const VEH_CLASSES = ['tank', 'ifv', 'truck', 'spg', 'eng']
const MAXC = 96 // instances per vehicle class

function UnitsLayer({ feedRef, mode }) {
  const tankRef = useRef(), ifvRef = useRef(), truckRef = useRef(), spgRef = useRef(), engRef = useRef()
  const classRefs = { tank: tankRef, ifv: ifvRef, truck: truckRef, spg: spgRef, eng: engRef }
  const vehGeos = useMemo(getVehicleGeos, [])
  const trpRef = useRef()
  const flashRef = useRef()
  const smokeRef = useRef()
  const tracerRef = useRef()
  const fireRef = useRef()
  const plumeRef = useRef()
  const tracerGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXSEG * 6), 3))
    return g
  }, [])

  useFrame(() => {
    const eo = mode === 'EO'
    const feed = feedRef.current
    const trp = trpRef.current
    const meshes = {}
    for (const c of VEH_CLASSES) meshes[c] = classRefs[c].current
    if (!trp || !meshes.tank || !feed.active) {
      for (const c of VEH_CLASSES) if (meshes[c]) meshes[c].count = 0
      if (trp) trp.count = 0
      return
    }
    const { cx, cy } = feed
    // feed audio: only for events on this sensor's footprint, each sounded once.
    // guns THUD when fired (deeper for bigger guns); rounds land as a quieter deep rumble.
    if (audioReady()) {
      const R = feed.viewR || 500
      // firing reports — cannon rounds, as they leave the (off-screen) aircraft
      for (const r of S.gunRounds) {
        if (r._snd || S.t - r.t0 > 0.2) continue
        if (Math.hypot(r.x - cx, r.y - cy) > R) continue
        r._snd = true
        const s = Math.min(1.9, Math.max(0.8, r.flash || 1)) // 25mm ~1.0, 40mm ~1.7
        muzzle(0.26 + (s - 1) * 0.30, 108 - (s - 1) * 58)     // bigger gun = louder + deeper
      }
      // firing report — 105mm howitzer (deepest thud)
      for (const sh of S.shells) {
        if (!sh.bigGun || sh._snd || sh.t0 == null || S.t - sh.t0 > 0.2) continue
        if (Math.hypot(sh.x - cx, sh.y - cy) > R) continue
        sh._snd = true
        muzzle(0.7, 46)
      }
      // impacts — deep rumble at roughly half the firing volume
      for (const im of S.impacts) {
        if (im._snd || S.t - im.t > 0.25) continue
        const dd = Math.hypot(im.x - cx, im.y - cy)
        if (dd > R) continue
        im._snd = true
        const vol = Math.max(0.2, 1 - dd / R)
        if (im.gun) {
          const s = Math.min(1.9, Math.max(0.8, im.sz || 1))
          // ~0.7x the firing thud so impacts stay at least half as loud, but deeper
          rumble(vol * (0.26 + (s - 1) * 0.30) * 0.7, (108 - (s - 1) * 58) * 0.66)
        } else {
          rumble(vol * 0.55, 42) // shell / HE — big deep rumble
        }
      }
    }
    const cnt = { tank: 0, ifv: 0, truck: 0, spg: 0, eng: 0 }
    let ti = 0
    const groundY = (x, y) => S.map.elevAt(x, y)
    const putVehicle = (cls, x, y, heading, tilt, color) => {
      const mesh = meshes[cls]
      if (!mesh || cnt[cls] >= MAXC) return
      dummy.position.set(x, groundY(x, y) + 0.3, y)
      dummy.rotation.set(0, -heading, tilt)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      mesh.setMatrixAt(cnt[cls], dummy.matrix)
      mesh.setColorAt(cnt[cls], color)
      cnt[cls]++
    }

    // render each live, exposed element at the exact position combat uses, so a
    // pinpoint strike destroys the specific vic you can see
    for (const u of S.units) {
      if (Math.hypot(u.x - cx, u.y - cy) > 2800) continue
      const cls = classOf(u.type)
      for (const el of u.elements) {
        if (!el.alive || !elemExposed(u, el)) continue
        const w = elemWorld(u, el)
        if (el.kind === 'veh') {
          putVehicle(cls, w.x, w.y, u.heading, 0,
            eo ? cTmp.setRGB(0.24, 0.27, 0.19) : cTmp.setRGB(1, 1, 1))
        } else if (ti < MAXT) {
          dummy.position.set(w.x, groundY(w.x, w.y) + 0.1, w.y)
          dummy.rotation.set(0, -u.heading, 0)
          dummy.scale.setScalar(1.15)
          dummy.updateMatrix()
          trp.setMatrixAt(ti, dummy.matrix)
          trp.setColorAt(ti, eo ? cTmp.setRGB(0.18, 0.17, 0.14) : cTmp.setRGB(0.85, 0.85, 0.85))
          ti++
        }
      }
    }
    // wrecks: cooling hulks / charred hulls, tilted into the dirt
    for (const wk of S.wrecks) {
      if (Math.hypot(wk.x - cx, wk.y - cy) > 2800) continue
      const age = S.t - wk.t
      if (age > 240) continue
      const spec = UNIT_TYPES[wk.type]
      if (spec && !(spec.carrier ? spec.carrier.veh : spec.veh)) continue
      let color
      if (eo) color = cTmp.setRGB(0.07, 0.06, 0.05)
      else {
        const heat = Math.max(0.3, 1 - age / 240)
        color = cTmp.setRGB(heat, heat * 0.95, heat * 0.9)
      }
      putVehicle(spec ? classOf(wk.type) : 'tank', wk.x, wk.y, (wk.x % 3), 0.22, color)
    }
    for (const c of VEH_CLASSES) {
      const m = meshes[c]
      m.count = cnt[c]
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
    trp.count = ti
    trp.instanceMatrix.needsUpdate = true
    if (trp.instanceColor) trp.instanceColor.needsUpdate = true

    // flashes: arty impacts, muzzle flashes, impact sparks, kill explosions
    const fl = flashRef.current
    if (fl) {
      let fi = 0
      const flash = (x, y, h, scale, bright) => {
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
      const pos = tracerGeo.attributes.position.array
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
      tracerGeo.attributes.position.needsUpdate = true
    }

    // burning wrecks: fire + rising smoke plumes
    const fr = fireRef.current, pl = plumeRef.current
    if (fr && pl) {
      let fi2 = 0, pi = 0
      for (const wk of S.wrecks) {
        const age = S.t - wk.t
        if (age > 75) continue
        if (Math.hypot(wk.x - cx, wk.y - cy) > 2800) continue
        const spec = UNIT_TYPES[wk.type]
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
      {VEH_CLASSES.map((c) => (
        <instancedMesh key={c} ref={classRefs[c]} args={[null, null, MAXC]}
          geometry={vehGeos[c]} frustumCulled={false}>
          <meshBasicMaterial vertexColors toneMapped={false} />
        </instancedMesh>
      ))}
      <instancedMesh ref={trpRef} args={[null, null, MAXT]}
        geometry={vehGeos.soldier} frustumCulled={false}>
        <meshBasicMaterial vertexColors toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={flashRef} args={[null, null, 40]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={0.85} />
      </instancedMesh>
      <instancedMesh ref={smokeRef} args={[null, null, 24]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 7]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={0.82} />
      </instancedMesh>
      <lineSegments ref={tracerRef} geometry={tracerGeo} frustumCulled={false}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.9} toneMapped={false} />
      </lineSegments>
      <instancedMesh ref={fireRef} args={[null, null, 32]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={0.9} />
      </instancedMesh>
      <instancedMesh ref={plumeRef} args={[null, null, 96]} frustumCulled={false}>
        <sphereGeometry args={[1, 9, 7]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={0.7} />
      </instancedMesh>
    </>
  )
}

function DroneCamera({ feedRef, droneId, gimbal }) {
  useFrame(({ camera }) => {
    const d = S.drones.find(d => d.id === droneId)
    const feed = feedRef.current
    if (!d) { feed.active = false; return }
    feed.active = true
    const spec = DRONE_TYPES[d.type]
    const gx = gimbal?.gx ?? 0, gy2 = gimbal?.gy ?? 0
    const elev = S.map.elevAt(d.x, d.y)
    camera.position.set(d.x, elev + spec.alt * (d.altMul || 1), d.y)
    if (d.lock && d.state !== 'striking') {
      // sensor lock: stay on the point/track no matter where the orbit takes us
      feed.cx = d.lock.x; feed.cy = d.lock.y
      camera.lookAt(d.lock.x, S.map.elevAt(d.lock.x, d.lock.y), d.lock.y)
    } else if (d.state === 'onstation') {
      const lx = d.tx + gx, ly = d.ty + gy2
      feed.cx = lx; feed.cy = ly
      camera.lookAt(lx, S.map.elevAt(lx, ly), ly)
    } else {
      const hx = d.state === 'rtb' ? d.ox : d.state === 'striking' ? d.sx : d.tx
      const hy = d.state === 'rtb' ? d.oy : d.state === 'striking' ? d.sy : d.ty
      const a = Math.atan2(hy - d.y, hx - d.x)
      const ahead = d.state === 'striking' ? 120 : 900
      const lx = d.x + Math.cos(a) * ahead + gx, ly = d.y + Math.sin(a) * ahead + gy2
      feed.cx = lx; feed.cy = ly
      camera.lookAt(lx, S.map.elevAt(lx, ly) + (d.state === 'striking' ? 0 : 30), ly)
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

export default function DroneView({ droneId, gimbal, mode = 'WHOT' }) {
  const feedRef = useRef({ active: false, cx: 0, cy: 0 })
  const eo = mode === 'EO'
  return (
    <Canvas
      gl={{ antialias: true }}
      camera={{ fov: 38, near: 5, far: 20000, position: [0, 1000, 0] }}
      style={{ background: eo ? '#8fa3ae' : '#050607' }}
    >
      <ambientLight intensity={eo ? 0.85 : 0.55} />
      <directionalLight position={[3000, 4000, 2000]} intensity={eo ? 1.1 : 0.9} />
      <fog attach="fog" args={[eo ? '#9aacb8' : '#0a0c0d', 3500, eo ? 11000 : 9000]} />
      <TerrainMesh mode={mode} />
      <SceneDetail mode={mode} />
      <StructuresLayer feedRef={feedRef} mode={mode} />
      <UnitsLayer feedRef={feedRef} mode={mode} />
      <DroneCamera feedRef={feedRef} droneId={droneId} gimbal={gimbal} />
    </Canvas>
  )
}
