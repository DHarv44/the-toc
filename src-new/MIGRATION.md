# TypeScript Migration — status

Old `src/` stays untouched and keeps running the game until Wave 6 cutover.
`npm run typecheck` must stay clean after every migrated module.

## Behavior gate
Open `http://localhost:5187/?golden` →
- `__golden()` — scripted 10-min scenario against the old sim
- `__goldenNew()` — same script against `window.__newGame` (once the new sim exists)
- `__goldenDiff()` — both, digest equality

**Baseline (old sim) digest hash: `696495692`** — deterministic across back-to-back runs.
The harness seeds `Math.random` globally; the four raw `Math.random()` sim sites
(surrender, gunship bursts/dispersion, radio closings, formSeed fallback) are ported
verbatim so old and new consume the identical sequence. Re-routing them through `S.rng`
is post-migration cleanup, not part of the port.

## Waves
- [x] **0** tooling: typescript+types (pinned to runtime majors), strict tsconfig,
      `typecheck` script, golden harness (`devtools/`), `?golden` loader in index.html
- [~] **1** leaves: `engine/rng` ✓ · **world/ ✓ VERIFIED** (`WorldMap` types, `mobility`
      — MOVE_FACTORS moved here so domains→world, never reverse — `minheap`, `mapgen`,
      `pathfinding`). Parity proven in Node via esbuild bundle: mapgen raster-identical
      (elev/terr/road/waterSurf/slope/towns/bases) on 4 seed×size combos; findPath
      waypoint-identical on 6 cases covering all route modes.
      Remaining: domain catalogs (`forces/air/installations` from units.js — full source
      now in session record, incl. carrier/def/indirect/logi/df/canBridge/carries fields
      and the gunship weapon table), `economy/difficulty`, `lib/` (format, math)
- [ ] **2** `engine/GameState` (counters nextId/designators/groupSeq move INTO state —
      flagged deviation; in-run behavior identical, fixes HMR counter reset) ·
      `engine/events` (RadioTraffic/Toast/GameOver) · `engine/scenario` (init/initDevGame)
- [ ] **3** domains: comms → economy → forces → intel → fires → installations → air → opfor
- [ ] **4** per-domain `update.ts` + `engine/SimLoop` composing the FROZEN tick order:
      economy → construction/garrison → columns → movement → direct fire → ballistics →
      drills/surrender/reports → attrition/deaths → airframes → contacts → opfor.
      Gate: `__goldenDiff().match === true`.
- [ ] **5** presentation: audio → map (picking extracted) → drone (camera/feedAudio split) →
      ui (feed/, tray/, menus/, panels/, store, HUD thin)
- [ ] **6** cutover: index.html → `/src-new/main.tsx`; full browser verification sweep;
      rebuild `window.__game`/`__advance` hooks from the new sim.

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
