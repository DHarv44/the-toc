// 1st Cavalry Division — the player's formation. An ARMORED division: the
// Bradley/Abrams/Paladin core of the existing catalog is organic; the light
// and Stryker infantry the game offers are attachments from other divisions
// (1CD doesn't organically have them). Battalion designations are real 1CD
// lineage (1ABCT "Ironhorse" slice + division enablers).
//
// Stage 2: the pack is SELF-CONTAINED — it ships its platform catalogs
// (composed from the shared US library) and its name pools. Combat stays
// byte-identical to the pre-pack game: same tables, same keys, same order.
import type { Pack } from './types'
import { US_UNITS } from './lib/units'
import { US_AMMO, US_WEAPONS, US_TROOPS, US_VEHICLES, US_COMPS } from './lib/composition'
import { US_DRONES } from './lib/drones'
import { US_FACILITIES } from './lib/facilities'

// The US name pools (moved verbatim from personnel.ts — same lists, same
// order, so every generated name in existing saves/rosters is unchanged).
const FIRST = [
  'MARCUS', 'TYLER', 'JAMES', 'DEVON', 'CARLOS', 'ETHAN', 'ANDRE', 'LUIS',
  'BRANDON', 'KYLE', 'DARIUS', 'COLE', 'MIGUEL', 'JORDAN', 'TRAVIS', 'ISAAC',
  'CALEB', 'RYAN', 'OMAR', 'JARED', 'VICTOR', 'NOLAN', 'ELI', 'DANTE',
]
const LAST = [
  'DELACRUZ', 'WHITAKER', 'OKONKWO', 'RAMIREZ', 'THAO', 'BURKE', 'CASTILLO',
  'PRUITT', 'JENNINGS', 'KOWALSKI', 'BARNES', 'GUTIERREZ', 'HOLLOWAY', 'NGUYEN',
  'SATTERFIELD', 'ORTIZ', 'MCBRIDE', 'ADEYEMI', 'LANDRY', 'VANCE', 'SHEPPARD',
  'CARDENAS', 'BOONE', 'WINTERS', 'ESPARZA', 'TILLMAN', 'ROJAS', 'GALLAGHER',
  'HUTCHINS', 'MOSLEY', 'FARRELL', 'QUINTERO', 'STANTON', 'BEASLEY', 'AKANA',
]

export const PACK_1CD: Pack = {
  id: '1cd',
  name: '1st Cavalry Division',
  abbr: '1CD',
  side: 'friend',
  patch: '1cd',
  rankStyle: 'us',
  catalogs: {
    units: US_UNITS, ammo: US_AMMO, weapons: US_WEAPONS,
    troops: US_TROOPS, vehicles: US_VEHICLES, comps: US_COMPS,
    drones: US_DRONES, facilities: US_FACILITIES,
  },
  names: { first: FIRST, last: LAST },
  // Requestable division/corps/USAF assets (ASSET-REQUESTS.md): what the TOC
  // can ask higher for. Pooled counts are the DIVISION's holdings — campaign
  // scripting pre-allocates pieces to sister brigades so scarcity is real.
  assets: {
    CRAM: {
      name: 'C-RAM Section', from: '2-44 ADA', echelon: 'CORPS', count: 3,
      setupTime: 120, refitTime: 2400, // a lost intercept battery is a LONG replacement
      delivers: { facility: 'CRAM' },
      crew: {
        billets: [
          ['SFC', 'Section Chief'], ['SSG', 'Engagement NCO'],
          ['SGT', 'Radar Operator'], ['SPC', 'Radar Operator'],
        ],
        civ: 2, // FSR contractors — that's how C-RAM actually runs
      },
    },
    AEROSTAT: {
      name: 'PGSS Aerostat Det', from: 'PM Aerostats', echelon: 'DIV', count: 1,
      setupTime: 90,
      delivers: { tether: 'AEROSTAT' },
      crew: { billets: [['SSG', 'Site Lead']], civ: 4 }, // PGSS is contractor-run
    },
    SHADOW: {
      name: 'Shadow Orbit', from: '1ACB', echelon: 'DIV', count: 2,
      delivers: { orbit: 'SHADOW' },
    },
    SENTINEL: {
      name: 'Sentinel Orbit', from: 'INSCOM', echelon: 'CORPS', count: 1,
      delivers: { orbit: 'SENTINEL' },
    },
    VIPER: {
      name: 'Armed UAS Orbit', from: 'CENTCOM CAOC', echelon: 'CORPS', count: 1,
      delivers: { orbit: 'VIPER' },
    },
    ALO: {
      name: 'ALO Team', from: '3 ASOS', echelon: 'USAF', count: 1,
      setupTime: 30,
      delivers: { unlock: 'CAS' },
      crew: { billets: [['CPT', 'Air Liaison Officer'], ['SSG', 'TACP JTAC']] },
    },
    SPECTRE: {
      name: 'AC-130 CAS Window', from: '4 SOS', echelon: 'USAF', sortie: true,
      callsigns: ['SPOOKY', 'GHOST'],
      windowLen: 900, atoLead: 180, // one long on-station block per grant
      delivers: { window: 'SPECTRE' },
    },
    AIRLIFT: {
      name: 'C-130 Airdrop', from: '317 AW', echelon: 'USAF', sortie: true,
      callsigns: ['REACH', 'HERKY'],
      delivers: { airdrop: true }, // roadmap mechanic — requests evaluate honestly
    },
  },
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
  // Battalion nicknames (battalion-specific — 2-8 are the Stallions even
  // though 1-8 and 3-8 share the regiment's arms and motto)
  nicks: {
    '2-8 CAV': 'STALLIONS',
    '1-82 FA': 'DRAGONS',
    '91 BEB': 'SABERS',
    '115 BSB': 'MULESKINNERS',
    '1-227 ARB': 'FIRST ATTACK',
    '1-506 IN': 'RED CURRAHEE',
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
