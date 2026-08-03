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
  AmmoType, WeaponType, ExpendableType, TroopKind, TroopKindKey, VehicleType,
  VehicleKey, UnitComposition,
} from '../domains/forces/composition'
import type { DroneType } from '../domains/air/catalog'
import type { FacilityType } from '../domains/installations/catalog'
import type { StructureTypeKey } from '../domains/installations/catalog'

// how a unit type's parent element is designated inside its battalion:
//  - 'plt'  — numbered platoon in a lettered company ("1st PLT, A CO, 2-8 CAV")
//  - 'btry' — lettered battery ("A BTRY, 1-82 FA")
//  - 'hhc'  — a named specialty platoon in HHC ("SCT PLT, HHC, 2-8 CAV")
export type LineageStyle = 'plt' | 'btry' | 'hhc'

export interface OrganicSlot {
  bn: string              // parent battalion designation, e.g. '2-8 CAV'
  style?: LineageStyle    // default 'plt'
  hhcName?: string        // the specialty platoon's name for style 'hhc'
  // WHICH companies of that battalion this type actually comes from. A
  // combined arms battalion has tank companies AND mech companies under one
  // designation, so the type alone does not say which letters are yours:
  // ARM draws A/B, MECH draws C/D. Absent = the battalion's companies in
  // order, which is right for a battalion of one kind.
  cos?: string[]
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
// WHAT KIND OF BATTALION — a key into the pack's OWN `bnKinds` table, never an
// engine enum. What a combined arms battalion is made of is a fact about an
// army, not about this game: the engine knows how to BUILD a battalion from a
// template (verb), the pack says what the templates ARE (noun). A pack that
// fields motor rifle battalions declares those and nothing here changes.
export type BnKind = string

/** ONE PERSON on a rostered element: their troop kind, billet and rank, and
 *  the sub-element they stand in. `n` repeats the entry — nine snipers are one
 *  line, not nine. */
export interface StaffBillet {
  kind: TroopKindKey
  pos: string             // 'S3 — Operations', 'Crew Chief'
  rank: string            // 'MAJ'
  // the SUB-ELEMENT inside the slot ('S3 SEC', 'FS ELEMENT'). Absent = the
  // person hangs directly off the element. See Soldier.sec.
  sec?: string
  n?: number              // repeat count, default 1
}

/** ONE SLOT inside a company. Exactly one of `type` / `roster` / `flight`:
 *   type   — a FIELDABLE game unit; its people come from the composition
 *   roster — a hand-rostered element, naming an entry in Pack.rosters
 *   flight — airframes and their crews (a crew roster, repeated per airframe) */
export interface BnSlotPlan {
  name: string            // 'CMD GRP', '1st PLT', 'FLT 1'
  type?: UnitTypeKey
  roster?: string         // key into Pack.rosters
  flight?: {
    air: VehicleKey
    n: number             // airframes
    crew: string          // Pack.rosters entry for ONE airframe's crew
    attach?: string       // extra roster added once (flight medics)
  }
}

export interface BnCoPlan {
  co: string              // 'HHC', 'A CO', 'A TRP', 'FSC'
  /** shorthand for n numbered platoons of one type — '1st PLT'…'4th PLT' */
  plts?: { type: UnitTypeKey; n?: number }
  slots?: BnSlotPlan[]
}

// --- billets ----------------------------------------------------------------
// WHAT A JOB IS CALLED and who holds it. Titles and ranks are an army's own
// vocabulary — 'Platoon Sergeant, SFC' means nothing outside one — so the pack
// says them and the engine keeps only the STRUCTURE: that leaders are listed
// last in casualty order, that seat 0 of an armed vehicle commands it.

/** One job. A rank LIST is a hash-weighted spread (the same billet is not the
 *  same rank in every platoon); a single rank is fixed. */
export interface BilletPlan {
  pos: string
  rank: string | string[]
}

/** How a troop kind's people are billeted. Most kinds are one job repeated.
 *  `fromEnd` names the billets at the END of the group — the roster lists
 *  leaders last (casualty order: the last one standing is the platoon
 *  leader), so that is where a platoon's command sits. `fromStart` is the
 *  same from the other end (a mortar section's gunner leads it). */
export interface TroopBillets extends BilletPlan {
  fromEnd?: BilletPlan[]
  fromStart?: BilletPlan[]
}

/** Crew jobs BY SEAT, keyed by crew size ('*' = any size not named). The last
 *  entry repeats for any further seats. Armed and unarmed vehicles crew
 *  differently: a truck has a driver and an assistant driver, a turret has a
 *  commander, a gunner and (on a four-hand crew) a loader. */
export interface CrewBillets {
  armed: Record<string, BilletPlan[]>
  unarmed: Record<string, BilletPlan[]>
}

// --- staff reports ----------------------------------------------------------
// THE PRODUCT EACH DESK WRITES. A staff report is a form: a heading with the
// time on it, numbered paragraphs in a fixed order, and a sign-off. Which
// paragraphs, in what order, and every word of them is the army's own — the
// engine only counts the things they are about and fills the blanks.
//
// Templates fill by field name ({asg}, {kia}); a field with nothing to say
// resolves empty. `phrases` holds the ALTERNATIVE wordings a paragraph needs —
// what to write when there are no open cases as against when there are. The
// composer CHOOSES between them (a rule); the words are never its own.
export interface ReportTemplate {
  head: string
  paras: string[]
  sign: string
  phrases?: Record<string, string>
}

// --- the net ----------------------------------------------------------------
// HOW THIS ARMY TALKS ON THE RADIO. Net procedure is culture: who you address,
// what you call the station above you, how you sign off, and the shape of the
// sentence itself. The engine knows the FIELDS a transmission carries — who is
// speaking, who they are speaking to, the report, a range read-back, a closing
// proword — and nothing about the words.
//
// Templates fill by name: {control} {higher} {callsign} {msg} {range} {closing}
// and, in `range`, {n} for the distance. A field with nothing to say resolves
// empty, so a template may reference one that is not always present.
export interface NetVoice {
  /** what an element calls the station above it — one per element, held stable
   *  so a given callsign always addresses the same higher */
  higher: string[]
  /** sign-off prowords, drawn per transmission */
  closings: string[]
  /** the station that broadcasts to everyone */
  control: string
  /** a broadcast to all stations */
  broadcast: string
  /** one element's transmission to its higher */
  call: string
  /** the range read-back, appended to the report when far enough to matter */
  range: string
  /** how far away something has to be before the range is worth saying, in
   *  metres — under this a report just says what it saw */
  rangeFloor?: number
  /** THE DESK that answers for each asset echelon — who a battalion is
   *  actually talking to when it asks higher for something. Keyed by
   *  PackAsset.echelon; an echelon with no desk speaks under its own name. */
  desks?: Record<string, string>
}

// --- awards -----------------------------------------------------------------
// WHAT THIS ARMY DECORATES ITS PEOPLE WITH. The engine knows only that certain
// things EARN a decoration; which decoration answers each is the pack's, and
// so is every name and ribbon. `on` names the criterion an award answers:
//
//   wound      — hurt or killed in action
//   wound-civ  — the same, for a CIVILIAN (a real distinction: a contractor
//                wounded in the line of duty is not eligible for a soldier's
//                wound decoration and receives their own)
//
// An award with no `on` is not granted automatically — it exists so the key is
// stable in saved rosters before the rule that awards it is built.
export type AwardCriterion = 'wound' | 'wound-civ'

export interface AwardDef {
  key: string
  name: string
  abbr: string
  ribbon: string[]        // ribbon stripe colours, left → right
  on?: AwardCriterion
}

// --- ranks ------------------------------------------------------------------
// THE RANK LADDER, junior first. The ORDER is the seniority — an ordered list
// rather than hand-written weights, so a rank cannot be added without being
// placed, and nothing silently sorts below a private because a table forgot
// it. Every roster reads this: who answers for an element, who leads a fire
// team, who the shop's chief is.

/** Which device a rank wears, named from the engine's procedural vocabulary.
 *  The RENDERERS are engine (chevrons are chevrons); which rank wears what,
 *  and what it is called, is the army's own. Absent = no device (a private). */
export interface RankInsignia {
  /** [chevrons above, rockers below] */
  chevrons?: [number, number]
  diamond?: boolean             // lozenge inside the chevrons (first sergeant)
  spec?: boolean                // the specialist device
  warrant?: number              // warrant bar bearing n squares
  bars?: number                 // n officer bars
  leaf?: 'gold' | 'silver'      // field officer's leaf
  metal?: 'gold' | 'silver'     // colour for bars / the pip
  /** a device at centre, at this scale — the senior-NCO pip */
  pip?: number
  /** n general officer stars */
  stars?: number
  starScale?: number
}

export interface RankDef {
  key: string                   // 'SFC' — what a roster carries
  name: string                  // 'Sergeant First Class'
  insignia?: RankInsignia
}

/** HOW THIS ARMY DESIGNATES A FIELDED ELEMENT on the net. A `pool` is cycled
 *  and numbered — ALPHA-1, BRAVO-2 — which is how a force that names things
 *  talks; `prefix` + a zero-padded count is how a force that only counts them
 *  does (E01, E02). Every net call, map label and callsign derives from this,
 *  so a pack that wants its opposition to sound different changes it here. */
export interface CallsignStyle {
  pool?: string[]
  prefix?: string
  pad?: number
}

export interface BilletTables {
  /** any troop kind the table does not name */
  default: BilletPlan
  dismount: Record<string, TroopBillets>
  crew: CrewBillets
}

export interface BnKindPlan {
  /** heraldic branch for the S1 header's procedural shield ('inf', 'sus'…) */
  branch?: string
  companies: BnCoPlan[]
}

export interface BnPlan {
  desig: string           // '2-8 CAV'
  kind: BnKind
  nick?: string           // 'GARRYOWEN' — the battalion's own name, not the brigade's
  tfCos?: string[]        // companies allocated to the TF ('A CO'…); playerBn = all
  // this formation's insignia as an ART FILE (svg or png under public/) — the
  // DUI a battalion is known by. Drawn on the map symbol in place of the 2525
  // echelon letters, and by the S1 header; no art = the echelon marker.
  patch?: string
  // the REGIMENTAL coat of arms this battalion carries — a different piece of
  // heraldry from the DUI (the full achievement: crest, shield, motto scroll).
  // Battalions of the same regiment name the same file. No art = the S1
  // header's procedural branch shield.
  arms?: string
}

/** ONE RUNG of an army's ladder: what it is called, and the size marker a map
 *  symbol wears for it. The mark cannot be derived from depth — a regiment is
 *  III and a brigade is X and both sit one below a division — so the army that
 *  has the rung is the only thing that can say. */
export interface EchelonDef {
  name: string            // 'BRIGADE', 'REGIMENT', 'BROOD'
  mark?: string           // the 2525 size marker: 'XX', 'X', 'III', 'II', 'I'
}

/** ONE FORMATION, at any rung. A formation either COMMANDS other formations
 *  (`under`) or IS an element made of companies (`kind`), and it may do both —
 *  a brigade with its own headquarters commands battalions and has staff.
 *
 *  Recursive on purpose. Two fixed levels (brigade → battalion) could not say
 *  what the Mobile Infantry is — DIVISION / REGIMENT / COMPANY / PLATOON, no
 *  brigade and no battalion — nor a flat swarm, nor a militia of cells. Depth
 *  is whatever the pack nests, and `Formation.echelons` names the rungs. */
export interface FormationNode {
  desig: string           // '1ABCT', '3RD REGT', 'BROOD 4'
  nick?: string           // 'IRONHORSE'
  patch?: string          // insignia art file (see BnPlan.patch)
  arms?: string           // regimental coat of arms (see BnPlan.arms)
  /** the template this formation expands into — set on the ELEMENT rung (a
   *  battalion, an MI company), and on any formation that has a headquarters
   *  of its own. A formation with children AND a kind is both. */
  kind?: BnKind
  /** companies allocated to the task force ('A CO'…); the chair contributes
   *  everything it has */
  tfCos?: string[]
  /** WHERE this formation sits when it is not yours to see — what the S1
   *  writes in the location column ('DIV MAIN'). Absent = '<desig> AO'. */
  station?: string
  /** the formations it commands */
  under?: FormationNode[]
}

export interface Formation {
  // The formation this pack is commanded from by default, at whatever rung
  // `chairRung` says. The CAMPAIGN pins its own ('2-8 CAV' for IRON TRIANGLE);
  // skirmish sets it from the player's pick.
  chair: string
  // Which battalions a player may take command of. `'all'` opens the whole
  // division; a list names the ones that are playable. This is a PACK design
  // statement, not a campaign one — a pack decides whether you can run its
  // BSB, and a campaign separately decides which battalion its story is about.
  // Absent = only playerBn, which is how packs behaved before the field
  // existed.
  playable?: 'all' | string[]
  patch?: string          // the top formation's insignia art file
  // WHAT THIS ARMY CALLS EACH RUNG, top down and NOT counting the top
  // formation itself. The depth is however deep `under` nests; this only names
  // the rungs. 1CD: [BRIGADE, BATTALION, COMPANY]. The Mobile Infantry has no
  // brigade and no battalion — Rasczak's Roughnecks is "Second Platoon, George
  // Company, Third Regiment, First Division" — so it reads [REGIMENT, COMPANY,
  // PLATOON] and everything shifts down an echelon: the chair is a COMPANY and
  // the fieldable element is a PLATOON. A swarm is [BROOD]. A militia is
  // [CELL]. A rung past the end of this list is unnamed rather than wrong.
  echelons?: EchelonDef[]
  /** the TOP formation's own rung — 1CD is a DIVISION marked XX */
  top?: EchelonDef
  // WHICH RUNG a player takes command of, as an index into `echelons`. 1CD and
  // the MI both sit at 1 (battalion / company) — the second rung down is where
  // a commander with a staff usually lives — so that is the default.
  chairRung?: number
  /** the formations the top formation commands */
  under: FormationNode[]
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
  // the NCO who answers for the desk when the officer is down ('S1 NCOIC').
  // `full` is the officer's billet; this is the next person on it. Absent = a
  // desk that goes quiet when its officer does.
  alt?: string
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
  // the TASKS column on this objective's briefing slide, IN THE AUTHOR'S OWN
  // WORDS. Absent — the normal case — and the deck generates the lines from
  // the objective's own parameters, which cannot go stale. Set it only when
  // the phase needs saying differently, and remember that authored words do
  // NOT follow the objective when it is edited.
  notes?: string[]
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

// (The campaign-as-separate-content-type died 2026-08-02 — SCENARIO-MODEL.md.
// A campaign is a SCENARIO the author typed 'campaign'; its situation and
// missions are sections of scenario/types.ScenarioSpec. This module keeps the
// mission VOCABULARY above — objectives, conditions, effects, place refs,
// tutorial — which the scenario schema composes.)

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
  // every unit type the game offers is either organic to the formation or an
  // attachment from a donor; a type in neither map simply isn't fielded by
  // this pack (not enforced in P1 — the palette still offers everything)
  organic: Partial<Record<UnitTypeKey, OrganicSlot>>
  attached: Partial<Record<UnitTypeKey, AttachedSlot>>
  // WHAT THIS ARMY'S ELEMENTS ARE MADE OF — the rostered elements every
  // template draws on (command groups, staffs, maintenance platoons, aircrews)
  // and the battalion templates themselves, keyed by this pack's own kind
  // names. The engine builds from these; it does not know what is in them.
  // (`staff` above is a different thing — the S-shop identities.)
  rosters?: Record<string, StaffBillet[]>
  bnKinds?: Record<string, BnKindPlan>
  billets?: BilletTables  // what each job is called, and who holds it
  callsigns?: CallsignStyle // how this army designates a fielded element
  ranks?: RankDef[]       // the rank ladder, junior first (order IS seniority)
  awards?: Record<string, AwardDef> // decorations, and what earns them
  net?: NetVoice          // how this army talks on the radio
  reports?: Record<string, ReportTemplate> // the form each staff desk writes on
  formation?: Formation   // the whole division (org materializes from this)
  // regimental mottos by battalion designation — real lineage heraldry
  // (rendered on the S1 battalion header's coat of arms)
  mottos?: Record<string, string>
  // battalion nicknames (battalion-specific, unlike regimental mottos)
  nicks?: Record<string, string>
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
  return desig === f.chair
}

/** THE FORMATION TREE, FLATTENED — every formation in declaration order, each
 *  with the lineage that reaches it. `path` excludes the top formation (which
 *  is the pack itself) and ends with the formation's own designation, so
 *  path[rung] is always this formation and path.length-1 is its rung. */
export interface FormationWalk {
  node: FormationNode
  path: string[]
  rung: number
  parent?: string
}
export function walkFormation(f: Formation | undefined): FormationWalk[] {
  const out: FormationWalk[] = []
  const visit = (nodes: FormationNode[], path: string[], parent?: string): void => {
    for (const node of nodes) {
      const here = [...path, node.desig]
      out.push({ node, path: here, rung: here.length - 1, parent })
      if (node.under) visit(node.under, here, node.desig)
    }
  }
  visit(f?.under ?? [], [])
  return out
}

/** Which rung a player takes command at — the chair's echelon. */
export const chairRung = (f: Formation | undefined): number => f?.chairRung ?? 1

// Every formation a player may command, in declaration order — the skirmish
// picker's source. Only formations at the CHAIR RUNG are candidates: you
// command a battalion (or an MI company), not a brigade and not a platoon.
export function playableBns(f: Formation | undefined): { bde: string; bn: FormationNode }[] {
  if (!f) return []
  return walkFormation(f)
    .filter(w => w.rung === chairRung(f) && isPlayableBn(f, w.node.desig))
    .map(w => ({ bde: w.parent ?? '', bn: w.node }))
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
    const cos = slot.cos ?? CO
    elem = `${ORD[n % 3]} PLT, ${cos[Math.floor(n / 3) % cos.length]} CO`
  }
  return { text: `${elem}, ${slot.bn}`, from }
}
