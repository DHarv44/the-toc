// The OPFOR pack — the hostile side's OWN pack, never a rider on the player's.
// P4 upgrades this into the full DPRK-flavored fictional faction (its own
// platforms, org, heraldry); until then it is an honest PLACEHOLDER that
// fields the same generic platforms as blue (today's game reality), composed
// BY REFERENCE from the shared US library — identical objects, so the
// installer's collision check is satisfied and golden doesn't move.
import type { Pack } from './types'
import { US_UNITS } from './lib/units'
import { US_AMMO, US_WEAPONS, US_TROOPS, US_VEHICLES, US_COMPS } from './lib/composition'

// the subset of shared platforms the OPFOR actually fields
const pick = <T,>(table: Record<string, T>, keys: readonly string[]): Record<string, T> =>
  Object.fromEntries(keys.map(k => [k, table[k]!]))

const OPFOR_TYPES = ['INF', 'MECH', 'ARM', 'AT', 'CAV', 'ARTY'] as const

// Placeholder name pools (Korean-romanization flavor) — moved verbatim from
// personnel.ts so existing generated hostile names are unchanged. P4 replaces
// these with the real faction's pools.
const FIRST = ['CHOL', 'MYONG', 'SUNG', 'HYON', 'KWANG', 'YONG', 'IL', 'DUK', 'CHUN', 'HAK']
const LAST = ['RI', 'KIM', 'PAK', 'CHOE', 'KANG', 'HAN', 'YUN', 'JANG', 'O', 'SIN']

export const PACK_OPFOR: Pack = {
  id: 'opfor',
  name: 'OPFOR',
  abbr: 'OPFOR',
  side: 'hostile',
  catalogs: {
    units: pick(US_UNITS, OPFOR_TYPES),
    comps: pick(US_COMPS, OPFOR_TYPES),
    // support tables ride along whole — entries are shared by identity, so
    // this adds nothing beyond what the player pack installs
    ammo: US_AMMO, weapons: US_WEAPONS, troops: US_TROOPS, vehicles: US_VEHICLES,
  },
  names: { first: FIRST, last: LAST },
  organic: {},
  attached: {},
}
