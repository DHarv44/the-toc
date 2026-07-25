// 1st Cavalry Division — the player's formation. An ARMORED division: the
// Bradley/Abrams/Paladin core of the existing catalog is organic; the light
// and Stryker infantry the game offers are attachments from other divisions
// (1CD doesn't organically have them). Battalion designations are real 1CD
// lineage (1ABCT "Ironhorse" slice + division enablers).
//
// P1: organization + lineage only. The unit STATS are the existing shared
// catalog — combat is byte-identical to the pre-pack game.
import type { Pack } from './types'

export const PACK_1CD: Pack = {
  id: '1cd',
  name: '1st Cavalry Division',
  abbr: '1CD',
  side: 'friend',
  patch: '1cd',
  rankStyle: 'us',
  organic: {
    MECH: { bn: '2-8 CAV' },                                  // combined arms bn (Bradley)
    ARM: { bn: '1-12 CAV' },                                  // combined arms bn (Abrams)
    CAV: { bn: '1-7 CAV' },                                   // armored recon squadron
    SCT: { bn: '2-8 CAV', style: 'hhc', hhcName: 'SCT PLT' }, // battalion scouts
    MOR: { bn: '2-8 CAV', style: 'hhc', hhcName: 'MORT PLT' },// battalion mortars
    ARTY: { bn: '1-82 FA', style: 'btry' },                   // Paladin battalion
    ENG: { bn: '91 BEB' },                                    // brigade engineer bn
    SIG: { bn: '13 SIG BN' },
    LOG: { bn: '115 BSB' },                                   // brigade support bn
  },
  attached: {
    STRY: { bn: '5-20 IN', from: '2ID' },                     // Stryker bn — SBCT attachment
    INF: { bn: '1-506 IN', from: '101 ABN' },                 // light rifle attachment
    AT: { bn: '1-506 IN', from: '101 ABN', style: 'hhc', hhcName: 'AT SEC' },
  },
}
