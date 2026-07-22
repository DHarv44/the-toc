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
export const DIFFICULTIES = {
  recruit: {
    key: 'recruit', label: 'RECRUIT',
    sub: 'Deep supply · a company on the ground · long, forgiving firefights',
    supplies: 6000,
    supplyLift: 45,          // 900/min
    startForce: ['SCT', 'INF', 'INF', 'MECH', 'ARM', 'LOG'],
    damageMul: 0.55,
  },
  regular: {
    key: 'regular', label: 'REGULAR',
    sub: 'A platoon-plus and room to build · fights you can read',
    supplies: 3500,
    supplyLift: 30,          // 600/min
    startForce: ['SCT', 'INF', 'INF', 'MECH'],
    damageMul: 0.75,
  },
  veteran: {
    key: 'veteran', label: 'VETERAN',
    sub: 'A scout section and an infantry platoon · contact hurts',
    supplies: 2000,
    supplyLift: 22,          // 440/min
    startForce: ['SCT', 'INF'],
    damageMul: 1,
  },
  elite: {
    key: 'elite', label: 'ELITE',
    sub: 'One platoon, thin supply · every loss is felt',
    supplies: 1200,
    supplyLift: 16,          // 320/min
    startForce: ['INF'],
    damageMul: 1.35,
  },
}

export const DIFFICULTY_ORDER = ['recruit', 'regular', 'veteran', 'elite']
export const DEFAULT_DIFFICULTY = 'regular'
