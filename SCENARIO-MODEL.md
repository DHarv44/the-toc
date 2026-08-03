# THE SCENARIO MODEL — one object, typed by the author

Plan + progress tracker for the model collapse (settled with the user
2026-08-02, superseding the SCENARIO/MISSION/EVENT/SITUATION-as-siblings
vocabulary in SCENARIO-BUILDER.md). Update statuses in place as work lands.

## The settled model

**There is ONE content object: the SCENARIO.** A campaign is not a different
thing — it is a scenario whose author typed it `campaign`. "Situation" and
"missions" are SECTIONS of a scenario, not sibling content types.

```
SCENARIO
  type        'attack-defend' | 'king-of-the-hill' | 'base-defense' | 'campaign'
  name, map ('packId/mapId', required), sides, fog
  situation   the H-hour placement: structures, units (intel picture), places
  missions[]  0..N script arcs (objectives/triggers/brief/frago/tutorial), in order
  events[]    (S4) the random pool: IDF teams, intel taskings, …
```

**`type` is authored, never inferred** (user: "I want to be able to say 'this
is a campaign', or 'this is KOTH'"). It drives exactly three things:
1. **Menu door** — `campaign` → CAMPAIGNS (NEW/CONTINUE); everything else → SKIRMISH.
2. **Rules** — skirmish types run that engine ruleset; `campaign` gets its
   rules from its missions (objectives are the victory logic).
3. **The badge** in every list, including the builder's LOAD panel.

**The H-hour rule** (unchanged): the SITUATION places the world once, at
creation. Missions arrive into a world in motion and speak in trigger effects.
Losses carry mission-to-mission automatically because it is ONE world playing
ONE scenario continuously.

## Disk form — one file until it has missions, then a folder

```
packs/1cd/
  maps/kabul/…                        ground + map.json defaults (unchanged)
  scenarios/
    hill-402.json                     simple fight — everything in one file
    iron-triangle/
      scenario.json                   type, map, sides, SITUATION (+ campaign extras)
      missions/
        01-lodgment.json              a mission is a FILE: copy/share/diff it raw
        02-lines-of-supply.json       number prefix = mainline order, visible in the tree
      events/                         (S4)
        idf-pot.json
```

- Both forms load to the IDENTICAL scenario object — engine, menus and builder
  never know the difference.
- Order is the filenames. No manifest, nothing to desync, no orphan refs.
- Every surface (skirmish list, campaigns menu, LOAD panel, runner) is a dumb
  projection of this tree. Nothing registered, nothing mapped.

**What dies:** `campaigns/` folders, `campaign.json` manifests,
`Pack.campaigns`, `packs/campaign-files.ts`, `packs/campaigns.ts`,
`/__gwcampaign`, the builder's destination select, `CampaignSpec`,
the mission-Record-plus-mainline indirection. Manifest extras (operation name,
hqLabel/airfieldLabel, divHq, anchors, preAllocations) become OPTIONAL
scenario fields with engine defaults.

## Phases

### C1 — Schema                                        [x]
- `ScenarioSpec`: `type` (authored), required `map`, `situation` section,
  `missions: MissionScript[]` (id/name/brief/frago/objectives/triggers/
  tutorial — no map, no coords of its own), optional campaign extras
  (operation, hqLabel, airfieldLabel, divHq, anchors, preAllocations).
- `CampaignSpec`, `MissionSpec` remnants, `ScenarioSpec.id/mode` die.

### C2 — Discovery + content                           [x]
- `scenario-files.ts` reads BOTH forms: `scenarios/<id>.json` and
  `scenarios/<id>/scenario.json` + `missions/*.json` (filename-sorted),
  assembling one spec. `campaign-files.ts`, `campaigns.ts` deleted.
- Iron Triangle converts: `1cd/scenarios/iron-triangle/scenario.json`
  (type campaign, extras from the old manifest, map null→field absent =
  listed-not-startable) + `missions/01-lodgment.json`. Old campaigns/ tree
  deleted.

### C3 — Engine                                        [x]
- Campaign runner reads a ScenarioSpec: `activeCampaign()` →
  `activeScenario()`; `buildOperation` walks `spec.missions` in array order;
  situation applied via `applyScenario`; manifest extras read from spec
  fields with defaults when absent.
- Skirmish play path: splash SKIRMISH lists typed scenarios (badge = type,
  card → difficulty → play): `buildGameMap(spec.map)` → `initGame(map, seed,
  diff, spec.type)` → `applyScenario`. QUICK BATTLE keeps the bare-map flow.
- CAMPAIGNS menu lists `type: 'campaign'` scenarios (greyed while `map`
  absent). CONTINUE stub unchanged.

### C4 — pack-io                                       [x]
- `/__gwscenario` learns both forms: flat file, or folder writes
  (`file=scenario` | `file=mission&id=NN-slug`). `/__gwcampaign` deleted.

### C5 — Builder                                       [x]
- Dropdown = TYPE: A&D / KOTH / BASE DEFENSE / CAMPAIGN. Destination select
  dies — a scenario saves to its pack, period.
- LOAD panel (right rail tab, default): flat rows with type badges;
  mission-bearing scenarios expand to show missions; click loads everything
  (map, situation, script); [PORT] per row copies into the current workspace
  (same ground verbatim; new ground = relative positions + staged re-anchor).
- SCRIPT tab gains a mission picker when the scenario has missions; the
  situation is the sheet's entity layer as today.
- H-hour warning: placements live in the SITUATION; mission scripts warn if
  they would need placements.

### C6 — Docs + sweep                                  [x]
- SCENARIO-BUILDER.md vocabulary section superseded by this file (pointer
  left). ROADMAP touch. Grep sweep: no `CampaignSpec`, no `campaigns/` refs,
  no 'opening', no destination code left.

## Decisions log

- 2026-08-02 · type is AUTHORED, never inferred from mission count (user).
- 2026-08-02 · one file until missions exist, then folder; missions are files;
  order = filename prefix (keeps hand-composability — the training mission
  ships once, gets copied anywhere, incl. raw file drops).
- 2026-08-02 · copy semantics for floating content — no shared references.
- 2026-08-02 · SITUATION keeps its name (OPORD Paragraph 1) as the section
  name for H-hour placement inside a scenario.
- Deferred: EVENTS section (S4), hold-area / hold-out / wave verbs (the
  "campaign can be whatever we want" rules), Save/Continue serializer,
  builder PLAY loop, NEW CAMPAIGN authoring of extras beyond defaults.
