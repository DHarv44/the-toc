// VEHICLE MODELS IN THE FEED — pack GLB art, baked down to sensor geometry.
//
// The UAV feed is a SENSOR, not a showroom. Everything in it is shaded by the
// sensor — white-hot thermal or washed-out EO — so a model contributes its
// SHAPE and nothing else: geometry in, materials and textures on the floor.
// Pasting an artist's PBR paintwork into a thermal picture would destroy the
// whole visual language of the feed. Vertex shading is re-baked here the same
// way the procedural shapes bake theirs, so a GLB tank and a box tank read as
// the same kind of object under the same sensor.
//
// WHAT COMES OUT: one merged, non-indexed BufferGeometry per platform, with
// position/normal/color, sitting on y=0, centred on x/z, nose down +X, scaled
// to the size the procedural shape it replaces already occupied. Ready to hand
// straight to an InstancedMesh.
//
// THE TRIANGLE BUDGET is the reason this file is careful. The feed instances up
// to MAXC vehicles of a platform at once, so a model's cost is multiplied by
// about a hundred. A 460-triangle jeep is free; a 216,000-triangle display
// tank is 20 million triangles on screen and would take the frame rate with it.
// Over budget, the model is REFUSED and the procedural shape stays — the game
// keeps running and the pack builder gets told why in the console. Bringing a
// heavy model in is a job for an optimize pass on the FILE, not for the feed.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { loadGlbScene, findGlbNode } from '../packs/glb-scene'
import { packModelUrl } from '../packs/model-files'
import { installedPacks } from '../packs/install'

// per model, after merging. ~100 instances * 8k = 800k triangles for a whole
// platform on screen, which sits comfortably beside the terrain mesh.
export const TRI_BUDGET = 8000

interface Sized { geo: THREE.BufferGeometry; tris: number }

// Pull every mesh under `src` into one geometry, in the file's own frame.
// World matrices are baked in, so a model built out of parented parts arrives
// assembled. Attributes are cut down to position+normal: uvs, tangents and
// skinning have no meaning once the materials are gone, and merging is only
// legal when every part carries the same attribute set.
function collapse(src: THREE.Object3D): Sized | null {
  const parts: THREE.BufferGeometry[] = []
  let tris = 0
  src.updateWorldMatrix(true, true)
  src.traverse(o => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.geometry) return
    const g0 = m.geometry
    tris += (g0.index ? g0.index.count : g0.attributes.position.count) / 3
    if (tris > TRI_BUDGET) return
    const g = g0.index ? g0.toNonIndexed() : g0.clone()
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name)
    }
    g.morphAttributes = {}
    if (!g.attributes.normal) g.computeVertexNormals()
    g.applyMatrix4(m.matrixWorld)
    parts.push(g)
  })
  if (!parts.length || tris > TRI_BUDGET) {
    for (const g of parts) g.dispose()
    return tris > TRI_BUDGET ? { geo: new THREE.BufferGeometry(), tris } : null
  }
  const geo = parts.length === 1 ? parts[0]! : mergeGeometries(parts)!
  if (geo !== parts[0]) for (const g of parts) g.dispose()
  return { geo, tris }
}

const box = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox()
  return g.boundingBox!
}

// Sit it where the feed expects a vehicle: on the ground, centred, nose along
// +X (the axis every procedural shape is built down and the heading rotates
// about), and the length the shape it stands in for already had — so a model
// authored in centimetres, or in Z-forward, still lands correctly.
//
// The quarter turn is +90, not -90: glTF vehicles are authored nose-along +Z,
// and rotating -90 about Y sends +Z to -X — every vehicle driving backwards.
//
// Long-axis alignment is as far as geometry can be read; whether the nose or
// the tail ends up down +X is the one thing a file cannot say. A model that
// still comes in backwards gets a `yaw` on its manifest entry — authored data,
// not a heuristic piled on a heuristic.
function orient(g: THREE.BufferGeometry, targetLen: number, yaw = 0): void {
  let b = box(g)
  const size = b.getSize(new THREE.Vector3())
  if (size.z > size.x * 1.15) { g.rotateY(Math.PI / 2); b = box(g) }
  if (yaw) { g.rotateY(yaw * Math.PI / 180); b = box(g) }
  const c = b.getCenter(new THREE.Vector3())
  g.translate(-c.x, -b.min.y, -c.z)
  b = box(g)
  const len = b.max.x - b.min.x
  if (len > 1e-4) g.scale(targetLen / len, targetLen / len, targetLen / len)
}

// Re-bake the shading the feed reads. The procedural shapes hand-author a grey
// per part — tracks dark, hull mid, turret bright — and the sensor tints the
// whole instance on top of that. A model has no such authoring, so its greys
// come off the surface normal: up-facing panels catch the sky, flanks and
// running gear stay dark. Same range, same look.
function shade(g: THREE.BufferGeometry): void {
  const nor = g.attributes.normal!
  const n = nor.count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const c = 0.5 + 0.55 * Math.max(0, nor.getY(i))
    col[i * 3] = c; col[i * 3 + 1] = c; col[i * 3 + 2] = c
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
}

async function bake(
  url: string, node: string | undefined, targetLen: number, yaw?: number,
): Promise<THREE.BufferGeometry> {
  const scene = await loadGlbScene(url)
  const src = findGlbNode(scene, node)
  if (!src) throw new Error(`node "${node}" not found`)
  const got = collapse(src)
  if (!got) throw new Error('no mesh in model')
  if (got.tris > TRI_BUDGET) {
    got.geo.dispose()
    throw new Error(
      `${Math.round(got.tris / 1000)}k triangles is over the ${TRI_BUDGET / 1000}k feed budget — optimize the file`,
    )
  }
  orient(got.geo, targetLen, yaw)
  shade(got.geo)
  got.geo.computeBoundingSphere()
  return got.geo
}

// Every model the installed packs assign to a platform, baked and keyed by
// VEHICLE catalog key. Refusals are reported and skipped, never thrown: a bad
// or heavy model costs you that platform's art, not the feed.
export async function loadFeedVehicleModels(
  targetLen: (vehKey: string) => number,
): Promise<Record<string, THREE.BufferGeometry>> {
  const jobs: Promise<[string, THREE.BufferGeometry] | null>[] = []
  for (const p of installedPacks()) {
    for (const [vehKey, ref] of Object.entries(p.models?.vehicles ?? {})) {
      const url = ref?.file ? packModelUrl(p.id, ref.file) : undefined
      if (!url) {
        console.warn(`[feed] ${p.id}/${vehKey}: no such model file '${ref?.file}'`)
        continue
      }
      jobs.push(
        bake(url, ref.node || undefined, targetLen(vehKey), ref.yaw)
          .then(geo => [vehKey, geo] as [string, THREE.BufferGeometry])
          .catch(e => { console.warn(`[feed] ${p.id}/${vehKey}: ${e?.message ?? e}`); return null }),
      )
    }
  }
  return Object.fromEntries((await Promise.all(jobs)).filter(x => x !== null))
}
