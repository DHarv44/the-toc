// Seeded PRNG (mulberry32) so maps — and, once the sim consumes it exclusively,
// entire runs — are reproducible per seed.
//
// The generator's whole memory is one 32-bit word, exposed through `state()` so
// Save/Continue can capture a run mid-stream and resume it EXACTLY — the next
// draw after a restore is the draw the save would have made. Restoring is just
// makeRng(anything, savedState): mulberry32 advances the word before every
// output, so the word alone is the position in the stream.
export interface Rng {
  (): number
  /** the internal word — meaningful only to makeRng's second argument */
  state(): number
}

export function makeRng(seed: number, state?: number): Rng {
  let a = (state ?? seed) >>> 0
  const rng = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  } as Rng
  rng.state = () => a >>> 0
  return rng
}
