# HANDOFF — 2026-08-02 (Fable 5 → Opus 5): TASK-ORG PHASE 1

> **STATUS: T1–T5 SHIPPED** (commits 3228704 · 66dfd94 · e77e70e · 8f76e6a ·
> and the retrofit). tsc clean at every step; the `'2-8 CAV'` literal is gone.
> The settled model below is now IMPLEMENTED — it stands as the reference for
> how task org works, not as a to-do. What remains from this arc:
> **phase 2, the friendly-commander AI** (make allied formations manoeuvre —
> `domains/forces/command.ts` is the seam it plugs into), which waits behind
> the PLAY loop so it can be watched and tuned. Hostile formations wait for
> the OPFOR pack's org (P4). Nothing else here is outstanding.

The Scenario Builder speaks the pack's real division. This doc is
self-contained — read it plus the two plan docs and you have everything.
Prior handoff content is in git history (this file, 2026-07-25).

## Read first

1. **SCENARIO-MODEL.md** — the settled content model (ONE object, the
   SCENARIO, typed by the author; situation + missions[] as sections; disk =
   one file until missions exist, then a folder with missions as NN-id.json).
   Includes the ten dogfood findings from building TRAINING DAY through the
   UI — respect them while working in the builder; fix any you touch in
   passing (esp. #2 draft protection and #3 armed-tool if convenient, but
   they are NOT this phase's scope).
2. **SCENARIO-BUILDER.md** — the E-phase history. Superseded on vocabulary by
   SCENARIO-MODEL.md but the REUSE-NO-MONOLITHS directive and design laws
   stand.
3. `src/packs/1cd/scenarios/training-day/` — the acceptance content: a
   campaign scenario authored 100% through the UI. Your work must be
   retrofit-able onto it (its CP becomes 2-8 CAV's, etc.).

## Standing conduct (the user's rules — do not relearn these the hard way)

- **The user tests.** Do not launch play-tests unless told. Typecheck
  (`npx tsc --noEmit`, CHECK THE EXIT CODE — `| head` eats it) is your gate.
- **Edit tool only** — never modify source via node/sed/scripts.
- **Commit and push completed work** unless it's game-breaking. Small
  commits per coherent increment. `git add -A` will sweep in the
  deliberately-untracked `public/training.html` — add paths explicitly.
- **No shims over old systems** — rewrite or delete ("don't ram shit in").
- **Realism litmus**: "would a real TOC/division have this?" gates every
  feature decision.
- **No monoliths**: reuse existing services/factories; new code = small
  single-concern modules. If the game already does it, the builder calls it.
- The word "theater" is banned in new code (P6).
- React gotcha that cost a crash on 2026-08-02: NEVER read
  `ev.currentTarget` inside a setState updater — capture the value first.
  (Fixed instance: ScenarioBuilder mission id/name inputs.)
- Bash cwd resets — `cd /t/Dev/war-of-dots &&` on every command.
- After changing vite.config/tools/pack-io, the DEV SERVER must restart;
  stale module graphs blank the page with misleading HMR errors.

## The settled model you are implementing (user-ratified 2026-08-02)

**Ownership and command ARE the pack's org tree.** The pack ships the full
real division (S.org = buildDivisionOrg; formations/battalions/slots/people).
The builder gains one vocabulary:

1. **Every friendly entity carries a FORMATION** — a designation from the
   pack org ('2-8 CAV', '3ABCT', 'DIV MAIN'), picked from org-fed dropdowns,
   never free text.
2. **Command DERIVES from task organization** (user: "command derives from
   task org"). No player/AI toggle:
   - units of the player's formation → player-controlled
   - units of another formation with `attached: true` → player-controlled
     (the pack's existing organic/attached concept, per-scenario)
   - units of another formation, not attached → AI-commanded friendly
     (phase 2 makes them maneuver; THIS phase they hold/defend dumbly —
     that's acceptable and explicit)
3. **The scenario declares the player's chair**: `player: '2-8 CAV'`.
   Campaign type: fixed by the author (kills the `'2-8 CAV'` fallback
   literal in engine/campaign.ts — hardcode audit item). Skirmish types:
   it's the DEFAULT; the splash lets the player choose among the pack's
   `playable` battalions (machinery exists: `playableBns`/`isPlayableBn` in
   packs/types.ts).
4. **Installations carry ASSETS with quantities**: `assets: [{asset, qty}]`
   from the pack's asset catalog — C-RAM section at the FOB, SHADOW at the
   CP. Enters the asset registry sited there at apply.
5. **Difficulty does NOT scale authored quantities** (user-ratified via the
   OPORD litmus). Difficulty stays economic asymmetry. No coupling. If ever
   needed, a per-entry `scaleWithDifficulty` flag is the escape hatch — do
   not build it now.
6. **The OPORD litmus** for any "should this be configurable?" question:
   the scenario file is the OPORD plus task org — task organization,
   attachments, asset allocation, supply status, control measures, mission,
   who commands = scenario data. Player preference and engine physics = not.

## Schema deltas (src/scenario/types.ts)

```ts
ScenarioSpec {
  // NEW — the player's chair: a formation designation from the friend
  // pack's org. Campaign: script. Skirmish: default, overridable at launch.
  player?: string
}
ScenarioStructure {
  // NEW — owning formation designation (friendly side; hostile joins when
  // the OPFOR pack ships its org). Drives deploy/garrison gating, label
  // defaults, DIV MAIN placement.
  formation?: string
  // NEW — assets sited here at H-hour, from the pack asset catalog
  assets?: { asset: string; qty: number }[]
}
ScenarioUnit {
  formation?: string   // NEW — owning formation
  attached?: boolean   // NEW — task-organized to the player's command
}
```

Absent `formation` = the player's formation (back-compat: TRAINING DAY and
empty scenarios keep working; retrofit TRAINING DAY's entities explicitly as
part of verification).

## Work plan (commit per step, tsc-gated)

**T1 — schema + org service.** Types above. A small `src/packs/orgquery.ts`
(or extend packs/org.ts if it fits its concern) exposing what the builder
needs: `formationOptions(pack)` (designations, display labels, echelon),
`slotBudget(pack, formation, unitType)` (how many of a type the formation
really has), `playableFormations(pack)` (wraps the existing playable
machinery). REUSE buildDivisionOrg's tables — do not re-derive org shape.

**T2 — applyScenario honors the org.** engine/applyScenario.ts:
- friendly units: draw slots from THEIR formation (deployUnit currently
  draws from the player pool — check domains/installations/orders.ts +
  packs/org.ts slot drawing; parameterize by formation, reusing the same
  draw function CALL UP uses; no parallel path).
- `attached` units join the player's command exactly like today's engineer
  attachments (the precedent: attachments in packs — follow that path).
- non-attached other-formation units: fielded, AI-side friendly — phase 1
  behavior = hold position (aiRole 'garrison'-equivalent for friend side or
  simply no player orders accepted; pick the SMALLEST honest mechanism and
  document it; do NOT build the friendly commander AI — that is phase 2).
- structures: owner formation on the Structure (GameState Structure gains
  `formation?: string`), label defaults from formation, deploy/garrison
  gating: CALL UP at an installation lists only garrisons of its owning
  formation (+ attachments to it). Find the CALL UP source list (ForcesRail /
  installations) and gate there — one filter, not a new system.
- structure `assets`: enter the asset registry sited at that structure
  (domains/assets/registry.ts — extend the build/preAllocate seam, same
  style).
- `player`: startCampaign + initScenarioGame set the player's battalion from
  spec.player (default = pack.formation.playerBn), and setBnCommander uses
  it — DELETE the `?? '2-8 CAV'` literal.

**T3 — builder UI.**
- Palette: "PLACING AS: <formation> ▾" selector (org-fed) above the BLUFOR
  sections; placed entities stamp that formation. Palette rows show live
  slot budget ("MECH · 4/6") for the selected formation; at 0, row disables.
- Inspector (friendly unit): FORMATION picker + ATTACHED TO PLAYER'S COMMAND
  checkbox (only when formation ≠ player's). Inspector (friendly structure):
  FORMATION picker + ASSETS editor (rows of asset picker + qty, from the
  pack asset catalog).
- Scenario-level: PLAYER'S COMMAND picker (org battalions) — top bar or a
  small SCENARIO section; campaign/skirmish both author it (skirmish treats
  it as default).
- Sheet: AI-commanded friendly units render visually distinct from player
  units (the COP already distinguishes things — reuse an existing visual
  channel, e.g. label styling; do not invent a new symbology layer).
- Slot validation: total placed per formation/type vs slotBudget — warn in
  the header (amber, never block; the H-hour-rule warning precedent).

**T4 — splash chair picker (skirmish only).** Scenario card flow gains
"YOUR COMMAND" step listing `playableFormations` of the friend pack,
default = spec.player. Campaign flow: no picker (script). Pass the choice
through StartFn → initScenarioGame.

**T5 — retrofit + docs.** TRAINING DAY: CP LONGKNIFE + strip get
`formation: '2-8 CAV'`, spec gains `player: '2-8 CAV'` (edit via the
builder if practical — it is also a UX test — else hand-edit the JSON and
say so). SCENARIO-MODEL.md: mark the phase, log decisions. Update the
hardcode audit for the killed literal.

## Explicitly OUT of scope (do not build)

- Friendly AI commander maneuvering (phase 2 — after the PLAY loop; task #47).
- Difficulty scaling of authored quantities.
- Hostile formations (waits for the OPFOR pack org, P4).
- Events (S4), serializer/CONTINUE, PLAY loop itself.

## Verification gates

- `npx tsc --noEmit` exit 0 per commit (echo the exit code).
- TRAINING DAY and IRON TRIANGLE load in the builder and round-trip save
  without data loss (diff the JSON before/after a no-change save).
- Campaign NEW still boots to the VTC brief (the user will play-test; you
  verify it doesn't crash on load path via typecheck + reading the apply
  path — do NOT launch play-tests yourself).
- The `'2-8 CAV'` literal is gone from engine code; grep proves it.

## Current repo state

- main @ fe5c7d4, tree clean except deliberately-untracked
  public/training.html. All prior arcs (collapse to one scenario object,
  two-screen builder, TRAINING DAY content) are pushed.
- Dev server on :5187 may be running from a prior session — restart it
  before browser work.
