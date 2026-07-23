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
self-reported. Last audited 2026-07-22.

---

## Status at a Glance

**✅ Shipped (29)** — TypeScript migration *(full domain-driven rewrite, golden-run
verified, fully seeded sim)* · AC-130 Spectre gunship · AC-130 muzzle origin *(fixed —
bottom-centre of the feed)* · Movement & orders playtest hardening *(spread routing,
waypoint right-click delete, break-contact resume, long-detour advisory, artillery march
resume, structure select)* · Air asset caps & re-tasking cooldowns ·
Ground force caps + refit cooldowns · Difficulty presets · One-click fielding + rally ·
Formation column movement *(built; parked until combat groups)* · Road-aware routing + route
modes · Economy: upkeep, stepped resupply, difficulty income · Aerostat turret (auto/free,
follow, one-click) · Weapon-range overlay · In-contact ring · Drones shadow enemy units ·
Surrender · Airfield placement restricted to HQ · Dev / test map · Off-map backdrop ·
Persistent left command panel · NET log as full-height right panel · Collapsible side panels ·
Move UAV resize handle to footer · Per-feed mute · Radio chatter & CIC soundscape · Radio
chatter audio (squelch + mumble) · Rest & refit at a FOB *(main bullet)* · Sensor-lock transit
bug *(fixed)* · ROUTE IMPASSABLE toast spam *(fixed)*

**🟡 Partial (12)** — Attack & Defend *(win/lose yes; no mode selector, no end-of-match
handling)* · Air asset cost & access · Drone team & organic UAS ·
Drone airframe types & FPV · Tactical smoke *(system yes, triggers no)* · SIGINT/EW *(DF
only)* · Enemy AI / OPFOR · Engineers build roads & bridges *(bridges only)* · Radio chatter
library & message factory · Seed-generated maps *(seed not surfaced)* · Installation-gated
unlocks *(no existence gating)* · Bottom panel / selection tray

**⬜ Everything else is not started.** Two items are commonly mistaken for started —
they are not: **Individual unit formations** (the old `formationOffset` dead code was
removed in the TS migration — nothing exists) and **Symmetric fog & counter-recon**
(`updateContacts` is one-directional; the AI reads ground truth — there is no enemy
contact model).

---

## Priority

### Now — finish what's half-built
1. ~~**AC-130 gun muzzle origin**~~ ✅ — rounds depart from bottom-centre of the feed
   (straight below the sensor) at every bearing and altitude.
2. ~~**Deployment & fielding mechanics**~~ ✅ — the ⊕ one-click flow off the installations
   roster shipped, with refit cooldowns and force-cap gating shown in the palette.
3. ~~**Game modes & end-of-match handling**~~ ✅ *(framework + three playable modes:
   A&D, Base Defense, King of the Hill — see Game Modes)*. Zone Capture parked for a
   design discussion; Campaign in design, paused behind the map overhaul below.
4. **Maps & Terrain overhaul** ← **CURRENT FOCUS** *(decided 2026-07-23: nail the map
   system before anything else — see the Maps & Terrain section)*. Campaign development
   resumes on top of it.
5. **Bottom panel / selection tray** — the last piece of HUD that ignores the Mantine theme
   and the only one that degrades badly with a large selection.

### Next — the enablers
5. ~~**Code quality — TypeScript & componentization**~~ ✅ **DONE** — full strict-TS,
   domain-driven rewrite, golden-run verified (`src/MIGRATION.md`). The gate on the unit
   wiki, tray rework, and dashboard is open.
6. **Save / continue game** — highest player-facing value per unit of work, and the natural
   first API surface now that there's a server. Easier now: the sim is fully seeded and the
   state is typed plain data built for a JSON round-trip.
7. **Enemy AI / OPFOR** — battlegroups exist; what's missing is a commander above them,
   a reserve, counterattacks, and any use of the air/ISR layer.
8. **Symmetric fog & counter-recon** — the AI cheats today. This is the single change that
   most raises the ceiling on every other combat system.

### Later — depth
Unit wiki · scenario builder · tutorial map · call for fire · counter-battery · attack
helicopters · air defence & SEAD · sustainment (ammo/fuel, MEDEVAC, speedballs) ·
true line-of-sight · smoke triggers · auto break-contact · installations' defences & C-RAM ·
radio channels/nets · better three.js assets & particles · additional game modes (waves ·
zone capture · king of the hill · spec ops) · campaign (last — it builds on the others).

### Someday — architecture
SharedWorker sim → pop-out feeds, detachable map views, combat-group dashboard, and
eventually multiplayer. Deliberately last: it's the same client/server split, so doing it
early buys nothing until the game underneath is worth spreading across screens.

---

## Maps & Terrain  🟡 *(CURRENT FOCUS — direction decided 2026-07-23)*

### Design laws (agreed 2026-07-23 — every map decision is tested against these)
1. **The drone feed is the product; the map exists to serve it.** The feeds must remain a
   mostly-accurate representation of the ground. Nothing ships that makes the map cooler
   at the feeds' expense — which is why full real-world (OSM) maps were rejected: our
   synthesized ground would be competing with the player's mental image of a real place.
2. **This is the war in Iraq, not the war in Baghdad.** Operational maneuver at 50 m/cell.
   The smallest orderable element is a platoon; towns are terrain a company occupies,
   cordons or shells — never building-by-building mazes. Buildings exist only as drone-feed
   scenery (footprint render data), never as gameplay entities. Every theater must be
   *maneuver country*: valleys, river plains, ridge-and-farmland, steppe — at most one
   modest town per map, no megacities.
3. **One map contract, many sources.** Everything compiles to `WorldMap` (elev / terr /
   road / slope rasters + towns + names). Map *sources* are swappable compilers:
   `procgen noise | baked real-DEM theater | authored heightmap | (someday) builder file`.
   Both renderers (BFT and feeds) read `WorldMap`, so drone-cam ground truth is accurate
   by construction regardless of source.

### The plan
- **M1 — Real-DEM theaters** ⬜: real elevation, procedural culture. A curated **theater
  library** — hand-picked real-world terrain patches (Copernicus/SRTM 30 m, public-domain
  government data, fetched once and baked into small repo assets — no runtime downloads,
  no keys, offline). `genMap` swaps only its elevation step; depression fill, flow-accum
  rivers, terrain classing, forests, towns, roads and bridges all run unchanged on real
  relief — flow accumulation on a real DEM puts rivers where the real rivers are. Seeds
  still vary the culture *and* pick a sub-window of the (larger) theater patch, so one
  theater yields many battlefields. Splash: theater picker (or RANDOM) in the Skirmish
  flow. Candidate theaters (doctrine-test compliant): wide river plain with bluffs ·
  glacial valley · karst hills · high-desert mesa country · forested ridge lines
  (Ardennes-like) · alpine pass · coastal fjord · open steppe with wadis.
  *Pure-noise procgen stays as a source (and as the golden-run default — baseline
  unchanged; theater maps are additive).*
- **M2 — Cartography glow-up** ⬜: hillshade + contour rendering under the BFT symbology
  (real military-map look), better water/forest/field rendering. Visual only, golden-safe.
  Fixes most of "the maps feel lackluster" on its own; twice as good over real relief.
- **M3 — Culture layer upgrades** ⬜: towns strung along roads and valleys instead of
  scattered; field/hedgerow patterning; a **buildings layer** (footprints in towns —
  scenery only, per design law 2) rendered by the drone feeds so village orbits stop
  looking empty; **named features** (rivers from the flow-accum pass, dominant hills,
  towns already named) feeding radio calls, briefings and objective labels
  ("crossing the KOMA RIVER", "contact on HILL 402"). Wider open areas and 2–4 km
  engagement geometry so the terrain plays at company/battalion frontage, not
  skirmish-game density.
- **M4 — Mode recipes** ⬜: per-mode map validation (the Campaign's guaranteed river belt
  across the axis, ≥2 crossings, towns along the way; KotH's central dominant hill), by
  generate-validate-reroll. Campaign development resumes here.
- **Map authoring v0** *(free with M1)*: a "map" is a heightmap + a culture recipe —
  Claude can author maps by hand (painted or real-DEM heightmap + placement params JSON)
  with zero tooling. The community-facing **map builder** lands later as a Scenario
  Builder tab; players who want to build maps get the old-school-RTS custom-map loop
  (share JSON + PNG), the player who doesn't (Dave) never touches it.
- **Parked**: full OSM real-world import (roads-as-data is solved — it's a graph — but it
  fails design law 1 in the feeds); vector/polygon map rewrite (raster bones are good).

---

## C2 & Echelon  ⬜ *(design direction agreed 2026-07-23)*

**You command the echelon the mission deserves.** Small maps / Spec Ops → battalion (or a
task-force slice). Medium → brigade. Large / Campaign → division — **division is the
player ceiling**. Multiplayer someday: a human **corps** commander with human division
commanders under them — the C2 hierarchy *is* the multiplayer structure.

- **Platoon stays the atomic element** at every echelon; the drone feed remains the only
  window below it.
- **Intent-based subordinate commanders** make high echelons playable: you don't
  micromanage 60 platoons, you tell 2nd Battalion to seize the crossing and screen north.
  The machinery already exists — the OPFOR battlegroup AI is exactly this (a commander
  that issues only player-legal orders, tactical execution in shared code, built to be
  side-agnostic). A friendly battalion commander is that code pointed the other way.
- **The directed telescope**: the player can always reach down and directly order any
  platoon. Delegation is the default, never a cage.
- **ORBAT / task organization**: units roll into companies/battalions/brigades in a task
  org tree (UI: an ORBAT rail; orders at any node). Prerequisite for combat groups,
  formations, and the campaign's later missions.
- **Campaign promotion arc**: the campaign *promotes* you — mission 1 is a battalion
  command (the tutorial, solved organically); by the river crossing you run a brigade;
  the endgame is yours as division commander. Teaching arc and echelon ladder are the
  same mechanism.

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
and will eventually let the player place enemy units too. The July 2026 playtest made the gap concrete: the HQ fell, one toast fired and
scrolled away, and the sim kept running — orders still worked, the OPFOR kept fighting,
nothing acknowledged the loss.

### End of Match — Shared Framework ⬜ *(absorbs the old Victory/Defeat Screen item)*
The mode declares the outcome; this framework lands it:
- **Mode-declared outcomes** — each mode registers its win/lose checks and end text
  (A&D: objective secured / command post lost; Waves: waves survived / base overrun;
  Zone Capture: line held / line broken). `S.won`/`S.lost` become the A&D mode's
  implementation detail, not the global rule.
- **A modal, not a toast** — full-screen overlay in the splash's visual language (radial
  wash + faint grid), with the outcome stated plainly.
- **After-action summary** — mission clock, units fielded and lost, enemy destroyed,
  supply spent, mode/difficulty/map played. Wants a few counters accumulated during the
  run — units lost and enemy killed aren't recoverable from final state.
- **The sim actually ends** — freeze (or wind down) the loop on match end; post-defeat
  today the OPFOR keeps spawning and the palette still half-works. NEW GAME goes straight
  back to the splash; continue-watching stays as a secondary action for reading the map.
- Design notes: render from `App` above the rails, reusing the Splash backdrop. A small
  `ModeSpec` (id, label, init hook, `checkEnd(S) → outcome | null`, end text, stat lines)
  keeps modes 2 and 3 from re-implementing the screen.

### 1. Attack & Defend 🟡 *(win/lose conditions exist; no mode selector, no end-of-match handling — see the shared framework above)*
The existing sandbox: take the enemy HQ while defending your own. Formalize it as
a named mode with explicit win/lose objectives and a mode-select entry point.

### Difficulty Presets ✅
New games run **map size → difficulty** on the splash. Four presets set three levers at init:
- **Starting supplies** — Recruit 14,000 · Regular 8,000 · Veteran 4,500 · Elite 2,500.
- **Starting force** — the units already on the ground: a company at Recruit down to a single
  platoon at Elite. Slots that land on no-go terrain are nudged to the nearest passable spot,
  so the force is never silently short a vic.
- **How long firefights run** — a global damage scale applied to **both sides**, so lower
  difficulty means units soak more and fights last longer. It buys reaction time rather than
  making the player invincible.
- Design notes: presets live in `game/difficulty.js`; `initGame(seed, size, difficulty)` applies
  them and sets `S.damageMul`, consumed at the two damage sites (direct fire and
  `precisionBlast`). Damage is scaled rather than max strength on purpose — strength is treated
  as a 0-100 percentage everywhere (surrender thresholds, reconstitution caps, HUD bars), so
  raising the ceiling would break all of it. Dev tooling is gated behind `S.devMode`, set only
  by `initDevGame`, so the FOG/+10K cheats no longer appear in a real game.

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

### 2. Base Defense (Waves) ✅ *(v1 shipped — playable from the splash; "ready" trigger and difficulty-scaled waves still open)*
A survival/horde mode built around a supply economy that is spent, not idled:
- ~~**Supplies do NOT continuously generate**~~ ✅ — passive lifts AND upkeep are off
  while the mode runs; you bank your starting supply and spend deliberately.
- ~~**Enemy waves scale up over time**~~ ✅ — a hand-tuned 10-wave escalation from a
  two-platoon probe to massed armor with guns behind it, launched as scripted
  battlegroups (no economy/cap gates — the schedule is the difficulty).
- ~~**Earn a supply payout after clearing each wave**~~ ✅ — 500 + 200×wave on repel,
  with a NET call and toast; 75 s intermission to spend it, 90 s grace before wave 1.
- ~~Hold your base across escalating waves~~ ✅ — survive all 10 → POSITION HELD;
  base network lost → BASE OVERRUN. Cutting the OPFOR's launch base ends the threat.
- Still open: a manual **"READY" trigger** to call the next wave early; **difficulty
  scaling** of the wave table (identical on Recruit and Elite today); wave pacing on
  larger maps (foot-heavy early waves walk a long way).

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
wants M4's guaranteed map shape and M3's named terrain for its briefings. Two design
decisions made in the meantime: the **main menu** is CAMPAIGN / SKIRMISH / DEV SANDBOX
(see the menu note above), and the campaign uses the **promotion arc** (see C2 & Echelon):
mission 1 is a battalion command, the endgame a division. A single **Large (12.8 km)
map**, one continuous operation fought as a sequence of missions **on that same map**. Nothing resets between missions: the front moves, your
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

### 5. King of the Hill ⬜
One objective, both sides want it, terrain decides who keeps it:
- **The hill is real** — pick the map's dominant terrain feature (the elevation
  raster already exists): a hilltop, or the central town on flatter seeds. Mark a
  control radius on the BFT.
- **Control by presence** — friendly units inside, no live hostiles → your clock
  runs. Contested or empty → nobody's does. First side to accumulate N minutes of
  control wins.
- **Why it's not a blob fight** — the hill itself pays: holding high ground extends
  sight (ties into *True Line-of-Sight* later), and the control radius is small
  enough that arty, smoke and flanks around the shoulder matter more than mass in
  the open (leans on *Make Maneuver Beat Mass*).
- **OPFOR posture** — continuous pressure: battlegroups cycle onto the objective
  instead of marching on your HQ; its economy decides how hard each push is.
- Design notes: a single capture zone sharing Zone Capture's presence/ownership
  machinery (build whichever first, the other inherits it); mode-owned clock in
  `S`; `checkEnd` = first-to-N-minutes; the hill picker reads the elevation raster
  for the highest defensible cell cluster near map centre. A natural second
  implementation after A&D — smaller than Waves and it forces the capture-zone
  plumbing Zone Capture needs anyway.

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

### C-130 Gunship (AC-130) ✅
An orbiting fire-support platform called in as a timed asset:
- Circling gunship that provides on-call precision fires (25mm / 40mm / 105mm
  analog) against ground targets while it's on station.
- Sensor/feed of its own (thermal gun-camera view), consistent with the drone-feed
  system, with the player designating targets in the feed.
- Time-on-station limit and a supply cost to call it in; leaves when winchester or
  bingo.
- Fits the existing element model — rounds resolve against individual vics.

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

### Air Asset Caps & Re-Tasking Cooldowns ✅
Cost alone doesn't gate air power — once the economy is healthy you can simply buy another
gunship. Scarcity should be structural: a limited number of airframes, and a wait before the
next sortie.
- **Per-type concurrent cap** — each airframe gets a max number airborne at once, varying by
  how strong it is. The AC-130 is the clear outlier (persistent 25/40/105mm area fire over a
  whole grid square): **cap 1**. Fixed-wing ISR sits mid (Shadow/Sentinel a few each), and the
  hand-launched field drones (Raven/Switchblade) stay effectively uncapped — they're the
  attritable ones.
- **Per-type cooldown after the sortie ends** — when an airframe RTBs, is shot down, or times
  out on endurance, that type is unavailable for a set period (turnaround/rearm). **AC-130: 15
  minutes.** Shorter for the smaller platforms, none for field drones.
- **Surface it in the deploy palette** — the entry shows the cap as used/total, and when on
  cooldown it's disabled with the remaining time, so the player can plan the next window
  instead of discovering the block at click time.
- **Balance pass alongside it** — the gunship's magazine was halved (25mm 500→250, 40mm
  100→50, 105mm 10→5) so a single sortie is a decisive commitment rather than an endless
  orbit. Caps + cooldown + a finite magazine are the three levers; tune together.
- **Shipped as:** `maxActive`/`cooldown` on the `DRONE_TYPES` specs — AC-130 1 airborne with a
  15-minute turnaround, Shadow 3/2 min, Sentinel 2/4 min, Viper 2/5 min; Raven, Switchblade and
  the aerostat stay uncapped. `airAvailability(type)` is the single source of truth, used both to
  gate `deployDrone` (refusal toast naming the limit or the remaining turnaround) and to render
  the palette row, which shows `used/total` or `⟳ m:ss` and greys out when unavailable.
  `endSortie()` stamps `S.airCooldown[type]` from every despawn path — recovery, bingo, tether
  loss, and crash — so a lost airframe costs the same wait as a clean recovery.

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

### Drones Shadow Enemy Units ✅ *(no LKP hold / re-acquire when the track is lost)*
Follow tasking now works against hostiles: click a contact in the UAV feed to designate it, then
**FOLLOW** to track it. A movable airframe flies its **orbit anchor** after the contact while the
**sensor stays under operator control** (following moves the aircraft, not the camera). The
tethered **aerostat** can't move, so it follows with the **sensor only (camera lock)** and drops
the track once the contact leaves its sensor arc. The track drops automatically when the contact
is destroyed.
- Still open: hold the **last-known position** as a broken track when the contact goes dark under
  fog (currently drops the follow), then re-acquire.

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

### Surrender ✅ *(no POW handling)*
Broken units don't always fight to the death or cleanly withdraw:
- A unit at low strength that's in/near contact rolls a small surrender chance (~1–5%) per check
  and, if it surrenders, is removed from the fight (friendly surrender toasts; enemy surrender
  reports over the NET). Both sides can surrender.
- Still open: prisoner handling / POW intel value.

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

## Command & Control

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

### Movement & Orders — Playtest Hardening ✅ *(July 2026 full-campaign playtest)*
A complete Medium/Regular campaign played end-to-end through the real input handlers
(ended in an honest defeat — see *Make Maneuver Beat Mass* for the balance read) shook out
seven movement/order defects, all fixed and verified:
- **Spread-drag road U-turns** — per-slot road inference made any slot landing within
  100 m of a road cling to the network the whole way and hook back in a J (measured
  2–5.6× detours) while neighbours went direct. Spreads now route cross-country with mild
  road damping unless a route mode is explicitly set.
- **Right-click deletes waypoints** — on any pip, units and drones; removing a middle
  waypoint re-paths the bridge between its neighbours. Previously a right-click near a
  pip cleared the whole selection.
- **Break-contact resumes the mission** — one retry once contact is broken (the playtest
  supply truck silently dropped four successive move orders); a route that keeps drawing
  fire is abandoned with UNABLE TO CONTINUE. Convoys exempt — their loop self-heals.
- **Long-detour advisory** — a move order whose route runs >1.6× the straight line
  radios TAKING LONG DETOUR with the route length (two engineers died on silent 5 km
  detours through the fight before this existed).
- **Artillery keeps its march** — a fire mission ordered mid-move holds the route and
  resumes it after the reload (ROUNDS COMPLETE — RESUMING MOVEMENT), and the FIRING
  state relaxes to hold instead of sticking forever.
- **Structures select like units** — clicking a friendly installation with units in hand
  selects it (shift-click still appends a move onto it), instead of marching the
  selection onto the base.

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

### Rest & Refit at a FOB ✅ *(ground reconstitution shipped; FOBs are not an air rearm/refuel point — drones despawn on RTB)*
No dedicated recovery/repair units — instead, worn-down forces **heal by falling back**:
- A unit that **makes it back to a FOB regenerates strength** over time (reconstitution),
  turning FOBs into the rest/refit/rearm hubs (no separate FAARP — FOBs are the hubs for air
  rearm/refuel too).
- Design notes: extend the existing reconstitution so proximity to a friendly FOB/HQ drives
  faster regen; FOBs double as the air rearm/refuel point.

## Audio

### Radio Chatter & CIC Soundscape ✅
Sound should reinforce the **"you are the commander in the CIC"** fantasy, not drop you into
the mud:
- **Radio chatter** — the core of it: spot reports, contact calls, requests, RTB/winchester,
  net traffic reading out over the radio (the RadioLog made audible). Alert tones for requests
  and losses.
- **Not full battlefield audio** — hearing cannons while staring at a UAV feed breaks the CIC
  frame. Keep weapon/impact sound **diegetic to the feed you're watching** (muted/attenuated on
  the map) or optional, so the map stays a quiet command view and the feed is where the noise is.
- Design notes: the sister gunship project's `audio.js` is a starting point; drive radio SFX/TTS
  off the existing radio events; gate weapon/ambient audio to the active drone feed rather than
  the map.

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

### Radio Chatter Audio (Squelch + Procedural "Mumble") ✅ *(no player-facing radio volume control)*
The **net readout stays**; on top of it, play the *sound* of radio traffic. **No computer
TTS** (browser voices sound like Siri and can't route through our radio filter). Instead:
- **Radio SFX** — a keyed-mic **click** on the front, a **static/squelch** bed, and a squelch
  tail ("ksshh") on the back of every net transmission, with a little crunch. This alone reads
  instantly as a command post and can never sound wrong.
- **Procedural "mumble" voice** — a synthesized, wordless voice that tracks the *cadence and
  inflection* of the message (Animal-Crossing "Animalese" / muted-trombone idea, but **military,
  not cartoon**): low gruff pitch, terse clipped syllable blips driven by the message's word/
  syllable count, gaps between words, a downward inflection at the end of a statement, run
  through the narrow radio bandpass so it's muffled comms. You *hear* the traffic and *read* the
  words — never intelligible speech, so it's always dynamic and never wrong.
- **Per-speaker variation** — hash the callsign to a base pitch + formant so different elements
  sound distinct (ties into the callsign system).
- **Global, not feed-gated** — this is the command net; it plays regardless of which feed is
  open (unlike weapon audio, which is gated to the feed). **Throttle + priority** so it's traffic
  not a drone — contact/fires/loss always chirp; routine gets a short blip or is skipped. Its own
  **radio volume**, silenced by the existing mute.
- Design notes: build on the existing Web Audio graph; hook the friendly `radio()` net path
  (sim.js) to a `radioMsg(text, speakerSeed, priority)` that emits click → mumble → squelch
  through a shared radio bandpass; derive syllable timing from the text; own gain node under
  master.

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

### Per-Feed Mute (Individual UAV Tabs) ✅
Audio is currently all-or-nothing on the global mute, but up to four feeds can be open at once —
each with its own engine ambient, gun reports and impacts.
- **Mute a single feed** — a small mute toggle per UAV window (and per feed tab), so you can watch
  a noisy gunship run while keeping a quiet ISR feed up, or silence a feed you're only glancing at.
- **Independent of the global mute** — the top-bar mute still kills everything; per-feed mute is a
  finer control layered under it. Muted state rides with the feed (and shows on its tab).
- Design notes: `audio.js` already keys ambients by `feedId` (`setFeedAmbient`/`clearFeedAmbient`),
  so add a per-feed gain/mute flag and check it in the feed-audio pass in `DroneView` (gun reports,
  impacts, ground-unit fire) as well as when starting the ambient loop.

## Maps & World

### Seed-Generated Maps 🟡 *(genMap(seed, size) + size presets shipped; the seed is `Date.now() % 100000`, never shown and not enterable)*
- **Seeded procedural maps** *(done)* — the terrain/hydrology/roads/towns generate from a single
  seed, and the map now comes in **selectable sizes** (Small 4.8 km / Medium 8.0 km / Large
  12.8 km), chosen on the splash screen for a new game (`genMap(seed, gridSize)`).
- Still open: **surface/expose the seed** in the UI so a specific battlefield is shareable and
  replayable (seed entry + display), not just randomized per game.

### More Detailed Maps & Bigger Towns
- **Richer terrain and larger, denser towns** — more detail in the world and bigger urban areas
  to fight over (urban terrain matters more with LOS, cover, and HUMINT in towns).
- Design notes: increase town size/building density and terrain detail; make sure pathfinding,
  cover, and LOS scale with the added density.

### Dev / Test Map ✅ *(still rides the procedural small map; no hand-built terrain)*
A purpose-built sandbox for fast, accurate feature testing, reached from the splash screen's
**Dev Sandbox** button (`initDevGame`):
- Uses the **small map** (fixed seed, fog off, full supply, no incoming waves) with **one of every
  friendly and hostile unit type** staged per side and both sides' installations (HQ + FOB + OP,
  friendly also an airfield). Friendly lower-left, enemy upper-right; both fit in one screen.
- Units start **weapons-held** so the scene stays static and reproducible until the dev commits
  to a fight.
- Still open: a purpose-built terrain layout that deliberately packs every cover/concealment type,
  choke points, and water gaps into one screen (currently rides the procedural small map).

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

### Airfield Placement Restricted to HQ ✅
Airfields are a strategic asset, not something you sprinkle anywhere:
- **Only the HQ can establish an airfield** — `AFLD` placement requires proximity to a friendly
  HQ specifically (not any base), with a "must be established near the HQ" toast when out of range.

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

### Persistent Left Command Panel ✅ *(roster + palette shipped; group/unit sections still to come)*
The left panel is currently a transient deploy palette — it only exists while a base, airfield,
engineer or carrier is selected, and vanishes the moment you click elsewhere. It should be a
**permanent fixture of the console**, always on screen, with the deploy palette as just one of
several sections.
- **Always visible** — a fixed left rail that's part of the layout rather than a popup, so the
  map/HUD reserve space for it instead of it floating over the terrain. Sections are
  independently collapsible so a player can keep only what they use open.
- **Installations roster** — a live list of friendly HQs, FOBs, OPs and airfields: click one to
  select and centre it, and field from it immediately via the **+** flow (see *Deployment &
  Fielding Mechanics*). This is the fix for the current friction of hunting for a base on the map
  before you can deploy anything.
- **Deploy palette, contextual as now** — keeps the existing "what you clicked determines what
  you can field" behaviour, but rendered inside the persistent panel and driven by whatever is
  selected in the roster, with an empty/hint state instead of disappearing.
- **Room to grow** — the panel is the home for the roster-style views that don't belong on the
  map: combat groups / task organisation, a unit roster with status, supply and build queues.
  Each is a section, added over time.
- Design notes: `DeployPanel` becomes a section inside a new persistent `CommandPanel`;
  `deployContext(selectedIds)` still decides palette contents but now also accepts a structure
  selected from the roster. Lay the app out so the panel is a flex sibling of the map rather than
  an absolute overlay. Pairs with the Units / Combat-Group Dashboard (same data, detachable
  window) and the TS/componentization rewrite — worth doing after the split, since it's a
  restructure of exactly the code `HUD.jsx` currently owns.

### NET Log as a Full-Height Right Panel ✅ *(channel filtering deferred to Radio Channels)*
The radio net log is currently a free-floating, hand-resized box pinned near the top-right
(`top: 44, right: 10`, a stored `netSize`, and a resize grip in its corner). It's the console's
primary readout and should be a proper panel, not a widget parked on the map.
- **Full-height right rail** — mirror the persistent left command panel: the net occupies the
  full height between the top bar and the bottom of the screen, part of the layout rather than
  floating over the terrain. The manual width/height resize goes away (or becomes a draggable
  splitter on its inner edge).
- **Tidy the message list** — the entries are a dense unstyled stack right now. Give them real
  structure: timestamp / callsign / message columns that line up, clearer per-kind colour and
  priority weighting, visual grouping by sender or time, and a sensible empty state. Keep
  click-to-centre.
- **Filtering, once it's roomy** — filter or mute by net/channel and by message kind, which the
  current box has no room for. Pairs with *Radio Channels / Nets*.
- Design notes: `RadioLog` moves from an absolute `top/right` box with `ui.netSize` to a flex
  sibling in the app layout; drop `netSize`/`setNetSize` and the corner grip in favour of a
  splitter. Do it alongside the persistent left panel — it's the same layout change (map becomes
  a flex centre column between two rails).

### Collapsible Side Panels ✅ *(no width animation; state is session-only, not persisted)*
With both rails permanent, the player needs the screen back on demand.
- **Minimize each panel to its own edge** — the left command panel collapses left, the NET panel
  collapses right, each leaving a thin always-visible strip to restore it. Independent of each
  other, so any combination is possible (both open, one open, full-screen map).
- **The map reclaims the space** — collapsing genuinely widens the map rather than just hiding an
  overlay, which is the point of making the panels part of the layout.
- **Remember the state** — a collapsed rail stays collapsed across the session (and into saves,
  once Save / Continue lands).
- Design notes: two booleans in the UI store driving the flex layout; animate the width so the
  map's `clampView` re-fits smoothly rather than snapping. The existing `showNet` toggle in the
  top bar becomes the NET rail's collapse control.

### Victory / Defeat Screen → moved to Game Modes
Folded into **Game Modes → End of Match — Shared Framework**: victory/defeat conditions
belong to the mode being played, so the screen (modal, after-action summary, and the sim
actually ending) is specified there and shared by all three modes.

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

### Off-Map Backdrop — Match the Splash Screen ✅
The off-map area shown on **fit-to-screen** (the letterbox where the square map doesn't fill the
viewport) is currently a flat dark fill, which reads as harsh "black edges."
- **Style it like the splash screen** — the same radial-gradient + faint grid backdrop — so the
  fit-to-screen view looks intentional and framed rather than clipped.
- Design notes: reuse the splash's backdrop treatment for the map canvas's off-world fill (behind
  the world-edge border); keep it theme-aware (day/night).

### Fit-to-Screen Control Overlaps the UAV Window ✅
> **Fixed** — the bottom-right 50 px strip is reserved for map controls: feeds now default-dock
> at `bottom: 50` so the ⛶ corner stays clear. Verified: docked feed's bottom edge sits 10 px
> above the button and the button is the top element at its own centre. (A hand-dragged feed can
> still be parked over it deliberately — that's the player's choice, not a default collision.)

The bottom-right **fit-to-screen (⛶)** map control sits in the same corner where UAV feeds dock, so
it overlaps the drone window. (The UAV window is now top-most z-index, so it covers the button, but
that just hides it rather than fixing the layout.)
- Give the map controls their own reserved spot clear of the feed dock (e.g., a small control
  cluster that the feeds avoid, or reflow the button when a feed occupies that corner).

### Move the UAV Resize Handle to the Footer ✅
The feed window's resize grip is a small triangle in the bottom-right of the sensor view, which
overlaps the imagery and the footer controls.
- Move the resize affordance **into the footer bar** (e.g., a grip at the footer's right edge) so it
  doesn't sit on top of the video, matching the tidy three-part header/view/footer layout.

### Code Quality — TypeScript & Componentization ✅ *(full migration complete — the game runs on a strict-TypeScript, domain-driven `src/`)*
Done as a formal rewrite-in-place migration (see `src/MIGRATION.md` for the full record):
- **Strict TypeScript everywhere** — sim state (`GameState`), every entity (units/elements/
  drones/structures/shells/contacts/battlegroups), catalogs, orders, and all UI props typed;
  `npm run typecheck` is clean and gates every change.
- **Monoliths gone** — `sim.js` (~2400 lines) split into domain modules
  (`engine/ world/ domains/{forces,air,installations,fires,intel,economy,comms,opfor}`) with a
  frozen tick order composed in `engine/SimLoop`; `HUD.jsx` and friends ported to typed TSX with
  DroneView split into view/camera/feedAudio.
- **Behavior-proven** — a golden-run harness (`?golden`, baseline hash `4133144527`) digests a
  scripted 10-minute battle; the port matched the old sim bit-for-bit before cleanup.
- **Bonus fixes landed en route** — HMR counter-reset bug (callsign reuse), a latent crash in the
  feed hamburger's Lock control, dead code removed, the sim is now fully seeded (whole battles
  replay from their seed — groundwork for save/replay), and sim edits hot-apply without killing
  the running session.

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

### AC-130 Gun Rounds Originate From the Wrong Point ✅ *(fixed — `gunMuzzle()` spawns rounds 14 m inboard on the port beam, 7 m below the fuselage; the drop rides the airframe so it no longer slides with ALT. Applied to the 25/40 mm cannon path and the 105 shell.)*
Tracers don't look like they leave the aircraft's guns, and the apparent origin **shifts when
altitude is changed** — both symptoms of the round's spawn point being the aircraft's own
camera position rather than a muzzle on the airframe.
- **Rounds spawn at the aircraft centroid.** `gunshipHowitzerFire` / the cannon path stamp
  `fromX: d.x, fromY: d.y` with `mAlt = spec.alt * (d.altMul || 1)` — dead centre of the
  aircraft, at exactly the sensor's own altitude. But the feed camera *is* the aircraft, so
  rounds appear to emanate from the eye point instead of from a gun off to the side.
- **Real AC-130 guns fire out the port beam.** The 25/40/105mm all fire to the **left** during
  a left-hand pylon turn. The muzzle should be offset laterally from the fuselage centreline
  (and slightly below), rotated by the aircraft's current heading around the orbit — so the
  tracer visibly departs from off-camera-left rather than from under the lens.
- **Altitude changes the origin** because `mAlt` scales directly with `altMul` while the camera
  altitude moves with it too; any mismatch between the two reads as the muzzle sliding.
  Tie the muzzle to the airframe's frame of reference, not to an independently-computed
  altitude.
- Design notes: derive the muzzle from the drone's orbit heading — offset ~10–15 m port and a
  few metres below the fuselage — and stamp that as `fromX/fromY/mAlt` in `sim.js` (~lines
  753–756 for the howitzer, 579/676 for the cannon paths). `DroneView`'s tracer pass already
  draws straight from `r.fromX/fromY/mAlt` to the impact, so fixing the spawn point fixes the
  render with no change there. Worth checking the muzzle-flash sprite placement at the same time.

### Column Deadlocks Behind a Straggler ✅ *(fixed — column order was static; see below)*
A formation halts and goes firm when a gap opens past `STRAGGLE_GAP` — but if the trailing
element **never** closes, the column waits forever. Measured on a cross-map march: the front
four hold station beautifully (59/32/74 m gaps) while the last element sits ~1.4 km back and
four units stay in `colWait` indefinitely.
- **Find out why the straggler stalls** — it isn't simply slow; the group cap is already
  released for units outside their station so it should be closing at its own speed. Suspects:
  it's in contact and running a halt/break drill, its join leg put it on the wrong side of an
  obstacle, or its path is blocked.
- **Then bound the wait** — cut a straggler loose after it demonstrably fails to close, so the
  column presses on and the straggler finishes the move independently. An attempt at this was
  reverted: it fired during initial forming-up (units start scattered around the HQ, so the
  gap is legitimately large before the column has formed) and dissolved the column within 60 s.
  The timer needs to start only once the column has actually formed, and reset whenever the
  gap is shrinking.
- **Root cause (not combat).** `colIdx` was assigned once when the order was issued — but at
  that moment every unit is bunched at the start with indistinguishable positions along the
  route, so the ordering was effectively arbitrary, and it then drifted as faster units pulled
  ahead. "The vic ahead" ended up pointing at a unit that was actually behind, so the real
  front ran free while the real rear halted waiting on it. Compounding it, the route owner
  (the slowest unit, whose path everyone shares) was pinned to `colIdx 0` even when it was
  physically at the back — route owner and column head are different jobs.
- **Fix:** column order is recomputed every tick from progress along the shared route (fewest
  waypoints remaining = furthest along). Column length now holds 38–267 m over a full cross-map
  march instead of stretching to 1.4 km, and the stall clears itself once formed.

### Sensor Lock Placement During Transit ✅ *(fixed by gating LOCK to on-station; the projection math was never made state-aware, so FOLLOW and in-feed target clicks during transit still assume the on-station aim point)*
Clicking **LOCK** on a UAV *before* it reaches its orbit (still in transit) drops the lock
reticle in the wrong spot. The LOCK button and the feed's ray/projection use the **on-station**
aim point (`drone.tx + gimbal`), but while transiting the camera actually looks **ahead along the
flight path** — so they disagree and the lock lands off from where the sensor is pointed.
- Fix: derive the lock point (and `feedRayToGround` / `feedProjectToScreen`) from the drone's
  *current, state-aware* camera look-at — the same one `DroneCamera` uses (transit looks ahead;
  on-station/lock look at `tx`/lock point) — so LOCK and the reticle agree in every state. (Or
  simplest: only allow LOCK once on-station.) **(fixed — LOCK now gated to on-station.)**

### "ROUTE IMPASSABLE" Toast Spam ✅ *(fixed)*
"ROUTE IMPASSABLE" toasts stacked up and never cleared. Root cause: `orderMove`/`orderAttack`
called `toast('ROUTE IMPASSABLE')` regardless of side, and the enemy AI re-drives idle units
every tick — so a hostile unit stuck against an unreachable objective (e.g. an aim point in a
disconnected water basin) re-fired the toast forever, for movement the player never ordered.
- **Fix:** the toast is now gated to friendly (player-issued) orders only — hostile pathfinding
  failures are silent. Verified headless: a hostile unit given an unreachable route pushes no
  toast; a friendly unit still surfaces the one legitimate notification.
- Still open (nice-to-have, not causing the spam): give a friendly unit whose route is impassable
  a fallback (re-plan / try cross-country / abort) instead of just reporting the failure.

## Later / Deferred

### Civilians & ROE  *(later)*
Human terrain — neutral civilians, positive-ID, and collateral-damage consequences that give
precision fires and target designation real moral weight. Deferred for now; the sister gunship
project already has a civilian model to draw on when we pick this up.
