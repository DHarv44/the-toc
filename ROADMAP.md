# TOC — Roadmap

The current build is a real-time C2 game: a Blue Force Tracker map with MIL-STD-2525
symbology, recon-driven fog, deployable UAS feeds (3D EO/IR), procedural terrain,
mounted/dismounted maneuver units with battle drills and weapons control, a logistics
chain, installations, and a tactical enemy AI. Units are modeled as individual
vics/troops (sub-elements) so precision fires hit specific platforms.

Sections below are a thematic **reference** — the full detail for each item. The bands
in *Priority* are the actual plan.

**Status:** ✅ shipped · 🟡 partial · ⬜ not started
An unmarked heading is not started. ⬜ is used only where something *looks* built but isn't —
so nobody plans work off a false lead. Statuses were verified against the source, not
self-reported. Last audited 2026-07-23. **Completed items live in the Shipped Archive at
the bottom of this file** — the sections above it are the open work.

---

## Status at a Glance

**✅ Shipped (~45)** — full compact records in the **Shipped Archive** at the bottom.
Recent headliners (all 2026-07-23): real-DEM theaters (M1) · cartography glow-up (M2) ·
vector road hierarchy with bridges (M2.5) · hamlets + named terrain (M3a) ·
terrain-anchored radio (M3b) · mode-recipe framework + KotH hill guarantee (M4) ·
feed ground on painted textures + AO apron · game-mode framework with three playable
modes and the end-of-match screen · water-discipline movement fixes.

**🟡 Partial (13)** — M4 mode recipes *(campaign recipe pending)* · Campaign *(in design,
scaffolding only)* · Air asset cost & access · Drone team & organic UAS · Drone airframe
types & FPV · Tactical smoke *(system yes, triggers no)* · SIGINT/EW *(DF only)* ·
Enemy AI / OPFOR · Enemy economy *(wave ramping open)* · Radio chatter library & message
factory · Seed-generated maps *(seed not surfaced)* · Installation-gated unlocks *(no
existence gating)* · Bottom panel / selection tray · Deployment & fielding *(radius
gating open)*.

**⬜ Everything else is not started.** Two items are commonly mistaken for started —
they are not: **Individual unit formations** (the old `formationOffset` dead code was
removed in the TS migration — nothing exists) and **Symmetric fog & counter-recon**
(`updateContacts` is one-directional; the AI reads ground truth — there is no enemy
contact model).

---

## Priority

### Now
1. **Quality-of-life pass** ← **CURRENT FOCUS** *(2026-07-23, Dave's call)* — playtest
   irritations and small fixes. First item (CPU units fording rivers) is fixed; more
   items land here as they're found.
2. **Campaign restart** — the map track hit its planned gate (M4); the campaign is next
   per the original plan: one battalion's war on the battalion-TOC model (objective
   specs, mission arc, briefings, NPC HHQ, allocation).
3. **Bottom panel / selection tray** — the last piece of HUD that ignores the Mantine
   theme and the only one that degrades badly with a large selection.

### Next — the enablers
4. **Save / continue game** — highest player-facing value per unit of work; a hard
   prerequisite for the campaign's long play. Easier now: fully seeded sim, typed plain
   data built for a JSON round-trip.
5. **Enemy AI / OPFOR** — battlegroups exist; what's missing is a commander above them,
   a reserve, counterattacks, and any use of the air/ISR layer.
6. **Symmetric fog & counter-recon** — the AI cheats today. This is the single change that
   most raises the ceiling on every other combat system.
7. **M3c oversized world** *(parked by Dave until wanted)* — real generated terrain
   beyond the AO for the feeds; BFT crops to the AO.

### Later — depth
Unit wiki · scenario builder · tutorial map · call for fire · counter-battery · attack
helicopters · air defence & SEAD · sustainment (ammo/fuel, MEDEVAC, speedballs) ·
true line-of-sight · smoke triggers · auto break-contact · installations' defences & C-RAM ·
radio channels/nets · better three.js assets & particles · UAV sensor realism · urban
depth · remaining game modes (zone capture · spec ops · custom scenarios).

### Someday — architecture
SharedWorker sim → pop-out feeds, detachable map views, combat-group dashboard, and
eventually multiplayer. Deliberately last: it's the same client/server split, so doing it
early buys nothing until the game underneath is worth spreading across screens.

---

## Design Laws

Agreed 2026-07-23 after the maps / echelon design sessions. Every feature, map and
system decision is tested against these; cite them by number ("fails law 1").

0. **Built for people who've sat in a real TOC.** The audience is military enthusiasts
   and vets who have run actual BFTs. Authenticity is the product — when a vet notices
   something, it should be because it's *right*.
1. **The drone feed is the product; the map serves it.** The feeds must remain a
   mostly-accurate representation of the ground. Nothing ships that makes the map cooler
   at the feeds' expense — why full real-world (OSM) maps were rejected: our synthesized
   ground would be competing with the player's mental image of a real place.
2. **73 Easting, not Fallujah.** The sim resolves *maneuver warfare*: the platoon is the
   smallest thing that exists as gameplay, cells are 50 m, and fights happen between
   terrain features — treelines, ridgelines, crossings — not between buildings. Towns
   are terrain a company occupies, cordons or shells, never mazes. Buildings are
   drone-feed scenery (footprint render data), never gameplay entities. Nothing below
   the platoon (soldiers, rooms, streets) is simulated — it is only *seen*, in the feeds.
   (Both anchors are battles, not places: this law is about simulation grain, not AO
   size — AO size is law 5's business.)
3. **One map contract, many sources.** Everything compiles to `WorldMap` (elev / terr /
   road / slope rasters + towns + names). Map *sources* are swappable compilers:
   `procgen noise | baked real-DEM theater | authored heightmap | (someday) builder file`.
   Both renderers (BFT and feeds) read `WorldMap`, so drone-cam ground truth is accurate
   by construction regardless of source.
   *Architectural stance (2026-07-23, after the "3D-first?" discussion): we do NOT flip
   to a 3D-scene-first pipeline — the sim needs rasters and elevation generation is
   raster math anyway. Instead the contract **thickens over time**: culture gets promoted
   from implicit (renderers hash-inventing detail) to explicit shared objects, as already
   done for roads (vector polylines both renderers honor). Next candidates: building
   footprints, tree instances, hedgerow/wall polylines. End state: one scene
   description, two honest renderers.*
4. **Automation adds seats; it never takes the stick out of your hand.** Personally
   calling the fire mission, flying the sensor, walking rounds onto the treeline — the
   *doing* is the game. AI staff, subordinate commanders and request flows are optional
   capacity for scale, never a replacement. Any change that makes the game feel less
   like being in the TOC and more like watching one gets rolled back.
5. **Battalion is the home echelon.** The player is a battalion commander; the game is
   their TOC — the lowest echelon where a real TOC exists, the highest where personally
   running every seat is doctrinally honest. Higher echelons are *characters*: they
   issue your orders, grant your allocations, and deny your requests (an NPC HHQ today,
   maybe a human division commander in multiplayer). Lower echelons are yours to command
   down to the platoon; below platoon you only watch, through the sensors. Playable
   brigade/division/corps seats: eventually, maybe.

---

## Maps & Terrain  🟡 *(overhaul largely shipped 2026-07-23 — M1–M4 records in the Shipped Archive; what's below is what remains)*

Governed by laws 1–3. Theater curation rule from law 2: every theater is *maneuver
country* — valleys, river plains, ridge-and-farmland, steppe; at most one modest town
per map, no megacities.

### The plan
*(M1 theaters, M2 cartography, M2.5 road hierarchy, M3a hamlets/named terrain and
M3b terrain-anchored radio are ✅ shipped — see the Shipped Archive. Loose ends carried
forward from them: a RANDOM theater button · sea-level water for coastal patches ·
theater names feeding briefings/HHQ flavor · LKP hold for lost drone tracks.)*
- **M3c — Oversized world (feed surround done right)** ⬜ *(PARKED by Dave — build when
  wanted)* *(decided
  2026-07-23)*: the interim drone-feed apron (a 1.6 km blurred smear of the map)
  doesn't match the real terrain and is too small — sensors can still find the edge.
  The right architecture, per Dave: **generate a larger world than the AO** — mapgen
  produces the AO plus a wide margin (~3× the current apron, ≈5 km) of *real*
  generated terrain: same elevation source, terrain classes, forests, even roads
  running off-map. The **BFT crops/contains to the AO** (sim, units, orders, fog all
  stay inside — the margin is scenery, not battlespace); the **UAV feeds render the
  full extent**. DroneView then deletes the blur-apron hack and just consumes the
  bigger rasters/textures. Theater patches already carry the surplus real elevation
  (512² baked vs. 256 AO window — the margin is sitting in the asset). Feed ground
  rendering just moved from vertex colors to painted 2048² textures (smooth
  shorelines/treelines, vector-true roads, no diagonal river pinch) — M3c builds on
  that directly. **Verification recipe: deploy an aerostat at the HQ, slew the
  sensor south past the map edge.**
- **M3 — Culture layer upgrades** ⬜ *(remaining)*: towns strung along roads and valleys instead of
  scattered; field/hedgerow patterning; a **buildings layer** (footprints in towns —
  scenery only, per design law 2) rendered by the drone feeds so village orbits stop
  looking empty; **named features** (rivers from the flow-accum pass, dominant hills,
  towns already named) feeding radio calls, briefings and objective labels
  ("crossing the KOMA RIVER", "contact on HILL 402"). Wider open areas and 2–4 km
  engagement geometry so the terrain plays at company/battalion frontage, not
  skirmish-game density.
- **Urban depth — cities that are places** ⬜ *(added 2026-07-23 — NEEDS DESIGN
  DISCUSSION before build)*: towns today are a blob of urban cells — plain and boring.
  Wanted: real urban structure (arterial road grid + districts, dense core vs.
  sprawl, compounds, industrial edges, named neighborhoods/key facilities), and
  support for **mostly-urban AOs** — a Baghdad-style mission with the HQ at a
  Camp Liberty/Victory-type base on the outskirts. Design law 2 stands: the urban
  fight at our echelon is **route clearance, not room clearing** — MSRs through the
  urban canyon, convoy security, cordons and overwatch, intersections and overpasses
  as decision points, ambush/IED threat on named routes (ROUTE IRISH energy). Open
  questions: urban generator design (district graph vs. denser cell classes), how
  concealment/engagement ranges behave in city blocks at platoon atomicity, what
  route-clearance gameplay actually consists of, feed density (buildings LOD).
  - **Units occupying buildings** *(thought 2026-07-23)*: at some point let a platoon
    strongpoint a building/compound — the building becomes a real defensive position
    (hard cover, sight lines) and a real *target*: the classic dilemma of drop the
    building with a bomb vs. cordon vs. assault. Stays platoon-atomic (a unit holds
    *the building*, no room-by-room) so it composes with law 2. Ties into structures/
    destructibility and the fires systems.
  Discuss, then slot into the M-track.
- **M4 — Mode recipes** 🟡 *(framework + KotH shipped 2026-07-23)*: `ModeSpec.mapOk(map)`
  plus a bounded map-seed reroll loop in initGame — modes without a recipe generate
  exactly once, so the default A&D path is byte-identical (golden-gated, baseline
  unchanged). KotH's recipe rejects maps whose central third has no real hill (peak
  ≥ 18 over the median): over 90 test maps, ~half of Small rerolled (≤ 3 attempts),
  Medium rarely, Large never. Still open: the **Campaign recipe** (river belt across
  the axis, ≥ 2 crossings, towns along the way) — lands when the campaign restarts,
  which begins here.
- **Map authoring v0** *(free with M1)*: a "map" is a heightmap + a culture recipe —
  Claude can author maps by hand (painted or real-DEM heightmap + placement params JSON)
  with zero tooling. The community-facing **map builder** lands later as a Scenario
  Builder tab; players who want to build maps get the old-school-RTS custom-map loop
  (share JSON + PNG), the player who doesn't (Dave) never touches it.
- **Parked**: full OSM real-world import (roads-as-data is solved — it's a graph — but it
  fails design law 1 in the feeds); vector/polygon map rewrite (raster bones are good).

---

## C2 & Echelon  ⬜ *(FINAL 2026-07-23 — battalion-TOC model; supersedes the earlier echelon-ladder draft)*

**The player is a battalion commander; the game is their TOC** (law 5). Today's game is
already a battalion task force with every seat played manually — the audit against 1st
Cavalry Division's real ORBAT confirmed the scale: 12–20 platoons ≈ a battalion TF with
attachments (our force caps), 5–13 km ≈ a battalion AO (our map sizes). A division is
~250 platoon-equivalents across a 100 km AO — not a map, and no longer a goal: the big
war exists as *context* delivered by higher headquarters.

- **Real formations (decided).** The player's TF comes from the real 1st Cav ORBAT
  (e.g. 1-8 CAV, 2nd BCT "Black Jack"). Future factions get the same treatment — a
  research deep-dive into each faction's actual battle assets, scoped to
  battalion-and-below fidelity (higher echelons are narrative structure).
- **E1 — 2525 echelon amplifiers** *(quick win, do early)*: `•••` above every unit frame
  now (everything fielded is a platoon), the task-force bracket for cross-attached
  teams, higher-formation text amplifier once the ORBAT tree exists. Doctrinal
  designations — "1/A/1-8 CAV" — alongside the radio callsigns. For this audience the
  amplifiers are the difference between game icons and a COP (law 0).
- **E2 — ORBAT / task organization**: platoons roll into companies inside the battalion
  in a small task-org tree (A/B/C CO + scouts + mortars + attachments); an ORBAT rail
  UI; orders at the company node ride the existing group machinery. Unlocks the parked
  formation/column work and the campaign's allocation model.
- **HHQ is a character, not a seat** *(lands with the campaign)*: an NPC higher-HQ
  system delivers the big war — FRAGOs come down, allocations are granted ("SPOOKY 41
  on station 0200–0300, then it's 2-8's"), priorities of fire shift, your requests go
  up and sometimes come back DENIED, a company gets detached from you for 48 hours.
  Requests flow one way (up); everything task-organized TO you stays hands-on (law 4).
  In multiplayer the NPC seat is what a human division commander later occupies —
  human battalion COs under a human allocator is the long-term MP structure.
- **Economy split (decided)**: Skirmish keeps the buy-economy (the game-y sandbox);
  the Campaign uses doctrinal allocation — you receive a task organization from higher,
  not a shopping cart, and replacements flow through sustainment.
- **The directed telescope**: the player can always directly order any platoon and
  personally run any seat they own (law 4). Future AI company XOs executing intent
  orders (the OPFOR battlegroup brain pointed our way — the architecture already
  supports it) are optional QoL, never required.
- **Eventually, maybe**: playable brigade/division seats, zoom-out aggregation
  (platoons collapse into their company's `❘` frame), corps-structured multiplayer.
  Nothing rots meanwhile — the HHQ system and the campaign's theater map are those
  features' foundations.

---

## Game Modes

The game currently plays as one open scenario. Add a mode selector and three modes.
**Modes own the ending**: each mode defines its victory/defeat conditions, its run stats,
and what happens when the match ends — all feeding one shared end-of-match framework
(below).

**Main-menu structure (decided 2026-07-23):** the splash offers **CAMPAIGN**,
**SKIRMISH**, and **DEV SANDBOX**. Skirmish is the umbrella for single-match play —
picking it opens the mode chooser (Attack & Defend, Base Defense, King of the Hill,
plus the in-development modes) and then map size / difficulty. The player-built
Scenario Builder (see 7) lands under Skirmish when it exists. Dev Sandbox stays as-is,
and will eventually let the player place enemy units too.

(The July 2026 playtest is what forced the end-of-match framework: the HQ fell, one
toast fired and scrolled away, and the sim kept running — orders still worked, the
OPFOR kept fighting, nothing acknowledged the loss. Shipped since.)

*(The End-of-Match shared framework, Attack & Defend as mode 1, King of the Hill, Base
Defense v1 and the Difficulty Presets are ✅ shipped — see the Shipped Archive. Open
follow-ups from Base Defense v1 live in the stub below.)*

### Base Defense v1 — Follow-Ups ⬜
The mode is playable end-to-end (archive entry has the record); deliberate v1 cuts plus
the wave-direction rework (added 2026-07-23):
- **No enemy HQ** — waves shouldn't muster at a hostile base at all (today they launch
  from the OPFOR HQ, which also means killing it insta-wins the mode). The threat is
  *off-map*: waves enter from the map edge.
- **Waves attack from different directions — smartly, not random 360°** — pick a small
  set of viable **avenues of approach** at setup (road entries, valley floors, covered
  ground — terrain the M-track now understands) and vary among them: consecutive waves
  shift axis, some probe one side then commit another.
- **Wave tactics, not just columns** — give waves shapes: **direct attack** down the
  main avenue; **supporting + flanking** (a fixing element on one axis while a flank
  element swings wide); later waves combining both with fires in support. The scripted
  comp table grows an axis/scheme per wave.
- A manual **"READY" trigger** to call the next wave early (banked intermission time as
  bonus payout?).
- **Difficulty scaling** of the wave table — identical on Recruit and Elite today; only
  the player-side levers differ.
- **Wave pacing on larger maps** — foot-heavy early waves walk a long way (edge-entry
  spawning above largely solves this; tune remaining walk time per map size).
- Design notes: edge-entry spawn replaces `fieldingBase()` for this mode (spawn just
  outside the AO on the chosen avenue, or at the edge until M3c's oversized world gives
  real off-map ground); avenue selection can reuse road entries + the pathfinding cost
  field; a wave becomes `{comp, axis, scheme}` instead of just a comp list; flanking
  elements are the same battlegroup machinery with a different aim point.

### Earned Income — Tie Supply to Ground Held ⬜
Upkeep now caps how big a force you can sustain, but the *gross* rate is still a flat
faucet: a fixed lift every few seconds, identical whether you hold one base or half the map.
`STRUCTURES` even has an `income` field that is `0` on every entry and read by nothing.
- **Installations generate supply** — a base rate from the HQ, more per FOB, a little per OP,
  so expansion is the economic engine and losing a base actually costs you.
- **Towns/objectives as income** — holding a town contributes, which gives the map's terrain
  features a strategic value beyond cover.
- **Makes the tutorial's arc pay off** — "take the town, put a FOB on it, run a convoy" should
  visibly raise your rate; right now it changes nothing.
- Design notes: `incomePerMin()` already centralises the gross figure — extend it to sum
  friendly structures instead of returning a flat lift, and surface the breakdown in the
  supply tooltip. Pairs with the upkeep model already in place.

### 3. Zone Capture ⬜ *(Hell Let Loose style — NEEDS DESIGN DISCUSSION before build)*
Contested-line control:
- A chain of capture zones/objectives across the map.
- Zones are captured by presence and held; contested zones flip over time.
- Push the frontline by taking adjacent zones in sequence; both sides fight over
  the active contested zone(s).
- Win by controlling the objective line / capturing the enemy's rear.
- Design notes: zone-ownership state, capture progress from friendly vs. enemy
  presence, a frontline/lattice of which zones are currently contestable, and
  scoring/victory tied to zone control rather than base destruction.
- **Open design questions (deliberately parked 2026-07-23 — discuss before build):**
  - *Zone layout* — chain of zones along the HQ–HQ axis vs. a full sector grid
    (HLL style) vs. a terrain-anchored node graph with explicit adjacency.
  - *Win condition* — capture the enemy's base zone vs. ticket bleed from majority
    control vs. timed score. Each changes the OPFOR posture and the match arc.
  - Campaign was pulled ahead of this in the build order (see 4); its objective-spec
    and capture/hold machinery may settle some of these questions for free.

### 4. Campaign 🟡 *(one large map, one long war — in design; paused 2026-07-23 behind the Maps & Terrain overhaul)*
Moved up in the build order ahead of Zone Capture: the campaign doubles as the
**new-player teaching arc** (each mission introduces one system), and building it may
surface design changes that feed back into the other modes. Development paused at the
state-scaffolding stage (`S.campaign` exists) until the map overhaul lands — the campaign
wants M4's guaranteed map shape and M3's named terrain for its briefings. Design decisions made in the meantime: the **main menu** is CAMPAIGN / SKIRMISH /
DEV SANDBOX (see the menu note above), and per law 5 the campaign is **one battalion's
war**: your TF carried through a division operation mission by mission. The theater map
is the division's operation graphic (NPC HHQ context — flanking battalions you hear on
the net but never control), and each mission's ground map is an AO cut from the same
baked theater patch, so the battalion fights across one continuous piece of real ground.
Your force comes as a task organization from higher (allocation, not the buy-economy),
and losses carry. The original framing below (one Large procgen map, missions as phases
on it) predates the theater-patch model — the arc and persistence goals stand, the map
substrate is now M1's theaters. Nothing resets between missions: the front moves, your
units, FOBs, bridges, wrecks and contact picture all persist. Long play, large scale —
the mode where every system already built gets a career instead of a cameo.

**The operation** — from a lodgment in your corner to the enemy command complex in
theirs. The OPFOR starts with the map: garrisoned towns, a prepared main defensive
belt behind the river line, and its own rear-area installations. Proposed mission arc
(each is an objective phase, briefed at its start, debriefed by the end-of-match
framework):
1. **LODGMENT** — capture, defend and stronghold a position: take the crossroads/town
   nearest your entry, dig in, and defeat the first counterattack. (movement, defense,
   the dig-in system)
2. **LINES OF SUPPLY** — build a FOB forward of the strongpoint with engineers, stand
   up a logistics run, raise an aerostat. Objective: FOB established + N supply
   delivered by convoy. (engineering, logistics, tethered ISR)
3. **EYES FORWARD** — stand up the airfield and map the enemy's first belt: put a
   required share of the defensive line on the COP and find the river crossings.
   (fixed-wing ISR, recon, the contact picture)
4. **SEIZE THE CROSSING** — force the river line: take a bridge or emplace pontoons
   under pressure, then hold the bridgehead against the counterattack. (bridging pays
   off; defense round 2)
5. **BREAK THE BELT** — deliberate attack on the dug-in main belt: shaping fires,
   smoke, flank through the bridgehead, take the central town. (fires, smoke,
   maneuver — the *Make Maneuver Beat Mass* systems earning their keep)
6. **DEEP OPERATIONS** — interdict the OPFOR rear: kill its FOBs/convoys and silence
   its guns; gunship on-station windows. (enemy economy as a target set,
   counter-battery once it exists)
7. **THE OBJECTIVE** — combined-arms assault on the enemy HQ complex with whatever
   you've kept alive. Campaign victory.

**Persistence & consequences:**
- **The force carries over** — losses are permanent; replacements come from a
  campaign supply ledger (mission payouts + *Earned Income* from ground held).
  Surrender, reconstitution and (later) MEDEVAC finally matter long-term.
- **Failing a mission doesn't hard-end the campaign** — the front sags instead: the
  OPFOR counterattacks toward your last stronghold and the mission re-briefs from
  the fallback position with what's left. The campaign is lost only when the
  lodgment/HQ is gone.
- **The map remembers** — pontoons stay laid, wrecks litter old battlefields, spotted
  enemy structures stay marked. Fighting back over ground you lost should feel like it.
- Design notes: missions generalize the mode framework's `checkEnd` into **objective
  specs** (hold-for-time, build-X, deliver-N, recon-%, seize-area, destroy-set) run
  sequentially over persistent state — the campaign is a list of those plus scripted
  OPFOR posture per phase (garrison → counterattack → defend-belt → collapse inward).
  *Save / Continue* is a hard prerequisite (long play means multiple sessions), and
  the end-screen RunStats become the campaign ledger. OPFOR belt/garrison pre-placement
  wants the seed-generated large map plus a placement pass keyed to the river line and
  towns. Build after modes 2–3: waves gives the counterattack machinery, zone logic
  gives capture-and-hold.

### 6. Spec Ops Missions ⬜
The inverse of the big war: a small fixed force, one discrete objective, and the fog
doing the heavy lifting. No economy, no fielding, no reinforcements — what you take
in is what you have.
- **A hand-picked team** — a scout section, a rifle or ATGM element, organic UAS
  (Raven/Switchblade), maybe a gunship or Viper on a limited on-station window.
  Night by default; the NVG/IR feeds become the primary way you fight.
- **Mission templates** (one per run, on a generated map):
  - **HVT RAID** — kill/capture a high-value element inside a garrisoned site, then
    exfil to the extraction point.
  - **SENSOR SMASH** — destroy a rear-area installation (arty battery, radar/OP)
    and get out before the reaction force arrives.
  - **CSAR** — reach a downed pilot before the enemy sweep does, then escort him to
    the pickup zone.
  - **CLOSE RECON** — put eyes on N positions and get the picture home **without
    being detected** — the only template where shooting means failing.
- **Alert states make it stealth** — the garrison starts quiet; detection (visual
  contact, heard gunfire — `firingDetected` already models this) escalates it:
  quiet → searching → alerted, and alerted spawns a QRF battlegroup hunting your
  last known position. Going loud is survivable but expensive.
- **Win/lose** — objective complete + team at exfil = win; team destroyed, HVT
  escaped, or pilot captured = loss. Exfil with partial losses reads out in the
  after-action stats.
- Design notes: a `ModeSpec` per template family with a scenario-setup hook (fixed
  force, no palette — gate the fielding UI off in this mode), an alert-state
  machine on the OPFOR side reusing the battlegroup spawner for QRFs, and an
  extraction-zone check in `checkEnd`. Leans hard on systems already built
  (concealment, DF/earshot detection, organic UAS, night mode) and pays forward:
  the alert/QRF machinery is exactly what *Symmetric Fog* wants the OPFOR to do in
  the big modes too.

### 7. Skirmish — Player-Built Scenarios ⬜
*(Note 2026-07-23: "Skirmish" is now also the main-menu umbrella for all single-match
modes — see the menu structure note above. This entry is the future custom-scenario
capability inside that menu.)*
The **Scenario Builder** (see its own entry under UI & Tools) played as a first-class
mode: you build the battle, then fight it.
- **Build** — lay out both sides' order of battle, structures, drones and staging on
  a chosen seed/map size; set supply, fog, and starting postures. All of that is the
  Scenario Builder's job — Skirmish is its play button.
- **Pick the victory condition** — from the objective-spec library the modes already
  use: destroy the enemy HQ (A&D rules), hold a zone for N minutes (KotH rules),
  survive N waves, destroy a target set, or plain last-side-standing. A scenario is
  placements + a `ModeSpec` reference + its parameters.
- **Save / load / share** — scenarios serialize to JSON (seed + placements +
  objective); the splash's mode step grows a MY SCENARIOS list.
- **Replayable by construction** — the sim is fully seeded, so a saved scenario
  replays identically; a "reroll seed" toggle keeps the layout but varies the map.
- Design notes: this is where the objective-spec generalization (see Campaign)
  really pays — Skirmish just points at it. The builder writes to the same `S`
  through the existing side-agnostic order/deploy paths; Save/Continue supplies the
  serialization. Natural order: mode framework (done) → builder → skirmish wrapper.

---

## Assets & Systems

### Unit-Requested Artillery (Call for Fire)
Frontline units can request artillery when a friendly artillery unit is in range:
- A maneuver unit that has a friendly indirect-fire unit within that gun's range can
  **call for fire** on a target.
- The request surfaces as a **toaster in the bottom-left** with **APPROVE / DENY**.
- Approving expends supplies from the **nearest logistics node to the firing artillery
  unit** — the FOB or HQ closest to the gun, whichever it is — not the requesting unit.
- If that node lacks the supplies for the mission, **APPROVE is disabled** (deny only).
- Design notes: reuse the existing `fireMission` path for the actual gunnery; add a
  pending-request queue that the HUD renders as approve/deny toasts; compute cost against
  the shell/rounds and debit the nearest friendly FOB/HQ stock to the firing battery;
  gate the approve control on `nodeStock >= missionCost`.

### Counter-Battery  *(worth investigating)*
Make the fires fight a cat-and-mouse instead of free artillery:
- Firing artillery **gives away its position** (already have DF/emitter ideas) — a
  counter-battery capability can then **locate and return fire** on active enemy guns.
- Rewards **shoot-and-scoot** — displace after firing or eat return fire; the mobile
  SP howitzer becomes worth its mobility.
- Could be a friendly auto-response (counter-battery radar cues a fire mission) and a
  mirrored threat the enemy uses against your guns.
- Design notes: on a gun firing, register a transient "acquired firing point"; a
  counter-battery asset/radar converts recent acquisitions into a return fire mission;
  ties into the SIGINT/emitter and Enemy AI work.

### Attack Helicopters (AH-64 Apache & AH-1Z Viper)
Rotary-wing close air support — the same feed/target-designation and per-vic damage
model as the gunship, but a fundamentally different platform:
- **Not tied to an orbit.** They can be flown to a position, **hover** to hold a
  battle position, pop up/mask behind terrain, and reposition on command — unlike the
  gunship's fixed pylon turn. (Reuse drone move/waypoint control; add a HOVER hold and
  drop the forced circle.)
- **Two airframes:** the Army **AH-64 Apache** and the Marine **AH-1Z Viper**, with
  distinct loadouts/handling but a shared control scheme.
- **Different munitions** — a mix the player manages per weapon (same select-active-
  weapon idea as the gunship):
  - **30mm chain gun** (Apache M230) / **20mm cannon** (Viper) — gun with fire modes
    (will / designated / hold), like the gunship guns.
  - **Guided missiles** — Hellfire (and AGM-179 JAGM / TOW on the Viper): player
    designates a target and launches, like the UAV strike flow.
  - **Rocket pods** — Hydra 70 (unguided): area fire, launched in salvos with real
    dispersion, for suppressing spread-out targets.
- Called in as a timed/supply-costed asset like the gunship; vulnerable to ground
  fire when low/exposed, rewarding hover-behind-cover and pop-up attacks.
- Design notes: generalize the gunship weapon suite (per-weapon ammo, fire modes,
  ballistic/guided round types) into a shared air-platform module; the helo differs by
  being player-positioned + hover-capable rather than orbit-locked.

### Air Defense, SEAD & Fixed-Wing Air
An integrated air-defense threat and the fixed-wing air to fight it — turns the whole
air layer (UAS, gunship, helos) into a real risk/reward decision instead of free airspace:
- **Radar systems** (static acquisition/early-warning) and **mobile radar** — detect and
  track air assets and cue the SAMs. Radars emit when active, so they're detectable
  (RWR/DF) and can be jammed or killed to blind the network.
- **SAM units** (fixed site) and **mobile SAM** (shoot-and-scoot) — engage aircraft inside
  their envelope, forcing standoff, altitude, and terrain-masking decisions.
- **Built-in air defense for FOBs / HQs** — bases carry organic SHORAD so rear areas
  aren't free airspace (parallels the guard-tower ground defenses).
- **SEAD** falls out naturally: find (recon / ELINT) → suppress or destroy the air
  defense → then commit CAS. Rewards EW and sequencing.
- **Fighter jets** — air superiority / interdiction: contest the airspace, escort friendly
  air, or run strikes.
- **A-10 Warthog CAS** — fixed-wing close air support (gun runs plus guided/unguided
  ordnance), called in like the gunship/helos but **fast-moving attack runs, not a loiter**,
  and itself exposed to the SAM/radar threat.
- Design notes: add an air-track layer (altitude, detectability/RCS) so SAMs and radars
  can engage air assets; new `UNIT_TYPES` for radar/SAM (static + mobile) with an
  air-engagement envelope; base AD is a per-structure air weapon; reuse the shared
  air-platform module (feed, weapons, ammo) for the A-10.

### Air Asset Cost & Access 🟡 *(costs + cheap field drones done; helos / A-10 / fighters absent)*
Air power is a premium capability, not something you spam:
- **Air assets are expensive** *(done)* — the AC-130 gunship and the larger fixed-wing UAS
  carry high supply costs (Shadow 350 / Sentinel 650 / Viper 900 / Aerostat 600 / AC-130 1500),
  so committing air is a real economic decision. Attack helos / A-10 / fighters still to come.
- **Small field drones stay cheap and unit-accessible** *(done)* — the hand-launched recon/loiter
  drones (Raven 75, Switchblade 150) remain deployable by frontline units, no airfield required.
- Design notes: keep `src:'field'` drones low-cost and airfield-independent; scale costs up
  for the airfield/helipad assets; pairs with Installation-Gated Unlocks.

### UAV Sensor Realism — Footprint & ID Degradation ⬜ *(added 2026-07-23 — UAVs are OP)*
UAVs currently spot everything in a big omnidirectional radius — too easy, too far.
Make the sensor ball real:
- **Sensor footprint, not a halo** — a flying UAV detects only inside what its gimbal is
  actually looking at (the projected FOV cone on the ground), the way the aerostat's
  fixed-stare turret already works. Orbiting = the footprint sweeps; slewing the sensor
  is a real decision.
- **Identification degrades with range** — the recognition ladder: *detection* (something
  moved) → *classification* (vehicle vs. troops) → *identification* (tank platoon)
  requires progressively shorter slant range / narrower zoom. Across the map you get an
  UNKNOWN contact mark at best, never a typed unit.
- **The soda-straw tradeoff** — wide FOV scans big but only detects; narrow FOV
  identifies but stares at a postage stamp. That tension IS real ISR work.
- Design notes: `Contact` grows a confidence/`unknown` state (spot reports say "UNKNOWN
  VEHICLE VIC ..."); `updateContacts` gates detection on footprint intersection and ID
  on slant range; BFT renders unknown contacts with the 2525 unknown frame (yellow).
  Pairs with *Symmetric Fog* (same ladder for the OPFOR) and makes the aerostat's
  fixed stare the norm, not the exception.

### Drone Team & Organic UAS 🟡 *(carrier units + organic launch/RTB/follow shipped; no drone-team unit type, no FPV airframe)*
Put the airfield-independent drones in the hands of units:
- **Drone unit** — a dedicated small-UAS team that **controls/deploys the drones that don't
  need an airfield** (Raven-class recon, Switchblade-class loiter, and FPV suicide drones),
  giving you organic air without an airstrip.
- **Suicide / FPV drones** — cheap, expendable **one-way attack drones (Ukraine-style FPV)**:
  the drone team launches them to dive on ground targets. Low cost, high volume, attritable.
- **Organic drones on other units** *(done)* — carrier-capable units field their organic UAS
  from the context deploy menu: Rifle/Stryker/Mech carry a Raven; Scout and Armd Recon carry
  Raven + Switchblade; the ATGM team carries a Switchblade (`carries: [...]` in `units.js`).
- Design notes: field-launched drones already exist (`src:'field'`); a dedicated drone-team unit
  is still to come; FPV suicide drone is a cheap kamikaze variant of the Switchblade model; keep
  costs low per the Air Asset Cost & Access tiering.

### Drone Airframe Types & FPV Terminal Attack 🟡 *(distinct silhouettes, fixed-stare aerostat, and Switchblade engage-and-watch with a terminal nose-cam all work; no flight-model split — every non-tether drone orbits — and no quadcopter/FPV airframe)*
Model drones by their real airframe rather than one generic flyer:
- **Distinct airframe symbols** *(done)* — each UAS/aviation asset now draws a unique top-down
  silhouette on the map and in the deploy palette (twin-boom Shadow, long-wing V-tail Sentinel,
  swept-wing Viper, tiny Raven, missile-body Switchblade, blimp aerostat, 4-engine AC-130).
- **Tethered aerostat holds a fixed stare** *(done)* — the balloon no longer orbits; it holds
  its tether point and only the sensor turret slews (a step toward the hover flight model below).
- **Quadcopters can hover** — hold a fixed stare, move in any direction, and work low/close;
  no orbit required (organic ISR quads and some FPV attack drones).
- **Fixed-wing must keep moving** — they orbit/loiter and can't hover (Raven, Shadow, Sentinel,
  the larger UAS), matching the current orbit behavior.
- **FPV suicide "engage and watch"** — an FPV attack drone can **designate a target, and on the
  player's ENGAGE click, dive into it** — optionally with a brief terminal nose-cam view of the
  run-in to impact. Cinematic and true to how these are used.
- Design notes: give each drone type a flight-model flag (`hover` vs `fixedWing`); hover drones
  hold position instead of orbiting; the FPV terminal attack reuses the kamikaze strike path
  with a player-confirmed engage step and an optional nose-cam feed.

### Individual Unit Formations (UAV View) ⬜
> **Not started.** `formationOffset` in `DroneView.jsx` looks like a head start but is **dead
> code with zero call sites**. Live layout is the generic `bgOffset`/`initElements` stagger.

The sub-elements (vics/troops) currently sit in a generic staggered offset. Give units real
tactical formations, visible in the drone feed:
- Lay elements out in proper formations — **column, wedge, line/skirmish, echelon, herringbone
  (halted on a road), coil/leaguer** — chosen by unit type, movement state, and posture.
- Formation shifts with what the unit is doing: traveling column on roads, wedge or line in the
  assault, herringbone on a short halt, dispersed/dug-in when defending; troops dismount into a
  skirmish line, vics hold wedge/column.
- Design notes: replace `bgOffset`/`initElements` with formation templates keyed to unit type +
  state, oriented to heading; keep the element world positions authoritative so fires still
  resolve against exactly what's shown in the feed.

### Catastrophic Kills — Turret Toss
When a tank/AFV vic is destroyed, a **30% chance it "blows its top"** — a catastrophic
ammunition cook-off that throws the turret clear:
- On that roll, spawn a **turret that launches upward, tumbles, and falls back to the ground**
  in the drone feed (the classic catastrophic-kill signature); otherwise a normal wreck/burn.
- Design notes: on a `veh` (armored) element kill, roll 0.3 → spawn a short-lived ballistic
  turret object (up-arc + spin + impact + settle as debris); reuse the wreck/fire system for the
  hull.

### Sensor Horizon — Haze the Distance in the Feed ⬜
A UAS feed can see clear to the map edge right now — the R3F scene renders the whole world
crisply, so a low Raven surveys as far as a high Sentinel. It should fall off with distance,
gated by altitude and airframe, so a feed shows a believable sensor footprint rather than the
entire theatre.
- **Distance haze keyed to altitude** — atmospheric fade that closes in low and opens up high.
  A Raven at 200m sees a small bubble; a Sentinel at 1250m sees far; the AC-130 and aerostat
  sit in between. The fade distance scales off `spec.alt * altMul`, so the ALT control (LOW/
  MED/HIGH) visibly trades field-of-regard for it.
- **Per-airframe sensor quality** — a multiplier on top of altitude so a dedicated ISR platform
  (Sentinel) reaches further than a hand-launched Raven at the same height. Ties to the existing
  `spec.sight`, which already sets each type's detection range.
- **Match detection to what's visible** — the haze should roughly coincide with `unitSees` /
  the feed's contact range, so "if you can see it in the feed, the sensor reports it" stays true
  and the player isn't shown vics past the point the sim would detect them.
- Design notes: R3F `fog` is already on the Canvas — drive its near/far from
  `spec.alt*altMul` and a per-type sensor factor instead of the current fixed values, and tint
  it by day/night and camMode (IR vs EO). Cheap and mostly a tuning pass over existing fog.
  Pairs with the map-side fog/LKP model — this is its in-feed counterpart.

### Edge-of-Map Blackness in the Feed ⬜
When a drone near the map edge looks outward, the feed shows the black void past the world —
the R3F scene only has terrain inside the play area, so beyond it is empty background. It reads
as a bug ("the world just ends"). Needs a deliberate treatment.
- **Hide it, ideally** — the sensor-horizon haze above is the cleanest fix: if the fade closes
  in before the edge is reachable in frame, the void is never seen. For a high aerostat or
  Sentinel parked near the boundary, that may not be enough on its own.
- **Frame the boundary when it does show** — a horizon band / atmospheric wash at the world edge
  so it reads as distance/haze rather than a hard black wall, and/or skirt the play area with a
  low-detail "beyond the AO" apron (a few km of neutral terrain that isn't part of the sim).
- **Or keep drones off the rim** — clamp orbit/tether points far enough inside the boundary that
  the edge stays out of any sensor's reach; simplest, but limits where you can post ISR.
- Design notes: same Canvas as *Sensor Horizon* — tackle them together. Match the fog/background
  colour to the horizon band so the seam disappears. Decide first whether haze alone hides it at
  the highest altitude before building an apron.

### Better Three.js Assets, Particles & Effects
The drone feed carries the game's only real "ground truth" imagery, but its scene is built from
merged primitive boxes and a handful of sprites. It should look like an actual EO/IR downlink.
- **Real geometry for vics and troops** — replace the primitive-merged tanks/IFVs/trucks with
  properly modelled low-poly assets (turret, hull, running gear, stowage) that still read at
  sensor altitude; distinct silhouettes per class so the operator identifies by shape, not colour.
- **A proper particle system** — muzzle flash and smoke, impact dust kicked off the ground by
  calibre, burning-wreck fire and rolling smoke columns, rotor and track dust, tracer glow.
  Currently these are flat sprites and simple instanced quads.
- **Materials that survive the thermal filters** — the feed applies WHOT/BHOT/EO/NVG as CSS
  filters over the render; assets need emissive/temperature-driven shading so hot engines,
  fired barrels and burning hulls actually glow in IR rather than relying on the filter alone.
- **Environment detail** — better trees and buildings, ground clutter, and terrain texturing that
  holds up when a sensor zooms in.
- Design notes: keep everything procedural or self-authored — no downloaded asset packs (see the
  project's dependency stance). Build geometry in code as now (`getVehicleGeos` / `getStructGeos`
  in `DroneView.jsx`) but with real modelling effort, and keep instancing for the per-class draw
  calls. A GPU particle system (instanced quads + a shader-driven lifetime buffer) is the right
  shape; budget it against the feed's existing frame cost, and remember up to four feeds render
  at once. Pairs with Catastrophic Kills and Individual Unit Formations.

## Combat & Tactics

### OPFOR Digs In When Defending ⬜
The AI only ever advances. `enemyAI` has garrison anchors that dig in on threat, but a
battlegroup that has taken an objective, culminated, or been pushed onto the back foot just
sits there mobile — so attacking it costs the player nothing it wouldn't have cost anyway.
- **Prepare positions when holding** — a group whose phase is hold/withdraw, or one sitting on
  an objective it already owns, should `orderDefend` and dig in rather than idle. Same order the
  player has; nothing AI-only about it.
- **Dig in on the objective, not where it stopped** — prefer cover/concealment cells (forest,
  urban) within the position, so a prepared defence sits somewhere that's actually worth
  assaulting around.
- **Come out of it to counterattack** — digging in shouldn't be a one-way state; a group that
  digs in and then sees an opening reverts to mobile. Pairs with the counterattack behaviour
  still missing from *Enemy AI / OPFOR*.
- **This is what makes the defensive advantage bite both ways.** Once prepared positions
  decisively beat frontal assaults (see below), an OPFOR that never prepares is free to run
  over, and the player learns the lesson only in one direction. The two changes want to land
  together.
- Design notes: `updateBattlegroup` owns the muster → advance → withdraw cycle; add a `hold`
  phase that issues `orderDefend(u.id, true)` and clears it on re-tasking. `postureFactor`
  and `u.digT` already do the work — the AI simply never asks for them.

### Make Maneuver Beat Mass ⬜ *(playtest finding — the core one)*
Playtest verdict after a run on Recruit/small: *"it just turns into who can create the most
units and send them in a straight line at the other team."* That's not a tuning problem, and
unit counts alone won't fix it. Straight-line mass wins because **nothing punishes it**:
- Combat is attritional DPS, so two blobs meeting resolve by who has more — more is always the
  correct play.
- Cover (`COVER_DEF`) and dig-in (`postureFactor`) are modest multipliers, not decisive ones. A
  prepared defender doesn't reliably beat a frontal assault, so there's no reason to prepare a
  position — or to avoid attacking into one.
- No flanking, no facing, no suppression, no morale. Position is nearly consequence-free.
- Recon buys little, because the AI reads ground truth and never needed it (see *Symmetric Fog*).
- Losses cost supply, and supply regenerates — nothing is scarce enough to be worth protecting.
- The July 2026 Medium/Regular playtest reinforced it from the defender's side: a fully dug-in
  line was picked apart flank-first by massed OPFOR armor (mech infantry radioing HARD TARGET,
  CANNOT PENETRATE) — the prepared-position multiplier isn't decisive, and AT access on Regular
  is thin against the OPFOR's tank density.

**Highest-leverage fix: prepared positions should decisively beat frontal attacks.** If a dug-in
platoon in cover reliably defeats two or three attackers walking straight at it, the rush stops
being viable immediately — and the player then *has* to find a flank, prep with fires, or
fix-and-maneuver. That gives every system already built a job: UAS to find the gap, artillery to
soften it, smoke to cross open ground, engineers to force a crossing. No new mechanics needed;
the existing ones just have to matter.
- ~~**Then scarcity**~~ *(largely done)* — per-unit upkeep, map-size force caps and per-type
  refit cooldowns now bound how big and how fast a force can grow. Making units individually
  dearer/slower is a tuning knob on top, not a new system.
- **Then symmetric fog** — while the AI knows where everything is, it never has to maneuver
  either; it can always just walk at you.
- Suggested order: *Enemy Economy* (done) → decisive defensive advantage → symmetric fog. The
  defensive advantage is now the single biggest remaining piece.
- Design notes: the defensive levers already exist and are applied in the direct-fire pass —
  `COVER_DEF[terrain]` and `postureFactor(tgt)` multiply incoming DPS. Start by widening those
  and adding an attacker-in-the-open penalty, rather than adding a new combat model. Pairs with
  *Longer Firefights & Auto Break-Contact* (a rush that stalls should break, not grind).

### Longer Firefights & Auto Break-Contact  *(no morale)*
Keep combat **pure attrition** — no morale system — but make engagements read like real
firefights rather than instant deletions:
- **Lower lethality / drawn-out fights** — tune DPS so units trade fire over a sustained
  engagement instead of melting in seconds.
- **Auto break-contact at low strength** — when a unit is worn down to roughly **25–35%
  strength** it automatically breaks contact and pulls back rather than fighting to
  destruction (each unit rolls its own threshold in that band so it isn't uniform).
- Design notes: reuse the existing break-contact battle drill; add an auto-trigger at a
  per-unit `breakAt` threshold picked in [0.25, 0.35]; side-agnostic so the enemy does it
  too (generalizes the battlegroup's current <35% withdraw). Rebalance weapon DPS /
  time-to-kill alongside so fights actually last longer.

### Tactical Smoke 🟡 *(SMOKE shell + LOS/gunnery blocking shipped; no self-smoke on break-contact, no unit smoke order)*
Smoke as a maneuver tool, not just an artillery effect:
- **Units pop smoke when they break contact** — screen the withdrawal so a broken unit can
  disengage without being cut down.
- **Player can smoke a position before assaulting** — obscure an objective or an enemy
  overwatch, then move under its cover.
- Smoke blocks line of sight (ties into the intervisibility work) and degrades detection while
  it lingers.
- Design notes: reuse the existing smoke system; add a self-smoke trigger on break-contact and
  a player "deploy smoke" order (unit smoke grenades / mortar smoke); smoke reduces LOS/sight
  through its footprint.

### Foot Mobiles Seek Cover → Concealment → Prone
Under fire, dismounted infantry actively better their position instead of standing in the open,
in priority order:
- **Cover first** — move to the nearest cover that actually stops rounds (buildings, walls,
  defilade), if any is within reach.
- **Then concealment** — if no cover is close, break to the nearest concealment (treeline, brush)
  that degrades line of sight / detection.
- **Then prone** — if neither is near, go prone in place (smaller signature, harder to hit).
- Cuts casualties, makes cover/terrain matter, and reads great in the feed — troops scrambling
  for a wall rather than standing still.
- Design notes: on the contact/suppression trigger, per troop element pick nearest cover cell →
  else nearest concealment cell → else set a prone flag; cover/prone lower damage-taken and
  detectability (ties into the cover and LOS systems).

## Intelligence & EW

Deepen the ISR/fog layer so intelligence is something you fight for, not a given:

### Satellite Intel Request
An on-call national/theater ISR asset, requested like a fire mission:
- Player **requests a satellite pass** over a chosen area; after a short **tasking delay**
  it returns a **snapshot** of enemy positions in that footprint (a timed reveal, then the
  contacts go stale again).
- **Supply-costed** and on a **cooldown** (limited passes), so it's a deliberate "where do I
  most need eyes right now" decision, not a persistent god-view.
- Design notes: reuse the contact/reveal system — briefly mark hostiles inside the footprint
  as live contacts with a timestamp, then let them decay to stale like any other; add a
  request order (pick area), a tasking timer, a per-request cost, and a cooldown.

### HUMINT (Sources & Networks)
Human intelligence from the local population — a slow but reach-extending collector:
- A **HUMINT unit** positioned **in/near a town develops sources** among the locals over time
  (the longer it works an area, the more sources it cultivates).
- Sources **report at random intervals** — enemy sightings, movements, or activity in their
  area — delivered as a **bottom-left toaster the player reads**.
- Sources are **fragile and unreliable**: a source can be **compromised / murdered**, or
  simply **go quiet and stop making contact**, ending that source — cultivating new ones takes
  time.
- Design notes: new HUMINT `UNIT_TYPES` (RECON/INTEL); per-source objects tied to a town with a
  random report cadence and a per-tick chance of being lost; reports post as toasts and may
  drop a (possibly fuzzy/delayed) contact marker; reuse the toast + contact systems.

### Symmetric Fog & Counter-Recon ⬜
> **Not started, and further off than it looks.** `updateContacts` is one-directional — it
> only ages *hostile* contacts for the player, and `findSpotter` scans friendly units only.
> There is no hostile contact store at all: the AI reads `S.structures` and real positions
> directly. `S.fogEnabled` gates only the player's map draw. This is a new system, not a tweak.

- The **CPU is fog-limited too** — it has to find you before it can mass on you.
- Makes **recon vs. counter-recon** a real fight: kill/blind enemy scouts and screens to go
  dark on them; screen your own front to deny them the picture.
- Design notes: give hostile forces their own detection/contact model mirroring the player's
  (the sensor code is already side-agnostic-ish); enemy decisions key off *their* contacts.

### Last-Known-Position Uncertainty ⬜
> **Not started, despite LKP ghosts existing.** Stale contacts already freeze in place and
> render greyed/dashed with an `LKP {n}M` age label — but that's the whole of it. There is no
> growing uncertainty radius, no ellipse, and no dead reckoning; the position never moves
> after `live = false`. The item is the uncertainty model, and none of it is there.

- Stale contacts don't just freeze at their last pixel — they drift into a **growing
  uncertainty area** ("was here, could be anywhere in this radius now") that expands with
  time since last seen and the target's speed.
- Design notes: render an uncertainty ellipse/circle on stale contacts that grows with age;
  optionally dead-reckon a best-guess drift along last-known heading.

### SIGINT / Electronic Warfare 🟡 *(SIG direction-finding of firing hostiles works; no jamming, emitters or radio-silence tradeoff)*
Expand the SIG unit beyond direction-finding:
- **Jamming** — degrade enemy comms and **drone/datalink** control in an area (ties into the
  C2-as-a-system idea; jammed enemy units fall back to SOPs).
- **Direction-finding / ELINT** — locate enemy emitters (HQ, radars, active jammers) by their
  transmissions, feeding SEAD and decapitation.
- **Radio-silence tradeoffs** — emitting reveals you to enemy DF; going silent costs
  coordination. A real signature-vs-coordination decision.
- Design notes: build on the existing `df` mechanic; add an emitter/RWR model shared with the
  radar/SAM work; jamming as an area effect on comms and drone control.

### HUMINT ⬜ *(added 2026-07-23 — bake in later, after Symmetric Fog)*
Human intelligence as a third INT alongside the ISR (IMINT) and SIG (SIGINT) pictures —
slower, fuzzier, and sometimes the only thing that sees through terrain and fog:
- **Population as a sensor** — towns you control or patrol near generate tips: "armor moved
  through ELMSTED heading south before dawn." Delayed, area-grade, occasionally wrong —
  rendered as aged/uncertain contacts, never crisp tracks.
- **EPW debriefs** — the surrender system already yields prisoners; interrogation turns them
  into intel about their parent formation (composition, objective, supply state). A reason
  to accept surrenders instead of finishing the fight.
- **Patrol debriefs** — dismounted elements that transit an area contribute passive
  observations on return, even without contact reports.
- **A HUMINT team asset** — a small attachable element (the strange-but-interesting people)
  that multiplies tip rate and reliability when parked in or near a population center.
- Design notes: feeds the same contact/report pipeline as recon; tips are radio-net entries
  + low-confidence map marks with big age/uncertainty. Wants Symmetric Fog (so intel has
  real value) and pairs with the NPC HHQ (intel summaries in FRAGO traffic). OPFOR mirror
  eventually: the population can rat *you* out in enemy-sympathetic areas.

## Command & Control

### Staff-Section Views (S1–S6) ⬜ *(added 2026-07-23)*
The TOC UI reorganized the way a real battalion staff splits the fight — one COP, with
switchable staff-section views that filter overlays and panels to one seat's concerns
(design law 4: you're playing every seat; this makes each seat feel like a seat):
- **S1 Personnel** — strength states, casualties, replacements/reconstitution, (later) MEDEVAC.
- **S2 Intelligence** — the contact picture, ISR coverage, SIGINT/DF fixes, HUMINT tips,
  named areas of interest; fog emphasized rather than friendly clutter.
- **S3 Operations** — current ops: orders, routes, ROE/postures, fire missions, the fight.
  (Effectively today's default view.)
- **S4 Logistics** — supply stocks, convoy runs, upkeep burn, FOB status, fielding queues.
- **S5 Plans** — (later) draft orders/overlays for the next phase without touching current ops.
- **S6 Signal** — net status, jamming, retrans/SIG coverage once Comms & Jamming exists.
- Design notes: views are filters + panel presets over the existing 10 Hz UI pump, not new
  state; a compact selector (S1…S6 tabs) on the top bar. Start with S2/S3/S4 — they map to
  systems that already exist; S1/S5/S6 light up as their systems land.

### Comms & Jamming (fall back to SOPs)
Coordination is **not** limited by distance — units stay linked to HQ at any range — but it
can be **jammed**:
- Enemy EW can **jam** friendly units in an area; a jammed unit loses coordination and
  **falls back to its SOPs** (holds/continues its last drill) until the jamming lifts.
- A unit **with (or near) a SIG unit is far less likely to be jammed** — signal units harden
  the net around them.
- Reinforces **decapitation** — losing the HQ (or heavy jamming) degrades force-wide C2.
- Design notes: no range gate on C2; add a per-unit `jammed` state driven by enemy jammers,
  reduced by proximity to a friendly SIG unit; jammed units run SOP behavior.

### Groups, Task Organization & Mission Builder
Make groups a first-class thing **without** losing the quick ad-hoc grouping:
- **Keep ad-hoc groups** — selecting several units and moving them works exactly as it does
  now (ephemeral, unnamed, just a shared move). Sometimes you just want to move a bunch of
  units, and that's fine.
- **Named groups** — promote a selection into an **official group with an operating name**,
  assigned on the group bar. Membership persists.
- **Group roster HUD** — a panel listing all named groups with **quick-select** (click a
  group to select its whole membership at once).
- **Mission builder** — for a named group, compose a **mission**: an ordered set of
  tasks/phases (move to a phase line, hold, screen, attack on trigger / H-hour) that the
  group executes on its own. Ties into the mission-type-orders-with-triggers idea.
- Design notes: a persistent `groups` structure (id, name, member unit ids) separate from the
  transient move-group; a "name this group" action on the group bar; a roster panel with
  select-group; the mission builder queues conditional waypoints/tasks per group.

### Group Movement — Follow the Lead Vic 🟡 *(built, but parked until combat groups exist)*
> **Built and working, deliberately not wired up.** A marquee selection is not a formation —
> it's several units handed the same order — so applying column behaviour to it was wrong:
> ad-hoc selections now path independently and move at their own speed, with no shared pace
> cap. `orderGroupMove` and the station-keeping/straggler logic are intact and waiting on
> *Groups, Task Organization & Mission Builder*: once a player can actually **form** a named
> combat group, that group marches as a column and everything below applies to it.
> **Revisit when wiring it up:** the 65 m station and 190 m straggler threshold were tuned
> against ad-hoc selections and should be re-tuned against real groups, and the column should
> probably be opt-in per group (column vs. spread) rather than automatic.

### Group Movement — Follow the Lead Vic (mechanics, once groups exist)
> **Shipped.** `orderGroupMove` designates the most constrained member (slowest real speed
> over its own terrain) as the lead vic, paths **once**, and hands that exact route to every
> follower — so the column takes the same road, the same bridge, the same gap in the treeline
> instead of each unit picking its own line. Followers hold station off `colIdx`, easing down
> inside a 110 m trail gap and stopping dead if they close right up. A unit given its own
> order drops out of the column. The column also **waits for its tail**: if a gap opens past
> 340 m, everyone forward of the break halts and digs in until the straggler closes up, rather
> than driving on and arriving piecemeal. Still open: formation shapes other than column
> (wedge, line, echelon) and a leader hand-off when the lead vic is destroyed.

When a group is routed, the members should move as one body along the **front vic's path**,
not each pathfind independently to its own offset:
- The lead (front) unit computes the route; trailing units **follow that same path** in file/
  formation, holding spacing — a proper column/convoy instead of members diverging onto
  separate ways to their slots.
- Keeps the group together through choke points, bridges, and roads; kills the current spread
  where each unit solves its own A\* to a formation offset and they scatter.
- Design notes: only the lead unit runs A\*; followers trail the leader's path by a spacing
  offset (fall back to their own route only if separated); keep the existing slowest-member
  pace cap so the column stays together.

### Deployment & Fielding Mechanics 🟡 *(HQ/FOB one-click fielding + rally shipped; engineer and carrier radius gating still open)*
Right now a fielded ground unit can be placed anywhere inside a base's deploy zone. It should
instead **originate from the fielding source and move out** to where the player wants it:
- ~~**HQ / FOB ground units** — spawn **at** the HQ/FOB and then move out to a rally point near
  the base~~ ✅ — `fieldUnit(type, structId)` builds the unit on the site and issues its own
  `orderMove` to a rally ~340 m out, facing the map interior. Successive units fan left/right of
  that bearing so a queue spreads instead of stacking (verified: three units out at 335/350/354 m,
  112–269 m apart). A player-draggable rally point is still the natural follow-on.
- **Airfield aircraft** — unchanged: launched from the strip and sent to a specific orbit point,
  exactly as it works now.
- **Engineer installations** — buildable only **within a radius of the engineer** (the engineer
  emplaces it), not anywhere on the map.
- **Carrier-launched UAS** — same as the engineer: the drone launches **within a radius of the
  carrying unit**, so hand-launched birds actually come off the unit that carries them.
- ~~**One-click fielding, no map click**~~ ✅ — select an HQ/FOB (map or roster) and the ground
  rows carry a **⊕**; clicking the row fields it immediately. No deploy mode, no map click. The
  aerostat keeps its map click (it picks a site), as do airfield aircraft and engineer builds.
  FOB rows grey out when the site's own stock can't cover the cost, so the block is visible
  before the click.
- **The installation is the context** — because the source is already selected, the palette is
  already filtered to what that installation can field (which it does today), so the **+** never
  needs to ask "from where?". Airfield aircraft keep their orbit-point click, since *where* they
  fly is the actual order.
- Design notes: ground deploy = spawn at base → auto-move to a chosen/near rally; gate
  build/launch clicks to a range check around the source (toast if out of range); keep the
  deploy-zone ring as the *allowed rally area* rather than a free-placement region. The **+**
  flow removes the `mode: 'deploy:<TYPE>'` round-trip for ground units — `deployUnit` gets called
  straight from the palette row with the selected structure as the origin, then issues an
  `orderMove` to the rally. A per-installation rally point the player can drag (RTS-style) is the
  natural follow-on.

### Threat-Aware Routing ⬜ *(playtest finding)*
The detour advisory warns; it doesn't stop the pathfinder routing straight through the
enemy's axis. Around water the only crossing is often exactly where the fighting is, and
units take it without hesitation — both playtest engineers died this way.
- **Route cost from the contact picture** — known live contacts project a soft cost
  bubble into `findPath` for friendly planning (fog-honest: it reads the COP, not ground
  truth).
- **A "safe route" option** beside ROADS ONLY rather than always-on — sometimes through
  *is* the order.
- Design notes: an additive cost raster rebuilt from `S.contacts` at order time, sampled
  in the A* neighbour loop like `roadBias`. Keep it away from the AI's own moves until
  *Symmetric Fog* gives it an honest picture too. Combat groups (escorted moves) are the
  deeper fix.

## Enemy AI / OPFOR 🟡

### Decision Layer — Utility Scoring for Commander & Units 🟡 *(phase 1 shipped 2026-07-24: substrate + FIRE_HE / SMOKE_SCREEN / DIG_IN on battlegroup commanders — `domains/opfor/decide.ts`; verified in hour-long headless runs: prep fires when the assault is close enough to support, smoke answering incoming fire on the reported threat vector, digging in on taken ground; `fireMission` made side-aware (OPFOR pays its own purse); debug via `__game.S.enemyGroups.map(g => g.lastDecision)`. Next: unit-SOP echelon, fix+flank schemes, reserve; tuning follow-ups: DIG_IN only digs currently-idle members, garrison ARTY at the base never participates)*
Every deciding agent knows its full menu of available actions and scores each against
the situation — a **utility system**: many small hand-written evaluations flowing into
a decision. Deterministic, hand-tunable, debuggable; no training, no models.
- **The iron rule**: the layer only *chooses among* the existing player-legal order
  functions and shared drills (`orderMove` / `orderAttack` / `orderRoe` / `orderDefend`
  / `fireMission` / the deploy paths). It never grows AI-only mechanics. If a decision
  wants a capability that doesn't exist yet (e.g. unit self-smoke), that capability
  ships in the shared layer as a player-usable feature FIRST (see *Tactical Smoke*),
  and then both sides' deciders may use it. AI-specific needs get discussed before
  being built.
- **Two echelons of decider**:
  - *Commander* (per battlegroup, later the OPFOR commander): assign objective ·
    fix / flank schemes · commit or withhold the reserve · fire missions in support
    (HE prep on a defense, **SMOKE screening an advancing group**) · dig in on ground
    taken · withdraw / consolidate.
  - *Unit SOP*: return fire · break contact (**+ pop self-smoke once it exists**) ·
    dismount · dig · resume mission · hold. These extend the existing drill/ROE
    machinery rather than replacing it.
- **Scoring**: an action = availability predicate + weighted considerations (threat,
  own strength, ammo/supply, commander's intent, terrain) → 0..1; best score wins,
  with hysteresis/decision cooldowns so agents don't oscillate. All randomness through
  `S.rng` in fixed order — golden-gated like everything else in the sim.
- **Intent flows down**: the commander stamps each group with intent (mission +
  aggressiveness); intent is an *input to the members' scoring* — a screening unit
  scores BREAK high, an assaulting unit scores PUSH high. This generalizes the ROE
  knob that already exists.
- **Personalities are weight tables**: cautious defender / armor thrust / recon-pull
  profiles (and difficulty itself) are just different consideration weights — no new
  code per personality.
- **Both sides benefit by construction**: the unit-SOP scoring runs the shared drill
  layer, so *player* units inherit the same smarter automatic behaviors (law 4 —
  automation adds seats); the commander brain later becomes the friendly AI company
  XOs and the campaign's scripted OPFOR postures.
- **Debuggability is a feature**: a dev overlay showing each agent's chosen action and
  the scores behind it ("why did it do that") — utility AI lives or dies by this.
- Build order: (1) substrate + wire the actions that already exist (move/attack/ROE/
  defend + OPFOR arty fire missions) → (2) commander schemes (fix+flank, reserve,
  dig-on-objective) → (3) new shared capabilities as they ship (self-smoke, etc.) →
  (4) personalities/difficulty weights. *Symmetric Fog* stays a separate, later
  prerequisite for honest ISR-driven decisions.

**A priority.** Battlegroups now exist — four templates, recon vs main-effort roles, a
muster → advance → withdraw cycle, a recon screen 750 m ahead, objective re-selection every
10 s, and a withdraw under 35% strength. It issues only player-legal orders, so it inherits
the halt/dismount/break drills. What's still missing is everything above and around that:
- **Multi-echelon force, not one object** — a commander directing several subordinate elements
  (recon, main effort, supporting effort, reserve) rather than one blob.
- **Actually plans** — picks an objective, designates a main effort, sequences recon → shaping →
  assault, and commits/withholds a **reserve**; **counterattacks** when the player overextends;
  reacts to losses (culminate, consolidate, or press).
- **Uses the air/ISR layer** — flies its own **recon drones** to find the player under symmetric
  fog, and employs **strike/loiter/FPV** drones and requested fires like the player does (the
  order code is already side-agnostic — extend it to drones).
- **Difficulty & personalities** — tunable aggressiveness/competence; different OPFOR profiles
  (cautious defender, aggressive armor thrust, recon-pull infiltrator).
- Design notes: layer an operational "commander" above the existing battlegroup AI that owns
  objectives/reserves/phasing; give hostile forces the drone + request systems; expose a
  difficulty setting that scales tempo, competence, and asset access.

### Enemy Economy — the OPFOR Buys What It Fields 🟡 *(economy, upkeep cap, difficulty income and a map-size force cap shipped; wave ramping still open)*
**The AI plays by the player's rules.** It doesn't today: `spawnBattlegroup` conjures an entire
template into existence on a timer — free, no supply cost, no upkeep, no cap, no cooldown. That
is the reason it can put everything on the board at once while the player is counting supply,
and it's why a small map on the easiest difficulty can still overwhelm you.

Current behaviour, for reference: first wave at 60 s, then a full battlegroup every 110–180 s,
unbounded (16 groups by minute 30) — and **identical on Recruit and Elite**. Every difficulty
lever built so far (starting supply, income, starting force, damage scale) is on the player's
side of the board; the opposition never changes.

- ~~**Give the hostile side the same economy**~~ ✅ — `S.enemyResources` / `S.enemySupplyLift`
  run on the same lift clock as the player's, with `upkeepPerMin('hostile')` drawn off it.
  `spawnBattlegroup` now filters `BG_TEMPLATES` to what it can afford and debits the cost;
  broke means no wave. Hostile *garrisons* are exempt from upkeep — they're pre-positioned and
  locally sustained, and charging for them would starve the OPFOR's ability to ever attack.
  Measured at 30 min: 3 groups / 20 hostiles on Recruit up to 10 / 52 on Elite, where every
  difficulty previously converged on ~16 groups and ~90 hostiles. Pressure plateaus instead of
  compounding, and Recruit gets ~4 minutes before the first group is affordable.
- ~~**Upkeep caps the OPFOR the way it caps the player**~~ ✅ — same upkeep clock as the player,
  so destroying its units genuinely relieves pressure; it has to re-buy them.
- ~~**Difficulty becomes enemy income**~~ ✅ — enemy lift runs 240/min on Recruit up to 900/min on
  Elite (against the player's 900 down to 320), plus a starting bank that sets how soon the first
  group lands. Honest economic asymmetry instead of hidden rules.
- ~~**Scale with map size**~~ ✅ *(force side)* — the OPFOR lives under a per-side force cap that
  scales with map area (`MAP_FORCE_CAP`, tilted by difficulty via `CAP_MUL`): small 8v-cap on
  Recruit up to 45 on Elite/large. `spawnBattlegroup` won't field a template that would breach
  it, so density is bounded by room as well as money. *(Wave cadence/budget still doesn't scale —
  see below.)*
- **Also can't field from a base it lost** *(done)* — `spawnBattlegroup` requires a live hostile
  HQ/FOB and musters at it; raze them all and it stops reinforcing whatever it has banked.
- **Ramp rather than dump** — early battlegroups should be small and grow, instead of arriving
  full-size from the first affordable wave. This is the main piece still open.
- Design notes: mirror `S.resources`/`S.supplyLift`/`upkeepPerMin()` per side (a `sides` record,
  or `S.enemy.resources`); price `BG_TEMPLATES` from their members' `UNIT_TYPES[].cost`; gate
  `spawnBattlegroup` on affordability and let `S.nextWave` become "time until it can afford the
  next group" rather than a bare timer. The command layer is already side-agnostic — the AI
  issues player-legal orders — so this is that same idea finished. Pairs with Earned Income
  (both sides should earn from ground held) and Enemy AI / OPFOR.

## Engineering & Terrain

### Engineers Build Roads & Bridges 🟡 *(pontoon bridges shipped and written into the road grid; no road-building order)*
Extend the engineer platoon beyond its current gap-crossing bridge:
- **Build roads** — engineers can lay a road segment between two points, permanently
  improving mobility there (roads speed wheeled/tracked movement in `MOVE_FACTORS`).
- **Build bridges** — formalize/keep the existing bridge-a-water-gap ability.
- Both take build time and (likely) supply; the new road writes into the map's `road`
  grid so pathfinding and terrain rendering pick it up.
- Design notes: reuse the `orderBridge` flow for placement; roads mutate `map.road`
  cells along the drawn segment and re-cost the affected pathfinding tiles.

### EOD Unit (Explosives & Counter-IED)
A demolition and counter-explosive specialist:
- **Emplaces IEDs and mines** — lay hidden explosive obstacles to deny ground and ambush
  enemy movement (canalize the enemy into your engagement areas).
- **Clears IEDs and mines** — detect and neutralize enemy IEDs/minefields to open a safe
  lane for friendly movement.
- **Destroys bridges / structures** — drop a friendly or enemy bridge to deny a crossing
  (removes the bridge, reverting the gap to impassable water).
- Design notes: new `UNIT_TYPES` entry (SUPPORT/ENGINEER category); IED/mine entities
  (hidden until triggered or detected) that attrit crossing units; place/clear orders; a
  `demoBridge` order that removes bridge cells and re-blocks the water gap. Ties into the
  Obstacles & Area Denial item.

## Terrain & Protection

### True Line-of-Sight / Intervisibility
Terrain should block sight and fire, not just slow movement:
- **Crests, hills, and dead ground mask** units — something behind a ridge can't be seen or
  shot until an observer has line of sight. Makes hull-down, reverse-slope defense, and
  covered approaches real.
- Design notes: add an intervisibility check against the height grid for spotting and direct
  fire (sample the terrain profile between observer and target).

### Obstacles & Area Denial
- **Minefields, wire, and tank ditches** canalize movement and impose delay/attrition;
  engineers emplace them, EOD/engineers breach (dovetails with the engineering items).
- Shapes maneuver — force the enemy into your engagement areas.
- Design notes: obstacle entities that block/slow/attrit crossing units; a breach order clears
  a lane; ties into the EOD/engineer roster.

## Sustainment

### Ammo & Fuel Consumption + Accompanying Logistics
Make the LOG chain operationally decisive:
- Units **consume ammo and fuel**; run dry and they can't fire / can't move until resupplied
  (like the gunship's winchester, but for ground units).
- **Send fuel trucks and a supply truck along with a force** to extend how long and how far it
  can operate before it culminates.
- A force (and its accompanying LOG) can be told to **wait/hold for fuel and resupply** —
  pause the advance, top off, then continue.
- Design notes: per-unit ammo/fuel pools that deplete with fire/movement; LOG units transfer
  from their capacity; a "hold for resupply" order; a culminating point emerges when a force
  outruns its supply.

### Heli Aerial Resupply (Speedballs)
- Utility/attack **helicopters can drop speedballs** (resupply bundles) to units **running low
  on ammo**, rearming them in the field without a ground convoy.
- Design notes: a helo resupply action that delivers an ammo (later fuel/medical) bundle to a
  friendly unit's position; reuses the helo platform + the unit ammo pools above.

### Casualties & MEDEVAC (9-Line)
Give losses weight and a recovery path, requested like a call for fire:
- Casualties can be **evacuated via a 9-line MEDEVAC request** — same request/approve pattern
  as the artillery/CAS call, dispatching a medevac bird to pick up wounded and recover strength
  rather than writing those losses off.
- Design notes: mirror the call-for-fire flow with a MEDEVAC 9-line form/toast; a medevac helo
  flies to the unit, and evacuated casualties return strength (at a FOB/aid station); wounded vs.
  killed split feeds how much is recoverable.

## Audio

### Radio Chatter Library, Callsigns & Message Factory 🟡 *(callsigns + phrasing wrapper done; no role numbers, no per-event template table, no SALUTE/9-line/SITREP)*
Generate authentic radio traffic that drives the JBC-P NET readout now and voice later.

**Unique callsigns (command-down).**
- Give every element a consistent, unique callsign down the chain — a unit word + a role number
  (US convention: `6` = commander, `5` = XO, `7` = senior NCO, `1–4` = subordinate
  platoons/sections; higher HQ has its own). e.g. `HAMMER 6` (company cdr), `HAMMER 1` (1st plt).
  Phonetic, and reused consistently in every message to/from that element.
- Design notes: a callsign generator that draws from a name pool + assigns role numbers per
  echelon at spawn, stored on the unit/HQ; the enemy gets its own (unheard on our net).

**Message factory (templates + variation).**
- Each event type has a **template with slots** filled from game state (callsigns, grid, cardinal
  direction, range, SALUTE-style enemy description) and **several phrasing variants** so it isn't
  identical every time. Uses proper **prowords** (THIS IS, CONTACT, SPOT REPORT, ROGER, WILCO, SAY
  AGAIN, OVER, OUT, BREAK), the phonetic alphabet, and grid readouts.
- Example (contact): `{HIGHER}, THIS IS {UNIT} — CONTACT {DIR}, {RANGE}, {SIZE}x {ENEMY} VIC GRID
  {GRID}, OVER.` → variants reorder/reword ("TROOPS IN CONTACT", "IN CONTACT, {DIR}", etc.).
- **Legit formats to build in** (proper procedure):
  - **Contact / SPOT report — SALUTE**: Size, Activity, Location, Unit, Time, Equipment.
  - **9-Line MEDEVAC**: 1 pickup location/grid · 2 freq/callsign · 3 # patients by precedence ·
    4 special equipment · 5 # by type (litter/ambulatory) · 6 security at pickup · 7 marking
    method · 8 patient nationality/status · 9 terrain/NBC.
  - **CAS 9-line**: 1 IP/BP · 2 heading (IP→tgt) + offset · 3 distance · 4 target elevation ·
    5 target description · 6 target location/grid · 7 mark type/code · 8 friendlies location ·
    9 egress · + remarks; plus run brevity (CHECK IN, IN FROM THE SOUTH, CLEARED HOT, WINCHESTER,
    OFF STATION).
  - **Routine**: SITREP, ACE report (Ammo/Casualties/Equipment), MOVE/SET, RTB/BINGO, RIFLE/SPLASH.
- Design notes: a `radio()` factory that takes an event + actors and returns both a formatted
  string (for the NET) and a structured token list (for voice); a small variant/synonym table per
  message type; replaces ad-hoc radio strings over time.

### Radio Channels / Nets
Real C2 runs multiple nets, not one stream — split the traffic into channels:
- **Separate nets** — e.g. **Command**, **Fires**, **Air/CAS**, **Admin/Log**, and optionally a
  **per-combat-group net** (ties into named groups). Each message is tagged to a channel by its
  type/originator.
- **Monitor & filter** — the JBC-P NET can filter by channel; the player chooses which channels
  they **hear** (chatter audio) and see, with **per-channel volume/mute**. Monitor all, or focus
  the command net and mute the log net.
- **Immersion + control** — lets the player dial the information load and adds authenticity
  (fires traffic on the fires net, air on the air net).
- Design notes: add a `channel` field to net messages (routed from `kind`/actor); a channel
  selector on the NET panel; gate both the text feed and the chatter audio per monitored channel.

## Maps & World

### Seed-Generated Maps 🟡 *(genMap(seed, size) + size presets shipped; the seed is `Date.now() % 100000`, never shown and not enterable)*
- **Seeded procedural maps** *(done)* — the terrain/hydrology/roads/towns generate from a single
  seed, and the map now comes in **selectable sizes** (Small 4.8 km / Medium 8.0 km / Large
  12.8 km), chosen on the splash screen for a new game (`genMap(seed, gridSize)`).
- Still open: **surface/expose the seed** in the UI so a specific battlefield is shareable and
  replayable (seed entry + display), not just randomized per game.

### More Detailed Maps & Bigger Towns *(superseded)*
Superseded by the **Maps & Terrain** M-track (theaters, culture layer) and the **Urban
depth** design discussion — fold any remaining wishes into those entries.

### Tutorial Map
TOC has a lot of surface area and none of it is currently explained. One small map, launched
from the splash, that walks a player through a single complete operation. **Keep it simple** —
one linear mission, not a syllabus.

**The mission, in order:**
1. **Field a task force** — deploy a Stryker Rifle Platoon, a Rifle Platoon, an Engineer
   Platoon and a Logistics Platoon from the HQ. Teaches: select the installation, ⊕ to field,
   units build at the base and move out to a rally.
2. **Take the nearest town** — move the task force to the town and clear the garrison.
   Teaches: movement orders, mounted travel vs dismounting in contact, weapons control.
3. **Establish a FOB there** — the engineer emplaces it on the objective. Teaches: engineers
   build installations, and a forward base extends the deploy zone.
4. **Open a supply route** — run the logistics platoon HQ → FOB. Teaches: FOBs spend their own
   stock, and convoys are what keep them fielding.
5. **Put up air** — launch the organic UAS off a carrier unit, and fixed-wing off the airfield.
   Teaches: recon drives fog, feeds are how you see ground truth, caps and cooldowns.
6. **Destroy the enemy HQ** — the win condition, now with a supplied forward base and eyes on.

- **Teach through the radio net** — each step arrives as TOC traffic in the net log, which is
  already the game's voice, rather than modal popups that stop the sim. A quiet highlight on
  the control being referenced is enough pointing.
- **Non-blocking** — steps advance off sim state, not a step counter, and a player who does
  things out of order or early just ticks them off early. Nothing is locked.
- **Forgiving opposition** — a light town garrison and no wave clock, so nobody gets run over
  while they read.
- **Skippable and replayable** — never forced on first launch, always available from the splash.
- Design notes: fixed seed + staged placement like `initDevGame`; a task list whose checks read
  sim state (units of type X exist, town cell cleared of hostiles, a FOB within the town radius,
  a convoy completed, a drone on station, `S.won`). Reuse `radio()` for prompts. Pairs with the
  Unit Wiki (what the tutorial points at) and the Scenario Builder (same staging/serialization).

### Scenario Builder
A proper in-app editor to lay out a battle instead of hand-placing everything by console:
- **Place forces for both sides** — friendly and enemy units, structures, and drones anywhere on
  the map, set their facing/posture/mount state, and drop wrecks/smoke/effects for staging.
- **Set starting conditions** — map seed, supply/economy, fog on/off, objectives, and each side's
  order of battle.
- **Save / load scenarios** (seed + placements as data) so they're repeatable and shareable;
  feeds custom battles, feature testing, and staged screenshots/demos.
- Design notes: an editor mode that writes to the same `S` (units/structures/drones) via the
  existing deploy paths but side-agnostic and position-free; serialize a scenario to JSON;
  pairs with the mode selector, seeded maps, and the dev/test map. Played back through
  **Game Modes → 7. Skirmish**, which adds a victory-condition picker on top.

## Installations

### Static Defense Assets — Pillboxes & Emplacements ⬜ *(needs a larger design discussion before build)*
A new class of buildable "unit": static defensive works — pillboxes, bunkers, AT
emplacements, maybe trench segments — that hold ground without tying up a maneuver
platoon. Raised by engineers, killed like structures, fought like units.
- **The idea** — a pillbox covers an avenue of approach with a fixed weapon arc; a
  bunker shelters infantry (garrison a squad inside?); an AT emplacement makes a
  crossing or road genuinely expensive to force. Pairs naturally with *Make Maneuver
  Beat Mass* (prepared defense should win frontally) and gives Base Defense (waves)
  and the Campaign's LODGMENT mission their teeth.
- **Open questions for the discussion:**
  - Crewed or automatic? (garrisoned by troops pulled from a unit vs self-firing like
    the planned FOB guard towers — very different sustainment and balance)
  - Unit or structure? (element model + weapons like a unit, or hp-block + buildT like
    a structure — probably a structure with a unit's fire pass)
  - How they differ from dug-in infantry so both stay worth using (arc-limited but
    tougher? no reposition ever? cheaper to hold, blind outside the arc?)
  - Overlap with *Obstacles & Area Denial* (wire/mines under Terrain & Protection) and
    *FOB / HQ Built-in Defenses* below — one emplacement system should serve all three.
  - Does the OPFOR get them? (its prepared belts would love pillboxes — and symmetric
    rules say yes)
- Design notes (sketch only, pending the discussion): likely a `STRUCTURES`-style
  catalog entry with an `emplacement` block (arc, range, dps, crew?) resolved in the
  direct-fire pass against the element model; engineer-built via the existing build
  flow with its own placement rules (fields of fire preview would be the killer UX).

### FOB / HQ Built-in Defenses
Bases shouldn't be passive HP sponges — give FOBs and HQs organic protection:
- **Guard towers / fighting positions** that automatically engage enemies within range,
  so a base can defend itself against probing attacks without a dedicated garrison.
- Scales with the installation (HQ better defended than a FOB); part of the structure,
  destroyed with it.
- Design notes: add a per-structure weapon (range + DPS) that auto-fires on the nearest
  visible hostile, resolving against the element model like unit fire; render tower
  icons on the map and models in the drone feed.

### C-RAM at FOBs and HQs
Counter-Rocket, Artillery and Mortar defence for the bases, so incoming indirect fire isn't a
guaranteed hit:
- **Intercepts inbound indirect fire** — a C-RAM at a FOB/HQ engages mortar/artillery/rocket
  rounds inbound to its protected radius, destroying some fraction of the salvo before impact
  (with the characteristic burst of fire in the drone feed and on the map).
- **Not a hard shield** — a saturating salvo or counter-battery on the C-RAM itself gets through;
  intercept chance falls off with volume, and the system has ammo/reload limits.
- Makes enemy artillery a problem to *suppress* (counter-battery, SEAD-style strikes on the C-RAM)
  rather than an unanswerable attack, and gives HQ/FOB placement more meaning.
- Design notes: a per-structure interceptor with a protected radius and per-round hit chance,
  checked against `S.shells` in flight before their `impactT`; pairs with FOB/HQ Built-in Defenses
  and Counter-Battery.

### Helipad Installation
A rotary-wing base for the attack helicopters (and future utility/lift helos):
- **Placed near an HQ or FOB** (like other installations, within a `near` radius of an
  existing base) — cheaper/faster than an airfield.
- Launch/rearm/refuel point for helos; ties into the Attack Helicopters asset above.
- Design notes: new `STRUCTURES` entry with `launchesHelos` (parallel to the airfield's
  `launchesDrones`); helo assets spawn from the nearest helipad.

### Installation-Gated Unlocks 🟡 *(context-sensitive palette shipped; nothing is greyed with a "needs airfield/helipad" hint — the only existence check is a toast at click time)*
The deploy palette is now **context-sensitive**: it only appears when you select a fielding
source and lists exactly what that source can field — click an **airfield** for the fixed-wing
UAS + AC-130, an **HQ/FOB** for ground units + the aerostat, an **engineer** for installations,
a **carrier unit** for its organic Raven/Switchblade. What remains is gating on *existence* of
the enabling installation (grey out airfield UAS until an airfield is built, etc.):
- **Placing a helipad unlocks the attack helicopters** — they're locked until at least
  one friendly helipad exists.
- **Placing an airfield unlocks the airfield-launched UAVs** — the fixed-wing UAS
  (Shadow, Sentinel, Viper) and the AC-130 gunship are locked until a friendly airfield
  exists.
- Field-launched assets (Raven, Switchblade) and the aerostat stay available without an
  airfield, as today.
- Design notes: gate each palette entry on the presence of its enabling structure
  (`launchesDrones` / `launchesHelos`); show locked items greyed with a "needs airfield
  / needs helipad" hint rather than hiding them, so the player knows the path to unlock.

## Interface & Multi-Window

Let the commander spread the fight across tabs, windows, and monitors — a real CIC has
many screens, not one. Build toward the state being a **single source of truth** that any
number of lightweight view windows read from and issue commands to.

### HUD Polish — Small Fixes ⬜
A running list of small, self-contained UI corrections:
- **Top-bar stat cluster still needs work** — SUPPLY / NET-MIN / UPKEEP / MISSION are now
  uniform caption-over-value stacks, but the two-line stack is heavy for a 34 px bar and the
  captions read as noise at that size. Try a single-line `LABEL │ value` treatment with a thin
  divider between each pair, so the row scans horizontally like an instrument strip instead of
  four little towers. Worth trying inline units too (`+550/min` rather than a NET/MIN caption).
- **Drop the unit-type sub-label in the installations roster** — each row already shows the
  2525 symbol and the site's name (HQ COBALT, FOB DEV); repeating the abbreviation
  underneath as a second line is noise. Keep the row to symbol + name, and reserve the
  sub-label slot for something that changes (e.g. the BUILDING countdown).
- ~~**FOG button should read `FOG` and toggle by colour**~~ ✅ — fixed label, `variant` carries
  state, matching every other top-bar toggle. (It now only appears in the dev sandbox at all.)
- Design notes: roster label in `CommandPanel.jsx` (`InstallationsRoster` → `PaletteRow`'s
  `tag` prop); FOG button in `TopBar.jsx`. Both are a few lines.

### Bottom Panel / Selection Tray UI 🟡 *(minimize + richer cards added; no scale-to-selection, not scrollable, still ad-hoc inline styles rather than the Mantine theme)*
The bottom selection tray needs design work — it's grown organically and feels cramped and
inconsistent:
- **Rework the layout** — the per-unit cards, order buttons (HOLD/MOUNT/FIRE MISSION/DIG IN),
  command mode, ROE, and weapons-control rows are dense and wrap awkwardly with a large
  selection; clean up spacing, grouping, and hierarchy.
- **Scale to selection size** — degrade gracefully from one unit to a large marquee (summarize
  a big selection instead of showing N full cards); make it scrollable/collapsible.
- Consistent styling with the rest of the HUD (the restyled deploy panel is the reference), and
  make the common orders faster to reach.

### Unit Wiki (Friendly & Enemy)
An in-game reference so the player can actually learn the order of battle instead of guessing:
- **Every unit, both sides** — friendly and enemy entries with the MIL-STD-2525 symbol, name and
  abbreviation, role, mobility/speed, sight and weapon ranges, firepower vs soft/hard targets,
  protection, crew/vic counts, cost, and any special abilities (bridging, indirect fire, organic
  UAS, dig-in posture).
- **Also cover UAS, installations and munitions** — airframes (endurance, altitude, sensor range,
  armament), structures (build time, deploy zone, supply), and shell/weapon types.
- **Reachable in context** — open from a unit's context menu / the deploy palette / the selection
  tray, and browsable as a standalone codex; enemy entries reveal progressively as you identify
  them (tie to fog/contacts so it doubles as an intel log).
- Design notes: it's mostly a read-only view over `UNIT_TYPES` / `DRONE_TYPES` / `STRUCTURES`, so
  the data already exists — render it with the shared symbol drawing (`PaletteIcon`) and Mantine;
  pairs with the TS rewrite (typed models make this trivial to generate).

### Save / Continue Game
Persist a session so a game can be resumed later:
- **Save the full sim state** (`S` — map seed + size, units, structures, drones, resources, time,
  fog, radio log) to local storage (and/or a downloadable file), and **Continue** from the splash.
- Autosave periodically and on exit; a small save/load menu.
- Design notes: `S` is a plain mutable singleton, so serialize it to JSON (rebuild the `Map`/`Set`
  fields and the `S.map` methods on load, or regenerate the map from its seed+size and replay
  placements); add a "Continue" entry to the splash when a save exists; pairs with the Scenario
  Builder's serialization and seeded maps.

### Pop-Out UAV Feeds
- **Detach a feed window into its own browser window/tab** so it can be dragged to a second
  monitor and run full-size, independent of the main map.
- Multiple pop-outs at once (e.g. one per combat group's supporting drone).

### Units / Combat-Group Dashboard
- A separate window that lists and **manages units and named combat groups** — status, orders,
  missions, ammo/fuel, roster select — while the tactical map lives on another screen.
- Lets you run sustainment/task-org from one screen and maneuver from another.

### Multiple / Detachable Map Views
- **More than one map view open at once**, each independently panned/zoomed. e.g. the main map
  and functions on one screen; on the other, three panels — each a combat group's **drone feed +
  a map zoomed to that group's location** — watched side by side.

### Architecture — do we need WebSockets? (No, not for this)
WebSockets are for talking to a **server / another machine**. Everything above is the *same
machine, same browser*, so it's all client-side:
- **The problem:** the sim today is a module singleton (`S`) living in one tab's JS context.
  A popped-out window is a **separate context** and can't read `S` directly.
- **The fix (right long-term shape):** move the sim into a **SharedWorker** — one authoritative
  game loop shared by every tab. The main map, dashboard, and each pop-out become thin **view
  clients** that render from shared state and post commands back to the worker.
- **Lighter interim option:** keep the sim in the main tab and sync pop-outs via the
  **BroadcastChannel API** (or `window.open` + `postMessage`) — the main tab broadcasts state
  snapshots/deltas each tick; pop-outs render them and send commands back. No server needed.
- **Where WebSockets do come in:** only for **true remote multiplayer** (players on different
  machines). Nicely, the SharedWorker "views send commands to an authoritative sim" split is the
  *same shape* as client/server — so doing this now sets up multiplayer later: swap the local
  worker transport for a WebSocket to a server. Pairs with the side-agnostic command layer and
  the Multiplayer north star.
- Design notes: promote `S` + `tick` into a SharedWorker with a command channel; make Map/Feed/
  HUD read a state snapshot rather than importing `S` directly; start with one pop-out feed over
  BroadcastChannel to prove the transport, then generalize.

## Bugs & Fixes

### Trees Growing on Roads (drone feed) ⬜ *(added 2026-07-23)*
Roads cut through forest, but the feed's instanced trees spawn on any forest cell —
including cells a road polyline passes through — so trunks stand in the middle of the
carriageway.
- Design notes: the tree placement loop in `DroneView getDetail()` checks
  `terr === T_FOREST` only. Cheapest fix: also skip cells with `road[ci]` set (cell-
  granular; may clear slightly wide). Cleaner: distance-to-road test — sample the road
  raster at the jittered tree position (or a couple of points around it) so trees keep
  crowding the verge but never stand on the deck. Same check should apply to the
  buildings loop for urban cells a road crosses.

Everything else tracked is fixed — records in the Shipped Archive → Fixed Bugs. One
carried-forward nice-to-have lives with *Threat-Aware Routing*: a friendly unit whose
route is impassable should get a fallback (re-plan / cross-country / abort) instead of
only reporting the failure.

## Later / Deferred

### Civilians & ROE  *(later)*
Human terrain — neutral civilians, positive-ID, and collateral-damage consequences that give
precision fires and target designation real moral weight. Deferred for now; the sister gunship
project already has a civilian model to draw on when we pick this up.

---

## Shipped Archive

Everything below is **done and verified**. Compact records — the full design text lives
in this file's git history and the feature commits. Open follow-ups from shipped items
are called out here *and* stubbed in the active sections above where they matter.

### Maps & Terrain (the 2026-07-23 overhaul)
- **M1 — Real-DEM theaters** — 7 real-world elevation patches (Fulda Gap, NTC Mojave,
  Tigris Valley, Donbas Steppe, Ardennes, Arghandab Valley, Golan Heights) baked from
  public-domain DEMs into repo assets (`tools/bake-theaters.mjs`, no runtime fetches);
  seeded sub-windows so one theater yields many battlefields; splash gained the
  CAMPAIGN / SKIRMISH / DEV SANDBOX top level + TERRAIN step. Procgen noise stays the
  default source and the golden baseline. *Open: RANDOM button, coastal sea-level
  water, theater names in briefings.*
- **M2 — Cartography glow-up** — Lambertian hillshade, elevation-warped farmland mosaic
  that hugs the contours, forest-edge treelines, river/lake bank lines, stronger
  contours. View-only.
- **M2.5 — Road hierarchy & vector roads** — roads are Chaikin-smoothed vector
  polylines (`WorldMap.roads`) stroked per-frame, raster-stamped for O(1) mobility;
  three classes (highway = the MSR trunk / road / dirt path) with per-class
  MOVE_FACTORS; bridges as span objects at every paved water crossing; dirt paths can
  never cross water. Golden re-baselined `60356280`.
- **M3a — Hamlets + named terrain** — settlements strung along the paved net;
  `WorldMap.features` with military spot-elevation hills (real meters on theaters —
  HILL 1190 on the Golan) and named rivers, rendered as faint BFT reference marks.
- **M3b — Terrain-anchored radio** — `locRef`: report traffic says "VIC CALDER" /
  "VIC HILL 1190"; precision traffic (fires, waypoints, LKPs) keeps raw grids.
- **M4 — Mode recipe framework + KotH hill guarantee** — `ModeSpec.mapOk` + bounded
  map-seed reroll; KotH rejects hill-less maps. *(Campaign recipe still open — tracked
  in the active M4 entry.)*
- **Feed ground on painted textures + AO apron** — DroneView colors moved off vertices
  onto 2048² IR/EO canvas textures (smooth shorelines/treelines, vector-true roads, no
  diagonal river pinch); interim 1.6 km blur apron beyond the AO *(real fix is M3c)*.
  Towns/hamlets clear forest from their footprints; urban wins render priority.

### Game Modes & End of Match
- **End-of-Match shared framework** — `ModeSpec` (label/sub/setup/update/checkEnd/end
  text), `checkMatchEnd` in the frozen tick order, RunStats after-action counters,
  full-screen end modal + REVIEW pill, sim freezes on match end; splash mode selector.
- **1. Attack & Defend** — formalized as mode 1 (destroy the enemy CP, keep yours or a
  FOB fallback); OBJECTIVE SECURED / COMMAND POST LOST.
- **2. Base Defense (waves) v1** — banked economy (no lifts/upkeep), hand-tuned 10-wave
  scripted escalation, per-wave payouts, WAVE stat in the top bar; POSITION HELD /
  BASE OVERRUN. *(Follow-ups stubbed above: READY trigger, difficulty-scaled waves,
  pacing.)*
- **5. King of the Hill** — real hill picked from the elevation raster (now guaranteed
  by the M4 recipe), control-by-presence clocks, holder-tinted zone on the BFT, OPFOR
  fights for the hill; OBJECTIVE HELD / HILL LOST.
- **Difficulty presets** — Recruit→Elite set starting supply, starting force and a
  both-sides damage scale; dev cheats gated to the sandbox.

### Combat, Movement & AI
- **Movement & orders playtest hardening** *(July 2026 playtest — 7 defects)* —
  spread-drag U-turns fixed (cross-country spreads), right-click waypoint delete with
  mid-route re-path, break-contact resumes the mission (one retry), long-detour
  advisory, artillery holds its march through fire missions, structures select like
  units.
- **Water discipline** *(2026-07-23)* — no corner-cut fords through diagonal water
  cells, `findPath` never terminates on a raw in-water point, `spawnEnemy` snaps
  through `nearestLand`. All three leaks were in shared services — the AI issues only
  player-legal orders, by design and in fact. Golden `1377301839`.
- **Surrender** — low-strength units in contact can surrender, both sides. *(POW
  handling folded into the active HUMINT entry — EPW debriefs.)*
- **Enemy economy (bulk)** — the OPFOR buys what it fields, pays upkeep, lives under
  map-size force caps, needs a live base to muster, difficulty = enemy income.
  *(Wave ramping still open — tracked in the active entry.)*

### Air & ISR
- **AC-130 Spectre gunship** — orbiting fire support with its own thermal gun-camera
  feed, 25/40/105 mm resolved per-vic; muzzle-origin fix (rounds depart the port beam).
- **Air asset caps & re-tasking cooldowns** — `maxActive`/`cooldown` per airframe
  (AC-130 1 up / 15 min turnaround), `airAvailability()` gates deploys and drives the
  palette's used/total + countdown display; halved gunship magazine.
- **Drones shadow enemy units** — FOLLOW tasking vs hostiles; aerostat follows with
  sensor only. *(Open: LKP hold / re-acquire on lost track — noted in the M-track
  loose ends.)*
- **Aerostat fixed stare + distinct airframe silhouettes** — shipped inside the 🟡
  airframe-types entry (see active section for what remains).

### Interface & UX
- **Persistent left command panel** (installations roster + contextual deploy palette),
  **NET log as a full-height right rail**, **collapsible side panels**, **off-map
  backdrop** matching the splash, **fit-to-screen control** clear of the feed dock,
  **UAV resize handle in the footer**, **per-feed mute**, **one-click fielding + rally
  fan-out**, **airfield placement restricted to the HQ**, **dev/test sandbox map**
  *(open: purpose-built terrain layout)*.
- **Victory/defeat screen** — absorbed into the end-of-match framework above.

### Audio
- **Radio chatter & CIC soundscape** — net traffic audible, weapon audio diegetic to
  the open feed. **Squelch + procedural "mumble" voice** — keyed-mic click, wordless
  cadence-tracking voice per callsign through a radio bandpass, priority-throttled.

### Architecture
- **TypeScript migration** — full strict-TS domain-driven rewrite of the whole game
  (`src/MIGRATION.md`), golden-run verified, fully seeded sim, sim-edit HMR hot-apply.
  Golden baseline history: `696495692` → `4133144527` → `1929051837` → `60356280` →
  **`1377301839`** (current).

### Fixed Bugs
- **OPFOR units crossing rivers** — see Water discipline above.
- **AC-130 rounds from the wrong point** — `gunMuzzle()` puts rounds 14 m off the port
  beam, riding the airframe at every altitude.
- **Column deadlocks behind a straggler** — column order recomputed per tick from
  route progress; columns hold 38–267 m instead of stretching to 1.4 km.
- **Sensor lock during transit** — LOCK gated to on-station.
- **ROUTE IMPASSABLE toast spam** — toast gated to player-issued orders; hostile
  pathfinding failures are silent.
