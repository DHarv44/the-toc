// Dev trigger for the base-under-fire experience (#14): drops a hostile
// 6-round HE fire mission on the commander's CP without needing an OPFOR
// battery in range — exercises the radar alarm, the INCOMING banner, the
// point-defense intercepts (if a system is emplaced) and the impact effects.
// Dev sandbox only (wired to the DEV cluster's IDF button).
import { S } from '../engine/state'
import { toast } from '../domains/comms/radio'

export function devIncomingStrike(): void {
  const hq = S.structures.find(s => s.side === 'friend' && s.kind === 'HQ')
  if (!hq || !S.rng) return
  for (let i = 0; i < 6; i++) {
    const a = S.rng() * Math.PI * 2
    const r = S.rng() * 140
    S.shells.push({
      fromX: hq.x + 3200, fromY: hq.y - 900,
      x: hq.x + Math.cos(a) * r, y: hq.y + Math.sin(a) * r,
      impactT: S.t + 12 + i * 2.2,
      dmg: 22, blast: 130, side: 'hostile', shell: 'HE',
    })
  }
  toast('DEV — INCOMING IDF ON THE CP')
}
