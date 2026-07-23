// Difficulty presets, chosen after map size on a new game.
//
// Four levers, all set at init:
//   supplies   — opening supply pool, i.e. how much you can field before income matters
//   supplyLift — supply per resupply tick (every SUPPLY_INTERVAL seconds). This is the
//                lever that compounds; starting supply washes out within ~10 minutes,
//                so difficulty has to live here to mean anything late.
//   startForce — the units already on the ground next to the HQ
//   damageMul  — global scale on damage dealt to units, BOTH sides. Lower means units
//                soak more and firefights run longer, which is the "more health" knob:
//                it buys reaction time rather than making the player invincible.
//
// damageMul scales damage rather than max strength deliberately — strength is treated as
// a 0-100 percentage everywhere (surrender thresholds, reconstitution caps, the HUD bars),
// so raising the ceiling would break all of it.
// Ported verbatim from src/game/difficulty.js (values unchanged).
import type { UnitTypeKey } from '../forces/catalog'

export interface Difficulty {
  key: string
  label: string
  sub: string
  supplies: number
  supplyLift: number
  enemySupplyLift: number
  enemyStart: number
  startForce: readonly UnitTypeKey[]
  damageMul: number
}

export const DIFFICULTIES = {
  recruit: {
    key: 'recruit', label: 'RECRUIT',
    sub: 'Deep supply · a company on the ground · long, forgiving firefights',
    supplies: 6000,
    supplyLift: 45,          // 900/min
    enemySupplyLift: 12,     // 240/min — sustains roughly 2 battlegroups
    enemyStart: 400,         // can't afford a group yet; a few minutes of grace
    startForce: ['SCT', 'INF', 'INF', 'MECH', 'ARM', 'LOG'],
    damageMul: 0.55,
  },
  regular: {
    key: 'regular', label: 'REGULAR',
    sub: 'A platoon-plus and room to build · fights you can read',
    supplies: 3500,
    supplyLift: 30,          // 600/min
    enemySupplyLift: 22,     // 440/min — roughly 4 battlegroups
    enemyStart: 900,
    startForce: ['SCT', 'INF', 'INF', 'MECH'],
    damageMul: 0.75,
  },
  veteran: {
    key: 'veteran', label: 'VETERAN',
    sub: 'A scout section and an infantry platoon · contact hurts',
    supplies: 2000,
    supplyLift: 22,          // 440/min
    enemySupplyLift: 32,     // 640/min — out-earns you
    enemyStart: 1400,
    startForce: ['SCT', 'INF'],
    damageMul: 1,
  },
  elite: {
    key: 'elite', label: 'ELITE',
    sub: 'One platoon, thin supply · every loss is felt',
    supplies: 1200,
    supplyLift: 16,          // 320/min
    enemySupplyLift: 45,     // 900/min — nearly 3x your rate
    enemyStart: 2000,        // a battlegroup on the board almost immediately
    startForce: ['INF'],
    damageMul: 1.35,
  },
} as const satisfies Record<string, Difficulty>

export type DifficultyKey = keyof typeof DIFFICULTIES

// Force caps by map size. Upkeep already limits army *value*, but cheap units let you
// blob around it — a count cap limits density, which is what actually makes a small map
// unplayable. Roughly tracks map area without scaling linearly with it.
export const MAP_FORCE_CAP: Record<number, number> = { 96: 14, 160: 20, 256: 28 }

// per-difficulty multipliers on that cap: yours, and the OPFOR's manoeuvre force
export const CAP_MUL: Record<DifficultyKey, { player: number; enemy: number }> = {
  recruit: { player: 1.3, enemy: 0.6 },
  regular: { player: 1, enemy: 1 },
  veteran: { player: 0.9, enemy: 1.25 },
  elite: { player: 0.75, enemy: 1.6 },
}

// Seconds a unit type is unavailable after one is fielded, derived from its price, so
// armour and guns come out in a trickle while riflemen keep pace. Stops a banked pile of
// supply becoming ten platoons in ten seconds.
export const fieldCooldownFor = (cost: number): number => Math.round(cost / 10)

export const DIFFICULTY_ORDER: readonly DifficultyKey[] = ['recruit', 'regular', 'veteran', 'elite']
export const DEFAULT_DIFFICULTY: DifficultyKey = 'regular'
