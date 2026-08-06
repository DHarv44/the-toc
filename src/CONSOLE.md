# THE CONSOLE — how the screen is organised

A working plan. Kept current as it is built: each step carries its state, and
the reasoning stays with the step so a later change can argue with it.

Settled 2026-08-06.

---

## THE MODEL

```
LEFT   COMMAND     what I have, and what the staff says
                   GARRISON · S1 · S2 · S3 · S4       docked, expandable to full

CENTRE COP         the battalion picture — the map, fully interactive

BOTTOM CONTROL     the task org bar + the command card for the selection

RIGHT  STATIONS    one full-height column per team, opening leftward
                   TEAM BRAVO · TEAM ALPHA · …        + FEEDS as a launcher
```

**Left is administration. Bottom is command. Right is stations.**

Every object gets exactly one home. That is the test a change has to pass: if
a thing can be done in two places, one of them is wrong.

---

## THE DECISIONS, AND WHY

### The dock commands ELEMENTS. The station commands the TEAM.

An element is a platoon. A team is a COLUMN, and the things that belong to a
column are exactly the things that belong to no platoon in it: order of march,
interval, load plan, disabled-vehicle policy. Those live in the station. The
rest is element-level and stays in the dock.

The tell that this is the right cut: **group selection stops needing a special
case.** Three independents selected together get the same card as one, because
they are peers. Four platoons that happen to be a team get the same card too —
and if you move them, the movement code already partitions by team and marches
them as a column, which is correct and invisible.

### Clicking a symbol selects THAT ELEMENT

Not its team. Selecting the team on a map click made sense when the dock was
the only place a team existed; with stations it hides the unit you clicked and
duplicates what the station is for.

Consequence: **alt-click is deleted.** It existed to isolate one element out of
its team, which is now what a plain click does.

| gesture | result |
|---|---|
| click a symbol | that element |
| click a rolled-up team symbol | focus its station — there is no individual to click |
| ctrl-click | add / remove |
| marquee | N elements, same card |
| `1`–`9` | focus that team's station, and select its elements |
| right-click ground | move — team members still march as their column |
| right-click a unit | context menu, acting on the whole selection |
| `G` / `shift+G` | task organize / detach |

### Stations are full-height columns, not stacked panes

The right wall grows LEFTWARD as stations open. Each is read top to bottom —
header, map, order of march, standing orders, net — and is width-resizable.

Two at ~340 px leaves ~900 px of COP on a 1600 px screen; three is tight. That
is a budget the player feels directly, so no artificial cap is needed.

The station map is READ-ONLY. You look at it; the station's control rows do the
commanding. The COP stays fully interactive because right-click-to-move is the
core verb and there must be a place to use it.

### Feeds are floating windows, not panel children

A panel containing windows is neither one thing nor the other. A sensor picture
is a 16:9 object and forcing it into a 340 px column would be consistency for
its own sake. So the FEEDS tab is a LAUNCHER; the feed itself floats and can be
popped out. Teams are columns; feeds are windows.

### Tabs are never the answer for a second screen

A browser tab that is not the active tab in its window is `document.hidden`:
timers throttle to ~1 Hz and rAF stops. Three of four map tabs would be frozen.

A second WINDOW (`window.open`) is visible, so it is not throttled, AND it
shares the JS context — same `S`, no serialization, no sync layer.

Measured: the baked terrain sheet is **4096×4096 = 64 MB**, built once per
document. Per frame a map pane costs one `drawImage` plus ~20 symbol draws.
So panes are nearly free and documents are not: four panes in one document
share one 64 MB sheet; four tabs would bake four.

---

## THE STEPS

- [ ] **1 · LEFT WALL** — S1–S4 become dockable panels at rail width, with the
      current full-viewport view as their MAXIMISED state. GARRISON above a
      divider, the staff block below it. The map stops being traded away to
      read a LOGSTAT.

- [ ] **2 · RIGHT WALL + TEAM STATIONS** — tabs per team, full-height columns
      opening leftward, width-resizable. Header · read-only locked map · march
      order (draggable) · standing orders · net filtered to the team.

- [ ] **3 · FORCES RAIL DIES** — MarchList, ADD UNIT, DISBAND, the commander
      line move into the station; CALL UP moves into GARRISON. Nothing is left
      over, which is why the rail goes rather than shrinking.

- [ ] **4 · DOCK RE-SCOPES TO ELEMENTS** — interval and `ORDER OF MARCH ▸`
      leave the dock for the station. Map click selects the element. Alt-click
      deleted. Right-click context menu carries the task-org verbs.

- [ ] **5 · POP-OUT** — `window.open` + React portal. Generic window chrome
      (drag / resize / min / max / z-order / edge-snap), viewport coordinates
      so a window can sit over a rail and later move to another document
      unchanged. Feeds land on it first. Not needed on one screen — this is
      the bonus for people with two.

### Fix first (live bug)

- [ ] **`G` tie-break.** `taskOrganize` picks the destination team by "most of
      its own members in the selection". Grab 3 of BRAVO and 3 of ALPHA and it
      is a tie, resolved by whichever the loop counted first — a silent
      coin-flip that merges two companies. It must refuse and say so:
      `SELECTION SPANS TEAM BRAVO AND TEAM ALPHA — RIGHT-CLICK TO CHOOSE`.

---

## THE CONTEXT MENU ON A MIXED SELECTION

The hard case: some elements free, some in team A, some in team B. The menu
NAMES THE CONSEQUENCE rather than guessing, because a menu is read rather than
fired from muscle memory and can afford to be explicit.

```
FORM NEW TEAM                              all free, n ≥ 2
FORM NEW TEAM — detaches 5 from 2 teams    mixed: says what it costs
ATTACH ALL TO ▸  TEAM BRAVO  (3 of 6 here)
                 TEAM ALPHA  (2 of 6 here)
DETACH ALL FROM THEIR TEAMS
─────
DISBAND TEAM BRAVO                         selection is exactly one whole team
```

The counts carry the weight: `(3 of 6 here)` says which way a merge runs and
how much of that team you have hold of, so a consolidation is never a surprise.

`G` does the obvious case instantly. The menu does every case, explicitly.

---

## OPEN

- Watch panes bound to a grid or a contact (rather than to a team) — deferred;
  the team station covers the case that motivated them.
- Whether the net rail becomes a station column or stays a rail.
- Sharing the baked terrain sheet across panes: it is built inside MapView's
  mount today and must move to a module cache keyed by map id before a second
  pane exists, or pane two bakes a second 64 MB.
