# War of Dots — Roadmap

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

### C-130 Gunship (AC-130)
An orbiting fire-support platform called in as a timed asset:
- Circling gunship that provides on-call precision fires (25mm / 40mm / 105mm
  analog) against ground targets while it's on station.
- Sensor/feed of its own (thermal gun-camera view), consistent with the drone-feed
  system, with the player designating targets in the feed.
- Time-on-station limit and a supply cost to call it in; leaves when winchester or
  bingo.
- Fits the existing element model — rounds resolve against individual vics.
