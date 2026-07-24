// Theater baker — one-time dev tool (ROADMAP → Maps & Terrain → M1).
//
// Fetches real-world elevation from the AWS Open Data terrain tiles
// (Mapzen "terrarium" PNGs, public-domain government DEM sources - SRTM,
// EU-DEM, etc.; https://registry.opendata.aws/terrain-tiles/) and bakes each
// curated theater into a small repo asset:
//
//   public/theaters/<id>.bin   — 512×512 Uint16 LE, row-major, north up,
//                                exactly 50 m/px (25.6 km × 25.6 km), heights
//                                quantized between the min/max in the index
//   src/world/theaterIndex.ts  — generated metadata the game imports
//
// The game never fetches anything at runtime — it only reads these assets.
// Re-run: node tools/bake-theaters.mjs   (safe to re-run; overwrites)
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { PNG } from 'pngjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_BIN = path.join(ROOT, 'public', 'theaters')
const OUT_TS = path.join(ROOT, 'src', 'world', 'theaterIndex.ts')

const SIZE = 512          // output pixels per side
const MPP = 50            // meters per output pixel (== one map cell)
const ZOOM = 12           // source tile zoom (24-38 m/px in our latitudes)
const TILE = 256          // terrarium tile size

// Curated theaters — maneuver country only (design law 2): valleys, plains,
// ridge-and-farmland, steppe. lat/lon is the patch center.
const THEATERS = [
  { id: 'fulda', name: 'FULDA GAP', sub: 'Central German ridge-and-farmland · the NATO tripwire corridors', lat: 50.51, lon: 9.75 },
  { id: 'ntc', name: 'NTC — MOJAVE', sub: "High-desert washes and ridgelines · the Army's own battlefield", lat: 35.35, lon: -116.65 },
  { id: 'tigris', name: 'TIGRIS VALLEY', sub: 'River plain, bluffs and wadis on the road to Mosul', lat: 35.82, lon: 43.3 },
  { id: 'donbas', name: 'DONBAS STEPPE', sub: 'Open steppe and shallow ridges · long sightlines, little cover', lat: 47.8, lon: 37.25 },
  { id: 'ardennes', name: 'ARDENNES', sub: 'Forested ridge and valley country · the Bulge', lat: 50.0, lon: 5.72 },
  { id: 'arghandab', name: 'ARGHANDAB VALLEY', sub: 'Green-zone river valley walled by desert ridges', lat: 31.7, lon: 65.55 },
  { id: 'golan', name: 'GOLAN HEIGHTS', sub: 'Volcanic tank country · the plateau of the Valley of Tears', lat: 33.05, lon: 35.78 },
]

// --- web-mercator helpers (global pixel space at ZOOM) ----------------------
const WORLD_PX = TILE * 2 ** ZOOM
const lonToPx = (lon) => ((lon + 180) / 360) * WORLD_PX
const latToPx = (lat) => {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2) * WORLD_PX
}

// --- tile fetch + decode -----------------------------------------------------
async function fetchTile(tx, ty, attempt = 0) {
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${tx}/${ty}.png`
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()))
    if (png.width !== TILE || png.height !== TILE) throw new Error(`bad tile size ${png.width}×${png.height}`)
    // terrarium: meters = (R*256 + G + B/256) - 32768
    const m = new Float32Array(TILE * TILE)
    for (let i = 0; i < m.length; i++) {
      const o = i * 4
      m[i] = png.data[o] * 256 + png.data[o + 1] + png.data[o + 2] / 256 - 32768
    }
    return m
  } catch (e) {
    if (attempt >= 3) throw new Error(`tile ${tx}/${ty}: ${e.message}`)
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
    return fetchTile(tx, ty, attempt + 1)
  }
}

async function bakeTheater(t) {
  // target sample positions in global mercator pixels, bilinear source lookup.
  // Output rows run north→south; meters offsets convert via local degree size.
  const latRad = (t.lat * Math.PI) / 180
  const mPerDegLat = 111320
  const mPerDegLon = 111320 * Math.cos(latRad)

  // tile range from the patch corners (+1px bilinear margin)
  const half = (SIZE / 2) * MPP
  const north = t.lat + half / mPerDegLat, south = t.lat - half / mPerDegLat
  const west = t.lon - half / mPerDegLon, east = t.lon + half / mPerDegLon
  const tx0 = Math.floor((lonToPx(west) - 1) / TILE), tx1 = Math.floor((lonToPx(east) + 1) / TILE)
  const ty0 = Math.floor((latToPx(north) - 1) / TILE), ty1 = Math.floor((latToPx(south) + 1) / TILE)

  const tiles = new Map()
  const jobs = []
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) jobs.push([tx, ty])
  // small fetch pool
  let j = 0
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (j < jobs.length) {
      const [tx, ty] = jobs[j++]
      tiles.set(`${tx}/${ty}`, await fetchTile(tx, ty))
    }
  }))

  const sample = (px, py) => {
    const x0 = Math.floor(px), y0 = Math.floor(py)
    const fx = px - x0, fy = py - y0
    const at = (x, y) => {
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE)
      const tile = tiles.get(`${tx}/${ty}`)
      if (!tile) throw new Error(`missing tile ${tx}/${ty}`)
      return tile[(y - ty * TILE) * TILE + (x - tx * TILE)]
    }
    return (
      at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) +
      at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy
    )
  }

  const hgt = new Float32Array(SIZE * SIZE)
  let lo = Infinity, hi = -Infinity
  for (let row = 0; row < SIZE; row++) {
    const lat = t.lat - ((row - (SIZE - 1) / 2) * MPP) / mPerDegLat
    const py = latToPx(lat)
    for (let col = 0; col < SIZE; col++) {
      const lon = t.lon + ((col - (SIZE - 1) / 2) * MPP) / mPerDegLon
      const v = sample(lonToPx(lon), py)
      hgt[row * SIZE + col] = v
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
  }

  // quantize to Uint16 between lo/hi (recorded in the index)
  const q = new Uint16Array(SIZE * SIZE)
  const s = hi > lo ? 65535 / (hi - lo) : 0
  for (let i = 0; i < q.length; i++) q[i] = Math.round((hgt[i] - lo) * s)
  await writeFile(path.join(OUT_BIN, `${t.id}.bin`), Buffer.from(q.buffer))

  console.log(`  ${t.id.padEnd(10)} ${tiles.size} tiles · elev ${Math.round(lo)}–${Math.round(hi)} m (relief ${Math.round(hi - lo)} m)`)
  return { ...t, size: SIZE, metersPerPx: MPP, minElev: Math.round(lo * 10) / 10, maxElev: Math.round(hi * 10) / 10 }
}

await mkdir(OUT_BIN, { recursive: true })
console.log(`baking ${THEATERS.length} theaters → ${OUT_BIN}`)
const index = []
for (const t of THEATERS) index.push(await bakeTheater(t))

const ts = `// AUTO-GENERATED by tools/bake-theaters.mjs — do not edit by hand.
// Real-world elevation patches baked from public-domain DEMs (AWS Open Data
// terrain tiles). Each entry pairs with public/theaters/<id>.bin:
// size×size Uint16 LE row-major (north up), heights quantized min→max.
export interface TheaterMeta {
  id: string
  name: string
  sub: string
  lat: number
  lon: number
  size: number        // pixels per side
  metersPerPx: number // ground distance per pixel (== one map cell)
  minElev: number     // meters at quantized 0
  maxElev: number     // meters at quantized 65535
}

export const THEATER_INDEX: readonly TheaterMeta[] = [
${index.map((t) => `  { id: '${t.id}', name: '${t.name}', sub: ${JSON.stringify(t.sub)}, lat: ${t.lat}, lon: ${t.lon}, size: ${t.size}, metersPerPx: ${t.metersPerPx}, minElev: ${t.minElev}, maxElev: ${t.maxElev} },`).join('\n')}
]
`
await writeFile(OUT_TS, ts)
console.log(`wrote ${path.relative(ROOT, OUT_TS)}`)
