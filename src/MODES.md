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

## Mode 2 — Base Defense (waves) · not started

Product spec in ROADMAP.md. Implementation sketch against this framework:
- New `ModeId 'waves'` + spec. `checkEnd`: lose = friendly HQ gone (no FOB
  recovery? decide), win = none (endless) or wave target reached.
- Init hook needs to exist — today `initGame` is A&D-shaped (spawns garrisons +
  starts `S.nextWave`). Suggest extending ModeSpec with a
  `setup(S)`/scenario-variant hook rather than branching initGame inline.
- Economy: gate the passive lift off (`S.supplyLift = 0`), grant a banked
  payout between waves; wave schedule replaces `S.nextWave`'s flat timer —
  reuse `spawnBattlegroup` with a scaling template/count curve.
- Between-wave intermission + "ready" trigger; wave counter in `S` (digest-
  relevant: re-baseline golden if the A&D path is touched at all).

## Mode 3 — Zone Capture · not started

Product spec in ROADMAP.md: zone lattice, capture-by-presence, frontline
progression. Needs zone state in `GameState`, a capture update phase in the
tick (respect the frozen order — add it explicitly in SimLoop with a comment),
map-gen or zone-placement logic, and map rendering for zone ownership.
`checkEnd`: line held/broken per the spec's scoring.

## Mode 4 — Campaign · not started (build after 2–3)

Linked operations: a theatre of sectors, each mission played as one of the other
modes with the force carrying over between missions. Full product sketch in
ROADMAP.md → Game Modes → 4. Campaign. Framework fit: a campaign layer that
picks a `ModeSpec` + setup per mission and serializes carry-over state — leans
on *Save / Continue* (persistent JSON state) and consumes the RunStats ledger
this framework already accumulates. Greyed entry already on the splash.

## Rules of the road (apply to all mode work)

- `npm run typecheck` clean after every unit of work.
- Golden gate: `?golden` page → `__golden()`, or headless via esbuild-bundling
  `src/devtools/golden.ts` + `newGame.ts` into a Node runner (see MIGRATION.md).
  Baseline `1929051837`. Behavioral changes to the A&D tick path require a
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
