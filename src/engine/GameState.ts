// The single mutable game state and every entity shape it holds. React reads it
// via polling; the sim loop mutates it. Entities are plain data typed by
// interfaces — behavior lives in domain modules (no entity classes), so the
// whole tree survives HMR stashing and a future JSON save round-trip (except
// `map`, which carries closures: persist { seed, GRID } and regenerate).
//
// Field inventory derived from src/game/sim.js actual usage — required fields
// are set at construction (newUnit/addStructure/deployDrone), optional ones are
// added later by the tick/orders and must stay optional to match.
//
// Imports below are type-only: they carry no runtime dependency, so the
// engine ← world ← domains layering holds at runtime even though the state
// shape naturally references catalog keys and the world map.
import type { Rng } from './rng'
import type { ModeId } from './modes'
import type { WorldMap, Vec2 } from '../world/WorldMap'
import type { UnitTypeKey } from '../domains/forces/catalog'
import type { AmmoKey, TroopKindKey, VehicleKey } from '../domains/forces/composition'
import type { DroneTypeKey } from '../domains/air/catalog'
import type { StructureTypeKey } from '../domains/installations/catalog'
import type { DifficultyKey } from '../domains/economy/difficulty'
import type { SlotRole } from '../packs/types'

export type Side = 'friend' | 'hostile'

// --- forces ---------------------------------------------------------------

export type UnitState = 'hold' | 'moving' | 'engaging' | 'firing' | 'bridging'
export type Roe = 'push' | 'halt' | 'break'          // actions-on-contact drill
// How tight the column runs. Interval is a real tactical trade — dispersion
// against artillery and air, versus control and road space (domains/movement/
// march). Metres per setting live there; this is only the choice.
export type MarchColumnType = 'close' | 'open' | 'infiltration'

/** Something buried on a route that goes off under ONE vehicle. Unlike every
 *  other source of damage in the game it does not reach a whole unit, which is
 *  what makes an order of march cost something. `side` is who LAID it. */
export interface Hazard {
  id: number
  kind: 'mine' | 'ied'
  x: number
  y: number
  r: number                  // trigger radius, metres
  side: Side
  armed: boolean
  t?: number                 // sim time it went off, for the crater
}

/** A move group's ORDER OF MARCH. Absent = no order was given and the column
 *  falls back to sorting itself by progress, which is what it always did. */
export interface MarchPlan {
  gid: number
  order: number[]            // unit ids, FRONT FIRST
  column: MarchColumnType
  // WHAT THE ORDER SAID. Kept beside the sequence rather than only written
  // onto the units, because the whole point is that they DIVERGE: a platoon
  // that gets badly hit reverts to `break` on its own judgement, and a
  // commander needs to see the difference between the order they gave and the
  // report they are getting. Absent = the order did not specify and whatever
  // each element already had stands.
  roe?: Roe
  weapons?: WeaponsControl
  name?: string              // the serial's callsign
}

/** THE TASK ORGANIZATION — a named, durable grouping of elements under one
 *  commander. See domains/forces/teams.ts for what that means and why a move
 *  group was not already it.
 *
 *  `id` IS the move-group id (drawn from the same counter), so a team that
 *  marches keeps ONE gid for its whole life and the order of march written
 *  against it survives every subsequent order. That is the entire reason this
 *  type exists. */
export interface Team {
  id: number
  name: string               // 'TEAM ECHO' — what the net calls it
  baseId: number             // the element it was named for and built around
  /** The element DESIGNATED to command, if the commander chose one. Absent =
   *  whoever is senior, which is also what happens when the designated
   *  element's leadership is killed. */
  cdrId?: number | null
  members: number[]          // unit ids, in the order they joined
  formedT: number
  /** Last reported commander (soldier id) — succession is DETECTED, not
   *  scheduled: the next senior is already in charge, the TOC just has to
   *  notice and put it on the net. */
  cdrSoldier?: number
}
export type WeaponsControl = 'free' | 'tight' | 'hold'
export type Posture = 'mobile' | 'dig'
export type AiRole = 'garrison' | 'bg'
export type BgRole = 'recon' | 'main'

// one waypoint leg of a player-issued route: destination + how many path points it owns
export interface Leg extends Vec2 { n: number }

// Individual vic/troop in a unit's formation.
//
// ox/oy/oh are the STATION: where the formation wants this one, in the unit's
// body frame (+ox forward, +oy left, oh radians off the unit's heading). They
// are what the whole unit lays out from and never change while it drives.
//
// The rest is where it ACTUALLY is. Once the unit is under way its vics stop
// being a rigid lattice welded to the unit's heading and start driving: each
// holds an odometer along the unit's retained route and a signed offset from
// its centreline, and station-keeps toward its slot (domains/movement). They
// are absent until the unit first moves — a unit sitting in a garrison has no
// route to hold an odometer against, so it lays out rigidly and elemWorld
// falls back to the body-frame transform.
export interface UnitElement {
  ox: number
  oy: number
  oh?: number              // body-frame facing, radians off the unit's heading —
                           // only the security formations (coil, herringbone)
                           // point their vics anywhere but straight ahead
  kind: 'veh' | 'troop'
  alive: boolean
  // HARDENED, or soft-skinned. UnitType.soft says what FRACTION of the unit is
  // soft — enough to price a whole platoon against enemy DPS, and useless the
  // moment something happens to one vehicle rather than to all of them. A mine
  // under the lead vic does not care about the platoon's average. Dismounts
  // are never hardened.
  hard?: boolean
  dist?: number            // odometer along the unit's track, metres. MONOTONIC.
  lat?: number             // offset from the route centreline, metres, + = LEFT
  spd?: number             // m/s along the route
  wx?: number              // resolved world pose; set only while track-controlled
  wy?: number
  wh?: number              // hull heading, radians — its own track, not the unit's
}

// How a unit arranges itself on the ground. The first seven are march
// formations — the trade is always control and speed against how much of the
// unit can shoot, and in which direction. The last two are halt formations: a
// stopped element does not just stop, it goes into a posture that covers the
// ground around it. See FORMATIONS in domains/forces/elements.ts.
export type Formation =
  | 'column' | 'stagger' | 'wedge' | 'vee' | 'echL' | 'echR' | 'line'
  | 'coil' | 'herringbone'

// --- force composition roster (FORCE-MODEL.md, Phase 2) --------------------
// The unit's actual people and vehicles, built from the composition catalog at
// spawn. Phase 2 scaffolding: strength/elements remain authoritative and the
// roster MIRRORS them deterministically (rosterSync); Phase 3 inverts this
// (casualties happen to individuals, strength/firepower derive) and adds ammo.
// Phase 4 adds names/bios/WIA/MIA + the S1 view. Ids are unit-local.

// MIA is rare: overrun platoon wipes and surrenders only (can spark a rescue mission)
export type SoldierStatus = 'FIT' | 'WIA' | 'KIA' | 'MIA'
export type VehicleStatus = 'OK' | 'DAMAGED' | 'DESTROYED' // DAMAGED = repairable at a motorpool
export type WoundSev = 'LIGHT' | 'SERIOUS' | 'CRITICAL'

// An actual injury report (P2.5): severity decides the soldier's path — LIGHT
// wounds return to duty after aid-station care, SERIOUS/CRITICAL are evacuated
// out of the fight (replacements fill the billet, P3).
export interface Wound {
  sev: WoundSev
  kind: string               // 'GSW', 'SHRAPNEL', 'BLAST CONCUSSION'…
  t: number                  // sim time wounded
  care: number               // seconds of medical care received (LIGHT → RTD at threshold)
}

export interface Soldier {
  id: number
  kind: TroopKindKey
  status: SoldierStatus
  vehId: number | null       // crewed vehicle (unit-local id), null = dismount
  // personnel (Packs P2): assigned at creation, deterministic, digest-invisible
  name?: string              // "MARCUS DELACRUZ" — player-renamable from the troop card
  rank?: string              // "SGT" (pack rank table)
  pos?: string               // billet: "Team Leader", "Gunner", "Platoon Medic"…
  // THE CHAIN OF COMMAND this soldier stands in, two rungs below their element:
  // `sec` is the sub-element ('1ST SQD', 'S3 SEC', 'MOUNTED SEC'), `team` the
  // one below it ('ALPHA TM', '2ND CREW'). Assigned with the billet
  // (packs/personnel.ts) so the two always agree. Absent = the person hangs
  // directly off the element, because there is genuinely nothing in between.
  //
  // NOTE this is INDEPENDENT of `vehId`. What a soldier rides in is a vehicle
  // assignment, not a place in the org — the two must never be derived from
  // each other.
  sec?: string
  team?: string
  // THE LOAD PLAN. Which vehicle this soldier RIDES IN — unit-local vehicle id,
  // null/absent = on foot. Deliberately NOT `vehId`: that is the crew billet, a
  // permanent assignment to a platform, and every roster partition in the game
  // reads `vehId === null` to mean "dismount". A rider is manifested onto a
  // vehicle for a move and can be shifted to another truck without changing
  // anything about who they are. See domains/forces/loadplan.ts.
  seat?: number | null
  cs?: string                // personal callsign, leadership billets only ("ECHO-5-6")
  pid?: string               // stable personnel identity (portrait seed) — survives fielding
  wound?: Wound              // current (or last) injury report
  evac?: boolean             // evacuated out of the mission — billet empty until P3 replaces
  awards?: string[]          // award keys (packs/awards) — Purple Heart lands automatically
  // P3 pipeline
  xp?: number                // combat experience (seconds in contact) — drives battlefield promotions
  repl?: boolean             // arrived through the replacement pipeline (not an original)
  replaced?: boolean         // this casualty's billet has been backfilled (don't double-fill)
}

// --- division organization (Packs P3 groundwork) ----------------------------
// The player's ENTIRE division, materialized at init: every platoon-equivalent
// slot down to named privates (and pilots — the air cav ships too). Fielding a
// unit DRAWS a garrisoned TF slot: the unit takes the slot's lineage and its
// roster BY REFERENCE (slot.soldiers IS unit.soldiers), so casualties are the
// same records either way and the slot keeps the roster when a dead unit is
// spliced from S.units (unitId then dangles → rendered as a combat loss).
export interface OrgSlot {
  id: string                 // stable slot path, seeds personnel generation
  // THE LINEAGE, top down, ending with the element that owns this slot:
  // ['1ABCT','2-8 CAV','A CO']. However deep the pack's formation nests — a
  // militia is ['NETWORK','CELL 3'], a swarm is ['BROOD 4']. This is the ONLY
  // structural truth about where a slot sits. Nothing reads it positionally
  // except by the pack's own declared rungs.
  path: string[]
  // THE FORMATION THAT COMMANDS IT — the designation at the pack's chair rung
  // ('2-8 CAV'). Stamped by the builder, which knows both the path and the
  // rung, so it is a recorded fact rather than a positional guess. This is
  // what THE CHAIR is compared against, at whatever echelon a pack commands.
  cmd: string
  name: string               // slot name inside the company ('1st PLT', 'CMD GRP')
  // WHAT IT IS TO ITS FORMATION where that is not a line element: the command
  // group the commander stands in, or a section of the headquarters. The pack
  // declares it (BnSlotPlan.role) because the name never could — 1CD's
  // battalions say CMD GRP and its division says COMMAND GROUP.
  role?: SlotRole
  lin: string                // full display lineage ('1st PLT, A CO, 2-8 CAV')
  type?: UnitTypeKey         // fieldable game unit type (staff/aviation slots have none)
  from?: string              // donor formation for attachments ('2ID')
  tf: boolean                // allocated to the player's task force (in theater, drawable)
  unitId: number | null      // live fielded unit, if drawn
  // WHERE this element is garrisoned (structure id) — set when a unit returns
  // to garrison at a base; unset/dead-base = the CP. Fielding stages from here.
  garrisonAt?: number | null
  // DEDICATED QRF duty at its garrison base: launches itself on base attack;
  // manual deployment releases the duty (UI warns). Multiple QRFs allowed.
  qrf?: boolean
  soldiers: Soldier[]
  vehicles: UnitVehicle[]
}

export interface DivOrg {
  slots: OrgSlot[]
}

// --- DUSTWUN (P2.5 follow-up) ----------------------------------------------
// A friendly platoon that goes down is NOT resolved on the spot — the TOC only
// knows the signal dropped. The site holds the unresolved roster at the last
// known position (dim symbol, like a stale contact). Securing the area rolls
// the truth: fast = most recovered (golden hour), enemy-held = captured (MIA),
// never = MIA-heavy at the end. Securing IS the rescue mission.
// What a recovery ORDER needs to know about the site it is tasking — a flat
// snapshot, so the order stays readable in the log after the site itself has
// resolved (the paper does not stop being the paper).
export interface RecoveryRef {
  x: number
  y: number
  label: string
  lineage?: string
  respFrom?: string   // set = a higher-echelon element; assisting is OPTIONAL
}

export interface DownedSite {
  id: number
  unitId: number             // the fallen unit (its org slot keys off this)
  side: Side
  type: UnitTypeKey
  label: string              // 'GOLF-7'
  lineage?: string
  x: number
  y: number
  t: number                  // sim time the signal dropped
  soldiers: Soldier[]        // unresolved roster (shared refs with the org slot)
  vehicles: UnitVehicle[]
  capturedT?: number         // first time the enemy held the site (skews MIA)
  secureT: number            // accumulated friendly-secure dwell toward resolution
  resolved?: boolean
  // a HIGHER-echelon unit went down in the AO (division asset convoy):
  // their problem, not the battalion's — helping is OPTIONAL (different FRAGO
  // framing), but securing it earns FAVOR and a chance the iron is recovered
  respFrom?: string
}

export interface UnitVehicle {
  id: number
  type: VehicleKey
  status: VehicleStatus
}

// --- division asset requests (ASSET-REQUESTS.md) ----------------------------
// The TOC requests capability up the chain; division allocates from a REAL
// pool (built from Pack.assets at init). All plain serializable data; every
// outcome is a hashStr roll, never the rng stream.
// An approved asset is NOT instant capability: a REAL convoy spawns at
// division in the rear and drives the road net to the requesting base
// (watchable, escortable, ambushable — the convoy dying loses the asset to
// the CL VII timer), then the section EMPLACES on site (setup). A C-RAM
// approved during an IDF attack does nothing for that attack. Effects
// (facility/tether/orbit) apply only when setup completes ('allocated').
// Orbit/window authority (paperwork, not iron) skips the convoy.
export type AssetState = 'available' | 'allocated' | 'enroute' | 'setup' | 'refit'

export interface AssetInstance {
  id: string                 // 'CRAM-1'
  kind: string               // Pack.assets key
  state: AssetState
  holder?: string            // who has it: 'TF' (the player) or a sister formation
  structId?: number          // player allocations: the base it's attached to
  convoyId?: number          // enroute: the live delivery convoy unit on the map
  setupT?: number            // setup: emplacement-complete sim time
  // refit = HULL replacement clock (CL VII) only; the instance stands up
  // again when the hull is ready AND its crew slot is fit (crewReady) — the
  // people regenerate through the replacement pipeline, not a timer
  refitT?: number
  hullReady?: boolean        // hull clock done, waiting on the crew (radio once)
  siteId?: number            // DUSTWUN site of the lost convoy (salvage roll)
}

// USAF sortie window (ATO cycle): launches of `kind` are authorized inside it
export interface SortieWindow {
  kind: string
  opensT: number
  closesT: number
}

export interface AssetsState {
  pool: AssetInstance[]
  // staff decisions in flight: request → (processing delay) → outcome traffic
  pending: Array<{ kind: string; structId?: number; decideT: number }>
  queue: Array<{ kind: string; structId?: number }>   // FIFO waiting list
  windows: SortieWindow[]
  unlocks: string[]          // capability unlocks in effect ('CAS')
  favor: number              // standing with division — earned by helping with
                             // division problems in your AO; speeds staff decisions
}

export interface ConvoyTask {
  fobId: number
  phase: 'toSource' | 'load' | 'toFob' | 'unload'
  carrying: number
  timer: number
}

export interface Unit {
  id: number
  side: Side
  type: UnitTypeKey
  label: string           // radio callsign designator (e.g. "ECHO-5")
  lineage?: string        // formal parent-formation line (e.g. "1st PLT, A CO, 2-8 CAV")
  attFrom?: string        // donor formation if this type is an attachment (e.g. "2ID")
  // TASK ORGANIZATION: the formation that COMMANDS this element (OrgSlot.cmd,
  // which is where it comes from), and whether it is task-organized to the
  // player for this operation. COMMAND DERIVES FROM THESE
  // (domains/forces/command.ts) — the chair's own formation plus anything
  // attached is theirs to order; every other friendly formation is a
  // neighbour on the same side, not a unit they command.
  //
  // Denormalised onto the unit deliberately: this is read for every unit every
  // frame, and unlike a lineage it answers exactly one question.
  // (`formation` below is the TACTICAL formation — column/wedge — unrelated.)
  cmd?: string
  attached?: boolean
  x: number
  y: number
  heading: number
  strength: number
  path: Vec2[]
  legs: Leg[]
  state: UnitState
  mounted: boolean
  roe: Roe
  heldRoute: { path: Vec2[]; legs: Leg[] } | null
  autoDismounted: boolean
  lastCombatT: number
  breaking: boolean
  convoy: ConvoyTask | null
  attackId: number | null
  attackMove: boolean
  attackRepathT: number
  groupId: number | null
  colIdx: number | null      // slot in a shared-route column, if marching in one
  leadId: number | null
  posture: Posture
  digT: number
  dugRadioed: boolean
  weapons: WeaponsControl
  fireCooldown: number
  missionCooldown: number
  ammo?: number              // indirect-fire rounds remaining (basic load; both sides)
  targetId: number | null
  bridging: { cells: number[]; t: number } | null
  lastContactT: number
  lastReqT: number
  lastSpotT: number
  lastFiredT: number | null
  strMark: number
  aiRole: AiRole | null
  aiRepathT: number
  formSeed: number
  _spd: number               // last computed real speed (map read-back)
  odo: number                // metres driven. MONOTONIC — every station-keeping
                             // controller measures against it, and a value that
                             // ever goes backwards makes lag explode.
  formation?: Formation      // absent = wedge (see formOf); optional so saves
                             // written before formations still load
  formHold?: boolean         // the unit's own vics have opened a gap it is
                             // waiting on (stop hysteresis — see follow.ts)
  formCap?: number           // 0..1 pace scale its formation is asking for,
                             // applied on the next tick
  elements: UnitElement[]
  soldiers: Soldier[]        // composition roster (mirrors elements in Phase 2)
  vehicles: UnitVehicle[]
  stowage: Partial<Record<AmmoKey, number>>  // consumable munitions pool (AT/cannon rounds)
  winch?: Partial<Record<AmmoKey, boolean>>  // winchester radio sent for this ammo type
  // added later by AI / tick code
  anchorX?: number           // garrison hold point
  anchorY?: number
  bgGroup?: number | null    // battlegroup id (null once reverted to garrison)
  bgRole?: BgRole
  underFireT?: number        // last time anything shot at this unit
  threatX?: number           // where the fire came from (break-contact vector)
  threatY?: number
  colWait?: boolean          // halted for column stragglers
  surrenderRolled?: boolean  // one-shot surrender roll consumed
  resumeDest?: Vec2          // mission objective saved by the break drill (resume once clear)
  rtgBase?: number | null    // RETURN TO GARRISON: driving to this base to stand down
  breakRetried?: boolean     // the one break-resume retry has been spent
  coverSought?: boolean      // this contact's cover scan is spent (unit SOP)
  lastBreakT?: number        // when the last break-contact completed (break fatigue)
  lastScreenT?: number       // last smoke screen popped (one pattern per contact)
  lastFragT?: number         // last grenade thrown (close assault only)
  trailT?: number            // engine-exhaust smoke: seconds of trail still running
  trailPuffT?: number        // …and when the last puff of it was laid
  _sndFireT?: number         // feed-audio throttle (stamped by DroneView's audio pass)
  // P2.5 strength inversion: casualties happen to PEOPLE, strength is derived
  dmgAcc?: number            // sub-element damage accumulator (strength points)
  repT?: number              // motorpool repair progress toward the next DAMAGED vic
  // responsibility cache (derived at spawn from pack data): undefined = task
  // force (ours); a formation name ('2-44 ADA') = a HIGHER-echelon unit
  // transiting our AO — not task-organized, no org slot, no force-cap seat,
  // no fielded stat; helping it is optional (favor), not a duty
  respFrom?: string
  // QRF (task #30): assigned as the Quick Reaction Force of this base
  qrfHome?: number           // structure id the unit stands QRF for
  qrfOutT?: number           // responding since (unset = standing by in garrison)
}

// --- installations --------------------------------------------------------

export interface Structure {
  id: number
  side: Side
  kind: StructureTypeKey
  x: number
  y: number
  // OWNING FORMATION (scenario task-org): which formation runs this
  // installation — a sister brigade's FOB fields ITS garrison, not yours.
  // Absent = the player's own formation.
  formation?: string
  label: string
  hp: number
  maxHp: number
  buildT: number
  sight: number
  deployZone: number
  income: number
  launchesDrones: boolean
  stock: number
  // added later
  rallySeq?: number          // fan-out counter for fielded units' rally points
  strMark?: number           // integrity high-water mark (friendly damage reports)
  lastSpotT?: number         // spot-report throttle when acting as a sensor
  // facilities (P5): FUNCTIONAL services a base runs — motorpool repairs
  // vehicles, the aid station returns casualties to duty, for units resting
  // in radius. HQs have the full set by default; FOBs build them out.
  facilities?: string[]
  intBudget?: number         // point-defense engagement budget (intercept spec rof)
  lastIntT?: number          // last intercept engagement (radio throttle)
  qrfT?: number              // last QRF launch re-evaluation (throttle)
}

// --- air ------------------------------------------------------------------

export type DroneState = 'transit' | 'onstation' | 'rtb' | 'striking'
export type SensorMode = 'auto' | 'free'   // aerostat turret; null on flying airframes
export type GunFireMode = 'hold' | 'will' | 'designated'

// camera lock: a grid point, or a unit track (track=true marks a follow-slave lock)
export interface SensorLock {
  x: number
  y: number
  unitId?: number
  track?: boolean
}

// per-vic designation: element `ei` of unit `unitId`, tracked while it lives
export interface TargetRef {
  unitId: number
  ei: number
}

export interface Drone {
  id: number
  type: DroneTypeKey
  x: number
  y: number
  ox: number                 // launch origin (recovery point for airfield birds)
  oy: number
  tx: number                 // orbit anchor / transit destination
  ty: number
  state: DroneState
  route: Vec2[]
  tether: number | null      // structure id the aerostat is moored at
  sensorMode: SensorMode | null
  scanAngle: number
  altMul: number
  sightMul: number
  orbitMul: number
  endurance: number
  angle: number
  ammo: number
  label: string
  launcherId: number | null  // unit that hand-launched it (recovers to it)
  followId: number | null
  // added later by orders / tick code
  lock?: SensorLock | null
  targets?: TargetRef[]
  strikeMark?: { x: number; y: number; until: number }
  sx?: number                // kamikaze terminal-attack point
  sy?: number
  orbR?: number              // current orbit radius (spirals toward commanded)
  tilt?: number              // aerostat turret depression
  scanMul?: number           // aerostat sweep-speed setting
  lastSpotT?: number
  // gunship suite (set at deploy when the spec has one)
  gunSel?: string
  fireMode?: GunFireMode
  gunCd?: number
  gunAmmo?: Record<string, number>
  burstLeft?: number
}

// --- fires ----------------------------------------------------------------

export type ShellKind = 'HE' | 'ICM' | 'SMOKE'

export interface Shell {
  fromX: number
  fromY: number
  x: number
  y: number
  impactT: number
  dmg: number
  blast: number
  side: Side
  shell?: ShellKind          // absent on drone AGMs (treated as HE)
  splashFrom?: string        // callsign that gets the SPLASH call
  t0?: number
  bigGun?: boolean           // firing-report cue for feed audio (deepest thud)
  _snd?: boolean             // one-shot feed-audio flag (global across open feeds)
  _int?: boolean             // point defense already engaged this round (one roll each)
}

export interface GunRound {
  fromX: number
  fromY: number
  mAlt: number
  x: number
  y: number
  t0: number
  impactT: number
  blast: number
  dmg: number
  flash: number
  ap: number
  _snd?: boolean             // one-shot feed-audio flag
}

export interface Impact {
  x: number
  y: number
  t: number
  gun?: boolean
  sz?: number
  _snd?: boolean             // one-shot feed-audio flag
}

export interface Smoke {
  x: number
  y: number
  t: number
  r: number
  // an expendable's own numbers when it laid this cloud: how long it stands and
  // how thick it is. Absent = the artillery-smoke defaults (SMOKE_DURATION/0.22).
  dur?: number
  c?: number
}

export interface Wreck {
  x: number
  y: number
  side: Side
  type: UnitTypeKey | StructureTypeKey
  t: number
}

// --- intel ----------------------------------------------------------------

export interface Contact {
  x: number
  y: number
  type: UnitTypeKey
  lastSeen: number
  live: boolean
  strength: number
  unknown?: boolean // intel-seeded: presence assessed, composition NOT identified
                    // (renders as a "?" contact; cleared when actually spotted)
}

// --- comms ----------------------------------------------------------------

export type RadioKind =
  | 'move' | 'arrive' | 'contact' | 'spot' | 'damage'
  | 'request' | 'fires' | 'loss' | 'struct'

export interface NetEntry {
  t: number
  callsign: string
  kind: RadioKind
  msg: string
  x?: number
  y?: number
}

export interface Toast {
  msg: string
  t: number
}

// --- opfor ----------------------------------------------------------------

export interface Battlegroup {
  id: number
  name: string
  phase: 'muster' | 'reserve' | 'advance' | 'withdraw'
  musterT: number
  reserveT?: number          // reserve staleness countdown — commit when it expires
  retaskT: number
  objective: Vec2 | null
  members: number[]
  initStr: number
  dead: boolean
  // commander decision layer (utility scoring — see domains/opfor/decide.ts)
  decideT?: number           // countdown to the next decision cycle
  nextFiresT?: number        // next sim time THIS group may fire again (rolled window)
  digging?: boolean          // commander ordered a defense on the current objective
  scheme?: 'flank' | null    // maneuver scheme in progress (fix + flank)
  flankIds?: number[]        // members detached as the flanking element
  effort?: 'main' | 'support' // operational role: main effort vs. fixing/supporting
  lastDecision?: { t: number; id: string; scores: Record<string, number> } // dev/debug
}

// The OPFOR operational commander — one level above the battlegroups. It sets
// a persistent MAIN EFFORT so groups converge on one objective instead of each
// marching at its own nearest target, and flips POSTURE to the defensive
// (recalling attackers home to crush an overextended player) when the player
// masses on the OPFOR base. It only chooses objectives; the battlegroups and
// the shared drill code do the fighting (same iron rule as the rest of the AI).
export interface OpforCmd {
  posture: 'attack' | 'defend'
  effortId: number | null    // structure id of the current main effort (null = per-group fallback)
  supportId: number | null   // structure id of the supporting/fixing effort (null = none worth it)
  effortT: number            // countdown to re-evaluate main + supporting efforts
}

// --- the state ------------------------------------------------------------

// Id/callsign/group counters live IN the state (flagged deviation from the old
// sim, where they were module-level and reset on HMR while S survived — causing
// callsign reuse and groupId collisions after a hot reload). In-run behavior is
// identical: initGame resets them exactly as the old module did.
export interface Counters {
  nextId: number
  designators: Record<Side, number>
  groupSeq: number
  lineage: Record<string, number> // fielded-slot counter per unit type (pack lineage assignment)
}

// King-of-the-Hill objective: one control zone on the map's dominant terrain.
// null in modes without a hill. Clocks accumulate control seconds per side.
export interface HillState {
  x: number
  y: number
  r: number                  // control radius (m)
  holder: Side | null        // uncontested presence right now (null = contested/empty)
  holdFriend: number         // accumulated control seconds
  holdHostile: number
  target: number             // seconds of control needed to win
}

// Base Defense (waves) mode state. null in other modes. The passive economy is
// off while this exists — supply is banked at start and paid out per wave held.
export interface WaveState {
  n: number                  // wave number currently inbound / being fought (1-based)
  phase: 'intermission' | 'assault'
  interT: number             // seconds until the next wave launches
  groupIds: number[]         // battlegroup ids of the current wave
  survived: number           // waves fully repelled
  target: number             // waves to survive for the win
}

// Per-objective UI state, driven by the campaign runner (engine/campaign.ts).
export type ObjStatus = 'pending' | 'active' | 'done'

// the staff shops that produce reports (S6 joins when EW/net systems exist)
export type StaffShop = 's1' | 's2' | 's3' | 's4'

// Campaign mode state. null in other modes. One long OPERATION on one map: a
// stream of OBJECTIVES that activate in sequence on ONE persistent world —
// missions are not separate game modes, they are taskings that pop up (FRAGO
// cards) while the sim runs. `objIdx` indexes the operation's objective list in
// engine/campaign.ts. All fields are plain, serializable data (no closures):
// objectives are DATA, evaluated by pure functions keyed on their kind, so
// restoring a save only needs these values (Save/Continue is deferred, but
// built for here). Landmarks picked at setup (strongpoint / crossing /
// centerTown) anchor objectives; the rear target sets are DEEP OPERATIONS ids.
export interface CampaignState {
  objIdx: number             // current objective in the operation (sequential)
  briefed: boolean           // opening briefing acknowledged (false = paused on it)
  // open VTC (new tasking) or REVIEW (recalled doc — no call). `speaker` puts a
  // staff officer on the call instead of the CG (e.g. the S1 delivering a
  // PERSTAT); `docOnly` calls skip the operation slide deck. `shop` marks a
  // staff-shop document (its console header letterheads the paper).
  frago: {
    title: string; text: string; review?: boolean
    speaker?: { name: string; title: string }
    docOnly?: boolean
    shop?: StaffShop
    recovery?: RecoveryRef  // personnel-recovery tasking: swaps in the RECOVERY deck
  } | null
  // Every order received, recallable from the objectives tracker. `urgent`
  // marks an outstanding tasking (red in the log); `recovery` carries the
  // downed site so the order can draw its OWN deck instead of the operation's.
  fragoLog: Array<{
    title: string; text: string; t: number
    urgent?: boolean
    recovery?: RecoveryRef
  }>
  complete: boolean          // whole campaign won (checkEnd reads this)
  status: ObjStatus[]        // per-objective UI state across the WHOLE operation
  hold: number               // accumulated hold seconds (hold-for-time objectives)
  delivered: number          // convoy supply delivered since the objective began
  deliverBase: number        // target-structure stock baseline when a deliver objective began
  eventT: number | null      // sim time a scripted counterattack launches (null = none pending)
  opforObj: Vec2 | null      // steer campaign OPFOR battlegroups to this point (null = none)
  allow: { field: boolean; support: boolean; drone: boolean } // palette gates for this mission
  frontY: number             // authored phase line (world y) — COP baseline: enemy-assessed north of it
  commander: string          // the player's name — the task force CO (VTC roster, reports)
  divHq: Vec2 | null         // the DIVISION MAIN marker in the deep rear (decorative — inert)
  tutorial: boolean          // guided tutorial enabled for this campaign
  tutStep: number            // current tutorial step index within the mission (steps in ui/tutorial)
  tutBreakShown: boolean     // one-shot reactive tip: BREAK drill taught after a unit takes 50% casualties
  dustwunSeen: number[]      // DUSTWUN site ids already raised as PERSONNEL RECOVERY taskings
  // staff reports: each shop produces ITS report — S1 PERSTAT, S2 INTSUM,
  // S3 OPSUM, S4 LOGSTAT. Request → delay → alert; first open is the VTC
  // (speaker + document), afterwards just the document. The staff works in
  // PARALLEL: one pending report per shop, never one slot for the building.
  reports: {
    pending: Array<{ shop: StaffShop; readyT: number; auto?: boolean }>
    log: Array<{ id: number; shop: StaffShop; title: string; t: number; text: string; read: boolean }>
  }
  // campaign ANCHORS: named points the manifest declares, resolved once at
  // start — mission place refs resolve against these by name (PACK-MISSIONS.md)
  anchors: Record<string, Vec2>
  strongpoint: Vec2          // mission 1 objective town — the campaign's anchor
  crossing: Vec2 | null      // river/bridge point for SEIZE THE CROSSING (null = no water on seed)
  centerTown: Vec2 | null    // central belt town for BREAK THE BELT
  rearStructIds: number[]    // pre-placed OPFOR rear installations (DEEP OPERATIONS target set)
  rearUnitIds: number[]      // pre-placed OPFOR rear guns (same target set)
}

// After-action counters, accumulated during the run — units lost and enemy
// destroyed can't be recovered from final state, so they're counted as they happen.
export interface RunStats {
  fielded: number        // friendly units that entered the board (incl. starting force)
  lost: number           // friendly units destroyed or surrendered
  enemyDestroyed: number // hostile units destroyed or surrendered
  supplySpent: number    // supply spent on units/structures/aircraft/fire missions
}

export interface GameState {
  t: number
  map: WorldMap | null
  resources: number
  supplyLift: number         // supply per resupply tick (see SUPPLY_INTERVAL)
  supplyT: number            // seconds since the last lift
  // the OPFOR runs the same economy: it buys what it fields and pays upkeep on it,
  // so it can't put more on the board than it can afford — same rules as the player
  enemyResources: number
  enemySupplyLift: number
  forceCap: number           // max ground units each side may have fielded at once
  enemyForceCap: number
  fieldCooldown: Partial<Record<Side, Partial<Record<UnitTypeKey, number>>>>
  units: Unit[]
  structures: Structure[]
  drones: Drone[]
  shells: Shell[]
  gunRounds: GunRound[]      // gunship cannon rounds in flight
  impacts: Impact[]          // recent arty impacts (for map flash + drone view)
  smoke: Smoke[]
  wrecks: Wreck[]
  pontoons: number[]         // cell indices of engineer-laid bridges
  contacts: Map<number, Contact>
  structContacts: Set<number> // spotted hostile structure ids (permanent)
  /** the applied scenario's authored gazetteer (name → world point/zone) —
   *  script place refs resolve against it; null outside scenario play */
  scenarioPlaces: Map<string, { x: number; y: number; r?: number }> | null
  fogEnabled: boolean
  devMode: boolean           // dev sandbox only: exposes the fog/supply cheats
  difficulty: DifficultyKey
  damageMul: number          // global damage scale (difficulty): lower = longer firefights
  speed: number
  toasts: Toast[]
  radio: NetEntry[]
  mode: ModeId               // which game mode's rules this match runs under
  won: boolean
  lost: boolean
  endT: number | null        // sim time the match ended (the end screen's mission clock)
  stats: RunStats & { promotions?: number } // promotions: battlefield promos processed (P3)
  hill: HillState | null     // King of the Hill objective (null in other modes)
  waves: WaveState | null    // Base Defense wave scheduler (null in other modes)
  campaign: CampaignState | null // Campaign mission tracker (null in other modes)
  org: DivOrg | null         // the player pack's full division organization (friend side)
  // THE CHAIR: the designation the player commands. A campaign scenario pins
  // it; a skirmish lets the player pick a playable formation. The org's
  // task-force marking is built around it, and command over every friendly
  // unit derives from it (domains/forces/command.ts).
  //
  // WHICH ECHELON this is, is the PACK's (Formation.chairRung). This game is a
  // battalion TOC because 1CD says its chair is a battalion — not because
  // anything here believes in battalions. An army that commands at a company
  // (the Mobile Infantry) or a brood says so and nothing below changes.
  chair: string
  assets: AssetsState        // division asset pool + request pipeline (ASSET-REQUESTS.md)
  downed: DownedSite[]       // DUSTWUN sites awaiting recovery (friend wipes)
  replT: number              // next replacement-packet arrival (P3 pipeline clock)
  enemyFiresOkT: number      // next sim time ANY OPFOR fire mission may launch (rolled window)
  nextWave: number
  airCooldown: Partial<Record<DroneTypeKey, number>>
  enemyGroups: Battlegroup[]
  march: MarchPlan[]         // authored orders of march, by move-group id
  teams: Team[]              // the task organization — named, durable groupings
  hazards: Hazard[]          // mines/IEDs on the routes
  opforCmd: OpforCmd         // OPFOR operational commander (main effort + posture)
  rng: Rng | null
  version: number
  counters: Counters
}

// Fresh pre-init state, mirroring the old module's literal defaults exactly
// (initGame overwrites nearly all of it; these matter for the pre-menu screen).
export function createInitialState(): GameState {
  return {
    t: 0,
    map: null,
    resources: 50000,        // dev: plenty
    supplyLift: 30,
    supplyT: 0,
    enemyResources: 0,
    enemySupplyLift: 30,
    forceCap: 20,
    enemyForceCap: 20,
    fieldCooldown: {},
    units: [],
    structures: [],
    drones: [],
    shells: [],
    gunRounds: [],
    impacts: [],
    smoke: [],
    wrecks: [],
    pontoons: [],
    contacts: new Map(),
    structContacts: new Set(),
    scenarioPlaces: null,
    fogEnabled: true,
    devMode: false,
    difficulty: 'regular',
    damageMul: 1,
    speed: 1,
    toasts: [],
    radio: [],
    mode: 'attack-defend',
    won: false,
    lost: false,
    endT: null,
    stats: { fielded: 0, lost: 0, enemyDestroyed: 0, supplySpent: 0 },
    hill: null,
    waves: null,
    campaign: null,
    org: null,
    chair: '',
    assets: { pool: [], pending: [], queue: [], windows: [], unlocks: [], favor: 0 },
    downed: [],
    replT: 0,
    enemyFiresOkT: -999,
    nextWave: 60,
    airCooldown: {},
    enemyGroups: [],
    march: [],
    teams: [],
    hazards: [],
    opforCmd: { posture: 'attack', effortId: null, supportId: null, effortT: 0 },
    rng: null,
    version: 0,
    counters: { nextId: 1, designators: { friend: 0, hostile: 0 }, groupSeq: 1, lineage: {} },
  }
}
