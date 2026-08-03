# SCENARIO BUILDER — Eden on the BFT, Zeus over the sim

The plan of record for scenario authoring (ratified 2026-08-02). Kept current as
work lands, GROUNDWORK.md-style: phase statuses updated in place, decisions
recorded so nobody re-litigates them.

## The acceptance test

**The build is successful when IRON TRIANGLE is rebuilt in this tool** — on real
authored ground, its missions recreated against the real gazetteer — **living
entirely in `src/packs/1cd/` and shipping with the pack. Nothing hardcoded.**
The engine ships verbs; the campaign is data; the splash un-greys itself because
the pack says so. Any campaign-specific content still found in engine code when
this lands gets moved to pack data as part of the same phase.

## The model (settled)

- **A scenario is PACK CONTENT, its own content type**:
  `packs/<id>/scenarios/<scenarioId>/scenario.json`, glob-discovered like maps
  and models. It references a map as `"packId/mapId"` (cross-pack allowed — a
  faction pack's war on a shared map never copies the map).
- **The map's `map.json` sidecar keeps only the map's DEFAULTS** (name, FOB,
  enemy base, MSR, SAT). A scenario overrides the war completely. One map, many
  scenarios.
- **The scripting language already exists**: the campaign mission vocabulary
  (objective kinds, triggers, effects, place refs, anchors — `packs/types.ts`)
  IS the scenario script. Eden is a UI over placements + that vocabulary. A
  skirmish scenario = placements + a mode; a campaign = manifest + ordered
  missions. One tool feeds all of it.
- **Eden's grammar, not Eden's surface** (design law 2): entity workspace —
  place / select / inspect / drag / rotate / delete / undo — on the exact BFT
  sheet, top-down, platoon-atomic. No 3D walkthrough, no loadouts.
- **Eden and Zeus share one toolbox**: every placement/inspect/order service is
  side-agnostic and callable at runtime (PLAY-from-editor requires it anyway).
  Zeus is the same palette mounted over a RUNNING sim.
- **Sides are packs**: a scenario declares which installed pack plays BLUFOR and
  which plays OPFOR. Unit palettes come from each side's own catalogs.
- **REUSE, NO MONOLITHS (user directive 2026-08-02)**: the builder invents no
  parallel machinery. The sheet is `renderPackLayer` + the existing view/pan/
  zoom math; symbols are `map/symbols.ts`; snapping is `nearestLand`; route
  preview is `findPath` (the one router); placement-at-play goes through the
  SAME verbs the game uses (`addStructure`/`deployUnit`/`spawnEnemy`/the order
  functions) — which is also what makes Zeus free. Data shapes reuse
  `packs/types.ts` (MissionSpec, PlaceRef, anchors); discovery copies the
  map-files/model-files glob pattern; persistence extends the pack-io route.
  New code lives as small single-concern modules (`src/scenario/` services +
  focused UI components), never additions to a monolith. If something the
  builder needs exists in the game, the builder calls it; if it doesn't exist,
  it ships in the shared layer first — same iron rule the OPFOR AI follows.

## Phases

### E1 — Eden core (the entity editor)                 [ ]
- SCENARIO BUILDER on the splash (TOOLS). Pick pack → map (no terrain editing —
  the exact BFT sheet, real pan/zoom, SAT toggle works).
- Entity system: place / select / inspect / drag / delete / undo-redo. Entity
  types: STRUCTURES (HQ/FOB/OP/AFLD — label, side, build state, stock) and
  UNITS (from the side's pack catalog — label, heading, posture/dug-in, ROE,
  weapons, mounted, garrison-vs-fielded, battlegroup tag).
- Authored orders: waypoint routes per unit/group previewed by the REAL router
  (the counterattack column is drawn before the game runs), DEFEND positions,
  patrol loops.
- Placement snapping through `nearestLand` with the unit's own mobility —
  nothing is born inside a wall.
- Persistence: `scenario.json` written through the dev write route (pack-io
  pattern); discovery module `packs/scenario-files.ts`; skirmish splash lists
  scenarios (a scenario carries its own map + mode, so picking one skips those
  steps).
- The PLAY loop: launch the scenario from the builder, return to the builder.
  `initGame` grows a scenario application path (skip default staging, apply
  authored placements — the precedent is startCampaign's strip-and-place).
- The Map Editor's thin SCENARIO step retires into this tool.

### E2 — Eden scripting (the mission layer)            [~] core shipped 2026-08-02

**Settled model (2026-08-02):** the scenario is THE one content type — a
campaign mission IS a scenario with script sections (`places`, `brief`,
`objectives`, `triggers`, `tutorial` riding the mission vocabulary verbatim;
`missions/` folders retire when the campaign runner rewires). The H-hour rule
divides the representations: **what exists at H-hour is a placed entity; what
arrives later or conditionally is a trigger effect.** Place refs grow to a
tri-state (fixed pin / pick-one-of-candidates / query) — pins now, pick-lists
and queries with S4; portable side-mission templates are scenarios with no
`map` whose refs are all queries against terrain semantics (real OSM
roads/towns/cover — Groundwork's substrate). Random events are SIM-DRIVEN,
not damage rolls: the S4 roller spawns a real mortar team that infiltrates,
fires, displaces — counter-battery/UAV/patrols all engage it for free — and
persistent CampaignState counters feed eligibility (clear the cache → IDF
weight drops). Forms are GENERATED from vocabulary descriptors — a new engine
verb needs one descriptor row, no bespoke UI.

- [x] Named PLACES as entities (the authored gazetteer): point/zone from a
  CONTROL MEASURES palette section, amber control-measure rendering,
  name/radius in the inspector. Everything scripted hangs off these.
- [x] SCRIPT panel (tabbed right rail): brief + objectives + triggers edited
  beside the map; descriptor-driven forms (`descriptors.ts`); place params
  autocomplete over authored places + real gazetteer + builtins; effect
  reorder preserved (declaration-order law); recursive all/any conditions;
  RAW JSON toggle. Tutorial carried opaque.
- [x] IMPORT MISSION + the RE-ANCHOR pass: any pack campaign mission's logic
  imports verbatim; unresolvable place names become authored places staged
  mid-sheet to drag into position. LODGMENT opens in the builder today.
- CONTROL MEASURES beyond points/zones: phase lines, boundaries, TRPs, MSR
  nomination — rendered in-game as the operational overlay, referenceable by
  triggers ("cross PL BLUE").
- Mode + victory: ModeSpec pick + params (KotH hill PLACED by the author; Base
  Defense wave table authored — comp/axis/timing).
- Conditions: fog, day/night, difficulty binding, fielding open vs fixed force
  (the palette gate exists).
- Briefing text: opening OPORD, FRAGO cards, radio lines.
- COMPOSITIONS: prefab stamps ("mech platoon dug in", "FOB with OP screen",
  "garrisoned town") — task-org templates sourced from the pack's org.

### E3 — Zeus (the game master)                        [ ]
- The same entity palette + inspector live over a RUNNING sim: spawn units and
  battlegroups either side, hand the OPFOR objectives, drop FRAGOs, reinforce,
  withdraw. The dev sandbox's console-driven workflow absorbs into it first;
  it graduates to a real GAME MASTER mode after.
- Snapshot: save the current battlefield as a scenario (play god, freeze it
  into content) — decision pending on timing; forces the serializer early.

### E4 — Campaign assembly + THE TEST                  [~] spine shipped 2026-08-02

**Settled tree (2026-08-02):** `PACK → campaigns/<id>/` = `campaign.json`
(manifest: identity, THE map — a pack map ref, cross-pack allowed —, anchors,
pre-allocations, mainline order, S4 side pool) + optional `opening.json` (the
CAMPAIGN SCENARIO: H-hour entities for the whole arc — the campaign is
continuous, so only this one moment places a world) + `missions/*.json`
(script-heavy scenarios). Standalone `scenarios/` stay self-contained
skirmishes. Main menu: CAMPAIGNS → choose → CONTINUE (needs the battlefield
serializer — shared ground with Zeus snapshot) or NEW (difficulty).

- [x] One content type end-to-end: MissionSpec and map.json DIED —
  CampaignSpec.missions are ScenarioSpecs, the manifest owns the map,
  `opening.json` supported and authoritative when shipped.
- [x] `packs/campaigns.ts` discovery service + splash CAMPAIGNS picker
  (every installed pack's campaigns; unauthored ground greyed and honest;
  CONTINUE stub until the serializer). `setActiveCampaign` retires the
  first-campaign-only assumption.
- [x] `engine/applyScenario.ts` — THE apply path (opening, skirmish
  scenarios, builder PLAY, Zeus): player-order verbs only, authored
  gazetteer into `S.scenarioPlaces` (place resolver checks it), tagged
  hostiles form battlegroups in place, H-HOUR INTEL per hostile
  (known / suspected-with-scatter — the last-known marker is deliberately
  off truth) seeds the COP.
- [x] Legacy map-editor SCENARIO step rewritten as MAP DEFAULTS (sidecar
  fallback bases only; the word scenario now means the one content type).
- CONTINUE: the battlefield serializer (units/structures/contacts/org/
  assets/rng position/CampaignState) — next big rock; one save slot per
  campaign.
- Builder campaign context: open a campaign → its opening scenario on the
  sheet, mainline listed, missions editable in place.
- **Rebuild IRON TRIANGLE**: real ground authored in the MAP EDITOR (the actual
  Chorwon valley, if the user wants the name to be true), M1 LODGMENT and M2
  LINES OF SUPPLY recreated in Eden against the real gazetteer, campaign
  un-greys, plays end-to-end with losses carrying.
- **Hardcode sweep**: audit engine/campaign.ts and engine/missions/* for any
  remaining campaign-specific content (e.g. the '2-8 CAV' fallback literal) —
  everything content-shaped moves to pack data. The engine keeps only verbs.

## Open decisions

- **Zeus identity**: dev-tool-first vs playable GAME MASTER mode from day one.
  Leaning dev-tool-first (absorb the sandbox), promote when it's fun.
- **Zeus snapshot-to-scenario**: powerful authoring path, but pulls the full
  battlefield serializer forward (shared ground with Save/Continue). Decide at
  E3.
- **Campaign difficulty/commander flow**: stays on the splash (campaign card)
  or moves into the campaign's own picker screen at E4.
