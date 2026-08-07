# BASES — footprint, anatomy, and the motor pool (DESIGN DISCUSSION)

> Written 2026-08-06 at the user's direction, ahead of a compact. This is the
> discussion document — nothing below is built except where marked SHIPPED.
> The conversation to have: settle the open calls at the bottom, then cut it
> into buildable steps.

## Where this started

The motor pool shipped 2026-08-06 (`a2222fe`): fielded units park in a line
down the road that serves the base instead of fanning ~340 m into open dirt,
and the road-graph fixes underneath it (cache invalidation, vertex-snapped
track junctions, pontoon polylines + on-ramps) made every runtime road real
to the router. Verified on TRAINING DAY: three call-ups at exactly 35 m
spacing on the road by CP LONGKNIFE, and a unit ordered 5.2 km out entered
the network 16 m from its parking spot.

**The user's critique, immediately and correctly:** the pool parks on the
NEAREST road — and the nearest road might be an MSR under enemy observation.
"I don't want the vics to move to the nearest road... that might put them
right into fire." A motor pool belongs INSIDE THE WIRE. That critique opens
the bigger design: bases today are a point, a radius and an invisible list
of facilities. They should have a SHAPE and an ANATOMY.

## The direction (user, 2026-08-06)

1. **Bases have anatomy.** In the scenario builder, a placed FOB/HQ shows its
   assets — motor pool, aid station, etc. — as their own 2525 symbols when
   zoomed IN; zoomed OUT they roll up into the base's single symbol, exactly
   the way teams roll up today.
2. **Bases have a footprint.** The system reads the roads around the anchor
   and SMARTLY PROPOSES A POLYGON for the base. The scenario author then
   arranges the facilities where they want them inside the polygon.
3. **Authors can add roads** in the scenario builder.
4. **In-game:** when an engineer places a FOB, does the player get to set the
   polygon too?

## Design sketch

### The footprint polygon

> **SHIPPED (step 2 v1, 2026-08-06):** auto-proposed footprint that READS
> THE GROUND and is built LIKE A WALL — 12 corner posts marched out across
> the actual map (each ray stops at water, built-up blocks and real roads;
> the fence snaps to the road it sits beside; the base's own spur doesn't
> bound it; steep rays pull in relative to flat ones; small deterministic
> wobble seeded on QUANTIZED POSITION so builder preview and H-hour derive
> the identical shape), joined by STRAIGHT runs with near-collinear posts
> merged — organic corners, geometric fence. Gate = the perimeter point on
> the gate bearing. Derived lazily (installations/anatomy.ts pure *At cores
> + cached Structure wrappers), riding the save; drawn as graded-earth
> shading (urban-block language) with gate posts at anatomy zoom, in-game
> AND as a live scenario-builder preview (wires prop, same functions).
> Still open from the sketch: snapping to a full CLOSED RING of roads
> (city-block compounds), and polygon-aware effect radii.

A base becomes `{ anchor, polygon: Vec2[], gate: Vec2 }` instead of a point
with a radius.

- **Auto-proposal** (the smart part): read the road polylines around the
  anchor. If the anchor sits inside a closed ring of roads (a city block, a
  compound), snap the polygon to that ring — the roads ARE the perimeter,
  which is how real bases in built-up ground actually sit. In open ground,
  propose a rounded rectangle oriented to the nearest road, sized to the
  structure kind (HQ > FOB > OP), with the **GATE** vertex placed where the
  access track meets the perimeter.
- **The gate is the whole point.** Everything that enters or leaves the base
  passes the gate: fielded units, convoys, the access track terminates there.
  The gate is ON the network (a real junction, per the vertex-snap rule the
  engine just learned), so "hop straight onto a road" survives — but from
  inside the wire, through one deliberate opening, not from a shoulder on
  whatever road happened to be closest.
- Deploy zone / facility radii: v1 keeps radius-from-centroid semantics so
  nothing else has to change; polygon-aware effects can come later.

### Facilities as 2525 anatomy

> **SHIPPED (step 4, 2026-08-06) — author-placed facilities:** a facility
> plate on the selected base is a HANDLE in the builder — drag the motor
> pool / aid station where you want it. Authored spots save as METRE
> offsets from the anchor (`ScenarioStructure.fac`, they travel with the
> base when it moves; one drag = one undo step) and applyScenario pre-fills
> Structure.facPts from them at H-hour — unauthored facilities still get
> the default derived layout. Verified end-to-end: drag → JSON → PLAY →
> in-game facPts at the exact authored offset.

Facilities already exist as DATA (`facilities: string[]` + effect specs —
the C-RAM pattern). They gain a POSITION inside the footprint:

- **Author-placed in the builder**: drag the motor pool, aid station, TOC,
  ammo point, helipad where you want them inside the polygon. Default
  auto-layout for authors who don't care.
- **Zoom roll-up**: past a zoom threshold the base draws as today's single
  2525; inside it, the facility symbols draw at their placed offsets — the
  same mechanic the team roll-up uses, reused.
- **The positions become gameplay**, immediately and later:
  - The MOTOR POOL facility's position IS where fielded units park (pool
    line forms beside it, inside the wire) — this retires the
    nearest-road parking and answers the "into fire" critique directly.
  - The aid/repair auras are already spec-driven; they can radiate from the
    facility's actual spot instead of the base centre.
  - Later: incoming fires that land inside the footprint can hit the
    FACILITY they land on — knock out the ammo point, crater the helipad.
    That is a deeper system (facility HP) — flagged, not scoped here.
- Feed: facility clusters render as scenery at their offsets, so a low orbit
  over a FOB reads as a real compound.

### Author-added roads

> **SHIPPED (2026-08-07), scenario-level as recommended:** the builder's
> Control-measures palette carries a ROAD tool — click waypoints, dbl-click
> (or right-click) commits; right-click an authored road while the tool is
> armed to delete it; Ctrl+Z unbuilds the last. Stored as
> `situation.engineerRoads` (norm polylines) and laid at H-hour through the
> SAME machinery an in-game road-building engineer uses (S.engRoads: ends
> junction-snapped, raster-stamped, router re-junctioned, serialized), drawn
> in the shared track ink. This is also the KABUL patch path until it is
> re-exported with road vectors. In-game roadworks shipped alongside
> (engineers crawl a planned line leaving real road behind — see roadworks).

The builder gains a ROAD tool: draw a polyline, pick a class (track/road),
ends SNAP to existing network vertices so junctions form (the same
coincident-vertex rule the engine enforces). The open call is where they
live:

- **Recommended: scenario-level.** An `engineerRoads` list in the scenario,
  applied at start through the same push-polyline + invalidate machinery the
  runtime uses. The gwpack ground file stays pristine, the roads travel with
  the battle that needs them, and a scenario can patch a road-poor map
  (KABUL shipped with NO road vectors at all — until it is re-exported from
  the MAP EDITOR, scenario roads are the only way to give it any).
- Alternative: edit the ground itself in Groundwork — right for permanent
  geography, wrong for "this operation needs a supply spur".

### In-game engineer FOB placement

Full vertex-editing is builder-grade UI and probably doesn't belong in the
middle of a fight. Recommendation: when the engineer sites a FOB, the
auto-proposed polygon shows as a placement preview with a ROTATE/SIZE handle
— accept, nudge, build. The gate and access track lay themselves. Authors
who want hand-tuned compounds build them in Eden.

## What this retires / amends

- Motor-pool-on-nearest-road (SHIPPED today) becomes motor-pool-at-the-
  MOTORPOOL-facility, inside the wire, exiting via the gate. The shipped
  road-graph fixes (invalidation, junctions, pontoon on-ramps) are the
  foundation this stands on and are untouched.
- The interim option, if polygons wait: park the pool line along the base's
  OWN access spur (it starts at the base and belongs to it) instead of the
  nearest arbitrary road — cheap, safer, no new data. Decide below.

## The open calls

1. **Interim pool fix now** (park on the base's own spur, inside the deploy
   zone) or hold the shipped behaviour until polygons land?
   **RULED 2026-08-06, SHIPPED (step 1):** facilities link to their owning
   HQ/FOB and get real positions inside the wire (lazy default layout, the
   repair-effect facility on the gate bearing — spec-read, never name-read).
   A base WITH a motor pool parks fielded vics in formation rows at the
   facility's own 2525; a base without one parks down its OWN access spur;
   "nearest road" only survives as the doorstep case (< 150 m). QRF launches
   skip the rally entirely and form at the wire. Facility plates draw when
   zoomed in and roll up into the base symbol when zoomed out, the team
   convention. Main goal held: a parked vic enters the network in metres.
2. **Footprint data home**: polygon + facility offsets in scenario data,
   auto-generated at runtime for player-placed FOBs — agreed?
3. **Roads**: scenario-level `engineerRoads` (recommended) vs editing the
   ground pack?
4. **Zoom threshold**: reuse the team roll-up mechanism/threshold as-is?
5. **Facility damage** (fires knock out the thing they land on): in scope
   for this arc, or its own later item?
6. Does the OPFOR get footprints too (its bases are currently the same
   point-plus-radius)? Symmetry says eventually yes.
