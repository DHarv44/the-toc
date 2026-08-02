// SCENARIO — an authored battle as PACK CONTENT (SCENARIO-BUILDER.md).
//
// A scenario references a map ("packId/mapId" — cross-pack allowed) and
// overrides the war completely; the map's own sidecar keeps only defaults.
// Coordinates are pack-norm BOX coords (x 0→1 west→east, y 0→1 north→south),
// same convention as the map sidecar, so a scenario survives a re-baked map.
// JSON-pure throughout: this is pack data, authored by the builder and read
// by the engine — the same boundary rule as every other pack file.
import type { ModeId } from '../engine/modes'
import type { StructureTypeKey } from '../domains/installations/catalog'
import type { MissionObjective, MissionTrigger, TutorialSpec } from '../packs/types'

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
  /** display name — CP GARRYOWEN energy; absent = the engine's default label */
  label?: string
  /** under construction at H-hour (absent = complete) */
  building?: boolean
  /** FOB starting stock override */
  stock?: number
}

export interface ScenarioUnit {
  side: ScenarioSide
  /** unit type key in the owning side's pack catalog */
  type: string
  x: number
  y: number
  /** radians, world convention (0 = east, +cw); absent = engine default */
  heading?: number
  dug?: boolean
  roe?: string
  weapons?: string
  /** friendly only: starts IN GARRISON instead of fielded */
  garrison?: boolean
  /** OPFOR battlegroup tag — what defeat-group objectives and triggers reference */
  tag?: string
  /** authored movement route at H-hour, norm coords in order */
  route?: { x: number; y: number }[]
}

export interface ScenarioSpec {
  name: string
  /** the ground: "packId/mapId" */
  map: string
  /** which ModeSpec plays it; absent = attack-defend */
  mode?: ModeId
  /** which installed pack plays each side; absent = the default lineup */
  sides?: { friend?: string; hostile?: string }
  /** fog of war on (absent = on) */
  fog?: boolean
  structures: ScenarioStructure[]
  units: ScenarioUnit[]
  // --- the SCRIPT (optional — a skirmish scenario is just placements) -------
  // The mission vocabulary rides verbatim (packs/types): a campaign mission IS
  // a scenario with these sections. H-hour rule: what exists at H-hour is a
  // placed entity above; what arrives later or conditionally is a trigger
  // effect referencing `places` by name.
  places?: ScenarioPlace[]
  /** opener OPORD text (the VTC brief) */
  brief?: string
  objectives?: MissionObjective[]
  triggers?: MissionTrigger[]
  /** tutorial curriculum — carried opaque; the builder preserves, never edits */
  tutorial?: TutorialSpec
}
