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

## Dogfood findings — TRAINING DAY authored via UI (2026-08-02)

Built `1cd/scenarios/training-day` (type campaign, Baghdad) end-to-end through
the builder as a scenario author: situation (CP LONGKNIFE + strip, known
enemy HQ, two dug-in SUSPECTED garrison platoons, OBJ KHADRA zone), one
mission (4 objectives scout/clear/hold/fob, h-hour + counterattack triggers,
teaching brief). The loop works. What it surfaced, by severity:

1. **[FIXED] Mission rename crashed the app** — ev.currentTarget read inside
   a setState updater; first keystroke = white screen. Also: no React error
   boundary, so ANY component crash blanks the whole tool.
2. **No draft protection** — everything between saves dies with a crash or
   reload. CREATE should write the file immediately; add an autosave or at
   least a beforeunload warning.
3. **Armed placement tool never disarms** — every stray click stamps another
   entity (duplicated an enemy HQ against the panel edge). Want: visible
   armed-state indicator + Esc hint; consider one-shot placement for
   installations.
4. **Control measures are invisible on light terrain** — amber zone ring and
   diamond disappear against tan ground. Needs a dark outline halo.
5. **No situation roster** — no list of what's placed; auditing attributes
   means pixel-hunting symbols and clicking blind. A roster panel (rows =
   entities, click = select/center) fixes orientation, auditing, and dense
   overlaps at once.
6. **Objective KIND change wipes params** already entered (zone place/radius).
   Preserve compatible fields across kind switches.
7. **Effect authoring friction** — every new effect defaults to 'radio', so
   most effects need a trip through a 13-item scrolling dropdown; add-buttons
   sit flush against checkboxes (misclicked ALLOW DRONES for ＋ EFFECT).
   Frequency-order the kinds, space the buttons.
8. **Save feedback is a blip** — a small header message; no dirty indicator,
   no saved-state on the button. (One save silently missed = author left
   believing work was saved.)
9. **Trigger-spawned units are invisible** — the counterattack exists only as
   a form; the planned ghost overlay (render spawn effects + zones spatially
   per mission) is the fix, and PLAY is the real proof.
10. **Tutorial curriculum is not authorable** — by design the step overlay is
    hand-written JSON; the brief carries the teaching for now. Fine short-term,
    worth revisiting when the tutorial format stabilizes.

## TASK ORG — phase 1 (2026-08-02, shipped)

**The pack ships a real division; the scenario now speaks it.** Settled with
the user: **COMMAND DERIVES FROM TASK ORGANIZATION** — there is no player/AI
flag anywhere. The battalion you command plus anything ATTACHED to you for
this operation is yours to order; every other friendly formation is a
neighbour on your map fighting its own fight.

- `ScenarioSpec.player` — the CHAIR. Campaign: script (the author says who
  you are). Skirmish: the default, and the player may take another playable
  battalion at launch; the task org re-derives around whoever sits down.
- `ScenarioStructure.formation` / `ScenarioUnit.formation` — the owning
  formation, picked from the pack's org (division / brigade / battalion),
  never free text. Absent = the player's own command.
- `ScenarioUnit.attached` — task-organized to the player (the pack's own
  attachment concept, authored per scenario).
- `ScenarioStructure.assets` — division enablers sited at an installation at
  H-hour, with quantities, emplaced through the same path a delivered asset
  uses. **Difficulty never scales authored quantities** (the OPORD litmus).

Mechanically: a sister formation's platoon draws ITS OWN battalion's org
slot — real people, real lineage — via `drawSlotIn`, never the player's task
force. `tf` marking is built around the chair, so `buildDivisionOrg` takes it
as a parameter. Command is one predicate (`domains/forces/command.ts`) used
by the FORCES rail, map selection, CALL UP's base list and the force cap.
Phase 1 neighbours hold where placed and defend themselves; making them
MANOEUVRE is the friendly-commander AI (phase 2, after the PLAY loop).

**The OPORD litmus** for future "should this be configurable?" questions: the
scenario file is the OPORD plus task org — task organization, attachments,
asset allocation, supply posture, control measures, the mission, who
commands = scenario data. Player preference and engine physics = not.

Killed: the `'2-8 CAV'` fallback literal in engine/campaign.ts (hardcode
audit). Deferred: hostile formations (waits for the OPFOR pack's org, P4).

## THE BRIEFING DECK — generated (2026-08-03, shipped)

**A deck is a RENDERING of the operation, not a written list of pages.** The
old `OPERATION_DECK` was a three-slide const with `OBJ KEATON` typed into it
and `S.campaign.strongpoint` read directly, so any scenario with different
objectives got a briefing about ground it was not fighting for.

`operationDeck()` now builds one page per objective from
`operation().objectives`:

- **A kind→graphic registry** (`OBJ_GRAPHICS` in ui/deck.tsx) — one entry per
  objective verb, each bringing its own operational graphic and its own TASKS
  lines. That is the extension point: a new verb ships its slide beside the
  rule that evaluates it, and every scenario using it gets a briefing page for
  free.
- **Geometry from `objectiveFocus()`** (engine/campaign.ts), not `obj.zone` —
  it answers for objectives the stream has NOT reached, resolving the same
  spec activation will. Each verb knows where it lives: a zone-bearing task is
  its zone, a defeat task is where that group actually is, a delivery is the
  forward base it stocks — or, before that base exists, the site the
  operation's own BUILD phase says will build it. Null = not knowable yet, and
  the page falls back rather than guessing.
- **Bullets are GENERATED** from the objective's parameters (radius, amount,
  structure, group tag, contacts currently held, compass bearing to the
  enemy's base). An optional authored `MissionObjective.notes` overrides them.
  Generated by default because a stale bullet on a briefing slide is a real
  failure mode and a generated line is always true; authored words are there
  for the phase that needs saying differently, and are the author's to
  maintain (the builder's field says so).
- **`revealedEnd()` moved into engine/campaign.ts** — the tracker and the deck
  now share ONE reveal rule, so a slide can never brief a tasking the board is
  still hiding.

Also killed while in there: `townName()`'s `'THE TOWN'` fallback (a slide that
cannot name its ground gives a grid reference instead), the fixed-pixel
objective ellipse (rings draw at their real radius now, dashed while the task
is still an assumption), the hardcoded north-facing counterattack (BP arc and
CATK arrow derive from the bearing to the enemy base, as does the bullet that
warns about it), and `S.map.fob` as "the HQ" (`playerHq()` uses the command
post you actually COMMAND — task org again).

## Decisions log

- 2026-08-04 · a TUTORIAL is BESPOKE to its mission, and stays a SECTION of it
  (user). Not portable content with its own identity: a curriculum teaches
  *this* operation, on *this* ground, with *this* army's platforms — its
  conditions and anchors name pack nouns (`SCT`, `field-MECH`) and scenario
  places, so "the basic command tutorial" cannot be lifted onto another
  mission without rewriting most of it anyway. Consequences: it travels with
  its mission through PORT (correct — the lessons belong to it), the builder
  edits it in place beside objectives and triggers, and PORT warns when a
  curriculum lands in a scenario whose BLUFOR is a different army, because
  every type it names has just become wrong.
- 2026-08-03 · briefing slides are GENERATED from objectives; authored `notes`
  override but do not follow an edited objective. Generated-by-default because
  a stale briefing line is worse than a plain one.
- 2026-08-02 · command DERIVES from task org — no player/AI flag (user).
- 2026-08-02 · difficulty never scales authored asset quantities; if ever
  needed the escape hatch is a per-entry flag, not a global coupling.
- 2026-08-02 · a unit's owning battalion is `Unit.bn` in the sim (matching
  `OrgSlot.bn`) because `Unit.formation` already means the TACTICAL
  formation; the author-facing scenario field stays `formation`.
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
