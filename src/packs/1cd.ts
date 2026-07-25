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
    MED: { bn: '2-8 CAV', style: 'hhc', hhcName: 'MED PLT' }, // battalion aid station

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
  // Regimental mottos — the real lineage heraldry (verified against the unit
  // DUI/COA records; 17th Cav and 615th use their traditional words).
  mottos: {
    '2-8 CAV': 'HONOR AND COURAGE', '1-8 CAV': 'HONOR AND COURAGE', '3-8 CAV': 'HONOR AND COURAGE',
    '1-5 CAV': 'LOYALTY AND COURAGE', '2-5 CAV': 'LOYALTY AND COURAGE',
    '1-7 CAV': 'GARRYOWEN', '2-7 CAV': 'GARRYOWEN',
    '4-9 CAV': 'WE CAN, WE WILL', '6-9 CAV': 'WE CAN, WE WILL',
    '1-12 CAV': 'SEMPER PARATUS',
    '1-82 FA': 'CAN AND WILL', '2-82 FA': 'CAN AND WILL',
    '3-16 FA': 'MACTE NOVA VIRTUTE',
    '91 BEB': 'ACTS NOT WORDS', '8 BEB': 'ESSAYONS', '3 BEB': 'ESSAYONS',
    '115 BSB': 'MULE SKINNERS',
    '13 SIG BN': 'VOICE OF COMMAND',
    '1-227 ARB': 'POUVOIR', '2-227 AHB': 'POUVOIR', '3-227 GSAB': 'POUVOIR',
    '7-17 CAV': 'FORWARD',
    '615 ASB': 'COLD STEEL',
    '5-20 IN': 'TANT QUE JE PUIS',
    '1-506 IN': 'CURRAHEE',
  },
  // The whole division, brigades down (packs/org.ts expands each battalion to
  // companies/platoons/people). The campaign TF is the 1ABCT slice the player
  // commands: ALL of 2-8 CAV plus one company/battery from each enabler.
  formation: {
    playerBn: '2-8 CAV',
    bdes: [
      {
        desig: '1ABCT', nick: 'IRONHORSE',
        bns: [
          { desig: '2-8 CAV', kind: 'CAB' },                  // playerBn → fully allocated
          { desig: '1-12 CAV', kind: 'ARMOR', tfCos: ['A CO'] },
          { desig: '1-7 CAV', kind: 'RECON', tfCos: ['A TRP'] },
          { desig: '1-82 FA', kind: 'FA', tfCos: ['A BTRY'] },
          { desig: '91 BEB', kind: 'BEB', tfCos: ['A CO'] },
          { desig: '115 BSB', kind: 'BSB', tfCos: ['A CO'] },
        ],
      },
      {
        desig: '2ABCT', nick: 'BLACK JACK',
        bns: [
          { desig: '1-5 CAV', kind: 'CAB' },
          { desig: '1-8 CAV', kind: 'ARMOR' },
          { desig: '4-9 CAV', kind: 'RECON' },
          { desig: '3-16 FA', kind: 'FA' },
          { desig: '8 BEB', kind: 'BEB' },
          { desig: '15 BSB', kind: 'BSB' },
        ],
      },
      {
        desig: '3ABCT', nick: 'GREYWOLF',
        bns: [
          { desig: '2-7 CAV', kind: 'CAB' },
          { desig: '3-8 CAV', kind: 'ARMOR' },
          { desig: '6-9 CAV', kind: 'RECON' },
          { desig: '2-82 FA', kind: 'FA' },
          { desig: '3 BEB', kind: 'BEB' },
          { desig: '215 BSB', kind: 'BSB' },
        ],
      },
      {
        desig: '1ACB', nick: 'AIR CAV',
        bns: [
          { desig: '1-227 ARB', kind: 'ARB' },                // AH-64E attack
          { desig: '7-17 CAV', kind: 'ARB' },                 // heavy attack recon
          { desig: '2-227 AHB', kind: 'AHB' },                // UH-60M assault
          { desig: '3-227 GSAB', kind: 'GSAB' },              // CH-47F / MEDEVAC
          { desig: '615 ASB', kind: 'ASB' },
        ],
      },
      {
        desig: 'DIVARTY', nick: 'RED TEAM',
        bns: [{ desig: 'HHB DIVARTY', kind: 'HHB-DIVARTY' }],
      },
      {
        desig: '1CD SUST', nick: 'WAGONMASTER',
        bns: [
          { desig: 'STB', kind: 'STB' },
          { desig: '553 CSSB', kind: 'CSSB' },
          { desig: '13 SIG BN', kind: 'SIG', tfCos: ['A CO'] }, // division signal (TF slice)
        ],
      },
      {
        desig: 'HHBN', nick: 'MAVERICK',
        bns: [{ desig: 'HHBN 1CD', kind: 'HHBN' }],
      },
    ],
  },
}
