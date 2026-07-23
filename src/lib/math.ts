// Small pure math helpers shared across layers. Ported verbatim from
// src/ui/styles.js (clamp), src/game/audio.js (hashStr), src/drone/DroneView.jsx
// (hash01) — consumers migrate onto these in waves 3-5.

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

// djb2 over a string, 32-bit signed
export function hashStr(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return h
}

// deterministic [0,1) from an integer pair (1/1000 resolution)
export const hash01 = (a: number, b: number): number => {
  let h = (a * 374761393 + b * 668265263) | 0
  h = (h ^ (h >> 13)) * 1274126177
  return (((h ^ (h >> 16)) >>> 0) % 1000) / 1000
}
