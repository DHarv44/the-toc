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

### P0 — packages in, editor mounted        [DONE]
- [x] `.npmrc` scope line; installed `@dharv44/groundwork-core` 0.1.1,
      `-engine` 0.1.0, `-builder` 0.1.0, `@react-three/drei` 10.7.7 — from the
      registry, correctly deduped
- [x] MAP EDITOR entry on the splash (TOOLS) → full-screen `<Builder />` inside
      a TOC shell (src/ui/MapEditor.tsx)
- [x] `configureBuilder`: `toc.terrain` storage prefix; Köppen asset base taken
      from the package's own served URL; devHooks off (TOC owns window.__game)
- [x] Endpoints: TOC's vite config mirrors Groundwork's dev proxies
      (/api/opentopo with the key appended server-side from VITE_OPENTOPO_KEY
      in .env.local, /api/terrarium, /api/imagery) — so the builder's DEFAULT
      dev endpoints just work, and canvases stay untainted
- [x] Vite: the known `?worker` risk was real — builder must be
      `optimizeDeps.exclude`d, which then requires nested includes
      (`builder > leaflet/react-leaflet/geotiff/zustand/@react-three/drei`)
      for its CJS-adjacent deps. Two runtime failures found and fixed this way.
- Verified in-browser: editor opens from the menu, fetched a real 165-tile
  Colorado box through the proxies (AWS source — keyless, so no OpenTopo key
  needed for this path), rendered the 3D build, OSM vector query ran,
  attribution footer intact, clean return to the menu. Console error-free.
- Note: VITE_OPENTOPO_KEY not yet set in .env.local (user-owned secret) — the
  OpenTopography DEM source fails until then; AWS Terrain Tiles works today.

### P1 — save to PACK                        [DONE]
- [x] Dev-only write route `/__gwmap?pack=&map=&file=ground|meta` in pack-io:
      slug-guarded paths, zip-magic check on the ground, JSON re-serialized on
      the sidecar, 400 MB cap
- [x] Editor shell gained SAVE TO PACK: pack select + map name in the header,
      id slugged from the name, `packBytesFrom` + `useStore` host seam — what
      is saved is byte-identical to what Export would download
- [x] Discovery: `src/packs/map-files.ts` (globs `./*/maps/*/ground.gwpack`
      as URL + `map.json` eagerly, modeled on model-files.ts) —
      `packMaps()/packMap()`; sidecar type carries the P3 scenario fields
- Verified live: the P0 Colorado build saved as `1cd/maps/front-range/`
  (23.5 MB), sidecar written, discovered by the glob, and read back through
  core in bare Node — 3712×2464 heights 1471–4345 m, 56,903 roads, 18,094
  areas, 610 named places, attribution carried (AWS/SRTM + OSM ODbL).
- Note: FRONT RANGE is a scratch test box (109×72 km — far beyond a battalion
  AO) committed as the P3 development target; real campaign maps will be
  authored smaller. Map size guidance for authors is a P5 concern.

### P2 — wiring hygiene                      [DONE]
- [x] `CELL` audit: every consumer reads `map.CELL` (pathfinding, fires,
      orders, drone feed, both map renderers, deck). Only mapgen still imports
      the constant — it generates AT 50 m and dies in P6.
- [x] Map identity: `MapRef` (world/mapref.ts) — procgen or `{packId, mapId}`;
      `buildGameMap(ref)` is the one async seam; `map.ref` is what persists
- [x] `initGame(map, seed, difficulty, mode)` — synchronous scenario
      composition over a finished map; App builds the ref
- Course correction recorded mid-phase: golden.ts is DEPRECATED, not
  protected — patched to compile, killed in P6 with the generator it
  measured. Mode terrain rerolls (mapOk) not wired through the new seam;
  modes get fixed later, on pack maps.
- Verified: dev sandbox plays identically after the audit.

### P3 — the sim index (pack → WorldMap)     [DONE]
- [x] `src/world/pack/` services, one concern each:
      `loadGround` (fetch + core reader, session-cached) ·
      `frame` (pack box → largest centred square; CELL = max(data res,
      side/512) — the 512 cap serves the OLD renderer's 8 px/cell canvas and
      dies with it) · `elevation` (sampleBox resample + genMap's gameplay
      renormalisation kept — mobility tuning — with `toMetres` inverse) ·
      `surface` (areas even-odd with inner rings honored, water > built >
      wood; roads clipped/collapsed/stamped, TRACKS VECTOR-ONLY) ·
      `culture` (real-named towns capped to 8 most significant, peaks to 10
      highest with true elevations, named waters as river anchors)
- [x] `mapFromPack(ground, sidecar) → WorldMap` factory; fob/enemy from the
      sidecar or opposite-corner fallback on standable ground
- [x] `buildGameMap({kind:'pack'})` wired — a pack ref is now startable
- Deliberately absent: bridges (a stamped road cell already outprices the
  water under it, so crossings PRICE right; decks/targeting later), rivers'
  own hydrology raster (P4 reads polygons directly).
- Verified headless on BAGHDAD (26.5 km, 512 cells @ 51.7 m, 51,360 road
  polylines): initGame spawns 32 town garrisons, a scout ordered cross-map
  drove 12.2 km in 10 sim-minutes and sits on `highway` per terrNameAt —
  real Baghdad roads pricing real movement. Real names throughout (بغداد,
  تل جمر…).

### P4 — the exact BFT                       [core DONE; labels+attribution open]
- [x] src/map/packRender.ts: the export drawn directly — elevation art
      (hypsometric bands over the map's own range, NW hillshade, contour
      interval picked by relief: 10/20/50 m in REAL metres) from the pack
      heightfield; water/wood/built as even-odd polygon fills (islands and
      clearings survive; water fills last and gets bank lines); all five
      observed road classes at true widths (ROAD_WIDTH_METRES), cased by
      class, tracks dashed. Water drawn from the same polygons the sim raster
      quantized — one source, two projections, ≤ half-cell disagreement.
- [x] MapView: pack maps take the exact layer AND SKIP the per-frame road
      vector pass — which was the slowness (51k polylines walked per frame).
      Measured after: ~145 fps on Baghdad. Bake-once/blit-per-frame is the
      architecture, not an optimisation.
- [x] The full gazetteer labels, screen-space, zoom-gated by rank (cities
      always → hamlets only up close), deduped against the sim's own
      town/feature labels; peaks ▲, waters italic blue
- [x] Attribution printed on the sheet, bottom-right, from the pack's own
      manifest — the ODbL display obligation lives where the data does
- Note: bake cost is one ~4096² per-pixel pass at map open (~seconds). Fine
  as a one-time cost; tile it later only if it ever hurts.
- Data note: label density is the pack's place-node coverage — Baghdad's box
  carries only 27 (city cores are `suburb`/`neighbourhood` nodes in OSM,
  which Groundwork does not fetch). Front Range carries 610.

### P5 — skirmish + campaign on packs        [setup DONE; road graph open]
- [x] Skirmish terrain step lists every installed pack map first, then
      PROCEDURAL. Baked theaters are GONE from skirmish setup (the campaign
      still reads its legacy theater until it migrates). A pack map sets its
      own size; the size step's force caps still apply.
- [x] `CampaignMapSpec.map?: string` — a campaign referencing a pack map id
      plays that map (theater/seed/layout ignored). Iron Triangle stays on
      its legacy spec until campaign ground is authored for it.
- [x] Scenario placement: SCENARIO in the editor opens the saved map's exact
      sheet — arm PLACE FOB / PLACE ENEMY, click, SAVE writes the sidecar.
      "(auto)" marks the engine's fallback until a spot is authored.
      Groundwork still never learns what a FOB is.
- [x] P5b — roads, properly (design ratified + BUILT 2026-08-02; verified on
      Baghdad: graph build + first cross-city route 303 ms, 59 ms after; a
      ROADS-ordered scout drove 18.8 km with the ground under it reading
      primary/motorway on 84 of 90 samples and off-network on zero; supply
      convoys run the `convoy` profile with free-path fallback):
      · the sim adopts the DATA's five road classes — motorway/primary/
        secondary/minor/track — as its native vocabulary (the 3-class model
        was procgen's invention; the adapter stops throwing fidelity away).
        Procgen's three map onto the new codes for its remaining lifetime.
      · MOVE_FACTORS per class per mobility (motorway 0.45 wheeled … track
        1.0); ALL five classes stamp the raster — pricing wants them even
        though routing no longer reads cells (a unit on a track is priced on
        the track, and a city-core cell reading "minor" is roughly honest)
      · ROADS orders route on a JUNCTION GRAPH built from the real polylines
        (src/world/pack/roadGraph.ts): nodes = shared vertices + endpoints,
        edges carry geometry/length/class, entry/exit via nearest point on
        the network. Edge cost = length ÷ speed(mob, class) — time-optimal
        routing IS the Google-Maps behavior: local streets to the on-ramp,
        arterials for the trunk, exit near the destination, no mode ever
        "fails" because the last leg is a track.
      · cost PROFILES, not modes: `fastest` (honest time) and `convoy`
        (doctrine — over-prefers arterials via per-class multipliers; later
        discounts authored MSR edges). No strict highway-only mode: hard
        constraints fail ugly, the convoy profile carries the intent.
      · FASTEST/CROSS COUNTRY/OFF ROAD keep the cell A* unchanged; cell
        fallback stays as the safety net behind the graph.
- Verified: full skirmish flow to a running game on DENVER — FOB framed in
  real Front Range contours, starter force deployed. Authored DENVER bases
  round-trip: placed on the sheet, saved, and a fresh buildGameMap put both
  where they were clicked (snapped to standable ground).
- Bug found+fixed on the way: the maps folders are watcher-ignored, so
  Vite's TRANSFORM CACHE also never heard about saves — the sidecar's eager
  JSON import stayed stale across reloads. The /__gwmap route now invalidates
  every cached module under the map's folder, not just discovery.

### P6 — the kill                            [DONE 2026-08-02]
- [x] Deleted: theaters (`theaters.ts`, `theaterIndex.ts`, `bake-theaters.mjs`,
      `public/theaters/` — 8 baked patches), procgen (`mapgen.ts`, the skirmish
      PROCEDURAL option AND the map-size step — a pack map sets its own size —
      the golden harness + `?golden` hook), the old raster underlay
      (`mapRender.ts`; the VTC deck inset now blits the exact pack sheet), and
      the legacy `CampaignMapSpec` fields (`theater`/`seed`/`layout` and the
      whole `MapLayout` gazetteer type). `MapRef` is pack-only; `MAP_SIZES`,
      `Town.stamp`, `WorldMap.theaterId`, `ModeSpec.mapOk` (reroll machinery)
      all died with it.
- [x] `connectStructureToRoads` (runtime dirt path to a fresh FOB) was live
      SIM code trapped in the generator — extracted to `world/access.ts`, and
      fixed on the way out: it read the generator's 50 m CELL constant, which
      misaligned on pack ground. Now reads `map.CELL`, stamps `R_TRACK`.
- [x] IRON TRIANGLE: its ground WAS the chorwon window + authored layout, and
      its missions reference that invented gazetteer — so the campaign parks
      on `map.json → { "map": null }` and the splash shows it greyed
      ("awaiting authored ground") until real ground is authored for it and
      the mission place refs are re-anchored to real names. The old layout
      lives in git history. No pack maps installed at all greys DEV SANDBOX
      and the skirmish map step says to author one.
- [x] README pack-law text updated (maps at pack level, campaign references
      by id).
- Verify: typecheck clean; skirmish playthrough on pack ground in-browser.

### P7 — UAV on the engine                   [DONE 2026-08-02]
- [x] DroneView terrain = the engine's `buildTerrain(hf)` — the pack's native
      heightfield as a mesh in REAL metres, whole box, analytic normals
      (exaggeration 1 = the true ground). Engine geometry is box-centred; sim
      world coords hang off the frame's NW corner — spanX·widthMetres = WORLD
      makes the difference a pure translation, so nothing else in the feed
      moved. The old 512² mesh built from the sim's gameplay-renormalized
      `elev` raster is gone.
- [x] Ground height via core sampling: `drone/ground.ts` — `groundAt()` reads
      the pack through `sampleBox`, and everything the feed places vertically
      (hulls, camera, tracers, smoke, structures) reads there. DroneCamera had
      been flying on `S.map.elevAt` — a different (gameplay-scaled) datum that
      would clip real terrain — and now rides the same surface it films.
- [x] Sensor palettes kept, sources upgraded: the IR/EO ground textures are
      painted from the PACK's own polygons (water/wood/built, even-odd) and
      road vectors at true widths, whole box at ~6 m/px — the feed and the
      BFT draw the same geometry. Baked hillshade removed: the mesh normals
      light the relief. Trees/buildings/vehicles/effects layers unchanged.
- First-pass tradeoffs (tweaks welcome): no engine WaterPlane (water is
  painted tone on the near-flat DEM); plain Lambert over the draped texture
  rather than the engine's TerrainSurface shader (shading softness capped by
  mesh density, MESH_DETAIL 1024); the mesh's plinth skirt shows smeared edge
  texture when viewed from outside the box; a flat surround plane at
  hf.min − 1.5 keeps edge orbits out of the void.
- Verified: user-tested in the sandbox over Baghdad — feed over real terrain
  confirmed effective; further tweaks to follow as their own tasks.

- **Built-up ground is walls (2026-08-02).** `urban` is impassable to wheeled
  and tracked — vehicles drive the streets stamped through a district, never
  the blocks between them; foot passes at 1.3 (alleys, courtyards, rubble).
  One table entry carries the combined-arms split: dismounts cut blocks, vics
  own roads. Every placement path snaps through nearestLand with the unit's
  own mobility so nothing is born inside a wall. Consequence accepted: a
  block with no OSM-mapped street through it is vehicle-unreachable, which
  is why the service/alley upstream ask matters.
- **ONE router, no modes (2026-08-02, settled the hard way).** The route-mode
  selector is DELETED (AUTO/FASTEST/NO ROADS/ROADS ONLY are gone from the UI
  and from PathOpts, which no longer exists). Every order on a pack map takes
  the road-graph route, full stop; the cell A* survives only as the fallback
  where the graph has nothing (procgen until P6, mapless ground). There is
  deliberately NO time-race between graph and direct cell routes: on a road
  the cell version prices the same but measures shorter (cell centres chord
  the real curves), so any tie-breaker hands stair-step geometry a win over
  the clean route. Tried twice, regressed twice, never again. Known accepted
  cost: a waypoint dropped mid-field circles via the road; fix that later
  only with a rule that cannot beat the graph on a road. `profile` (convoy)
  is doctrine weighting, not a mode. Any-angle smoothing applies to cell
  fallback routes.

## Upstream asks (Groundwork changes, done in terrain-builder + republished)

- **Persist the viewer camera** (orbit position + target) with the builder's
  settings, so reopening the editor restores where you were looking, not just
  what was built. The camera lives inside its OrbitControls with no host
  handle — TOC will not reach through globals for it. Requested 2026-08-01.
- **Fetch `place=suburb`/`neighbourhood` nodes** into pack places. City-core
  boxes (Baghdad) carry almost no labels without them — districts are the
  names a COP over a city actually uses. Requested 2026-08-02.
- **A sixth road class** splitting service roads/alleys out of `minor` —
  convoys have no business in an alley and the sim would price them apart.
  The collapse happens at the builder's Overpass mapping, so only Groundwork
  can undo it. Requested 2026-08-02.
- **The `oneway` flag on roads.** TOC keeps units on their own motorway
  carriageway with a heuristic (traversing a motorway edge against its point
  order costs ×1.6 — OSM digitizes one-ways in the direction of travel), which
  is a guess, covers only motorways, and should be data. Requested 2026-08-02.

## Log

- 2026-08-01 — Plan committed. Branch `groundwork-maps` (off main at
  `6114ac9`). Groundwork published: core 0.1.1, engine 0.1.0, builder 0.1.0 on
  GitHub Packages; core-v0.1.1 tagged in the sibling repo.
