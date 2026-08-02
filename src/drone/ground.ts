// The ground the feed STANDS ON — real metres from the pack heightfield
// (GROUNDWORK.md P7), sampled the same way the engine mesh's vertices were
// placed (core sampleBox), so nothing floats or sinks against the surface you
// can see. The sim keeps its own renormalized `elev` for pricing and fog;
// this is a picture concern, and everything the feed positions vertically —
// vehicles, camera, tracers, smoke — reads here and nowhere else.
import { sampleBox } from '@dharv44/groundwork-core'
import type { HeightField } from '@dharv44/groundwork-core'
import { S } from '../engine/state'
import { frameOf, type Frame } from '../world/pack/frame'
import type { WorldMap } from '../world/WorldMap'

let cache: { map: WorldMap; hf: HeightField; f: Frame } | null = null

export function groundCtx(): { hf: HeightField; f: Frame } {
  if (!cache || cache.map !== S.map) {
    const g = S.map!.ground!
    cache = { map: S.map!, hf: g.hf, f: frameOf(g.files.manifest) }
  }
  return cache
}

/** Elevation in real metres at sim world coords (clamped beyond the box). */
export function groundAt(x: number, y: number): number {
  const { hf, f } = groundCtx()
  return sampleBox(hf, f.x0 + (x / f.WORLD) * f.spanX, f.y0 + (y / f.WORLD) * f.spanY)
}
