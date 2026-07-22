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

**✅ Shipped (18)** — AC-130 Spectre gunship · Air asset caps & re-tasking cooldowns ·
Difficulty presets · Drones shadow enemy units · Surrender ·
Airfield placement restricted to HQ · Dev / test map · Off-map backdrop · Persistent left
command panel · NET log as full-height right panel · Collapsible side panels · Move UAV
resize handle to footer · Per-feed mute · Radio chatter & CIC soundscape · Radio chatter
audio (squelch + mumble) · Rest & refit at a FOB *(main bullet)* · Sensor-lock transit bug
*(fixed)* · ROUTE IMPASSABLE toast spam *(fixed)*

**🟡 Partial (13)** — Attack & Defend *(win/lose yes, no mode selector)* · Air asset cost &
access · Drone team & organic UAS ·
Drone airframe types & FPV · Tactical smoke *(system yes, triggers no)* · SIGINT/EW *(DF
only)* · Enemy AI / OPFOR · Engineers build roads & bridges *(bridges only)* · Radio chatter
library & message factory · Seed-generated maps *(seed not surfaced)* · Installation-gated
unlocks *(no existence gating)* · Bottom panel / selection tray · Code quality — TS &
componentization *(split started, zero TS)*

**⬜ Everything else is not started.** Two items are commonly mistaken for started —
they are not: **Individual unit formations** (`formationOffset` is dead code, zero call
sites) and **Symmetric fog & counter-recon** (`updateContacts` is one-directional; the AI
reads ground truth — there is no enemy contact model).

---

## Priority

### Now — finish what's half-built
1. **AC-130 gun muzzle origin** *(bug)* — rounds spawn at the aircraft centroid at sensor
   altitude, which is exactly where the feed camera sits, so tracers leave the eye point and
   the origin slides with altitude. Small, visible, and wrong in every gunship sortie.
2. **Deployment & fielding mechanics** — the **+** one-click flow off the new installations
   roster. The rail that makes it natural now exists; fielding is still click-the-map.
3. **Bottom panel / selection tray** — the last piece of HUD that ignores the Mantine theme
   and the only one that degrades badly with a large selection.

### Next — the enablers
5. **Code quality — TypeScript & componentization** — `HUD.jsx` is still ~1000 lines and
   `sim.js` ~1970. Split first, type second. This gates the unit wiki, the tray rework, and
   the dashboard.
6. **Save / continue game** — highest player-facing value per unit of work, and the natural
   first API surface now that there's a server.
7. **Enemy AI / OPFOR** — battlegroups exist; what's missing is a commander above them,
   a reserve, counterattacks, and any use of the air/ISR layer.
8. **Symmetric fog & counter-recon** — the AI cheats today. This is the single change that
   most raises the ceiling on every other combat system.

### Later — depth
Unit wiki · scenario builder · tutorial map · call for fire · counter-battery · attack
helicopters · air defence & SEAD · sustainment (ammo/fuel, MEDEVAC, speedballs) ·
true line-of-sight · smoke triggers · auto break-contact · installations' defences & C-RAM ·
radio channels/nets · better three.js assets & particles · game modes 2 and 3.

### Someday — architecture
SharedWorker sim → pop-out feeds, detachable map views, combat-group dashboard, and
eventually multiplayer. Deliberately last: it's the same client/server split, so doing it
early buys nothing until the game underneath is worth spreading across screens.

---

## Game Modes

The game currently plays as one open scenario. Add a mode selector and three modes:

### 1. Attack & Defend 🟡 *(win/lose conditions exist; no mode selector — the splash offers map size and Dev Sandbox only)*
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

### 2. Base Defense (Waves)
A survival/horde mode built around a supply economy that is spent, not idled:
- **Start with lower supplies** than the open scenario.
- **Supplies do NOT continuously generate** (unlike the current passive income). You
  bank what you're given and spend deliberately.
- **Enemy waves scale up over time** — early waves are small, light units; later
  waves grow in size, quality, and combined-arms complexity.
- **Earn a supply payout after clearing each wave/level**, letting you reinforce,
  build, and dig in between assaults.
- Hold your base/objective across escalating waves; loss = base overrun.
- Design notes: reuse the battlegroup spawner with a wave schedule + difficulty
  curve; gate the passive `S.income` off in this mode; add between-wave intermission
  with a payout and a "ready" trigger.

### 3. Zone Capture  *(Hell Let Loose style)*
Contested-line control:
- A chain of capture zones/objectives across the map.
- Zones are captured by presence and held; contested zones flip over time.
- Push the frontline by taking adjacent zones in sequence; both sides fight over
  the active contested zone(s).
- Win by controlling the objective line / capturing the enemy's rear.
- Design notes: zone-ownership state, capture progress from friendly vs. enemy
  presence, a frontline/lattice of which zones are currently contestable, and
  scoring/victory tied to zone control rather than base destruction.

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

**Highest-leverage fix: prepared positions should decisively beat frontal attacks.** If a dug-in
platoon in cover reliably defeats two or three attackers walking straight at it, the rush stops
being viable immediately — and the player then *has* to find a flank, prep with fires, or
fix-and-maneuver. That gives every system already built a job: UAS to find the gap, artillery to
soften it, smoke to cross open ground, engineers to force a crossing. No new mechanics needed;
the existing ones just have to matter.
- **Then scarcity** — fewer, dearer, slower-to-replace units. Scarcity is what makes a player
  position carefully instead of feeding a queue.
- **Then symmetric fog** — while the AI knows where everything is, it never has to maneuver
  either; it can always just walk at you.
- Suggested order: *Enemy Economy* → decisive defensive advantage → scarcity → symmetric fog.
  The first two are most of the fix.
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

### Group Movement — Follow the Lead Vic ✅
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

### Enemy Economy — the OPFOR Buys What It Fields 🟡 *(economy + affordability shipped; map-size scaling and wave ramping still open)*
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
- **Upkeep caps the OPFOR the way it caps the player** — this is the actual answer to "the CPU
  deployed everything at once", and it's the same mechanism rather than a special case. It also
  means destroying its units genuinely relieves pressure, because it has to re-buy them.
- **Difficulty becomes enemy income** — Recruit: the OPFOR is poor and slow to reconstitute.
  Elite: it out-earns you. Honest economic asymmetry instead of hidden rules.
- **Scale with map size** — on a small map everything is close, so identical pressure lands far
  harder. Either the spawn budget or the wave cadence should account for map area.
- **Ramp rather than dump** — early battlegroups should be small and grow, instead of arriving
  full-size from the first wave.
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
  pairs with the mode selector, seeded maps, and the dev/test map.

## Installations

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

### Victory / Defeat Screen ⬜
Winning and losing currently pass almost unnoticed: `S.won` / `S.lost` fire a single toast that
scrolls away with everything else. The end of a match should land.
- **A modal, not a toast** — full-screen overlay in the splash's visual language (radial wash +
  faint grid), with the outcome stated plainly: objective secured, or command post lost.
- **A short after-action summary** — mission clock, units fielded and lost, enemy elements
  destroyed, supply spent, difficulty and map size played. Enough to make the run feel like it
  had a shape.
- **New Game button** — straight back to the splash, so a loss is one click from a rematch.
  Continue-watching / dismiss as a secondary action, for anyone who wants to look at the map.
- Design notes: `S.won` is set on destroying the hostile HQ, `S.lost` when the player's HQ is
  gone with no FOB. Render from `App` above the rails so it covers the whole console; reuse the
  Splash backdrop treatment. The stats want a few counters accumulated during the run rather
  than derived at the end — units lost and enemy killed aren't recoverable from final state.

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

### Fit-to-Screen Control Overlaps the UAV Window ⬜
> **Still colliding.** The ⛶ sits at `right: 10, bottom: 10` (z-index 16) and the first
> docked feed defaults to the same corner at z-index 40. Moving the button inside the map
> column cleared the *net rail*, which is a different problem — the feed dock still buries it.

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

### Code Quality — TypeScript & Componentization 🟡 *(TopBar/CommandPanel/NetPanel/Rail/palette/styles split out; HUD.jsx still ~1000 lines, sim.js ~1970, zero TypeScript)*
The codebase has grown organically; `HUD.jsx` in particular is a large monolith.
- **Rewrite in TypeScript** — type the sim state (`S`), unit/drone/structure models, and the UI
  props for real safety and editor support.
- **Break up the monoliths** — split `HUD.jsx` (and `sim.js`) into focused components/modules
  (deploy panel, selection tray, feed window + its subparts, radio log, top bar; sim into
  combat / movement / drones / fires / AI files).
- **General cleanup** — extract shared UI primitives (now that Mantine + a theme are in), remove
  dead code, and standardize styling on the theme instead of scattered inline styles.
- Design notes: incremental migration (allowJs + rename file-by-file); lean on the Mantine theme
  and components introduced with the UAV-window rebuild as the pattern to extend.

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

### AC-130 Gun Rounds Originate From the Wrong Point ⬜ *(confirmed still present)*
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
