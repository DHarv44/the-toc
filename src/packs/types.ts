// Faction "Packs" — a formation as CONTENT: which unit types it fields
// organically, what's attached from elsewhere, and how its units are designated.
// Packs reference the shared base catalogs (weapons/vehicles/ammo are physics
// and live once); a pack is organization + identity on top. The same schema
// serves the player's division, fictional campaign OPFOR, and (later) real
// armies selectable in skirmish.
//
// Stage 2 (2026-07-25): a pack is SELF-CONTAINED content — it ships its own
// platform catalogs (units/vehicles/weapons/ammo/troops/comps/drones) composed
// from the shared library in packs/lib/ (or entirely its own tables), plus its
// name pools. The engine defines the interfaces and behaviors; packs/install.ts
// pours the active packs' data into the engine registries at init. One pack can
// change the entire game.
import type { UnitType, UnitTypeKey } from '../domains/forces/catalog'
import type {
  AmmoType, WeaponType, ExpendableType, TroopKind, VehicleType, UnitComposition,
} from '../domains/forces/composition'
import type { DroneType } from '../domains/air/catalog'
import type { FacilityType } from '../domains/installations/catalog'
import type { StructureTypeKey } from '../domains/installations/catalog'
// type-only, cycle-safe: scenario/types imports this module's mission
// vocabulary; both directions erase at runtime
import type { ScenarioSpec } from '../scenario/types'

// how a unit type's parent element is designated inside its battalion:
//  - 'plt'  — numbered platoon in a lettered company ("1st PLT, A CO, 2-8 CAV")
//  - 'btry' — lettered battery ("A BTRY, 1-82 FA")
//  - 'hhc'  — a named specialty platoon in HHC ("SCT PLT, HHC, 2-8 CAV")
export type LineageStyle = 'plt' | 'btry' | 'hhc'

export interface OrganicSlot {
  bn: string              // parent battalion designation, e.g. '2-8 CAV'
  style?: LineageStyle    // default 'plt'
  hhcName?: string        // the specialty platoon's name for style 'hhc'
}

export interface AttachedSlot extends OrganicSlot {
  from: string            // donor formation, e.g. '2ID' — shown as the ATT tag
}

// --- full-division formation ------------------------------------------------
// The pack ships the ENTIRE division as data: brigades → battalions, each
// battalion expanded to companies/platoon slots by its kind's template
// (packs/org.ts). `tfCos` lists the companies allocated to the player's task
// force (fieldable, garrisoned in theater); the player battalion contributes
// everything. Skirmish later opens the whole tree; campaign stays on playerBn.
export type BnKind =
  | 'CAB' | 'ARMOR' | 'RECON' | 'FA' | 'BEB' | 'BSB' | 'SIG'   // ground
  | 'ARB' | 'AHB' | 'GSAB' | 'ASB'                              // air cav
  | 'CSSB' | 'HHBN' | 'HHB-DIVARTY' | 'STB'                     // support/staff

export interface BnPlan {
  desig: string           // '2-8 CAV'
  kind: BnKind
  tfCos?: string[]        // companies allocated to the TF ('A CO'…); playerBn = all
}

export interface BdePlan {
  desig: string           // '1ABCT'
  nick?: string           // 'IRONHORSE'
  bns: BnPlan[]
}

export interface Formation {
  // The battalion currently being commanded. The CAMPAIGN pins this ('2-8 CAV'
  // for IRON TRIANGLE); skirmish will set it from the player's pick.
  playerBn: string
  // Which battalions a player may take command of. `'all'` opens the whole
  // division; a list names the ones that are playable. This is a PACK design
  // statement, not a campaign one — a pack decides whether you can run its
  // BSB, and a campaign separately decides which battalion its story is about.
  // Absent = only playerBn, which is how packs behaved before the field
  // existed.
  playable?: 'all' | string[]
  bdes: BdePlan[]
  // Standing QRF at H-hour: the elements the battalion has ALREADY put on
  // reaction duty at the command post, as `CO:PLT` inside the player battalion
  // ('C CO:1st PLT'). A real TOC never opens a war with nobody on QRF, and it
  // never has the whole battalion on it either — this is one or two platoons.
  // The commander re-assigns from the COMMAND rail.
  qrf?: string[]
}

// Everything the pack's formations are made of. Tables usually reference the
// shared library (packs/lib/*) — identical object references across packs are
// fine (the installer merges by identity); CONFLICTING redefinitions of a key
// throw at install. A total-conversion pack ships tables of its own.
export interface PackCatalogs {
  units: Record<string, UnitType>
  ammo: Record<string, AmmoType>
  weapons: Record<string, WeaponType>
  expendables?: Record<string, ExpendableType>
  troops: Record<string, TroopKind>
  vehicles: Record<string, VehicleType>
  comps: Record<string, UnitComposition>
  drones?: Record<string, DroneType>
  facilities?: Record<string, FacilityType>
}

// Name pools the engine draws from when generating this pack's personnel —
// RESOLVED form (the pack folder's names.json ships first_names.male/female +
// last_names; the loader maps it here). Names are stored AS WRITTEN by the
// author; the app applies its own casing where its style demands. Generation
// picks male-heavy (the loader/engine, not the data, owns that weighting).
// A pack that ships none falls back to the neutral default (personnel.ts).
export interface NamePools {
  male: readonly string[]
  female: readonly string[]
  last: readonly string[]
}

// EXPLICIT mode: pin real people onto generated billets. Key format is
// '<org slot path>/<billet pos>' (e.g. '2-8 CAV/HHC/STAFF/S1 — Personnel');
// anything not pinned falls through to generation. This is how a pack ships a
// real roster without giving up procedural fill for the rest.
export type PeoplePins = Record<string, { name?: string; rank?: string }>

// --- requestable division assets (ASSET-REQUESTS.md) ------------------------
// The pack ships its habitual enablers: everything the battalion can REQUEST
// up the chain. `from` keeps the lineage honest (the org shows them as ATT
// from their real parent formations). Pooled assets have a `count`; USAF
// items are `sortie: true` (ATO windows, never pooled hulls — their crews are
// radio traffic, not org slots).
export type AssetEchelon = 'DIV' | 'CORPS' | 'USAF'

export interface AssetCrewRecipe {
  billets: readonly (readonly [rank: string, pos: string])[]
  civ?: number            // civilian contractor count (FSRs — noncombatants,
                          // Defense of Freedom Medal when wounded)
}

// what an approved request physically delivers
export interface AssetDelivery {
  facility?: string       // installs this facility at the requesting base ('CRAM')
  tether?: string         // raises this drone at the requesting base ('AEROSTAT')
  orbit?: string          // +1 concurrent orbit authority for this drone key ('SHADOW')
  window?: string         // opens an ATO sortie window for this drone key ('SPECTRE')
  unlock?: string         // capability unlock ('CAS' — the ALO team on your net)
  airdrop?: boolean       // roadmap: airdrop resupply (C-130)
}

export interface PackAsset {
  name: string            // 'C-RAM Section'
  from: string            // owning formation ('2-44 ADA', '317 AW')
  echelon: AssetEchelon
  count?: number          // pooled instances division can allocate
  sortie?: boolean        // ATO-cycle sortie windows instead of a pool
  callsigns?: readonly string[]  // sortie assets: radio identities ('REACH')
  setupTime?: number      // seconds to EMPLACE after the convoy arrives
  windowLen?: number      // sortie window duration once open (s)
  atoLead?: number        // max lead time to the next ATO slot (s)
  refitTime?: number      // CL VII clock when an instance is destroyed (s)
  delivers: AssetDelivery
  crew?: AssetCrewRecipe  // attach-and-live-here assets: real ATT org slots
}

// --- models (pack ART) ------------------------------------------------------
// NOT to be confused with `Pack.assets`, which is CAPABILITY the TOC requests
// up the chain (C-RAM, SHADOW). These are the 3D models a pack ships in its
// models/ folder.
//
// One reference shape covers both ways a pack can be authored:
//   { file }         — the file IS the model (one GLB per vehicle)
//   { file, node }   — a named node inside a file holding several vehicles
// so a pack author can start with a downloaded multi-vehicle GLB and split it
// later without the manifest changing shape.
export interface ModelRef {
  file: string            // pack-relative ('models/vehicles/pack.glb')
  node?: string           // named node inside that file; absent = whole file
  // Degrees about the vertical, applied after the loader has aligned the
  // model's long axis. Only nose-vs-tail needs saying: which end of a hull is
  // the front is the one thing geometry cannot be read for. 180 turns a
  // backwards vehicle around.
  yaw?: number
}

export interface PackModels {
  vehicles?: Record<string, ModelRef>   // keyed by VEHICLE catalog key
}

// Staff sections ("the shops"): the pack DESCRIBES its staff — the UI builds
// the shop tabs/consoles from this data (a different army's staff has
// different names, reports and flavor). Keys are IDs (s1..s6), immutable.
export interface StaffSection {
  label: string           // tab label: 'S1'
  name: string            // 'Personnel'
  full: string            // detailed name: 'S1 — Personnel'
  report: string          // the report this desk produces: 'PERSTAT'
  desc: string            // short description (tooltips)
  detail: string          // fleshed-out description (console sub-header/help)
}

// --- campaigns (campaign-down content: see src/PACK-MISSIONS.md) ------------
// A pack ships CAMPAIGNS; a campaign owns its MAP and its MISSIONS. Missions
// compose engine verbs (objective kinds, trigger conditions, effects, place
// refs) in JSON — the engine never knows a place name or a story beat.

// A world point, by reference: a gazetteer name / campaign anchor (string), or
// an object with modifiers. Builtin anchors: 'player-hq', 'enemy-base'.
// `toward` + `range` = directional standoff from `place` toward another place.
export type PlaceRef = string | {
  place: string
  offsetX?: number        // meters
  offsetY?: number        // meters (+south)
  toward?: string         // stand off from `place` toward this place…
  range?: number          // …by this many meters
}

// campaign anchors: named points resolved ONCE at campaign start (stored on
// CampaignState). Stage-1 query vocabulary: town-nearest.
export interface AnchorQuery { query: 'town-nearest'; to: string }

export type MissionObjectiveKind = 'recon-area' | 'clear-area' | 'defeat-group' | 'build' | 'deliver'
export interface MissionObjective {
  id: string
  label: string
  kind: MissionObjectiveKind
  zone?: { place: PlaceRef; r: number }  // clear-area / build locus (resolved at activation)
  groupTag?: string                      // defeat-group: the scripted group's tag
  structKind?: StructureTypeKey          // build: what to stand up
  amount?: number                        // deliver: supply to land at the target
  // which staff shops draft a report when this objective closes. Reporting is
  // CONTENT, not a reflex: a scout finding the enemy is an S2 product and
  // nothing else — nobody is hurt yet, nothing has been shot. A fight closes
  // with the whole staff writing. Absent = no reports for this objective.
  reports?: ('s1' | 's2' | 's3' | 's4')[]
}

// trigger conditions — stage-1 executor fires on objective moments; the wider
// vocabulary (timers, casualties, favor…) lands with side missions (S4)
export type MissionCondition =
  | { kind: 'objective-active'; objective: string }
  | { kind: 'objective-complete'; objective: string }
  | { kind: 'structure-exists'; struct: StructureTypeKey }
  | { kind: 'mainline-at-least'; index: number }
  | { kind: 'all'; of: MissionCondition[] }
  | { kind: 'any'; of: MissionCondition[] }

export interface MissionRadio {
  from: string; cat?: string; text: string
  at?: 'ctx'              // tag the net entry to the point the previous effect produced
}

// effects — executed in declaration order; every implementation is engine code
// (engine/missions/effects.ts). Deterministic: all randomness through S.rng.
export type MissionEffect =
  | { kind: 'set-allow'; field: boolean; support: boolean; drone: boolean }
  | { kind: 'front-line'; place: PlaceRef; offsetY?: number }
  | { kind: 'spawn-garrison'; at: PlaceRef; units: UnitTypeKey[]; spreadX?: number
      strip?: string[]                    // stowage keys zeroed (e.g. M_JAVELIN)
      contact?: { scatter: number; unknown?: boolean } }  // seed a stale COP contact
  | { kind: 'place-force'; at: PlaceRef; units: UnitTypeKey[]; radius: number }
  | { kind: 'set-roe'; type: UnitTypeKey; roe: string }
  | { kind: 'opfor-objective'; place: PlaceRef | null }
  | { kind: 'spawn-group'; tag: string; units: UnitTypeKey[]; at: PlaceRef }
  | { kind: 'deploy-column'; units: UnitTypeKey[]; edge: 'south'; margin: number
      spacing: number; moveTo: { anchor: string; offsets: [number, number][] } }
  | { kind: 'name-structure'; struct: StructureTypeKey; near: PlaceRef; r: number; label: string }
  | { kind: 'release-asset'; asset: string; formation: string; radio?: MissionRadio }
  | { kind: 'radio'; radio: MissionRadio }
  | { kind: 'toast'; text: string }
  // raise a tasking card mid-stream (DIV HQ on the VTC). A mission's own
  // `frago` block still drops implicitly when the mission activates; this is
  // the EXPLICIT form, so one mission can phase its own taskings — and so a
  // side mission (S4) can tender one whenever its trigger says.
  | { kind: 'frago'; title: string; text: string }

export interface MissionTrigger {
  id: string
  when: MissionCondition
  do: MissionEffect[]
}

// --- tutorial curriculum (S3 of PACK-MISSIONS.md) ---------------------------
// The curriculum is MISSION content — every word the player reads, the step
// order, and what each step gates on. The engine ships the vocabulary: the
// condition kinds (some read UI state — tutorial-only; sim triggers never
// see the UI), the anchor kinds (published `data-tut` ids + map anchors),
// and the overlay machinery (ui/tutorial.tsx).
export type TutCondition =
  | { kind: 'fielded'; type?: UnitTypeKey; exclude?: UnitTypeKey[]; min: number }
  | { kind: 'selected-only'; type: UnitTypeKey }     // exactly one unit selected, of type
  | { kind: 'selected-struct'; struct: StructureTypeKey }
  | { kind: 'selected-carrier' }                     // selected unit carries a drone
  | { kind: 'briefed' }                              // the opening VTC has been acknowledged
  | { kind: 'vtc-paged' }                            // player paged the deck by hand
  | { kind: 'rail-open'; rail: 'forces' | 'command' | 'net' | 'feeds' } // side rail expanded
  // the CALL UP picker, rung by rung: open at all, a GARRISON picked, a
  // CAPABILITY open. The curriculum has to teach the drill-down one rung at a
  // time, so it needs to see each rung.
  | { kind: 'callup-open' }
  | { kind: 'callup-base' }
  | { kind: 'callup-cat'; cat: string }
  | { kind: 'callup-co'; cat: string }               // a COMPANY under that capability
  | { kind: 'group-selected'; min: number; exclude?: UnitTypeKey[] }
  | { kind: 'roe-set'; type: UnitTypeKey; roe: string }
  | { kind: 'mode-is'; mode: string }                // ui command mode (prefix match)
  | { kind: 'drone-aloft' }
  | { kind: 'unit-beyond'; type: UnitTypeKey; dist: number }  // ... of the player HQ
  | { kind: 'view-near-hq'; dist: number }           // map centred within dist of the HQ
  | { kind: 'enemy-spotted' }                        // any live contact on the COP
  | { kind: 'attack-ordered'; exclude?: UnitTypeKey[] } // a line unit has an attack order
  | { kind: 'routed-to-marker'; type: UnitTypeKey }  // unit's route ends at the screen marker
  | { kind: 'column-has-orders'; types: UnitTypeKey[] }
  | { kind: 'column-routed'; types: UnitTypeKey[]; place: PlaceRef; r: number } // routed toward OR arrived
  | { kind: 'column-at'; types: UnitTypeKey[]; place: PlaceRef; r: number }     // ARRIVED
  | { kind: 'area-clear'; place: PlaceRef; r: number }
  | { kind: 'force-holding'; place: PlaceRef; r: number; spread?: number; routed?: boolean; exclude?: UnitTypeKey[] }
  // the force closed on a COMPUTED marker — the engine works the point out from
  // the ground (roads, the objective, where the enemy actually is), so a
  // mission never has to author a coordinate that the terrain may not honour
  // `routed` grades the ORDER rather than the arrival — the lesson is the move
  // the commander gives, not the minutes the platoons spend driving it
  | { kind: 'force-at-marker'; marker: 'attack-pos' | 'ap-approach' | 'screen-marker' | 'road-marker'; r: number; routed?: boolean; spread?: number; exclude?: UnitTypeKey[] }
  | { kind: 'dug-in'; place: PlaceRef; r: number; exclude?: UnitTypeKey[] }
  | { kind: 'structure-built'; struct: StructureTypeKey }
  | { kind: 'convoy-running' }
  | { kind: 'not'; of: TutCondition }
  | { kind: 'all'; of: TutCondition[] }

export type TutAnchor =
  | { kind: 'ui'; sel: string }                      // a published data-tut id
  | { kind: 'unit'; type: UnitTypeKey }              // first friendly unit of type (map ring)
  | { kind: 'spotted-enemy' }                        // the live contact nearest the scouts
  | { kind: 'struct'; struct: StructureTypeKey }     // a friendly structure (map ring)
  | { kind: 'point'; place: PlaceRef }
  | { kind: 'box'; place: PlaceRef; r: number }
  // computed: a rectangle bounding the FIELDED FORCE (what the player actually
  // has on the ground), padded. `exclude` drops types that aren't part of the
  // lesson — e.g. the scouts already forward when the line platoons are taught.
  | { kind: 'force-box'; exclude?: UnitTypeKey[]; pad?: number }
  | { kind: 'screen-marker' }                        // computed: standoff point toward the nearest known enemy
  | { kind: 'road-marker' }                          // computed: road waypoint partway to the strongpoint
  | { kind: 'attack-pos' }                           // computed: the attack position BOX short of the objective
  | { kind: 'ap-approach' }                          // computed: release point 60 m short of that box
  // teach a CAMERA move, not an order: an edge arrow marking which way the place
  // lies plus an animated middle-drag glyph. Unlike every other anchor this one
  // does NOT centre the view — the whole lesson is the player doing that.
  | { kind: 'pan-to'; place: string; label?: string }

// ordered hint variants: first one whose `when` matches (or has none) renders;
// `hide` shows no cue this frame (e.g. platoon en route).
// `dwell` holds a hint on screen for N SECONDS and then falls through to the
// next one — for beats that teach by pointing rather than by asking ("this
// whole window is the VTC"), where there is no player action to wait on.
// `next` does the same but on the PLAYER's clock: the card grows a NEXT button
// and holds until it is clicked. Prefer it for anything the player has to READ —
// a timer either rushes a slow reader or bores a fast one.
export interface TutHint {
  when?: TutCondition
  dwell?: number
  next?: boolean
  hide?: boolean
  text?: string
  action?: string
  anchor?: TutAnchor
}
export interface TutStep { id: string; gate?: boolean; done: TutCondition; hints: TutHint[] }
// reactive tips fire on engine VERBS (bespoke trigger logic), pack words:
// 'casualty-warning' = a line platoon has dropped below half strength. Pure
// ADVISORY — it rings the platoon, says it is about to be lost, and the
// commander acknowledges. Nothing is demanded: what to do about it is their
// call, which is the whole reason for telling them.
export interface TutReactive {
  verb: 'casualty-warning'
  warn: { text: string; action?: string }
}
export interface TutorialSpec { steps: TutStep[]; reactive?: TutReactive[] }

// A campaign MISSION is a SCENARIO (SCENARIO-BUILDER.md, settled 2026-08-02):
// one content type for skirmishes, campaign missions and (S4) side templates.
// Missions are script-heavy scenarios — the campaign is continuous, so only
// the campaign's OPENING scenario places entities; follow-on missions arrive
// into a world in motion and speak in trigger effects.

export interface CampaignManifest {
  /** The ground this campaign plays on: 'packId/mapId', or a bare pack map id
   *  meaning the OWNING pack's map — the ONLY ground path (P6, GROUNDWORK.md).
   *  `null` = the campaign's real ground has not been authored yet; it cannot
   *  start and the splash says so. The map's gazetteer (real names) is what
   *  missions reference. */
  map: string | null
  id: string
  name: string            // campaign display name
  operation: string       // the operation the mainline constitutes ('LODGMENT')
  hqLabel: string         // the battalion CP's name
  airfieldLabel: string   // the CP airstrip's name
  divHq: { atFrac: { x: number; y: number } } // DIVISION MAIN position (fraction of world)
  anchors: Record<string, AnchorQuery>
  preAllocations: Array<{ asset: string; formation: string }>
  mainline: string[]      // mission ids, in order
  sideMissions?: Array<{ mission: string; weight: number; cooldownS: number; when: MissionCondition }>
}

// a fully-loaded campaign: manifest + its scenario files
export interface CampaignSpec {
  manifest: CampaignManifest
  /** the CAMPAIGN SCENARIO — H-hour placements for the whole arc. Absent =
   *  mission 1's triggers place the world (today's LODGMENT shape). */
  opening?: ScenarioSpec
  /** the missions, keyed by id — scenarios with script sections */
  missions: Record<string, ScenarioSpec>
}

export interface Pack {
  id: string
  name: string            // '1st Cavalry Division'
  abbr: string            // '1CD'
  nick?: string           // formation nickname: 'First Team'
  motto?: string          // formation motto: 'America's First Team' (division-level heraldry)
  side: 'friend' | 'hostile'
  catalogs: PackCatalogs  // the platforms this pack's world is made of
  // The capability groups the CALL UP drills through, in briefing order. Each
  // one answers a question a commander asks under contact ("what kills that
  // tank?", "who clears the buildings?"), so the list is CONTENT: a pack with
  // no armor ships no ARMOR group. Unit types point at these with `cat`; a cat
  // a platform declares but this list forgets still renders, at the end.
  cats?: string[]
  names?: NamePools       // personnel name generation inputs
  people?: PeoplePins     // explicit roster pins (override generation)
  staff?: Record<string, StaffSection> // the shops (falls back to 1CD's)
  assets?: Record<string, PackAsset> // requestable division/corps/USAF assets
  models?: PackModels     // the pack's 3D art (models/ folder) — see PackModels
  // pack-declared audio ASSETS (engine synthesizes everything else from spec
  // params): a different faction's base has a different Big Voice
  audio?: { incomingAlarm?: string }
  patch?: string          // shoulder-sleeve insignia id — rendered by ui/insignia (keeps pack data JSON-able)
  rankStyle?: string      // rank-insignia style id ('us' chevrons/bars; other armies bring their own)
  // every unit type the game offers is either organic to the formation or an
  // attachment from a donor; a type in neither map simply isn't fielded by
  // this pack (not enforced in P1 — the palette still offers everything)
  organic: Partial<Record<UnitTypeKey, OrganicSlot>>
  attached: Partial<Record<UnitTypeKey, AttachedSlot>>
  formation?: Formation   // the whole division (org materializes from this)
  // regimental mottos by battalion designation — real lineage heraldry
  // (rendered on the S1 battalion header's coat of arms)
  mottos?: Record<string, string>
  // battalion nicknames (battalion-specific, unlike regimental mottos)
  nicks?: Record<string, string>
  // the pack's campaigns (identity content — never falls back), first = default
  campaigns?: CampaignSpec[]
}

const ORD = ['1st', '2nd', '3rd', '4th'] as const
const CO = ['A', 'B', 'C', 'D'] as const

// Can a player take command of this battalion? Reads the pack's `playable`
// declaration; with none, only the pack's own playerBn is playable (how packs
// behaved before the field existed).
export function isPlayableBn(f: Formation | undefined, desig: string): boolean {
  if (!f) return false
  if (f.playable === 'all') return true
  if (Array.isArray(f.playable)) return f.playable.includes(desig)
  return desig === f.playerBn
}

// Every battalion a player may command, in formation order — the skirmish
// picker's source (division → brigade → battalion).
export function playableBns(f: Formation | undefined): { bde: string; bn: BnPlan }[] {
  if (!f) return []
  return f.bdes.flatMap(b => b.bns
    .filter(bn => isPlayableBn(f, bn.desig))
    .map(bn => ({ bde: b.desig, bn })))
}

// The nth fielded unit of a type → its formal lineage line. Deterministic and
// rng-free (a plain counter drives n), so fielding order alone decides slots.
export function lineageFor(pack: Pack, type: UnitTypeKey, n: number): { text: string; from: string | null } {
  const slot = pack.organic[type] ?? pack.attached[type]
  if (!slot) return { text: pack.abbr, from: null }
  const from = 'from' in slot ? (slot as AttachedSlot).from : null
  const style = slot.style ?? 'plt'
  let elem: string
  if (style === 'btry') {
    elem = `${CO[n % CO.length]} BTRY`
  } else if (style === 'hhc') {
    const nth = Math.floor(n)
    elem = `${slot.hhcName ?? 'SCT PLT'}${nth > 0 ? ` (${nth + 1})` : ''}, HHC`
  } else {
    elem = `${ORD[n % 3]} PLT, ${CO[Math.floor(n / 3) % CO.length]} CO`
  }
  return { text: `${elem}, ${slot.bn}`, from }
}
