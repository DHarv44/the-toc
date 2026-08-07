// THE SCENARIO — the one content object (SCENARIO-MODEL.md, settled
// 2026-08-02). A campaign is not a different thing: it is a scenario whose
// author typed it 'campaign'. SITUATION and MISSIONS are SECTIONS of a
// scenario, never sibling content types.
//
// `type` is AUTHORED, never inferred. It drives exactly three things: which
// menu door lists the scenario (campaign → CAMPAIGNS, else SKIRMISH), which
// rules judge it (skirmish types run that engine ruleset; campaign gets its
// rules from its missions), and the badge on every list.
//
// Coordinates are pack-norm BOX coords (x 0→1 west→east, y 0→1
// north→south), same convention as the map sidecar, so a scenario survives a
// re-baked map — and PORTS between maps landing in the same RELATIVE spots.
// JSON-pure throughout: pack data, authored by the builder, read by the
// engine.
import type { ModeId } from '../engine/modes'
import type { StructureTypeKey } from '../domains/installations/catalog'
import type {
  AnchorQuery, MissionObjective, MissionTrigger, TutorialSpec,
} from '../packs/types'

export type ScenarioSide = 'friend' | 'hostile'

/** An authored NAMED PLACE — the scenario's own gazetteer entry. Everything
 *  scripted hangs off these: objective zones, trigger spawn anchors, OPFOR
 *  objectives. Point when `r` is absent; a ZONE (control measure) when set.
 *  Coordinates pack-norm like everything else; radius in METRES. */
export interface ScenarioPlace {
  name: string
  x: number
  y: number
  r?: number
}

export interface ScenarioStructure {
  side: ScenarioSide
  kind: StructureTypeKey
  x: number
  y: number
  /** OWNING FORMATION — a designation from the pack's org at any echelon
   *  ('1CD' division, '3ABCT' brigade, '2-8 CAV' battalion). Drives which
   *  garrison the installation fields from and the default label. Absent =
   *  the player's own formation. */
  formation?: string
  /** assets sited here at H-hour (ASSET-REQUESTS.md pool kinds): a C-RAM
   *  section on the FOB, a SHADOW orbit at the CP. Authored quantities are
   *  authored — difficulty never scales them. */
  assets?: { asset: string; qty: number }[]
  /** AUTHORED facility positions inside the wire, as METRE offsets from the
   *  anchor (map-size independent; they travel with the base when it moves).
   *  Keys are facility catalog keys; a facility with no entry gets the
   *  engine's default layout (installations/anatomy). */
  fac?: Record<string, { dx: number; dy: number }>
  /** display name — CP GARRYOWEN energy; absent = the engine's default label */
  label?: string
  /** under construction at H-hour (absent = complete) */
  building?: boolean
  /** FOB starting stock override */
  stock?: number
  /** hostile only: BLUFOR knows this structure at H-hour (ghosted on the COP
   *  — the enemy-HQ treatment). Absent = found like anything else. */
  intel?: 'known'
}

export interface ScenarioUnit {
  side: ScenarioSide
  /** unit type key in the owning side's pack catalog */
  type: string
  x: number
  y: number
  /** OWNING FORMATION — the battalion designation whose org slot this
   *  platoon draws ('2-8 CAV', '1-9 CAV'). Real slot, real people, real
   *  lineage. Absent = the player's own formation.
   *  COMMAND DERIVES FROM TASK ORG: the player's formation (plus anything
   *  `attached`) is player-controlled; every other friendly formation is
   *  AI-commanded. There is no player/AI flag — the task org IS the answer. */
  formation?: string
  /** task-organized to the player's command for this operation — the pack's
   *  own attachment concept, authored per scenario ("A CO/91 BEB attached to
   *  2-8 CAV"). Only meaningful when `formation` is not the player's. */
  attached?: boolean
  /** radians, world convention (0 = east, +cw); absent = engine default */
  heading?: number
  dug?: boolean
  roe?: string
  weapons?: string
  /** friendly only: starts IN GARRISON instead of fielded */
  garrison?: boolean
  /** OPFOR battlegroup tag — what defeat-group objectives and triggers reference */
  tag?: string
  /** hostile only: what the BLUFOR picture holds at H-hour.
   *  absent — invisible until a sensor finds it
   *  'known' — a stale contact at its TRUE position (type identified)
   *  'suspected' — last-known intel: a stale UNKNOWN contact templated up to
   *  `scatter` metres off truth — the marker is not where the unit is */
  intel?: 'known' | 'suspected'
  /** suspected only: template scatter radius, metres (default 400) */
  scatter?: number
  /** authored movement route at H-hour, norm coords in order */
  route?: { x: number; y: number }[]
}

/** The SITUATION — OPORD Paragraph 1: everything that exists the instant the
 *  world is created, before anyone has made a move. The H-hour rule: only
 *  the situation places entities; missions arrive into a world in motion and
 *  speak in trigger effects. */
export interface ScenarioSituation {
  structures: ScenarioStructure[]
  units: ScenarioUnit[]
  places?: ScenarioPlace[]
  /** AUTHOR-DRAWN ROADS (norm coords) — dirt tracks the engineers have
   *  already cut when the war starts. Laid at H-hour through the same
   *  machinery an in-game road-building element uses (S.engRoads: pushed,
   *  stamped, junction-snapped, serialized), so they are real to the router
   *  and the raster from the first tick. Also the way a road-poor map gets
   *  roads a scenario needs without touching the ground pack. */
  engineerRoads?: { x: number; y: number }[][]
}

/** One MISSION — a script arc with a conclusion: objectives are its phases,
 *  triggers its happenings, the brief/frago its voice. No coordinates of its
 *  own (place refs resolve against the situation's places + the map's real
 *  gazetteer + builtin anchors). On disk, a mission is a FILE
 *  (missions/NN-id.json — the number prefix is the mainline order), so it
 *  can be copied between scenarios raw. */
export interface MissionScript {
  id: string
  name: string
  /** opener OPORD text (the first mission's brief opens the campaign) */
  brief?: string
  /** tasking card dropped when this mission activates mid-stream */
  frago?: { title: string; text: string }
  objectives?: MissionObjective[]
  triggers?: MissionTrigger[]
  /** tutorial curriculum — carried opaque by the builder */
  tutorial?: TutorialSpec
}

export interface ScenarioSpec {
  /** AUTHORED type — the menu door, the rules, the badge. 'campaign' plays
   *  from CAMPAIGNS with its missions as the rules; the skirmish types play
   *  from SKIRMISH under that engine ruleset. */
  type: ModeId
  name: string
  /** the ground: 'packId/mapId' (cross-pack allowed). Absent = ground not
   *  yet authored — listed but not startable. */
  map?: string
  /** which installed pack plays each side; absent = the default lineup */
  sides?: { friend?: string; hostile?: string }
  /** THE PLAYER'S CHAIR — the battalion designation the player commands.
   *  Campaign type: script, the author decides who you are. Skirmish types:
   *  the DEFAULT, and the player may take a different playable battalion at
   *  launch. Absent = the friend pack's own playerBn. */
  player?: string
  /** fog of war on (absent = on) */
  fog?: boolean
  /** H-HOUR as a LOCAL datetime on the map's ground ('2026-06-21T04:30') —
   *  a dawn assault is something the author declares. Absent = local noon. */
  start?: string
  /** how much sky a sim-second sweeps (absent = 6× — an hour of play visibly
   *  moves the light; a realism scenario declares 1) */
  sunScale?: number
  situation: ScenarioSituation
  /** the mainline, in order (folder form: missions/NN-*.json, sorted) */
  missions?: MissionScript[]

  // --- campaign dressing (optional; engine defaults when absent) ----------
  /** operation name on the board ('LODGMENT'); default: the scenario name */
  operation?: string
  /** the battalion CP's name */
  hqLabel?: string
  /** the CP airstrip's name */
  airfieldLabel?: string
  /** DIVISION MAIN position (fraction of the world); absent = no div HQ */
  divHq?: { atFrac: { x: number; y: number } }
  /** named points resolved once at start (campaign anchors) */
  anchors?: Record<string, AnchorQuery>
  /** scarcity at H-hour: assets held by sister formations until released */
  preAllocations?: { asset: string; formation: string }[]
}
