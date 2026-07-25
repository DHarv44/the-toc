# Game Modes — working doc / handoff

> Living document for the game-modes work. **Keep it updated as pieces land** —
> it's the pickup point if a fresh session (or a different model) takes over.
> Read ROADMAP.md → "Game Modes" for the product intent; this file is the
> implementation state.

## The design in one paragraph

**Modes own the ending.** A mode is a small data object (`ModeSpec` in
`engine/modes.ts`): id, splash label/sub, a per-tick `checkEnd(S) → 'won' |
'lost' | null`, and the end-screen text for each outcome. The shared framework
does everything else — `checkMatchEnd()` in `engine/SimLoop.ts` runs the active
mode's check right after the death phases, sets `S.won/S.lost`, captures
`S.endT`, freezes the sim (`S.speed = 0` — the time controls still work if the
player wants to watch the aftermath), toasts, and emits the `gameover` bus
event; `ui/EndScreen.tsx` renders the modal + after-action stats. Adding mode 2
or 3 should touch `modes.ts`, the scenario/spawning side, and nothing in the
framework.

## Status — updated 2026-07-23

- [x] `engine/modes.ts` — ModeSpec, MODES registry, `attack-defend` spec
      (win: no hostile HQ left; lose: no friendly HQ AND no FOB to convert).
      MODE_ORDER / DEFAULT_MODE drive the splash and initGame default.
- [x] `S.mode`, `S.endT`, `S.stats` (RunStats: fielded / lost / enemyDestroyed /
      supplySpent) in `engine/GameState.ts`; reset in `initGame`, which also
      takes `mode` as a 4th param and resets `S.speed = 1` (a previous match
      ends frozen).
- [x] `checkMatchEnd()` in SimLoop, placed after `structureDeaths()` in the
      frozen tick order. The old inline win/lose in
      `domains/installations/update.ts → structureDeaths` was REMOVED — that
      function now only handles wrecks/teardown.
- [x] Stat counters wired: `fielded` in `forces/factory.newUnit` (friend side);
      `lost`/`enemyDestroyed` in `forces/update` (unitDeaths + surrender);
      `supplySpent` at every purchase site (deployUnit/fieldUnit both pool and
      FOB-stock paths, deployStructure, convertToHq's 300, deployDrone,
      fireMission — friend side only). The free `startForce` counts as fielded
      but not as spent.
- [x] `ui/EndScreen.tsx` — EndScreenGate polls the 10 Hz tick; full-screen modal
      (splash visual language), StatCell grid, map-size + difficulty line,
      NEW GAME (→ App sets started=false → splash) and CONTINUE WATCHING
      (collapses to a reopenable "■ TITLE — REVIEW" pill at top-center).
      Mounted at the end of App's started layout, so it unmounts on NEW GAME
      and a fresh match gets a fresh gate.
- [x] Splash: three steps (MODE → MAP SIZE → DIFFICULTY), back-buttons between
      steps, Base Defense / Zone Capture rendered greyed as IN DEVELOPMENT,
      Dev Sandbox unchanged. `StartFn` gained the `gameMode` param, threaded
      through `App.begin` → `initGame`.
- [x] VERIFIED (2026-07-23): typecheck clean · golden baseline UNCHANGED at
      `1929051837`, deterministic (the framework refactor is behavior-neutral
      for normal play) · browser: 3-step splash (A&D + greyed future modes) →
      match started with mode/stats set (4 fielded from startForce, 0 spent) →
      red HQ death → won=true, endT captured, speed frozen to 0, OBJECTIVE
      SECURED modal with the stat grid and SMALL MAP · REGULAR line →
      CONTINUE WATCHING collapses to the REVIEW pill → pill reopens → NEW GAME
      returns to splash step 1. Zero console errors.

## Mode 2 — Base Defense (waves) · IMPLEMENTED v1 ✓ (2026-07-23)

- `S.waves: WaveState` (n / phase / interT / groupIds / survived / target 10),
  created by the mode's setup hook, which also freezes the economy: passive
  lifts AND upkeep off (`supplyUpdate` returns early while `S.waves` exists),
  OPFOR economy zeroed, `S.nextWave = Infinity` kills the A&D auto-spawner.
- Scripted escalation: hand-tuned `WAVE_COMPS` table (2×INF probe → combined
  arms → 4×ARM + CAV + ARTY at wave 10), launched through
  `spawnScriptedBattlegroup` — a new export in opfor/ai built on a shared
  `raiseGroup` extracted from `spawnBattlegroup` (rng draw order preserved;
  golden verified unchanged). No affordability/cap gates: the schedule IS the
  difficulty.
- Cycle: 90 s first delay → assault → wave repelled when none of its groups
  remain in `S.enemyGroups` (destroyed or withdrawn home) → payout
  (500 + 200n) + NET call + toast → 75 s intermission → next. If the OPFOR
  has no base left to launch from, the source is cut and the defense stands
  (instant win path).
- `checkEnd`: survived ≥ target → won; no friendly HQ and no FOB → lost.
- TopBar shows a WAVE n/10 stat (NEXT xxS / ASSAULT, teal/orange).
- VERIFIED in browser: economy frozen (resources flat through lifts), wave 1
  launched on schedule with the NET announcement, repelled → +700 payout →
  wave 2 inbound; final-wave clear → POSITION HELD end screen, honest stats,
  sim frozen. Golden UNCHANGED at `1929051837`; typecheck + console clean.
- Follow-ups (deliberate v1 cuts): a manual "READY" trigger to launch the
  next wave early (banked intermission time as bonus payout?); wave pacing —
  foot-heavy early waves take minutes to walk in on bigger maps (consider
  spawn-closer or transport-only comps for waves 1–2); difficulty scaling of
  the comp table (currently identical on Recruit and Elite — only the
  player-side levers differ).

## Mode 3 — Zone Capture · not started

Product spec in ROADMAP.md: zone lattice, capture-by-presence, frontline
progression. Needs zone state in `GameState`, a capture update phase in the
tick (respect the frozen order — add it explicitly in SimLoop with a comment),
map-gen or zone-placement logic, and map rendering for zone ownership.
`checkEnd`: line held/broken per the spec's scoring.

## Mode 4 — Campaign · SLICE v1 SHIPPED 2026-07-24 (M1+M2 playable end-to-end; more missions pending design)

Vertical slice built and browser-verified: the objective engine, the mission
runner, the brief/tracker/FRAGO UI, palette gating, and the first two missions —
all on one persistent world (no reset between missions). Golden UNCHANGED at
`2409198223` (campaign is a new tick path; the A&D golden scenario never touches it).

**Objective-stream restructure (2026-07-24, later the same day):** missions are
GONE as containers — the campaign is one `OPERATION` (name, opening brief, flat
`objectives: CampaignObjective[]`). Each objective carries its own `onActivate(S)`
(allocations, palette gates, OPFOR placement, phase-line move) and optionally a
`frago: {title, text}` card that drops at activation while the sim runs. The old
M1+M2 are now ONE fight: CLEAR THE TOWN → DEFEAT THE COUNTERATTACK → (FRAGO:
LINES OF SUPPLY) ESTABLISH THE FOB → OPEN THE SUPPLY LINE. `CampaignState.mission`
is gone (`objIdx`/`status` span the whole operation; `frago` is the card object);
`startMission` is gone (`activateObjective` is the only transition). The tracker
and the opening briefing hide not-yet-revealed taskings (`revealedEnd`: a
FRAGO-bearing objective is a reveal point). The tutorial is one continuous step
stream (`CAMPAIGN_STEPS`), no per-mission reset. `defeat-group` counts a group
in `phase === 'withdraw'` as BEATEN — a broken survivor running home no longer
stalls the objective. Reactive BREAK tip (one-shot, `tutBreakShown`): any line
platoon under 50% strength pauses and teaches select→BREAK, any time in the op.
Pre-battle INTEL: the COP opens with what a battalion would know — the enemy HQ
stays on the board as a KNOWN installation (structContacts), and the garrison is
seeded as a SUSPECTED stale contact with ~200 m templating error; scouts still
have to make it a live track.

**Packs P1 (2026-07-25):** factions are "Packs" (`src/packs/`) — a formation as
CONTENT referencing the shared base catalogs (physics lives once; packs are
organization + identity). `Pack {organic, attached}` per unit type with parent
battalion + lineage style ('plt'/'btry'/'hhc'); `lineageFor(pack, type, n)` and
a plain `S.counters.lineage` counter (rng-free, golden-safe; reset in initGame
AND startCampaign — the staged pre-campaign force must not burn slots). 1CD
pack: MECH=2-8 CAV, ARM=1-12 CAV, CAV=1-7 CAV, SCT/MOR=HHC 2-8 CAV,
ARTY=1-82 FA (btry), ENG=91 BEB, SIG=13 SIG BN, LOG=115 BSB; attachments
STRY=5-20 IN (2ID), INF/AT=1-506 IN (101 ABN). Unit gains `lineage`/`attFrom`
(tray chip + context menu show them; palette rows tag "ATT — <donor>").
COMMANDER box on the campaign screen → `CampaignState.commander` (the player IS
the TF CO; own "· YOU" tile on the VTC). P1 is organizational ONLY — golden
byte-identical at 2409198223. Roadmap: P2 billets/ranks/deterministic names/
troop card with rename + hash-seeded profile-pic factory + billet callsigns
("6"=CO convention); P2.5 strength inversion; P3 rear det + automatic
replacement pipeline (LTC's lever = who pulls back to refit); P4 DPRK-flavored
fictional enemy pack (campaign) + real-army packs for skirmish; then S-shop
views (S1 personnel, S4 log) on top.

**Map batch (2026-07-25):** BN HQ is named **CP GARRYOWEN** (campaign rename in
startCampaign). **DIV MAIN · 1CD** marker in the deep rear bottom-left
(`CampaignState.divHq`, drawn by MapView — inert, deliberately: higher HQ as a
place). Layout grew: **VALEMONT** (big city, NW — `size: 11` urban stamp via
`MapLayout.towns[].size`/`Town.stamp`), FALKE, GARWICK; the MSR is now AUTHORED
(`MapLayout.msr` node path promoted to highway — extra towns can no longer
reroute the trunk off the campaign spine). **Blue trace = CAPTURED ground
only**: the friendly flood has no assessed prior row — only real units,
installations and the owned entry edge (red keeps its assessment prior).
Edge-scroll pan REMOVED: the camera moves only on middle-drag or WASD.

**Packs P2 (2026-07-25):** PERSONNEL. Every soldier gets name/rank/position/
callsign at creation (`packs/personnel.ts::assignPersonnel`, called from
newUnit) — DETERMINISTIC (hashStr of unit id + soldier slot, zero rng draws,
digest-invisible; golden holds at 2409198223). Billets follow casualty order
(last LEADER = PL, second-last = PSG, others = Squad Leaders); leaderless
platoons (tanks/guns/trucks) put the PL in the first vehicle and PSG in the
last; crew seats map to TC/Gunner/Loader/Driver. Leadership callsigns:
`<label>-6` (PL) / `<label>-7` (PSG); the player is COBALT 6. LEADER counts in
COMPOSITIONS were topped up (riflemen⇄leaders — same M4, combat-identical) so
rifle platoons have real squad leaders. **S1 console** (`ui/S1Console.tsx`,
staff bar S1|S2|S3|S4 in the TopBar, S2-4 stubbed): a TREE-GRID over the task
org — TF → battalion slices (ATT badges) → platoons → vehicles/derived squads →
soldiers — with PERSTAT columns aggregated at every level; Mantine styling;
map's "PERSONNEL ROSTER…" jumps here expanded+scrolled; inline rename (commit
reads live input value); loadout chips (WPN_SHORT + ✚/💨/📻 kit glyphs).
`ui/portrait.tsx` = hash-seeded DA-photo portrait factory (KIA slash variant);
`ui/insignia.tsx` = pack-keyed patch ('1cd' shield) + rank insignia ('us'
chevrons/bars/leaves) — Pack gains `patch`/`rankStyle` ids so pack data stays
JSON-able. TEMP gallery at `/?insignia` (ui/InsigniaTest.tsx). Tutorial cues
hide while a console is open.

**COP two-line trace (2026-07-25):** the control field now yields BOTH lines —
`blue` (friendly forward trace, ctl=+CONTEST) and `red` (enemy trace,
ctl=−CONTEST) with UNCONTESTED ground between; the wash only paints beyond the
red line. HQs/FOBs are strong influence anchors, so standing up FOB KEATON
visibly pushes the blue line out. VTCs now PAUSE the sim while open (restoring
the player's chosen speed on close).

**Naming (2026-07-24):** the objective town (ASHFORD) is designated **OBJ
KEATON**; the FOB built there is **FOB KEATON** (structure label stamped by the
build objective's `onComplete`). Pre-battle town intel is UNKNOWN contacts —
`Contact.unknown` renders a "?" glyph (`unk` UnitGlyph) until actually spotted.
Faction note: the player force will be **1st Cavalry Division** (units 1CD
doesn't organically have = attachments from other divisions) — formal faction
types are a future design discussion, only the VTC CG plate says 1CD so far.

**DIV VTC (2026-07-24, v2 same day):** orders arrive over a mock SECURE VTC
(`ui/Vtc.tsx`) — the CG's "camera" (silhouette + scanlines + speaking bars) with
the task force's platoon leaders as ATTENDEE tiles (callsigns, mic-muted) below,
beside a staff POWERPOINT DECK rendered live from world state. THREE slides for
this operation (◀ ▶ nav, SLIDE n/3): CLEAR <town> (axis arrow, OBJ ellipse,
suspected contacts, FLOT), DEFEND <town> (BP arc facing north, red CATK arrow,
hold-until-FOB tasks), BUILD FOB (dashed MSR supply route, FOB symbol). Slides
carry only what a staff slide would: map inset + a handful of task fragments,
SECRET//NOFORN strip (fictional), DTG. The opening OPORD is the first VTC
(blocking, `VtcOpener`, sim held until ACKNOWLEDGE); FRAGOs are non-blocking
(`VtcFrago`, END CALL — LINES OF SUPPLY opens on slide 3) — the world runs while
higher talks. Voice: `radioBrief` in audio/audio.ts — the net-chatter syllable
engine at conference grade (deep command register, VARIED cadence: word
emphasis stretches/lifts, syllables fall through words, phrase breaks every few
words, sentence-final pitch drop; ~22 s cap; the tactical net yields while the
CG is on). Header VOICE ON/OFF mutes the briefing voice (setBriefMuted /
stopBrief cuts a call mid-sentence; preference persists). Every order lands in
`CampaignState.fragoLog` (serializable) and is recallable from the tracker's
ORDERS row (`recallFrago`) — the deck redraws from CURRENT world state on replay.

**Continuous-campaign rework (2026-07-24, same day as slice v1):**
- **Authored map layout** — `MapLayout` in `world/mapgen.ts` (campaign passes
  `CAMPAIGN_LAYOUT`, skirmish passes nothing and stays byte-identical): pins the
  chorwon theater window `{ox:256, oy:224}` (SE quadrant — southern valley, the
  HILL 894 ridge east, major river system mid-map, opening north to the plain)
  plus designed towns/bases. The town chain IS the campaign spine, south→north:
  HQ → **ASHFORD** (M1/M2) → **BREVIK** (river junction) → **CALDER** → **DORAN**
  → enemy base; **ELMSTED** hangs west as a flank objective. Roads (MST + trunk
  MSR), hamlets and named features still generate procedurally from those nodes.
  `snapSite` clamps+snaps authored cells to buildable ground (a layout authored
  for Large also can't emit out-of-bounds cells on a smaller grid).
- **Spacing math** (see the CAMPAIGN_LAYOUT comment): ASHFORD is 3.1 km up the
  MSR — ~4× the garrison's 800 m sight/weapon envelope, and the MSR bridge sits
  1.35 km short of town so the approach column crosses UNOBSERVED. Garrison
  spawns on the town's NORTH side (away from the bridge). Later bounds run
  1.8–2.7 km. Mounted speeds make each bound a 2–3 min move at 1×; the whole M1
  arc lands in the target 5–10 real minutes.
- **No more mission windows or breaks**: AO crops deleted (`CampaignState.ao`
  gone, MapView clamps to the full world; camera opens on the HQ). Mission
  transitions never pause — `startMission(n>1)` drops a **FRAGO** (radio + toast
  + non-blocking amber card beside the tracker, `ackFrago` dismisses). The only
  modal left is the campaign-opening briefing; the only pauses left are tutorial
  gates (which now restore the player's chosen speed instead of stomping to 1×).
- **Reinforcements arrive in-world**: M2's ENG+LOG spawn at the south map edge
  and drive themselves to an HQ rendezvous (`orderMove` at setup).
- **FLOT + territory overlay** (`engine/frontline.ts`): 64² influence field —
  friendly = real units/structures, enemy = KNOWN intel (contacts incl. stale,
  spotted structures) + the authored phase line `CampaignState.frontY` (each
  mission's optional `frontY(S)` rolls it forward; M1 = town assessed enemy,
  M2 = line north of the town). Marching-squares zero contour = dashed red FLOT;
  negative cells = red wash (drawn in MapView above roads, below grids).
  Recomputes every 4 sim-seconds, cached per map.
- **Drone-feed hillshade**: NW-light shade baked into the feed ground texture
  (EO full strength, IR at 60%) so relief reads from the air.
- **Edge-pan fix**: edge-scroll requires the cursor to have actually been seen
  inside the canvas (`mouse` starts at (-1,-1); window-level mousemove means a
  cursor parked over the rails used to read as "in the edge band" and pan away).

**What's built:**
- `engine/campaign.ts` — the campaign runtime. Objectives are DATA (an
  `ObjectiveSpec` = `kind` + flat params), evaluated by the pure `evalObjective`
  switch, so `CampaignState` stays fully serializable for the deferred Save/Continue.
  Four verbs live so far (of the six-verb vocabulary): `clear-area`, `defeat-group`,
  `build`, `deliver`. A `Mission` is `{ brief, objectives[], setup(S), onObjComplete? }`;
  `MISSIONS` holds M1+M2. Runner: `startCampaign` builds the world once + starts M1;
  `startMission` overlays a mission (allocations, palette gates, OPFOR placement)
  on the LIVE state; `runCampaign` (mode `update`) advances objectives and rolls
  straight into the next mission's FRAGO without ever freezing/resetting;
  `ackBriefing` / `ackFrago` are the UI hooks. `campaignAllows(kind)` is the palette gate.
- `campaign` is a real `ModeId` in `engine/modes.ts` (setup/update/checkEnd only —
  checkEnd fires for the WHOLE campaign: `complete` → won, HQ+FOB floor → lost).
- OPFOR steering: `groupObjective` honours `S.campaign.opforObj`; `spawnCampaignGroup`
  (opfor/ai) musters a scripted group at a given point (near the fight, not the far base).
- Palette gating wired at the order entry points (deployUnit/fieldUnit/deployStructure
  under `field`, fireMission under `support` — OPFOR never gated, deployDrone under
  `drone`). The campaign's own free placements bypass the gate.
- UI (`ui/CampaignHUD.tsx`, mounted in App): opening-briefing modal (ACKNOWLEDGE,
  holds the sim at speed 0 — mission 1 only), persistent objectives tracker (status
  glyphs + live progress), and the non-blocking amber `FragoCard` for every later
  mission. Campaign victory routes through EndScreen.
- Splash: CAMPAIGN is a live entry → a difficulty pick → launch. The campaign is
  ALWAYS the same ground: `App.begin` forces the baked **Chorwon Valley** theater
  (the Iron Triangle — added to `tools/bake-theaters.mjs` + `theaterIndex.ts`, asset
  `public/theaters/chorwon.bin`), **Large** size, and a **fixed seed** (`CAMPAIGN_SEED`
  / `CAMPAIGN_THEATER` in campaign.ts) plus the authored `CAMPAIGN_LAYOUT`
  (window/towns/bases — see the continuous-campaign rework above) → an identical,
  hand-DESIGNED map every playthrough, with the real hydrology and relief of the
  Chorwon SE quadrant under it.
- ~~Per-mission AO crop~~ REMOVED in the continuous-campaign rework (see above):
  the whole theater is the playfield from minute one; the FLOT overlay carries the
  "where is the war" signal the crops used to.
- **Guided tutorial** (splash CAMPAIGN screen has a GUIDED TUTORIAL checkbox, default on →
  `CampaignState.tutorial`/`tutStep`; step DEFINITIONS + rendering live in `ui/tutorial.tsx`,
  engine stores only the two plain fields). Each step has a sim-observable `done(S)` and an
  adaptive `hint(S, ui)`; a `<TutorialOverlay>` draws a slow-pulsing ring over the target —
  a `data-tut` rail/menu item OR a **unit on the map** (`targetUnit`, world→screen via
  `__view` + the map canvas rect) OR a **map point** (`targetPoint`, e.g. a move
  destination snapped to a road) — plus a pointer callout to the right, with a SKIP escape.
  `done(S, ui)` can read selection. **Gated** steps pause the sim (speed 0) until done, then
  resume. Hint format (2026-07-24): every hint is `text` (the WHY — context only, no
  action verbs) + `action` (the DO — one imperative line rendered standout in amber at
  the callout's bottom, e.g. "▶ LEFT-CLICK your recon platoon."); the ring pulses
  YELLOW→RED (`RING_A`/`RING_B`), matching the action line's color. M1 (9 steps, recon-screen flow — reworked 2026-07-24 with the tuned garrison):
  (1) SCOUTS LEAD — teaches that the garrison is CONCEALED and the scouts are pre-set to
  BREAK (M1 setup sets the SCT's ROE); done on selecting the recon platoon; (2) SCREEN
  FORWARD — standoff marker ~650 m short of the garrison (inside scout spotting range
  through urban concealment, OUTSIDE the garrison's 550 m trigger); cue clears on the
  order, completes at ½ klick from the HQ; (3) gated LAUNCH THE RAVEN (⊕ on the Raven
  row); (4) silent hold until contact; (5) gated GROUP UP — the lead line narrates
  whichever way contact came: clean standoff spot, or "AMBUSH SPRUNG" + the scouts'
  automatic break-contact if the player strayed inside the trigger range (reads
  sct.breaking/underFireT); (6) gated ATTACK — set ATTACK posture, right-click the
  spotted enemy; (7) silent hold until cleared; (8) TAKE THE TOWN ON LINE — teaches the
  formation drag (RIGHT-click-DRAG a line across the town); completion is OUTCOME-based:
  every surviving platoon inside the town AND spread ≥100 m pairwise — a player who
  stacks them gets a SPREAD OUT nudge ("one shell can catch a bunched-up position");
  (9) gated DIG IN before the counterattack — only positions dug IN the town count.
  The M1 briefing sells the same story
  (concealed garrison · scouts screen · FIND THEM). **M2 (3 steps, all click-verified):**
  (1) BRING UP THE SUSTAINMENT — the WAYPOINT lesson: right-click a highlighted ROAD
  point first (roads are faster), then the cue flips to SHIFT+RIGHT-click the town to
  queue the final waypoint (a player who routes direct skips the lesson without nagging);
  (2) gated ESTABLISH THE FOB — select the engineer → ringed Forward Op Base palette row
  (`data-tut="build-fob"`) → click a spot in the town (adaptive: catches wrong-row
  clicks); (3) gated OPEN THE SUPPLY LINE — select the LOG → ringed SUPPLY RUN tray
  button (`data-tut="supply-run"`) → click the FOB. Curriculum front-loaded to be
  empty by M4 (M3 steps land with M3's design).
- **Organic UAS is one-click** (`fieldUnitDrone` in air/orders): a carrying unit's Raven
  launches over the unit via the ⊕ button (like the aerostat at a site) — no map
  placement — capped 1 per unit, so the palette row reads 0/1 → 1/1 and disables.

**The two missions (as designed with the user, 2026-07-24):**
- **M1 — LODGMENT (CLEAR & HOLD):** fixed force (MECH/INF/INF/SCT), no fielding, no
  fires, organic drones only; small supply. `clear-area` the town garrison (2× INF) →
  `defeat-group` the scripted counterattack (spawned on clear, advances on the town).
- **M2 — LINES OF SUPPLY (SET UP THE FOB):** M1 force PERSISTS in the town; allocation
  from higher (+supply, +ENG, +LOG, limited fielding unlocked). `build` a FOB in the
  town → `deliver` 200 supply to it via a supply run.

**Headless harness:** `.tmp-mig/campaign-check.entry.mjs` (esbuild → run in Node) —
25/25 assertions covering the full chain. Rebuild with the same esbuild pattern as the
other checks.

**Still open (design first, then build):** missions 3–7 (EYES FORWARD, SEIZE THE
CROSSING, BREAK THE BELT, DEEP OPERATIONS, and whatever the operation's end-state is —
the user explicitly dropped the "march to the enemy HQ" framing). Verbs those will
add: `hold-for-time`, `recon-%`, `seize-area`. Also deferred: Save/Continue (state is
built serializable for it), the front-sag failure model (slice has no hard per-mission
fail — you lose only on the HQ+FOB floor), the full FRAGO/allocation UI, and a proper
campaign map recipe (river belt + crossings) once the crossing missions need it.

**Decided meanwhile (still current):** main menu is **CAMPAIGN / SKIRMISH / DEV
SANDBOX**; the player is a **battalion commander**; the campaign is one battalion's war
with an NPC higher-HQ voice (briefings + NET traffic today). Zone Capture stays parked
pending a layout/win-condition design pass.

## Mode 5 — King of the Hill · IMPLEMENTED ✓ (2026-07-23)

Second playable mode, built to prove the framework generalizes:
- `S.hill: HillState` (zone + per-side control clocks + target 360 s) — created
  by the mode's `setup` hook; `ModeSpec` gained optional `setup(S)` and
  `update(S, dt)` hooks, called from initGame and the tick's frozen order
  (right before checkEnd) respectively.
- Hill picker: highest non-water cell in the central third of the elevation
  raster; radius 350 m.
- Control by presence: uncontested friendlies run your clock, hostiles theirs,
  contested/empty runs nobody's. `checkEnd`: first to target wins; the A&D
  structure-wipe defeat is kept as a floor (no HQ + no FOB = can't field).
- OPFOR: `enemyObjective` returns the hill when `S.hill` exists — battlegroups
  fight for the objective instead of marching on the player's bases (modes
  steer the AI through state, not new AI code).
- MapView renders the zone (holder-tinted ring + HELD/ENEMY HELD/CONTESTED
  label + both clocks); splash entry moved from COMING_SOON to MODE_ORDER.
- VERIFIED in browser: splash → KotH small/regular → hill on 103 m central
  high ground, clocks accrue with presence, OPFOR objective == hill, dug-in
  defense beat the push, clock ran out → OBJECTIVE HELD end screen with mode
  label + honest stats. Golden baseline UNCHANGED at `1929051837` (A&D path
  untouched; hill is null outside KotH).

## Mode 6 — Spec Ops Missions · not started

Small fixed force (no economy/fielding — gate the palette off), one objective
per run, night by default, stealth via the existing detection systems
(concealment, earshot/DF). Mission templates: HVT RAID / SENSOR SMASH / CSAR /
CLOSE RECON (no-detection scoring). OPFOR alert-state machine (quiet →
searching → alerted) with QRF battlegroups hunting the last known position —
machinery that *Symmetric Fog* will want in the big modes anyway. Win =
objective + exfil zone. Full sketch in ROADMAP.md → Game Modes → 6.

## Mode 7 — Skirmish (player-built scenarios) · not started

The Scenario Builder (ROADMAP → UI & Tools) played as a mode: placements + a
`ModeSpec` reference + parameters, serialized to JSON, listed on the splash.
Victory condition picked from the objective-spec library. Build order: mode
framework (done) → builder → skirmish wrapper. Full sketch in ROADMAP.md →
Game Modes → 7.

## Rules of the road (apply to all mode work)

- `npm run typecheck` clean after every unit of work.
- Golden gate: `?golden` page → `__golden()`, or headless via esbuild-bundling
  `src/devtools/golden.ts` + `newGame.ts` into a Node runner (see MIGRATION.md).
  Baseline `2409198223` (re-baselined 2026-07-24 for FORCE-MODEL Phase 3 —
  derived combat + munitions; full history in MIGRATION.md — older hashes
  referenced above predate it).
  Behavioral changes to the A&D tick path require a
  deliberate re-baseline (run twice, confirm deterministic, update MIGRATION.md
  + this file).
- The tick order in SimLoop is FROZEN — new phases get an explicit slot and
  comment, never inline inserts in other phases.
- Sim is fully seeded through `S.rng` — no `Math.random` in sim code (guarded
  pre-init fallbacks only).
- Entities/state are plain typed data; UI mutates only via order functions;
  modes read S in `checkEnd` but mutate only via the framework.
- Verify through the real UI where input handling is involved (synthetic
  MouseEvents on the map canvas work well — see the playtest pattern in the
  session notes; the biggest canvas in the DOM is the map, the small ones are
  palette icons; React batches, so DOM queries need a separate eval after a
  state change).
