# GROUNDWORK — packs become the ground truth

The plan of record for replacing TOC's map stack with Groundwork
(`T:/Dev/terrain-builder`, published as `@dharv44/groundwork-*`). Kept current
as the work lands: each phase gets its status updated in place, and decisions
made along the way are recorded under DECISIONS so nobody re-litigates them.

## The flow this builds

1. **Author.** The Groundwork editor — embedded in TOC — selects a box of real
   Earth, tunes it, and saves the export into a TOC PACK as a map
   (`src/packs/<pack>/maps/<map>/ground.gwpack` + a scenario sidecar
   `map.json`). Download-to-file also works; the standalone Groundwork app
   remains usable and its exports can be dropped into a pack folder by hand.
2. **Play.** Campaign or skirmish picks a PACK and one of its maps. The BFT is
   an **exact 2D rendering of the export** — real roads at true geometry,
   water/wood/built as the actual polygons, contours from the native
   heightfield, real names. No procgen, no invention.
3. **Sense.** The UAV feed renders the same ground in three.js (Groundwork
   engine terrain under TOC's sensor palettes, units, and camera).

## Standing decisions

- **Everything is PACK driven.** The baked theater system is dead code walking;
  it is deleted in P6, not maintained. Procgen ("invented ground") is retired
  with it — skirmish plays pack maps. During the transition the old paths keep
  working so the game is playable at every commit; the kill happens once, at
  the end, when pack maps stand on their own.
- **Maps are pack-level content.** `packs/<id>/maps/<mapId>/`, referenced by id
  from campaigns; skirmish lists every map of every installed pack. (Amends the
  README law "campaigns own their maps" — agreed 2026-08-01.)
- **Geography vs scenario.** The `.gwpack` is geography and carries its own
  attribution (shown in-game — ODbL requires display). The sidecar `map.json`
  is the war: FOB/enemy positions, MSR nomination, display name. Groundwork
  never learns military concepts.
- **The `WorldMap` contract is the seam.** The sim (movement, combat, fog,
  pathfinding, feeds) keeps reading `WorldMap`; the pack pipeline is a new
  implementation behind it. The sim is not rewritten.
- **New code is modular** — small services/factories under `src/world/pack/`,
  never additions to the old monolith. `mapgen.ts` is quarantined until P6
  deletes it (there is nothing in it a pack map needs; hydrology, forests,
  towns and roads all arrive as data).
- **No copying code between repos.** Groundwork is consumed as installed
  packages. Registry: GitHub Packages (`@dharv44` scope). Tarball fallback via
  `npm pack` from the sibling repo is acceptable only as a stopgap when auth is
  unavailable, and must be flagged here when in use.

## Phases

### P0 — packages in, editor mounted        [in progress]
- [ ] `.npmrc` scope line; install `@dharv44/groundwork-core`,
      `@dharv44/groundwork-builder`, `@react-three/drei`
- [ ] MAP EDITOR entry on the splash (TOOLS section) → full-screen
      `<Builder />` inside a TOC shell
- [ ] `configureBuilder`: storage prefix, direct tile endpoints (no proxies in
      TOC dev), Köppen asset URL
- [ ] Vite: builder is a Vite-class package (`?worker`, `import.meta.env`) —
      `optimizeDeps` handling if dev chokes (known risk from the smoke report)
- Verify: editor opens from the menu, builds a real box end to end, standalone
  download works. Nothing else in the game touched.

### P1 — save to PACK
- [ ] Dev-only write route (beside pack-io): PUT
      `src/packs/<pack>/maps/<map>/ground.gwpack` + `map.json` sidecar
- [ ] TOC shell around the editor gains SAVE TO PACK (pack picker, map id from
      name) using the documented host seam (`packBytesFrom` + `useStore`)
- [ ] Pack discovery: glob `./*/maps/*/ground.gwpack` (`?url`) + sidecar JSON;
      `installedPacks()` surfaces maps
- Verify: authored map appears in the pack folder, discovered on reload,
  round-trips through `packFromBytes`.

### P2 — wiring hygiene (before any non-50 m map exists)
- [ ] `CELL` audit: consumers read `map.CELL`, never the imported constant
      (movement, drone, renderers, HUD rulers — grep-driven, mechanical)
- [ ] Map identity: `{packId, mapId}` replaces seed-regenerates-the-map
      assumptions (persistence note in WorldMap.ts, HMR remount, initGame)
- [ ] `initGame` takes a map reference; Splash/campaign plumbing passes it
- Verify: existing procgen game still runs identically (golden unaffected).

### P3 — the sim index (pack → WorldMap)
- [ ] `src/world/pack/` services: pack loader (fetch + `packFromBytes`, cached),
      elevation resample (`sampleBox` → grid at data resolution),
      area rasteriser (even-odd, inner rings honored) → `terr`,
      road converter (clip, classify, stamp roads/highways; paths vector-only),
      places → real-named `Town[]`/`MapFeature[]`, bridges/waterSurf/slope/
      moveFactor derived as today, gameplay elevation renormalisation kept
      (mobility costs are tuned against it; `elevLabel` maps back to metres)
- [ ] fob/enemyBase from sidecar `map.json`; heuristic fallback
- [ ] `mapFromPack(files, sidecar) → WorldMap` factory assembling the above
- Verify: a real exported map is playable — old renderer as stopgap picture,
  units path over real roads, names show up in radio/briefs.

### P4 — the exact BFT
- [ ] Pack-native 2D underlay renderer (new module, not mapRender surgery):
      contours/hypsometric/hillshade from the native heightfield; water/wood/
      built as even-odd vector fills; roads stroked at class widths; real place
      labels. Water drawn = sim water (impassable must never be misdrawn).
- [ ] MapView selects renderer by map kind; symbols/overlays untouched
- [ ] Attribution line surfaced (splash credits + map load)
- Verify: side-by-side with Groundwork's own view — geometry matches.

### P5 — skirmish + campaign on packs
- [ ] Skirmish setup lists installed pack maps (procgen option remains until P6)
- [ ] Campaign references a map id; Iron Triangle either migrates to a real
      map or is explicitly grandfathered until content is authored
- [ ] ROADS ONLY becomes graph routing over pack road polylines
- Verify: full campaign start on a pack map; movement, fog, drones, missions.

### P6 — the kill
- [ ] Delete: theaters (`theaters.ts`, `theaterIndex.ts`, `bake-theaters.mjs`,
      `public/theaters/`), procgen (`mapgen.ts` + skirmish invented-ground UI,
      golden harness), old terrain underlay path in `mapRender.ts`, `MapLayout`
      gazetteer fields campaigns no longer use
- [ ] README pack-law text updated (maps at pack level)
- Verify: typecheck, full playthrough, bundle size drop.

### P7 — UAV on the engine
- [ ] DroneView terrain = `@dharv44/groundwork-engine` mesh fed by the pack;
      TOC keeps camera, sensor palettes (IR texture draped on engine geometry
      first pass), units/structures/trees layers; ground height via `sampleBox`
- Verify: feed over real terrain in WHOT/EO; performance on a full battle.

## Log

- 2026-08-01 — Plan committed. Branch `groundwork-maps` (off main at
  `6114ac9`). Groundwork published: core 0.1.1, engine 0.1.0, builder 0.1.0 on
  GitHub Packages; core-v0.1.1 tagged in the sibling repo.
