# TEAM TASKING, EXECUTE, AND THE AI ENGINE (DESIGN DISCUSSION)

> Task #61 / CONSOLE.md step 7 — "the only step never started." Written
> 2026-08-07 for discussion; nothing below is built. Settle the open calls
> at the bottom, then this cuts into buildable steps like BASES.md did.

## The ask (user, 2026-08-06)

A team is given an **OBJECTIVE or a TASK**; the commander presses
**EXECUTE**; the team builds its route to the objective and does it — on
its own. That is a different act from ordering a move, and it is what turns
the team station from a control panel into a command post.

## What already exists to stand on

More than there was when step 7 was written:

- **Teams are real** — named task organizations with a durable gid, an
  authored order of march, standing orders (ROE/weapons/disabled policy),
  a station, and a commander with a name.
- **The column machinery** — one shared route, station-keeping, the order
  of march obeyed, and (this week) **formation attacks** that close in
  march order, re-form on a displaced target, and deploy to assault on
  contact. A tasking's movement phase is this code, already tested.
- **The drills are side-agnostic** — halting to fight, breaking contact,
  dismounting, resuming the mission all run in shared tick code. A tasked
  team keeps every drill.
- **The OPFOR Decision Layer** (`domains/opfor/decide.ts`) — the declared
  architecture, "pointed our way": a utility system where each action
  states when it is available and scores itself 0..1 from weighted
  considerations; best score above a floor executes. THE IRON RULE: the
  layer only CHOOSES — execution goes through the same player-legal order
  functions the UI calls. Deterministic, and every cycle's scores are
  recorded so the dev console can answer "why did it do that."
- **The operational commander** (`opfor/ai.ts`) — main effort, supporting
  effort, posture. The echelon ABOVE a tasking, already modeled for the
  enemy.
- **Autonomy precedents the player already trusts** — QRF launches itself,
  escorts trail their wards, engineers crawl a planned line, the support
  spine raises and flies 9-lines. Each obeys the same convention: **a
  manual order takes the element off the job.** Tasking should feel like
  more of THAT, not like a new kind of magic.

## Design sketch

### The TASKING object

```
Tasking {
  teamId, task, objective,         // what and where
  state: 'planned' | 'moving' | 'actions-on' | 'done' | 'failed',
  phase notes for the readback (crossed LD, at the objective, consolidating)
}
```

One live tasking per team (a queue is chaining — call 5). Objectives by
task: a point or zone (SEIZE/DEFEND/RECON), a named route or convoy
(ESCORT), an area between two points (SCREEN).

### The vocabulary (start from what the sim already resolves)

| Task   | Objective     | Scheme (all existing verbs)                                   |
|--------|---------------|----------------------------------------------------------------|
| SEIZE  | point/zone    | column approach → formation attack on defenders → consolidate: DEFEND in place |
| DEFEND | point/zone    | move, array on the axis of threat (arrange exists), dig in, hold |
| SCREEN | line/area     | spread on positions, ROE halt, report contacts, break contact when pressed |
| ESCORT | route/convoy  | the escort verb, teamwide, tied to a named route              |
| RECON  | point/zone    | scouts forward per order of march, weapons hold, eyes on, report, withdraw on contact |

CLEAR (urban/route-by-fire) and RECOVER (stranded hulls — the deferred
recovery design) join in v2; both want mechanics that don't exist yet
(building-by-building fighting; hull entities).

### EXECUTE, the surface

The team station grows a **TASKING block**: task type, objective (picked on
the map — click or an existing ZONE/graphic), and the EXECUTE button. The
station already shows the order of march and standing orders above it — the
block completes the command post. A STOP button cancels (team holds in
place, keeps its drills).

### The engine — the friendly commander

A per-team commander tick, built on the **same utility kernel** as
decide.ts (extract the shared shape; OPFOR keeps using it — one commander
model, two sides, which is also what makes a second human/AI commander a
drop-in later). The task is the SCHEME — it fixes the phases; the utility
layer chooses WITHIN the phase: shift to the assault, call the team's own
mortars, break off, consolidate early. The iron rule holds throughout:
only player-legal orders, and the player can always grab the stick back.

Interruption follows the house convention: a manual order to a MEMBER
detaches that element from the tasking (the station says so); the tasking
continues with the rest. STOP cancels the whole thing.

### Readback

The state is the readout: the TASKING block shows the phase; net traffic
speaks at transitions ("CROSSING LD", "OBJECTIVE SEIZED — CONSOLIDATING",
"TASKING COMPLETE"); the march board badges the team. A tasking that fails
(casualty threshold, objective untakeable) says WHY on the net.

### What this unlocks

- **#51 allied-formation AI** — the same tasking objects at battalion
  echelon, issued by the campaign script instead of the station. Build
  team-level first; formations are phase 2 of the same engine.
- **Skirmish difficulty "AI smarts"** — the lobby knob the user reserved:
  difficulty scales the utility layer's considerations, not unit stats.
- **OPFOR convergence** — battlegroups eventually BECOME tasked teams under
  the OPFOR operational commander: one model both sides (law 4's endgame).
- **The attack rework** (#59's tail) — support-by-fire positions and
  suppression live naturally inside SEIZE's scheme rather than as a special
  case of the attack order.

## The open calls

1. **Vocabulary v1**: SEIZE, DEFEND, SCREEN, ESCORT, RECON — with CLEAR and
   RECOVER deferred to v2? (Recommend yes; every v1 task composes existing
   verbs.)
2. **The initiative envelope** — what may a tasked team do WITHOUT asking?
   Recommend: fire its own mortars (utility-gated), raise 9-lines through
   the existing support spine (the commander still approves), break off at
   a casualty threshold and report it. NOT in v1: requesting
   reinforcements, re-tasking itself, chaining its own next objective.
3. **Interruption semantics**: manual order to a member = that element
   detaches, tasking continues (the escort/roadworks convention) — agreed?
   STOP on the station cancels the whole tasking.
4. **Chaining v1**: SEIZE auto-consolidates into DEFEND in place on
   completion (that one chain only); an authored tasking QUEUE is v2.
5. **Where the commander lives**: extract the utility kernel from
   opfor/decide.ts into a shared module so friendly and OPFOR run the SAME
   engine (recommend), vs a separate friendly implementation.
6. **EXECUTE surfaces**: station TASKING block only, or also the map
   context menu on a team ("TASK → SEIZE…")? (Recommend both; the menu is
   cheap once the block exists.)
7. **Does a tasked team use the roads honestly** — plan its approach on
   named routes when they exist and go RED-aware (tie-in with MSR status),
   or route freely like any order today? (Recommend route-aware: it makes
   route security matter to maneuver, not just logistics.)
8. **Failure thresholds**: what ends a tasking as FAILED — team strength
   below N%? commander KIA? objective still held after M minutes of
   assault? (Propose: strength < 50% triggers break-off + FAILED report;
   the rest reads as still-fighting.)
