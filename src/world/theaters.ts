// Theater loading — real-world elevation patches as a map source (design law 3;
// ROADMAP → Maps & Terrain → M1). A theater is a baked repo asset (see
// tools/bake-theaters.mjs): 512×512 heights at exactly 50 m/px — one map cell —
// so mapgen samples a seeded sub-window 1:1 with no resampling. Loading is
// async (one small fetch of our own asset, then cached); everything downstream
// of genMap stays synchronous.
import { THEATER_INDEX, type TheaterMeta } from './theaterIndex'

export { THEATER_INDEX }
export type { TheaterMeta }

export interface TheaterData {
  meta: TheaterMeta
  hgt: Float32Array // meters, size×size row-major, north up
}

const cache = new Map<string, TheaterData>()

export async function loadTheater(id: string): Promise<TheaterData> {
  const hit = cache.get(id)
  if (hit) return hit
  const meta = THEATER_INDEX.find(t => t.id === id)
  if (!meta) throw new Error(`unknown theater: ${id}`)
  const res = await fetch(`/theaters/${id}.bin`)
  if (!res.ok) throw new Error(`theater ${id}: HTTP ${res.status}`)
  const q = new Uint16Array(await res.arrayBuffer())
  if (q.length !== meta.size * meta.size) throw new Error(`theater ${id}: bad asset size`)
  const hgt = new Float32Array(q.length)
  const s = (meta.maxElev - meta.minElev) / 65535
  for (let i = 0; i < q.length; i++) hgt[i] = meta.minElev + q[i]! * s
  const data: TheaterData = { meta, hgt }
  cache.set(id, data)
  return data
}
