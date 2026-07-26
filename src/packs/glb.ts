// Reading a GLB's TABLE OF CONTENTS — no three.js, no loader, no GPU.
//
// A .glb is a tiny binary container: a 12-byte header, then chunks. The first
// chunk is the glTF JSON, which already names every node, mesh, material and
// texture in the file. That is everything a browser needs to tell an author
// what is in their art and what `node` names they can reference, and it costs
// one fetch and a JSON.parse — no renderer involved.
//
// Loading models for DISPLAY is a separate job (GLTFLoader) and does not exist
// yet; this is the metadata side only.

const MAGIC = 0x46546c67 // 'glTF' little-endian
const JSON_CHUNK = 0x4e4f534a

export interface GlbNode {
  name: string
  depth: number
  tris: number      // 0 for a pure group node
  mesh: boolean
}

// One browsable THING in a file. Exporters bury the real content under a
// wrapper chain (Sketchfab_model > file.fbx > RootNode > …), so the models are
// found by walking DOWN the pass-through nodes to the first place the tree
// branches. A file holding five vehicles yields five; a file holding one model
// in many parts yields its parts, because that is genuinely how it was built.
export interface GlbModel {
  name: string           // display name
  node?: string          // the node a manifest would ref; absent = whole file
  tris: number           // triangles in this node's whole subtree
  part?: boolean         // a PIECE of the asset above it, not an asset itself
}

export interface GlbInfo {
  url: string
  bytes: number
  generator?: string
  extensions: string[]   // extensionsUsed — Draco/Meshopt/KTX2 show up here
  materials: number
  textures: number
  images: string[]       // mime types, so PNG-vs-KTX2 is visible
  models: GlbModel[]     // what is actually in here, wrappers stripped
  nodes: GlbNode[]       // the raw scene graph, flattened with depth
  tris: number           // whole-file triangle count
}

interface GltfJson {
  asset?: { generator?: string }
  extensionsUsed?: string[]
  scenes?: { nodes?: number[] }[]
  nodes?: { name?: string; mesh?: number; children?: number[] }[]
  meshes?: { name?: string; primitives?: { indices?: number }[] }[]
  accessors?: { count?: number }[]
  materials?: unknown[]
  textures?: unknown[]
  images?: { mimeType?: string }[]
}

export async function readGlb(url: string): Promise<GlbInfo> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const buf = await res.arrayBuffer()
  const dv = new DataView(buf)
  if (buf.byteLength < 20 || dv.getUint32(0, true) !== MAGIC) throw new Error(`${url}: not a GLB`)
  const jsonLen = dv.getUint32(12, true)
  if (dv.getUint32(16, true) !== JSON_CHUNK) throw new Error(`${url}: first chunk is not JSON`)
  const j = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen))) as GltfJson

  // a mesh's triangles = its primitives' index counts / 3
  const meshTris = (mi: number): number => {
    const m = j.meshes?.[mi]
    let t = 0
    for (const p of m?.primitives ?? []) {
      const acc = p.indices != null ? j.accessors?.[p.indices] : undefined
      if (acc?.count) t += acc.count / 3
    }
    return Math.round(t)
  }

  const nodes: GlbNode[] = []
  let total = 0
  const seen = new Set<number>()
  const walk = (i: number, depth: number) => {
    if (seen.has(i)) return // malformed graphs shouldn't hang the browser
    seen.add(i)
    const n = j.nodes?.[i]
    if (!n) return
    const tris = n.mesh != null ? meshTris(n.mesh) : 0
    total += tris
    nodes.push({ name: n.name ?? `node ${i}`, depth, tris, mesh: n.mesh != null })
    for (const c of n.children ?? []) walk(c, depth + 1)
  }
  for (const root of j.scenes?.[0]?.nodes ?? []) walk(root, 0)

  // subtree triangles, for the model list
  const subtreeTris = (i: number, guard = new Set<number>()): number => {
    if (guard.has(i)) return 0
    guard.add(i)
    const n = j.nodes?.[i]
    if (!n) return 0
    let t = n.mesh != null ? meshTris(n.mesh) : 0
    for (const c of n.children ?? []) t += subtreeTris(c, guard)
    return t
  }

  // Walk down the wrapper chain: while there is exactly ONE node and it holds
  // no mesh of its own but does have children, it is scaffolding, not content.
  // Stop at the first branch (or the first real mesh) — that is the level the
  // author actually modelled at.
  let level = j.scenes?.[0]?.nodes ?? []
  for (let hop = 0; hop < 16; hop++) {
    if (level.length !== 1) break
    const only = j.nodes?.[level[0]!]
    if (!only || only.mesh != null || !only.children?.length) break
    level = only.children
  }
  const names = level.map(i => j.nodes?.[i]?.name ?? `node ${i}`)
  const fileName = url.split('/').pop()?.replace(/\?.*$/, '').replace(/\.glb$/i, '') ?? 'model'

  // ONE asset in many parts, or many assets? Two tells, both from how
  // exporters name things:
  //
  //  STEM   parts of one asset share a name stem ('desirefx.me_002_1',
  //         '..._003_2', …); separate models do not ('BTR', 'T-90').
  //  DEFAULT a part is often left with its primitive's default name —
  //         'Cylinder.010', 'Track.001', 'Object_5'. Nobody names a VEHICLE
  //         Cylinder, so one of these in the branch means it is a parts list.
  const lcp = names.length > 1
    ? names.reduce((a, b) => {
      let k = 0
      while (k < a.length && k < b.length && a[k] === b[k]) k++
      return a.slice(0, k)
    })
    : ''
  const DEFAULT_NAME = /^(cube|cylinder|sphere|plane|circle|cone|torus|icosphere|mesh|object|node|group|empty)[\s._-]*\d*$/i
  const sharedStem = names.length > 1 && lcp.length >= 4
  const defaultNames = names.some(n => DEFAULT_NAME.test(n))

  const whole: GlbModel = { name: fileName, tris: total }
  const parts = (isPart: boolean): GlbModel[] =>
    level.map((i, k) => ({
      name: names[k]!, node: names[k]!, tris: subtreeTris(i), part: isPart || undefined,
    }))

  // Uniform parts (one stem) say nothing individually, so the file alone is
  // the answer. A MIXED branch — real names beside default ones — is one asset
  // whose pieces are still worth seeing, so the COMPLETE thing leads and the
  // pieces follow. Neither tell firing means these really are separate models.
  const models: GlbModel[] = sharedStem ? [whole]
    : defaultNames ? [whole, ...parts(true)]
      : parts(false)

  return {
    url,
    bytes: buf.byteLength,
    generator: j.asset?.generator,
    extensions: j.extensionsUsed ?? [],
    materials: j.materials?.length ?? 0,
    textures: j.textures?.length ?? 0,
    images: (j.images ?? []).map(i => i.mimeType ?? '?'),
    models,
    nodes,
    tris: total,
  }
}
