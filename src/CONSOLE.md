# THE CONSOLE — how the screen is organised

A working plan. Kept current as it is built: each step carries its state, and
the reasoning stays with the step so a later change can argue with it.

Settled 2026-08-06.

---

## THE MODEL

```
LEFT   COMMAND     what I am, what I hold, and what the staff says
                   COMMAND · S1 · S2 · S3 · S4     columns at 720, resizable

CENTRE COP         the battalion picture — the map, fully interactive

BOTTOM COMMIT      what is available to put into the fight:
                   INDEPENDENT elements · INSTALLATIONS (a panel opens upward)
                   and the command card for the current selection

RIGHT  STATIONS    one full-height column per team, opening leftward
                   TEAM BRAVO · TEAM ALPHA · …        + FEEDS · NET
```

**Left is administration. Bottom is what you can commit. Right is stations.**

Every object gets exactly one home. That is the test a change has to pass: if
a thing can be done in two places, one of them is wrong.

### THE WATCH AND THE LEDGER

The one legitimate exception, and it needs saying because it looks like a
violation: the same facts may appear twice if they answer two different
questions.

A WATCH is one object, now, with no navigation — the team's own net pane, the
bottom bar's panel for one base. A LEDGER is all of them at once, compared, for
a decision made deliberately — the battalion net rail, the COMMAND console's
installations page. The station's net is not a duplicate of the JBC-P rail; it
is the other half of it, and it even runs the opposite way (oldest first,
because you are waiting for the next call rather than looking up the last one).

What is NOT allowed is two watches, or two ledgers, for one object.

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

- [x] **2 · RIGHT WALL + TEAM STATIONS** — done 2026-08-06. `ui/station/` — a
      tab per formed team in the right edge column (below FEEDS and NET, which
      always exist and therefore never move), and a full-height column per open
      station: header that SELECTS the team · placeholder map · the draggable
      order of march · standing orders · the team's own net.

      Stations stack left to right in the order they were opened, so a new one
      appears against the tab that opened it and the older ones are pushed
      inboard — the alternative makes every column you already had jump sideways
      when you open another. One shared width, dragged from the inboard edge:
      a station is always the same kind of object, and a rail where every column
      is a different size is a rail nobody can scan.

      **The station's map is an EMPTY BOX that says so.** Decided 2026-08-06:
      not even a stand-in renderer. Do NOT parameterise MapView to serve a
      second pane, and do NOT copy its symbol drawing into a second file —
      either would have to be undone at step 6. (`packLayerFor` already shares
      the one 64 MB sheet across panes, so the real thing has terrain waiting
      for it whenever step 6 lands.)

      **AND IT TAUGHT US THE DOCK DOES NOT SURVIVE A NARROW MAP COLUMN.** Two
      stations open take six hundred pixels off the bottom bar, and everything
      past the command card — the whole of the standing orders — was clipped
      off the end of it: captions on screen, the pickers they labelled not. The
      zone row wraps now. A row of height is cheaper than a missing control.

- [x] **3 · THE LEFT WALL BECOMES CONSOLES** — done 2026-08-06. It started as
      "the FORCES rail dies" and finished by taking the bottom bar, the command
      rail, the garrison rail and the dashboard with it.

      Landed 2026-08-06: the station took the team's whole administration
      (ATTACH from the ground or straight out of garrison, COMMAND, RENAME,
      DISBAND, and the march list); FORCES became GARRISON; the bottom bar's
      second row stopped being the task org board and became INSTALLATIONS,
      with a panel that opens UPWARD in columns over the map — garrison, QRF,
      facilities, tethered ISR, division requests, for one base, in one click.
      The team tabs grew a status dot so moving the teams off the bottom bar
      did not cost the commander the board that said where everybody was.

      A click in the bottom bar now GOES THERE. The rails split select from go
      on purpose — reading a roster while the camera jumps to each row is
      unusable — but nobody reads this bar; they reach into it for one thing
      and the next thing they want is to see it.

      Then the left wall itself: `ui/shell/Column` is the one geometry (side,
      width, resizable, dragged from the inboard edge) that the rails, the
      consoles and the stations had all written separately. The S-shops moved
      onto it at 720 and out of the top bar into the tab column. COMMAND became
      a console in the staff pages' own chrome and tab strip — OVERVIEW (the
      command group, then the tiles) · INSTALLATIONS (a table, not the tree) ·
      GARRISON · ACTIONS — which retired the command rail, the garrison rail
      and the dashboard glyph together. The console remembers its tab, so
      garrison is still one click.

      And the S3's task-org board stopped organizing: ATTACH, DISBAND, rename,
      designate and FORM A TEAM all belonged to the station or the map. A staff
      board is the document; the team's name on it is now the door to its
      station.

      **720, WHICH REVISES STEP 1.** Step 1 concluded staff boards must open
      FULL because a six-column table at wall width is unreadable — true when
      the only alternatives were 420 and the whole screen. What changed is that
      FULL now fights the right wall: a board over the viewport hides the
      stations you opened to watch the fight you are reading about. Docked at
      720, resizable, FULL still one button away.

- [x] **4 · DOCK RE-SCOPES TO ELEMENTS** — done 2026-08-06. A map click selects
      the element it drew; alt-click is deleted (it existed only to undo the old
      click); interval left the dock for the station; the dock's team door opens
      that station rather than the S3's movement order; and the mixed-selection
      context menu below is built, which is what `G`'s `ambiguous` verdict has
      been pointing at since the tie-break landed.

      The station also grew TEAM ACTIONS. To put a Raven up you had to know
      which platoon carried it, find it, select it alone and press V — a
      battalion commander does not task a carrier, he tells the team to put its
      bird up. `ui/forces/actions` is now the one list of what a force can do;
      the dock draws it in fixed cells for muscle memory, the station draws it
      with the executing element named under each verb.

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

      *A camera module* — **done 2026-08-06, `map/camera.ts`.** The View type,
      the four transforms and the clamp, with `canvas` passed instead of
      captured, which is the whole difference between "the map's transform" and
      "a transform any surface can have". No behaviour change: the clamp is
      algebraically identical (x0/y0 were literal zeros, x1/y1 both WORLD, so
      every span term collapses). Verified by driving the view to (-50000,
      -50000) at ppm 0.0001 and watching it recover to the map centre at the
      zoom floor, with the whole sheet letterboxed as before.

      The transforms read `canvas.width` per call rather than closing over it:
      the canvas is resized every frame to whatever the rails have left it, and
      a stale width draws the whole picture wrong for one frame after every
      panel opens.

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

      **THE FULL CUT LIST**, in draw order, so the remaining work is a checklist
      rather than a judgement call each time. Every pass keeps its position in
      the loop; only its home changes.

      | # | module | passes | needs beyond the Frame |
      |---|---|---|---|
      | ✓ | `camera` | view, transforms, clamp | — |
      | ✓ | `frame` | the per-frame context | — |
      | ✓ | `layers/grid` | 100 m mesh, 1 km grid + labels | — |
      | ✓ | `layers/gazetteer` | sim towns, pack place names | the baked label list |
      | ✓ | `layers/features` | hills, rivers, infrastructure, credit | attribution, sat flag |
      | ✓ | `layers/measures` | phase lines, checkpoints, objectives, boundaries | — |
      | 1 | `layers/terrain` | the sheet, the sat patch, the AO border, the FLOT wash and contour | baked layers, sat state |
      | 2 | `layers/aim` | strike targeting, impact reticles, drone control rings, deploy/build placement rings, fire-mission rings | ui mode, cursor world pos |
      | 3 | `layers/routes` | faint routes for every mover, the march table, unit routes, drone routes | selection |
      | 4 | `layers/objectives` | king-of-the-hill zone, division main, scenario-authored graphics | — |
      | 5 | `layers/effects` | fire-mission impacts, the in-contact indicator | — |
      | 6 | `layers/ranges` | the fires / sensor / weapon overlays | ui toggles |
      | 7 | `layers/units` | DUSTWUN sites, the team roll-up, friendlies, hostiles, attack designation | selection, zoom |
      | 8 | `layers/cursor` | formation-spread preview, marquee, cursor readout | live input state |

      Then `map/input.ts` takes pick/click/drag/wheel/keys, and MapView is a
      canvas, a mount effect that builds the frame, and a LIST.

      **Batch the verification.** Checking each pass against the running map one
      at a time costs more than it catches — the passes are verbatim moves and
      the compiler catches the only mistake that is likely (a missed local).
      Cut the whole list, then look at the map hard: every overlay toggled, a
      route drawn, a team rolled up and expanded, night, satellite, and the
      whole-map fit.

      **THE DISCIPLINE, so this does not become forty files with one caller
      each:** extract when there is a second consumer or when a file has no
      seams. MapView now has both. Speculative decomposition is the other way
      to make a codebase unreadable.

- [ ] **7 · TASKS, AND AN EXECUTE BUTTON** — raised 2026-08-06, to be designed
      before it is built. A team is given an OBJECTIVE or a TASK; the commander
      presses EXECUTE and the team routes itself there and does it. That is a
      different act from ordering a move, and it is what turns the station from
      a control panel into a command post.

      It lands on whatever friendly-commander AI exists, which is close to
      nothing today: units execute orders, the campaign scores objectives, and
      nobody in between decides anything. Expect as much engine work as console
      work. Discuss before writing any of it.

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

Steps 1, 2 and 3 are done, plus the `G` tie-break and the shared terrain sheet.
The console now reads: COMMAND and the four S-shops as columns on the left, the
COP in the middle, what you can commit along the bottom, and a station per team
on the right.

Steps 1 through 4 are done. The original cut is complete: the dock commands
elements, the station commands the team, every object has one home, and the map
means what it draws.

What is left is no longer re-organising — it is building. **5** is pop-out
(`window.open` + a portal; the bonus for a second screen, not needed on one).
**6** is the map monolith, which is the one piece of debt the console is now
waiting on: the station's map is still a labelled empty box. **7** — tasks and
an EXECUTE button — is a design conversation before it is anything else, and it
is the one that turns this console into a command post.

Also outstanding, small: the pack tutorial's prose still tells the player to
open a FORCES rail that no longer exists. Its CONDITIONS were remapped; the
words are a content fix.
