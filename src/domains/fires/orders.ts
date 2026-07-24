// Indirect fire missions. Ported verbatim from src/game/sim.js.
import { S } from '../../engine/state'
import type { ShellKind } from '../../engine/GameState'
import { UNIT_TYPES } from '../forces/catalog'
import { toast, radio } from '../comms/radio'
import { grid } from '../../lib/format'

// Method of fire: opts = {shell: 'HE'|'ICM'|'SMOKE', rounds: n, sheaf: 'POINT'|'STD'|'AREA'}
export type Sheaf = 'POINT' | 'STD' | 'AREA'
export interface FireMissionOpts {
  shell?: ShellKind
  rounds?: number
  sheaf?: Sheaf
}

const ROUND_COST: Record<ShellKind, number> = { HE: 15, ICM: 25, SMOKE: 12 }

export function fireMission(unitId: number, x: number, y: number, opts: FireMissionOpts = {}): void | null {
  const u = S.units.find(u => u.id === unitId)
  if (!u || !UNIT_TYPES[u.type].indirect) return
  const ind = UNIT_TYPES[u.type].indirect!
  // side-agnostic gunnery, side-aware bookkeeping: the OPFOR pays from its own
  // purse and never surfaces player-facing toasts (same rules, its money)
  const friendly = u.side === 'friend'
  if (u.missionCooldown > 0) return friendly ? toast('BATTERY RELOADING') : undefined
  if (Math.hypot(x - u.x, y - u.y) > ind.range) return friendly ? toast('TARGET BEYOND MAX RANGE') : undefined
  const shell = opts.shell || 'HE'
  const rounds = opts.rounds || ind.salvo
  const sheafMul = opts.sheaf === 'AREA' ? 2.2 : opts.sheaf === 'POINT' ? 0.55 : 1
  const cost = rounds * (ROUND_COST[shell] || 15)
  if ((friendly ? S.resources : S.enemyResources) < cost) {
    return friendly ? toast('INSUFFICIENT SUPPLY FOR MISSION') : undefined
  }
  if (friendly) { S.resources -= cost; S.stats.supplySpent += cost }
  else S.enemyResources -= cost
  u.missionCooldown = ind.cooldown * Math.max(0.6, rounds / ind.salvo)
  // a battery ordered to fire mid-march holds its route and resumes it after the
  // reload (see drillsUpdate) instead of silently forgetting the move order
  if (u.path.length) u.heldRoute = { path: u.path, legs: u.legs }
  u.path = []; u.legs = []; u.state = 'firing'
  const rng = S.rng!
  for (let i = 0; i < rounds; i++) {
    const a = rng() * Math.PI * 2
    const r = rng() * ind.scatter * sheafMul
    S.shells.push({
      fromX: u.x, fromY: u.y,
      x: x + Math.cos(a) * r, y: y + Math.sin(a) * r,
      impactT: S.t + ind.flight + i * 2.2,
      dmg: ind.dmg, blast: ind.blast, side: u.side, shell,
    })
  }
  const last = S.shells[S.shells.length - 1]!
  if (u.side === 'friend') {
    last.splashFrom = u.label
    // danger close advisory
    const danger = ind.scatter * sheafMul + ind.blast + 80
    if (S.units.some(f => f.side === 'friend' && f.id !== u.id && Math.hypot(f.x - x, f.y - y) < danger)) {
      radio(u.label, 'damage', `DANGER CLOSE — FRIENDLIES NEAR TGT GRID ${grid(x, y)}`, x, y)
    }
    radio(u.label, 'fires', `SHOT, ${rounds} RDS ${shell} — TGT GRID ${grid(x, y)}, SPLASH ${Math.round(ind.flight)}S`, x, y)
  }
}
