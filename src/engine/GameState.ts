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

export type Side = 'friend' | 'hostile'

// --- forces ---------------------------------------------------------------

export type UnitState = 'hold' | 'moving' | 'engaging' | 'firing' | 'bridging'
export type Roe = 'push' | 'halt' | 'break'          // actions-on-contact drill
export type WeaponsControl = 'free' | 'tight' | 'hold'
export type Posture = 'mobile' | 'dig'
export type AiRole = 'garrison' | 'bg'
export type BgRole = 'recon' | 'main'

// one waypoint leg of a player-issued route: destination + how many path points it owns
export interface Leg extends Vec2 { n: number }

// individual vic/troop in a unit's formation; offsets are body-frame (fwd/lat)
export interface UnitElement {
  ox: number
  oy: number
  kind: 'veh' | 'troop'
  alive: boolean
}

// --- force composition roster (FORCE-MODEL.md, Phase 2) --------------------
// The unit's actual people and vehicles, built from the composition catalog at
// spawn. Phase 2 scaffolding: strength/elements remain authoritative and the
// roster MIRRORS them deterministically (rosterSync); Phase 3 inverts this
// (casualties happen to individuals, strength/firepower derive) and adds ammo.
// Phase 4 adds names/bios/WIA/MIA + the S1 view. Ids are unit-local.

export type SoldierStatus = 'FIT' | 'WIA' | 'KIA' | 'MIA' // Phase 2 drives FIT/KIA only
export type VehicleStatus = 'OK' | 'DESTROYED'

export interface Soldier {
  id: number
  kind: TroopKindKey
  status: SoldierStatus
  vehId: number | null       // crewed vehicle (unit-local id), null = dismount
}

export interface UnitVehicle {
  id: number
  type: VehicleKey
  status: VehicleStatus
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
  label: string
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
  breakRetried?: boolean     // the one break-resume retry has been spent
  coverSought?: boolean      // this contact's cover scan is spent (unit SOP)
  lastBreakT?: number        // when the last break-contact completed (break fatigue)
  _sndFireT?: number         // feed-audio throttle (stamped by DroneView's audio pass)
}

// --- installations --------------------------------------------------------

export interface Structure {
  id: number
  side: Side
  kind: StructureTypeKey
  x: number
  y: number
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

// Campaign mode state. null in other modes. One long operation on one map, run as
// a sequence of missions on ONE persistent world — nothing resets between them.
// `mission` / `objIdx` index into the mission table in engine/campaign.ts. All
// fields are plain, serializable data (no closures): objectives are DATA in the
// mission table, evaluated by pure functions keyed on their kind, so restoring a
// save only needs these values (Save/Continue is deferred, but built for here).
// Landmarks picked at setup (strongpoint / crossing / centerTown) anchor missions'
// objectives; the rear target sets are the ids DEEP OPERATIONS must kill.
export interface CampaignState {
  mission: number            // 1-based index into MISSIONS
  objIdx: number             // current objective within the mission (sequential)
  briefed: boolean           // opening briefing acknowledged (false = paused on brief; M1 only)
  frago: number | null       // mission # with an unread FRAGO card (non-blocking, sim runs on)
  complete: boolean          // whole campaign won (checkEnd reads this)
  status: ObjStatus[]        // per-objective UI state for the CURRENT mission
  hold: number               // accumulated hold seconds (hold-for-time objectives)
  delivered: number          // convoy supply delivered since the objective began
  deliverBase: number        // target-structure stock baseline when a deliver objective began
  eventT: number | null      // sim time a scripted counterattack launches (null = none pending)
  opforObj: Vec2 | null      // steer campaign OPFOR battlegroups to this point (null = none)
  allow: { field: boolean; support: boolean; drone: boolean } // palette gates for this mission
  frontY: number             // authored phase line (world y) — COP baseline: enemy-assessed north of it
  tutorial: boolean          // guided tutorial enabled for this campaign
  tutStep: number            // current tutorial step index within the mission (steps in ui/tutorial)
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
  stats: RunStats
  hill: HillState | null     // King of the Hill objective (null in other modes)
  waves: WaveState | null    // Base Defense wave scheduler (null in other modes)
  campaign: CampaignState | null // Campaign mission tracker (null in other modes)
  enemyFiresOkT: number      // next sim time ANY OPFOR fire mission may launch (rolled window)
  nextWave: number
  airCooldown: Partial<Record<DroneTypeKey, number>>
  enemyGroups: Battlegroup[]
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
    enemyFiresOkT: -999,
    nextWave: 60,
    airCooldown: {},
    enemyGroups: [],
    opforCmd: { posture: 'attack', effortId: null, supportId: null, effortT: 0 },
    rng: null,
    version: 0,
    counters: { nextId: 1, designators: { friend: 0, hostile: 0 }, groupSeq: 1 },
  }
}
