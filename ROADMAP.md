# TOC — Roadmap

Planned features and directions. The current build is a real-time C2 game: a
Blue Force Tracker map with MIL-STD-2525 symbology, recon-driven fog, deployable
UAS feeds (3D EO/IR), procedural terrain, mounted/dismounted maneuver units with
battle drills and weapons control, a logistics chain, installations, and a
tactical enemy AI. Units are now modeled as individual vics/troops (sub-elements)
so precision fires hit specific platforms.

---

## Game Modes

The game currently plays as one open scenario. Add a mode selector and three modes:

### 1. Attack & Defend  *(current gameplay)*
The existing sandbox: take the enemy HQ while defending your own. Formalize it as
a named mode with explicit win/lose objectives and a mode-select entry point.

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

### C-130 Gunship (AC-130)  *(implemented)*
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

### Air Asset Cost & Access
Air power is a premium capability, not something you spam:
- **Air assets are expensive** — the gunship, attack helos, A-10, fighters, and the larger
  fixed-wing UAS carry **high supply costs**, so committing air is a real economic decision.
- **Small field drones stay cheap and unit-accessible** — the hand-launched recon/loiter
  drones (Raven, Switchblade) remain **deployable by frontline units exactly as they are
  today**, no airfield required.
- Design notes: keep `src:'field'` drones low-cost and airfield-independent; scale costs up
  for the airfield/helipad assets; pairs with Installation-Gated Unlocks.

### Drone Team & Organic UAS
Put the airfield-independent drones in the hands of units:
- **Drone unit** — a dedicated small-UAS team that **controls/deploys the drones that don't
  need an airfield** (Raven-class recon, Switchblade-class loiter, and FPV suicide drones),
  giving you organic air without an airstrip.
- **Suicide / FPV drones** — cheap, expendable **one-way attack drones (Ukraine-style FPV)**:
  the drone team launches them to dive on ground targets. Low cost, high volume, attritable.
- **Organic drones on other units** — recon, rifle, Stryker rifle, and similar units can pop a
  **small quadcopter for local ISR** where it makes sense, without a dedicated drone team.
- Design notes: field-launched drones already exist (`src:'field'`); attach a launch capability
  to the drone team and to select unit types; FPV suicide drone is a cheap kamikaze variant of
  the Switchblade model; keep costs low per the Air Asset Cost & Access tiering.

### Drone Airframe Types & FPV Terminal Attack
Model drones by their real airframe rather than one generic flyer:
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

### Individual Unit Formations (UAV View)
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

### Drones Shadow Enemy Units
Extend the overwatch/follow tasking to hostiles — task a UAV to **follow and track a moving enemy
unit**, keeping its orbit and sensor on the target as it maneuvers (ISR shadowing), not just
friendly overwatch:
- The drone's orbit anchor chases the enemy contact and the sensor stays on it.
- If the enemy goes dark (contact lost under fog), the drone holds the last-known position like a
  broken track until it's re-acquired.
- Great for keeping eyes on a spotted force before a strike/ambush, or watching a withdrawal.
- Design notes: let `droneFollow` accept hostile units (currently friend-only); gate on a live
  contact and fall back to LKP when the track breaks; pairs with the sensor lock/track and fog.

## Combat & Tactics

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

### Tactical Smoke
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

### Surrender
Broken units don't always fight to the death or cleanly withdraw:
- When a unit breaks (hits its low-strength threshold), it has a **1–5% chance of surrendering**
  instead — taken out of the fight (and potentially a POW/handling hook later).
- Design notes: on the break-contact trigger, roll a small surrender chance; a surrendered unit
  is removed from combat (later: prisoner handling / intel value).

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

### Symmetric Fog & Counter-Recon
- The **CPU is fog-limited too** — it has to find you before it can mass on you.
- Makes **recon vs. counter-recon** a real fight: kill/blind enemy scouts and screens to go
  dark on them; screen your own front to deny them the picture.
- Design notes: give hostile forces their own detection/contact model mirroring the player's
  (the sensor code is already side-agnostic-ish); enemy decisions key off *their* contacts.

### Last-Known-Position Uncertainty
- Stale contacts don't just freeze at their last pixel — they drift into a **growing
  uncertainty area** ("was here, could be anywhere in this radius now") that expands with
  time since last seen and the target's speed.
- Design notes: render an uncertainty ellipse/circle on stale contacts that grows with age;
  optionally dead-reckon a best-guess drift along last-known heading.

### SIGINT / Electronic Warfare
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

### Group Movement — Follow the Lead Vic
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

## Enemy AI / OPFOR

**A priority.** The current enemy is thin — effectively a single tactical brain, it doesn't
really plan, and it doesn't use drones at all. Build it into a proper opponent:
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

## Engineering & Terrain

### Engineers Build Roads & Bridges
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

### Rest & Refit at a FOB
No dedicated recovery/repair units — instead, worn-down forces **heal by falling back**:
- A unit that **makes it back to a FOB regenerates strength** over time (reconstitution),
  turning FOBs into the rest/refit/rearm hubs (no separate FAARP — FOBs are the hubs for air
  rearm/refuel too).
- Design notes: extend the existing reconstitution so proximity to a friendly FOB/HQ drives
  faster regen; FOBs double as the air rearm/refuel point.

## Audio

### Radio Chatter & CIC Soundscape
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

### Radio Chatter Library, Callsigns & Message Factory
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

### Radio Chatter Audio (Squelch + Procedural "Mumble") — *decided direction*
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

## Maps & World

### Seed-Generated Maps
- **Seeded procedural maps** — a map seed generates the terrain/hydrology/roads/towns, so a
  seed is shareable and reproducible and every match can be a fresh battlefield.
- Design notes: thread a single seed through the existing procedural generation (terrain,
  rivers, roads, towns); surface it in the UI for share/replay.

### More Detailed Maps & Bigger Towns
- **Richer terrain and larger, denser towns** — more detail in the world and bigger urban areas
  to fight over (urban terrain matters more with LOS, cover, and HUMINT in towns).
- Design notes: increase town size/building density and terrain detail; make sure pathfinding,
  cover, and LOS scale with the added density.

### Dev / Test Map
A purpose-built sandbox for fast, accurate feature testing — deliberately not a "fair"
battlefield:
- Laid out to **exercise every system in seconds**: terrain barriers and choke points, all
  cover/concealment types (forest, urban, defilade/reverse-slope), buildings and a town, water
  gaps + bridges, roads and open ground, and **pre-staged friendly + hostile units of each type**
  plus installations.
- Lets us reproduce and verify features (LOS, cover buffs, movement factors, fires, air, drones,
  EW, audio) without hunting for the right terrain in a random map.
- Design notes: a fixed hand-authored (or fixed-seed + scripted) map with a dev-mode loader that
  pre-places representative units/structures; wire it behind the existing DEV controls.

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

### Helipad Installation
A rotary-wing base for the attack helicopters (and future utility/lift helos):
- **Placed near an HQ or FOB** (like other installations, within a `near` radius of an
  existing base) — cheaper/faster than an airfield.
- Launch/rearm/refuel point for helos; ties into the Attack Helicopters asset above.
- Design notes: new `STRUCTURES` entry with `launchesHelos` (parallel to the airfield's
  `launchesDrones`); helo assets spawn from the nearest helipad.

### Airfield Placement Restricted to HQ
Airfields are a strategic asset, not something you sprinkle anywhere:
- **Only the HQ can establish an airfield** — it must be placed within the HQ's build
  radius (not near a FOB), reflecting the logistics an airstrip needs.
- Design notes: tighten `AFLD` placement to require proximity to a friendly **HQ**
  specifically (vs. any base), and surface the restriction in the placement toast.

### Installation-Gated Unlocks
Air assets are unlocked by building the installation that operates them, so the
palette reflects what you can actually field:
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

### Sensor Lock Placement During Transit
Clicking **LOCK** on a UAV *before* it reaches its orbit (still in transit) drops the lock
reticle in the wrong spot. The LOCK button and the feed's ray/projection use the **on-station**
aim point (`drone.tx + gimbal`), but while transiting the camera actually looks **ahead along the
flight path** — so they disagree and the lock lands off from where the sensor is pointed.
- Fix: derive the lock point (and `feedRayToGround` / `feedProjectToScreen`) from the drone's
  *current, state-aware* camera look-at — the same one `DroneCamera` uses (transit looks ahead;
  on-station/lock look at `tx`/lock point) — so LOCK and the reticle agree in every state. (Or
  simplest: only allow LOCK once on-station.)

## Later / Deferred

### Civilians & ROE  *(later)*
Human terrain — neutral civilians, positive-ID, and collateral-damage consequences that give
precision fires and target designation real moral weight. Deferred for now; the sister gunship
project already has a civilian model to draw on when we pick this up.
