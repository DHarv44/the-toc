# PACK CAMPAIGNS — campaign-down content design (settled 2026-07-25)

> The decision: **do it right — maps and missions live in the pack.** The pack
> ships CAMPAIGNS; a campaign owns its MAP and its MISSIONS; missions own their
> objectives, triggers, and tutorial. The engine keeps only verbs. This doc is
> the contract; build stages are at the bottom.

## Doctrine (unchanged, extended)

- **Engine = verbs, packs = nouns.** The engine ships kind-keyed registries:
  objective kinds, trigger conditions, effects, spatial queries, tutorial
  UI-conditions and anchor IDs. Packs compose them in JSON. **No code in packs,
  ever** — no JS hooks, no exceptions. When a mission needs something the
  vocabulary can't say, the weird thing becomes a NEW ENGINE VERB with params
  (the MLRS-dump-truck rule) and every future pack gets it.
- **Determinism is law.** Effects execute in declaration order; all randomness
  through `S.rng`; trigger fired-state lives in CampaignState (save/replay
  safe). The stage-1 conversion must be GOLDEN-NEUTRAL: the JSON encodes
  exactly today's LODGMENT and the executor is literally today's code,
  parameterized — same rng draw order, same spawn order, checksum unchanged.
- **IDs, not names**, for every cross-reference (unit types, assets,
  formations, anchors, missions).

## Layout — campaign-down

```
src/packs/1cd/
  pack.json
  names.json
  campaigns/
    iron-triangle/            ← a campaign is a folder; packs may ship many
      campaign.json           ← manifest: identity, map ref, mainline, side pool
      map.json                ← theater + seed + authored layout (the gazetteer)
      missions/
        lodgment.json         ← the operation: scout/clear/hold, then FOB + supply line
        side/                 ← repeatable side-mission templates (stage 4)
          idf-pot.json
```

**A mission is an OPERATION, not a level.** The mainline's phases belong in ONE
mission file when they are one commander's one plan — the OPORD lays out the
whole scheme of maneuver and the objective board shows every phase from H-hour
(2026-07-25: `fob-keaton.json` was folded back into `lodgment.json` for exactly
this reason). Split into a second mainline mission only when the tasking is a
genuinely NEW operation — a different objective set the commander could not
have been briefed on at H-hour. Mid-operation taskings are the `frago` EFFECT,
not a file boundary.

A different campaign = a different folder (different theater, different war).
The splash's CAMPAIGN flow gains a campaign picker when a pack ships more than
one. `pack.json` lists them: `"campaigns": ["iron-triangle"]` (order = display
order, first = default).

## map.json — the campaign's ground

Today's `CAMPAIGN_THEATER` / `CAMPAIGN_SEED` / `CAMPAIGN_LAYOUT`
(engine/campaign.ts:18-70) verbatim, as data:

```json
{
  "theater": "chorwon",
  "seed": 1,
  "layout": {
    "window": { "ox": 256, "oy": 224 },
    "fob": { "gx": 128, "gy": 232 },
    "enemyBase": { "gx": 148, "gy": 18 },
    "towns": [ { "gx": 130, "gy": 170, "name": "ASHFORD", "size": 7 }, ... ],
    "msr": [0, 1, 2, 3, 4, 9],
    "features": [ { "gx": 44, "gy": 118, "kind": "dam", "name": "HANGYE DAM" }, ... ]
  }
}
```

`layout` is the existing `MapLayout` interface (world/mapgen.ts:27) — the
generator already accepts exactly this. **The town/feature names ARE the
gazetteer**: any mission in this campaign may reference them by name. Theater
ids stay engine assets for now (baked DEM patches are binary; a pack-shipped
theater is a later stage — note in HARDCODE-AUDIT).

## campaign.json — the manifest

```json
{
  "id": "iron-triangle",
  "name": "IRON TRIANGLE",
  "map": "map.json",
  "hqLabel": "CP GARRYOWEN",
  "airfieldLabel": "GARRYOWEN STRIP",
  "divHq": { "atFrac": { "x": 0.08, "y": 0.94 } },
  "anchors": { "strongpoint": { "query": "town-nearest", "to": "player-hq" } },
  "preAllocations": [
    { "asset": "CRAM", "formation": "2ABCT" },
    { "asset": "CRAM", "formation": "3ABCT" },
    { "asset": "SHADOW", "formation": "1ACB" },
    { "asset": "SENTINEL", "formation": "CORPS MAIN" }
  ],
  "mainline": ["lodgment"],
  "sideMissions": [
    { "mission": "side/idf-pot", "weight": 3, "cooldownS": 3600,
      "when": { "kind": "all", "of": [
        { "kind": "structure-exists", "struct": "FOB" },
        { "kind": "mainline-at-least", "index": 1 } ] } }
  ]
}
```

- `anchors` — named world points resolved ONCE at campaign start and stored
  (today's `pickAnchorTown` → `strongpoint`). Missions reference anchors and
  gazetteer names through the same place vocabulary.
- `mainline` — the operation spine, in order. Stage 1 keeps today's flat
  objective stream (missions concatenate); the **mission-instance model**
  (concurrent main + side missions, each with its own objectives/trigger
  state) is the stage-4 upgrade CampaignState is being shaped toward.
- `sideMissions` — the not-fully-scripted layer: eligibility predicate (same
  condition vocabulary), spawn weight, cooldown, all rolled on a paced clock
  through `S.rng`. An instanced side mission resolves its place QUERIES
  against the live world at spawn, then runs like any mission (FRAGO arrival;
  `optional: true` missions work like the division-convoy assist — favor rides
  on them, no penalty for declining).

## missions/*.json — one file per mission

```json
{
  "id": "lodgment",
  "name": "LODGMENT",
  "brief": "TASK FORCE, THIS IS HIGHER. ...",        // opener OPORD (M1) — or "frago" for follow-ons
  "objectives": [
    { "id": "clear", "label": "CLEAR OBJ KEATON", "kind": "clear-area",
      "zone": { "place": "strongpoint", "r": 420 } },
    { "id": "hold", "label": "DEFEAT THE COUNTERATTACK", "kind": "defeat-group",
      "groupTag": "REINFORCEMENT" }
  ],
  "triggers": [
    { "id": "h-hour", "when": { "kind": "objective-active", "objective": "clear" },
      "do": [
        { "kind": "set-allow", "field": true, "support": false, "drone": true },
        { "kind": "front-line", "place": "strongpoint", "offsetY": 500 },
        { "kind": "spawn-garrison", "at": { "place": "strongpoint", "offsetY": -80 },
          "units": ["INF"], "spreadX": 160, "strip": ["M_JAVELIN"],
          "contact": { "scatter": 380, "unknown": true } },
        { "kind": "place-force", "at": "player-hq", "radius": 260,
          "units": ["SCT", "MECH", "MECH", "MOR"] },
        { "kind": "set-roe", "type": "SCT", "roe": "break" },
        { "kind": "opfor-objective", "place": "strongpoint" },
        { "kind": "spawn-garrison", "at": { "place": "NORTH RAILHEAD", "offsetY": 90 },
          "units": ["MECH", "INF"], "spreadX": 140, "contact": { "scatter": 500, "unknown": true } },
        ...
      ] },
    { "id": "counterattack", "when": { "kind": "objective-active", "objective": "hold" },
      "do": [
        { "kind": "spawn-group", "tag": "REINFORCEMENT", "units": ["MECH", "INF"],
          "at": { "place": "strongpoint", "toward": "enemy-base", "range": 1300 } },
        { "kind": "radio", "from": "NET", "cat": "contact", "text": "COUNTERATTACK INBOUND — ...", "at": "spawned" },
        { "kind": "toast", "text": "COUNTERATTACK INBOUND" } ] },
    { "id": "shadow-release", "when": { "kind": "objective-complete", "objective": "hold" },
      "do": [ { "kind": "release-asset", "asset": "SHADOW", "formation": "1ACB",
                "radio": { "from": "DIV G3", "text": "1ACB RELEASES A SHADOW ORBIT — ..." } } ] }
  ],
  "tutorial": { "steps": [...], "reactive": [...] }   // see TUTORIAL below
}
```

`onActivate`/`onComplete` are GONE as code — they are triggers with
`objective-active` / `objective-complete` conditions, executed in declaration
order. `zone` params are place refs resolved at activation (today's late
`.zone =` assignment).

### Place vocabulary (spatial resolver — engine)

- `"place": "<NAME>"` — gazetteer name (town/feature) or campaign anchor
  (`strongpoint`). Fixed refs are legal ONLY because the campaign ships the map.
- Builtin anchors: `player-hq`, `enemy-base`, `div-hq`, `map-edge-south` (etc.),
  `spawned` (the previous spawn effect's point, for radio tags).
- Modifiers: `offsetX/offsetY` (m), `toward: <place> + range` (directional
  standoff — today's `reinforceFrom`), snapping (`nearest-land` always;
  `nearest-road` where today's code does).
- **Queries** (for side-mission templates + campaign anchors): `town-nearest`,
  `town-held-by`, `near/within`, `front-nearest`… resolved at instantiation,
  through the same resolver. Stage 1 needs only `town-nearest`.

### Condition vocabulary (stage-1 set)

`objective-active`, `objective-complete`, `mission-complete`,
`structure-exists`, `mainline-at-least`, `all`/`any`/`not`, `timer-since`
(stage 4: `casualties-above`, `contact-live-near`, `favor-at-least`, …).
Pure predicates over GameState, evaluated in the campaign tick.

### Effect vocabulary (stage-1 set)

`set-allow`, `front-line`, `spawn-garrison` (units + javelin-strip + seeded
stale contact w/ scatter), `place-force` (arc at anchor — today's
`placeForce`), `set-roe`, `opfor-objective`, `spawn-group` (tags + stamps
`eventT`), `deploy-column` (rear reinforcements entering at a map edge +
move orders — today's M2 ENG/LOG arrival), `name-structure`, `release-asset`
(conditional radio built in), `radio`, `toast`, `frago` (raise a tasking card
mid-stream — DIV HQ on the VTC; a mission's own `frago` block also drops
implicitly when the mission activates).
Every effect implementation is today's code lifted verbatim and parameterized —
that is what makes stage 1 golden-neutral.

## TUTORIAL — curriculum in the mission, machinery in the engine

The tutorial is mission content: each mission file may carry
`tutorial: { steps: [...], reactive: [...] }`. The splash toggle decides
whether it runs. The engine/UI ships the vocabulary:

- **UI conditions** (tutorial-only; sim triggers NEVER see UI state):
  `selected` (type/count), `mode-is`, `group-selected` (min line platoons),
  `drone-aloft`, `unit-past-distance`, plus the sim conditions above.
- **Anchor IDs** — the published `data-tut` set (`uas-raven`, `attack-mode`,
  `dig-in`, `roe-break`, `build-fob`, `supply-run`, + new `field-unit:<TYPE>`,
  `palette-section:<ID>`…) and map anchors (`unit-of-type`, `place`, a world
  box). A pack points at anchors by ID; new UI = new engine anchor.
- **Steps**: `{ id, gate?, done: <condition>, hints: [ { when?, text, action,
  anchor } ] }` — ordered hint variants, first matching `when` wins (replaces
  today's adaptive hint functions). `{place:NAME}` templates in text.
- **Reactive tips**: `{ id, when, hints, until, oneShot }` — today's BREAK
  drill lesson, as data. Mission 1's cold-start "build your first battle
  group" teaching lives here + in steps.

tutorial.tsx keeps the overlay/ring/callout/gating machinery and loses the
hardcoded TUTORIALS table.

## What moves out of engine code

- campaign.ts: `CAMPAIGN_THEATER/SEED/LAYOUT`, `OPERATION` (brief, objectives,
  FRAGO text, force lists, garrison comps, all `onActivate`/`onComplete`
  bodies), `pickAnchorTown`, CP/strip labels, preAllocate list, divHq frac.
- tutorial.tsx: the `TUTORIALS` step table + BREAK tip text.
- modes.ts campaign entry: reads the ACTIVE CAMPAIGN (pack + campaign id)
  instead of the exported constants.

Engine keeps: objective evaluation, trigger tick, effect/condition/query/
anchor registries, the overlay, and ALL sim behavior.

## Build stages (each gated, committed, HANDOFF'd)

1. **S1 — golden-neutral conversion** ✅ *(SHIPPED 2026-07-25)*:
   schema/types, 1cd `campaigns/iron-triangle/*` JSON encoding today's
   LODGMENT exactly, loader, engine executor (registries + resolver), campaign
   runner rewired. Gate PASSED: golden **3077619369 unchanged ×2**, campaign
   37/37, casualty 22, asset 32, pipeline 12, roster 8, phase3 14, campaign
   boots in-browser from the pack (opening VTC + deck verified). One deliberate
   delta: feature-name place refs resolve to the feature's true CENTER
   ((gx+0.5)·CELL); the old code used corner coords — a 25 m shift on the three
   theater garrisons, behaviorally invisible (battery green).
2. **S2 — mission-1 cold start** (the user's battle-group requirement): H-hour
   fields NOTHING (no pre-fielded M1_FORCE); the commander calls the force up
   from garrison and forms the first battle group. `place-force` drops out of
   lodgment.json's h-hour trigger; brief text updated. DELIBERATE golden
   re-baseline (world changes).
3. **S3 — tutorial-as-data**: engine vocabulary + overlay rewrite; lodgment
   curriculum rewritten for the CURRENT UI (palette fielding → battle group →
   scouts/Raven → attack → occupy → dig in) with the new cold-start steps.
4. **S4 — mission instances + side missions**: CampaignState mission-instance
   model (concurrent main/side), side-pool roller (weights/cooldowns through
   S.rng), place queries beyond `town-nearest`, first side mission
   (`idf-pot`). S3 console objective board shows instances.
5. **Later**: pack-shipped theaters (DEM patches), OPFOR campaigns, text
   templating beyond `{place:...}`.
