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

- [x] **1 · LEFT WALL** — done 2026-08-06. `ui/console/ConsolePanel` is the one
      shell: WALL (a real left column at a dragged width, the map narrows) and
      FULL (fixed over the whole viewport). S1, the S2/S3/S4 board, the command
      dashboard and the pack viewer all render through it — they each had their
      own `position:absolute; inset:0` before, four copies of one idea.

      **AND THE FIRST THING IT TAUGHT US: a staff board is a DOCUMENT.** The
      S3's task force table is six columns, the S1 PERSTAT and S4 LOGSTAT are
      worse, and at wall width they are crushed to unreadable. A table you
      cannot read is not a cheaper way to read it — it is a wasted click on the
      way to maximising anyway. So the S-shops open FULL.

      The wall was the right idea applied to the wrong content. It stays for
      the panels that are genuinely narrow — a tree, a roster, GARRISON —
      where beside-the-map is the right answer. **Width follows shape: trees
      dock, documents fill.**

      *Still to do here:* move the S-shop openers from the top bar into the
      left tab column, once GARRISON exists to sit above them (step 3).

- [ ] **2 · RIGHT WALL + TEAM STATIONS** — tabs per team, full-height columns
      opening leftward, width-resizable. Header · read-only locked map · march
      order (draggable) · standing orders · net filtered to the team.

      **The station's map is a PLACEHOLDER until step 6.** Decided 2026-08-06:
      get the console functional first, then fix the renderer properly. Do NOT
      parameterise MapView to serve a second pane, and do NOT copy its symbol
      drawing into a second file — either would have to be undone. The
      placeholder draws the shared terrain sheet plus plain unit dots for the
      team, and is explicitly labelled as such in its own source.

      Groundwork already done: `packLayerFor` (map/packRender) shares the one
      64 MB sheet across every pane, so the placeholder and the real thing both
      have terrain for free.

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

- [ ] **6 · BREAK UP THE MAP MONOLITH** — after the console is functional, not
      before. `map/MapView.tsx` is ~1750 lines: one canvas, one draw loop, and
      every pass, transform, pick and input handler living in closures inside a
      single mount effect. A second pane cannot use any part of it without
      taking all of it.

      **COMPONENTIZING A CANVAS MEANS LAYERS, NOT COMPONENTS.** There is no
      React tree to split. What comes out is:

      *A frame context* — everything a pass needs, built once per frame and
      handed to each:

      ```ts
      interface Frame {
        ctx: CanvasRenderingContext2D
        view: View                    // cx, cy, ppm
        w: number; h: number          // css px
        w2sX(x): number; w2sY(y): number
        s2wX(px): number; s2wY(py): number
        night: boolean; alpha: number
        sel: Set<number>
      }
      ```

      *Layers*, each `(f: Frame) => void`, one file per pass: terrain · sat +
      follow-patch · FLOT/territory · gazetteer · control measures · routes and
      the march table · team ties and plates · units · drones · structures ·
      range overlays · effects (shells, impacts) · marquee and drag previews.

      *A camera module* — the View type, transforms and clamping, joining the
      existing `map/view.ts`, instead of `window.__view` plus closures.

      *An input module* — pick/click/drag/wheel/keys, which a read-only pane
      simply does not mount.

      Then a surface is a LAYER LIST and nothing more:

      ```
      COP      every layer + input
      STATION  terrain · measures · routes · teams · units      (no input)
      ```

      and the VTC deck inset and the scenario builder's sheet — which already
      share the terrain bake — can converge on the same passes.

      **Sequence it in verifiable commits**, not one landing: frame context and
      camera first (no behaviour change), then passes out in groups, then
      input, then the station composes. The risk is draw ORDER and missed
      closure state, and both are only caught by looking at the map.

      **THE DISCIPLINE, so this does not become forty files with one caller
      each:** extract when there is a second consumer or when a file has no
      seams. MapView now has both. Speculative decomposition is the other way
      to make a codebase unreadable.

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
- ~~Sharing the baked terrain sheet across panes~~ — done, `packLayerFor`.

## WHERE THIS STANDS

Done: the plan itself, the `G` tie-break, step 1 (the left wall + staff boards
opening full width), and the shared terrain sheet.

Next: step 2, the right wall and team stations, with a placeholder map.
