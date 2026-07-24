# TypeScript Migration — status

> **FINISHED.** The old JS `src/` was deleted and `src-new/` renamed to `src/`
> (this document's `src-new` paths are historical). Remaining optional cleanup
> is listed at the bottom.

Old `src/` stays untouched and keeps running the game until Wave 6 cutover.
`npm run typecheck` must stay clean after every migrated module.

## Behavior gate
Open `http://localhost:5187/?golden` →
- `__golden()` — scripted 10-min scenario against the old sim
- `__goldenNew()` — same script against `window.__newGame` (once the new sim exists)
- `__goldenDiff()` — both, digest equality

**Baseline digest hash: `4056482884`** — deterministic across back-to-back runs.
(Re-baselined 2026-07-24 for the commander decision layer phase 1: battlegroups
with indirect members now call fire missions — HE prep, smoke screens — and dig
in on taken ground, all through the shared player-legal order functions;
fireMission became side-aware (OPFOR pays from S.enemyResources, toasts stay
player-only). Prior baselines: `1377301839` water discipline · `60356280` road
hierarchy · `1929051837` playtest fixes · `4133144527` rng seeding ·
`696495692` JS-parity cutover.)
(History: `696495692` matched the old JS sim bit-for-bit at cutover; `4133144527`
after the S.rng seeding cleanup; `1929051837` after the playtest fixes —
break-drill resume, fire-mission route hold, firing-state reset, detour advisory;
current value after the road-hierarchy rework — highway/road/path classes with
per-class move factors, Chaikin-smoothed vector polylines stamped to the raster,
extra dirt-path links, paths barred from water. Deliberate map-network change.)
The harness seeds `Math.random` globally; the four raw `Math.random()` sim sites
(surrender, gunship bursts/dispersion, radio closings, formSeed fallback) are ported
verbatim so old and new consume the identical sequence. Re-routing them through `S.rng`
is post-migration cleanup, not part of the port.

## Waves
- [x] **0** tooling: typescript+types (pinned to runtime majors), strict tsconfig,
      `typecheck` script, golden harness (`devtools/`), `?golden` loader in index.html
- [x] **1** leaves: `engine/rng` ✓ · **world/ ✓ VERIFIED** (`WorldMap` types, `mobility`
      — MOVE_FACTORS moved here so domains→world, never reverse — `minheap`, `mapgen`,
      `pathfinding`). Parity proven in Node via esbuild bundle: mapgen raster-identical
      (elev/terr/road/waterSurf/slope/towns/bases) on 4 seed×size combos; findPath
      waypoint-identical on 6 cases covering all route modes.
      **catalogs ✓ VERIFIED**: `forces/catalog` (UNIT_TYPES + COVER_DEF; CarriedUasKey
      literal union keeps forces upstream of air, air statically asserts it),
      `air/catalog` (DRONE_TYPES, gunship weapons discriminated on kind gun/howitzer),
      `installations/catalog` (STRUCTURES), `economy/difficulty` (type-only import of
      UnitTypeKey — no runtime dep). Value-parity proven in Node (deep-eq incl.
      Infinity endurance): all 10 exported tables identical + fieldCooldownFor on 13
      costs. `lib/format` (grid/fmtClock/fmtCooldown) + `lib/math` (clamp/hashStr/
      hash01) — verbatim one-liners lifted from sim.js/styles.js/audio.js/DroneView;
      old copies stay until their consumers migrate (waves 3-5).
- [~] **2** `engine/GameState` ✓ (full entity inventory from a complete sim.js re-read:
      Unit incl. late-added underFireT/threatX/colWait/bgGroup/surrenderRolled ·
      Structure · Drone incl. gunship/aerostat fields · Shell/GunRound/Impact/Smoke/
      Wreck · Contact · NetEntry/Toast · Battlegroup. Counters nextId/designators/
      groupSeq move INTO state — flagged deviation; in-run behavior identical, fixes
      HMR counter reset. createInitialState() mirrors the old literal defaults.
      Type-only imports of catalog keys/WorldMap — no runtime layering violation) ·
      `engine/events` ✓ (RadioTraffic/Toast/GameOver typed bus; radio payload =
      radioMsg(full, callsign, priority); NOT a general message bus).
      `engine/scenario` MOVED after wave 3: initGame calls domain behavior
      (addStructure/deployUnit/spawnEnemy/orderMove) that doesn't exist yet.
- [~] **3** domains: **comms ✓** (radio/netRadio/toast; radioMsg call replaced by bus
      emit; Math.random closing kept verbatim for golden parity) · **economy ✓**
      (SUPPLY_INTERVAL/UPKEEP_DIVISOR, upkeepPerMin, templateCost, forceCount/forceCap,
      unitAvailability, stampFieldCooldown, incomePerMin) · **air: availability ✓**
      (airAvailability/endSortie). Also: `engine/state.ts` — the S+bus singletons,
      HMR-stashed on NEW keys (__WOD2_*) so old+new sims coexist under ?golden;
      singleton pattern deliberately retained (flagged). Catalogs now export the
      literal table viewed through their interface (Record<Key, Type>) so
      generic-key access sees optional fields.
      **forces ✓** (world/place clampWorld+nearestLand w/ map param · elements —
      effStats cache moved off the catalog into a module Map, flagged, same outputs ·
      factory newUnit/spawnEnemy on S.counters · orders incl. column orderGroupMove) ·
      **intel ✓** (sensing.ts: concealment/unitSees/isVisibleToFriendlies/findSpotter/
      revealContact/updateContacts/firingDetected/canEngage) · **fires ✓** (fireMission)
      · **installations ✓** (addStructure/fundingStructure/deployUnit/rallyPoint/
      fieldUnit/deployStructure/convertToHq; fieldAerostat moved to AIR — it calls
      deployDrone) · **air ✓** (targeting/orders/gunship/availability; Math.random
      burst+dispersion kept verbatim for parity) · **opfor ✓** (ai.ts commander —
      issues only player-legal orders).
      ALL WAVE-3 DOMAIN LOGIC PORTED. Verification is the wave-4 golden gate.
- [x] **4** ✓ **GOLDEN GATE PASSED — hash 696495692, identical to the old sim.**
      Per-domain update slices: economy/update (supply lifts) · installations/update
      (construction+garrison, structReports, structureDeaths incl. win/lose + aerostat
      teardown) · forces/update (movementUpdate w/ columns+convoy+bridging, drillsUpdate,
      casualtyReports, surrenderUpdate, attritionSync, unitDeaths) · fires/update
      (directFireUpdate + ballisticsUpdate) · air/update (state machines).
      `engine/SimLoop.ts` composes the FROZEN order + startLoop/stopLoop/advance
      (loop handle on __WOD2_LOOP). `engine/scenario.ts` initGame/initDevGame
      (groupSeq deliberately NOT reset — matches old module counter). SimLoop+scenario
      are the composition root — the one engine layer allowed to import domains.
      airAvailability/endSortie relocated air→economy (airframe half of the fielding
      economy) so installation teardown needs no air import; air/availability.ts
      re-exports. Verified headless: esbuild bundle of devtools/newGame api + runGolden
      in Node vs the browser-verified old baseline. `?golden` page now wires
      window.__newGame for in-browser __goldenDiff() too.
- [~] **5** presentation: **audio ✓** (audio/audio.ts — synth graph verbatim; net chatter
      now arrives via bus.on('radio') instead of a direct sim call; radioBus.inNode
      expando replaced by a module-local radioIn; HMR-guarded wiring on
      __WOD2_AUDIO_WIRED; hashStr deduped into lib/math).
      **map ✓** (symbols/mapRender/MapView verbatim; ctxMenu type gained structId) ·
      **drone ✓** (DroneView + DroneCamera + feedAudio split; _snd/_sndFireT
      presentation flags typed on the entities; dead formationOffset dropped) ·
      **ui ✓** (theme/styles/store/Rail/NetPanel/TopBar/palette/CommandPanel/
      Splash/HUD; Feed gained winMode; HUD's dead feedRayToGround dropped and
      HeaderMenu's out-of-scope lookPoint — a latent crash — fixed via prop).
- [x] **6** ✓ **CUTOVER COMPLETE — the game runs on the TypeScript sim.**
      index.html → `/src-new/main.tsx` (old `/src/main.jsx` kept as the rollback
      path — just swap the script src back). App.tsx/main.tsx ported;
      devtools/hooks.ts rebuilds the full `window.__game`/`__advance` surface from
      the new modules; SimLoop self-accepts HMR (edits to other sim modules
      full-reload — restoring whole-graph acceptance is post-migration work).
      Browser verification: splash → new game (small/regular) → map+rails+HUD
      render, zero console errors; fieldUnit/deployDrone/advance(120) via hooks —
      OPFOR battlegroup spawned, Shadow on station, spot report on the net,
      contact plotted; feed window opened with live IR imagery and controls.

## Post-migration cleanup (deliberately NOT part of the port)
- ~~Route the raw Math.random() sim sites through S.rng~~ ✓ done — surrender rolls,
  gunship bursts/dispersion and radio closings now draw from S.rng (pre-init
  fallbacks only); the whole battle replays from its seed. Golden re-baselined to
  `4133144527`.
- ~~Fine-grained HMR accepts~~ ✓ done — devtools/hooks.ts and devtools/entry.ts are
  now self-accepting boundaries (they import the whole sim from the entry chain),
  and the UI pump interval is stashed so it replaces instead of stacking. Sim
  edits now hot-apply with the session preserved.
- ~~Delete old `src/`~~ ✓ done — deleted and `src-new` renamed over it.

## Module map (old → new)
| old | new |
|---|---|
| game/rng.js | engine/rng.ts ✓ |
| game/mapgen.js | world/mapgen.ts + world/WorldMap.ts (MinHeap → pathfinding) |
| game/pathfinding.js | world/pathfinding.ts |
| game/units.js | domains/{forces,air,installations}/catalog.ts (+shared COVER_DEF/MOVE_FACTORS with forces) |
| game/difficulty.js | domains/economy/difficulty.ts |
| game/audio.js | audio/audio.ts (subscribes to comms events) |
| sim.js state | engine/GameState.ts |
| sim.js init/initDevGame | engine/scenario.ts |
| sim.js orders | domains/*/orders.ts (ground→forces, drones→air, basing→installations, fireMission→fires) |
| sim.js elements/effStats | domains/forces/elements.ts |
| sim.js sensing/contacts | domains/intel/ |
| sim.js radio/toast/grid | domains/comms/radio.ts · lib/format.ts |
| sim.js tick | domains/*/update.ts + engine/SimLoop.ts |
| sim.js enemy AI | domains/opfor/ |
| map/*.jsx | map/*.tsx + picking.ts |
| drone/DroneView.jsx | drone/{DroneView.tsx,DroneCamera.ts,feedAudio.ts} |
| ui/HUD.jsx | ui/{feed,tray,menus}/ + thin HUD.tsx |

## Rules in force
- Move logic verbatim; type the seams. No behavior changes, no "improvements".
- Entities are plain data typed by interfaces (HMR + future JSON save round-trip);
  behavior lives in domain modules. No entity classes, no DI.
- UI reads GameState, mutates only via domain order functions.
- Dependency direction: engine ← world ← domains (comms/economy → forces → intel/fires →
  installations → air → opfor) ← presentation. No imports of another domain's update.ts.
