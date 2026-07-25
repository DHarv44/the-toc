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
  // a WALKING BARRAGE: the enemy observer corrects onto the CP — round one
  // lands ~700 m out, each next round walks ~120 m closer, the last is
  // practically in the wire. Booms grow louder, shake grows harder.
  const dir = S.rng() * Math.PI * 2
  for (let i = 0; i < 6; i++) {
    const range = 700 - i * 120
    const jx = (S.rng() - 0.5) * 90
    const jy = (S.rng() - 0.5) * 90
    S.shells.push({
      fromX: hq.x + Math.cos(dir) * 3200, fromY: hq.y + Math.sin(dir) * 3200,
      x: hq.x + Math.cos(dir) * range + jx, y: hq.y + Math.sin(dir) * range + jy,
      impactT: S.t + 12 + i * 2.4,
      dmg: 22, blast: 130, side: 'hostile', shell: 'HE',
    })
  }
  toast('DEV — WALKING BARRAGE INBOUND ON THE CP')
}
