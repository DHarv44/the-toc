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

export interface GlbInfo {
  url: string
  bytes: number
  generator?: string
  extensions: string[]   // extensionsUsed — Draco/Meshopt/KTX2 show up here
  materials: number
  textures: number
  images: string[]       // mime types, so PNG-vs-KTX2 is visible
  nodes: GlbNode[]       // the scene graph, flattened with depth
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

  return {
    url,
    bytes: buf.byteLength,
    generator: j.asset?.generator,
    extensions: j.extensionsUsed ?? [],
    materials: j.materials?.length ?? 0,
    textures: j.textures?.length ?? 0,
    images: (j.images ?? []).map(i => i.mimeType ?? '?'),
    nodes,
    tris: total,
  }
}
