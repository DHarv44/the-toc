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

## Mode 4 — Campaign · PAUSED 2026-07-23 (state scaffolding landed; resumes after the Maps & Terrain overhaul)

Status: `CampaignState` + `S.campaign` exist in `engine/GameState.ts` (reset in
initGame); nothing else is built. Paused per user direction — the map system gets
nailed down first (ROADMAP → Maps & Terrain: real-DEM theaters, cartography,
named features, mode recipes), because the campaign wants a guaranteed map shape
(river belt + crossings) and named terrain for briefings. Also decided meanwhile:
main menu becomes **CAMPAIGN / SKIRMISH / DEV SANDBOX** (Skirmish wraps the mode
chooser = MODE_ORDER + coming-soon entries), and the game's identity was settled:
the player is a **battalion commander** — the campaign is one battalion's war
through a division operation, with an NPC higher-HQ character issuing FRAGOs and
allocations (ROADMAP → Design Laws + C2 & Echelon). Zone Capture is parked
pending a layout/win-condition design discussion.

**One Large map, one long war** — a continuous operation fought as sequential
missions on the SAME persistent map (nothing resets: front line, units, FOBs,
bridges, wrecks, contacts). Seven-mission arc designed in ROADMAP.md → Game
Modes → 4. Campaign: LODGMENT (capture/defend/stronghold) → LINES OF SUPPLY
(build a FOB + convoy) → EYES FORWARD (ISR the belt) → SEIZE THE CROSSING →
BREAK THE BELT → DEEP OPERATIONS → THE OBJECTIVE. Framework fit: missions
generalize `checkEnd` into **objective specs** (hold-for-time / build-X /
deliver-N / recon-% / seize-area / destroy-set) run sequentially over
persistent state, with scripted OPFOR posture per phase; failing a mission
sags the front rather than ending the campaign. Hard prerequisite:
*Save / Continue*. RunStats becomes the campaign ledger. Greyed entry already
on the splash.

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
  Baseline `4056482884` (re-baselined 2026-07-24 for the AI decision layer
  phase 1; full history in MIGRATION.md — older hashes referenced above
  predate it). Behavioral changes to the A&D tick path require a
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
