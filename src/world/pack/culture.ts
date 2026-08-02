// CULTURE — the pack's named places, becoming the sim's towns and features.
//
// Real names are the point: radio calls, briefs and objectives anchor to
// SEIZE LOUISVILLE, not TOWN 3. The pack usually carries far more named
// places than a battalion scenario wants mechanics for (610 in the first test
// box), so towns are capped to the most significant — settlement kind first,
// population inside a kind — and peaks to the highest. Everything else still
// exists in the pack for the exact renderer (P4) to label; the caps only
// bound what the SIM treats as a town (enemy garrisons, objectives).
import type { PackPlace, PackVectors } from '@dharv44/groundwork-core'
import type { MapFeature, Town } from '../WorldMap'
import { normToWorld, type Frame } from './frame'

const TOWN_CAP = 8
const PEAK_CAP = 10
const SETTLEMENT_RANK: Record<string, number> = { city: 3, town: 2, village: 1, hamlet: 0 }

const inFrame = (f: Frame, p: { x: number; y: number }) =>
  p.x >= 0 && p.y >= 0 && p.x <= f.WORLD && p.y <= f.WORLD

export function townsOf(vectors: PackVectors, f: Frame): Town[] {
  const cands = vectors.places
    .filter((p): p is PackPlace & { kind: keyof typeof SETTLEMENT_RANK } => p.kind in SETTLEMENT_RANK)
    .map(p => ({ p, at: normToWorld(f, p.x, p.y) }))
    .filter(c => inFrame(f, c.at))
    .sort((a, b) =>
      (SETTLEMENT_RANK[b.p.kind]! - SETTLEMENT_RANK[a.p.kind]!)
      || ((b.p.population ?? 0) - (a.p.population ?? 0)))
  const towns: Town[] = []
  for (const c of cands) {
    if (towns.length >= TOWN_CAP) break
    // keep the list spread out — two names on one crossroads is one town
    if (towns.some(t => Math.hypot(t.x - c.at.x, t.y - c.at.y) < f.WORLD * 0.04)) continue
    towns.push({
      gx: Math.floor(c.at.x / f.CELL), gy: Math.floor(c.at.y / f.CELL),
      x: c.at.x, y: c.at.y, name: c.p.name.toUpperCase(),
    })
  }
  return towns
}

export function featuresOf(vectors: PackVectors, f: Frame): MapFeature[] {
  const out: MapFeature[] = []
  const peaks = vectors.places
    .filter(p => p.kind === 'peak')
    .map(p => ({ p, at: normToWorld(f, p.x, p.y) }))
    .filter(c => inFrame(f, c.at))
    .sort((a, b) => (b.p.elevation ?? 0) - (a.p.elevation ?? 0))
    .slice(0, PEAK_CAP)
  for (const c of peaks) {
    // the real name, with the real elevation where the source had one —
    // "LONGS PEAK (4346)" reads like a map sheet, which is the register
    const el = c.p.elevation ? ` (${Math.round(c.p.elevation)})` : ''
    out.push({ kind: 'hill', name: `${c.p.name.toUpperCase()}${el}`, x: c.at.x, y: c.at.y })
  }
  // named waters — lakes, rivers — anchor as river features
  for (const p of vectors.places) {
    if (p.kind !== 'water') continue
    const at = normToWorld(f, p.x, p.y)
    if (inFrame(f, at)) out.push({ kind: 'river', name: p.name.toUpperCase(), x: at.x, y: at.y })
  }
  return out
}
