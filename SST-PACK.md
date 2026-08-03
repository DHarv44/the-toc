# STARSHIP TROOPERS — total conversion, and what it takes

> The point is NOT Starship Troopers: a total conversion is the only honest
> test of "engine ships verbs, packs ship nouns". If a bug army can be authored
> without touching engine code, the split is real. Everywhere it can't, we
> found a hardcode.

## THE GAME (do not drift from this)

**A BATTALION TOC.** The player is a headquarters. They receive an OPORD from
division over the VTC, call PLATOONS up from garrison, push battle groups
around a COP, and their staff writes reports. The thing you COMMAND is a
battalion; the thing you MOVE is a platoon. Squads and fire teams are S1 roster
fidelity — who is on the books — not things you order.

The architecture must not ASSERT that. `Formation.chairRung` says which rung a
pack is commanded at; 1CD says 1 (battalion) and that is why this is a
battalion game. One rung up (brigade) is plausible if a pack ships
company-sized unit types. Division/corps is a different game — the map scale,
the tempo and the direct-order model are all battalion-shaped — and the
architecture should ALLOW it rather than pretend the tuning does.

## Canon

BLEND — novel for organisation, film for tone. **Researched and confirmed:**

- Rasczak's Roughnecks is formally **"Second Platoon, George Company, Third
  Regiment, First Division"**; Willie's Wildcats is "Company K, Third Regiment,
  First MI Division". So the MI ladder is **DIVISION → REGIMENT → COMPANY →
  PLATOON** — no brigade, no battalion. Companies lettered, spoken phonetically
  (George = G, King = K).
- Ranks: Recruit, Private, Trained Private, Lance Corporal, Corporal, Sergeant,
  Ship Sergeant, Fleet Sergeant; **Third Lieutenant** (a cadet officer on
  trial — a real Heinlein invention), Lieutenant, Captain, Major, Colonel.
- Suits: Marauder (line), Command (officer — more comms, more juice), and a
  scout/area-support type.
- Named platoons carry the commander's name and KEEP it after he dies.

**The MI maps onto the engine's shape one rung down:** the chair is a COMPANY,
the fieldable element is a PLATOON, `chairRung: 1` still.

**The 2525 is Federation propaganda** — a Federal Network COP renders the enemy
as clean bureaucratic icons. Bugs still get a hostile diamond, because the
frame is OUR convention, not theirs; the pack supplies only what goes inside.

## What burrowing turned out to be

Nothing — not a movement mode in either canon. A bug hole is a STRUCTURE with a
deploy zone (the HQ/FOB mechanic); "a pile in the sand that morphs on contact"
is a concealed contact (`intel: 'suspected'` + the garrison spawn's
`contact: { unknown }`); a burrowed bug is DIG IN (`def.name` is already pack
data per unit type). Three mechanics that already exist. Struck.

---

# IN FLIGHT — the formation refactor (NOT COMMITTED, tsc RED)

Discovered by MI research: two fixed levels (`bdes` → `bns`) cannot express
DIVISION → REGIMENT → COMPANY → PLATOON, a flat swarm, or a militia of cells.

### The model being built

```
Formation.under: FormationNode[]     recursive; depth is whatever nests
Formation.echelons: EchelonDef[]     names + 2525 marks per rung, below the top
Formation.top: EchelonDef            the top formation's own rung
Formation.chairRung: number          WHICH RUNG IS PLAYABLE (default 1)
Formation.chair: string              (was playerBn) default commanded formation

FormationNode { desig, nick, patch, arms, kind?, tfCos?, station?, under? }
    `kind` = the bnKind template it expands into. A node with children AND a
    kind is both a headquarters and a commander (a brigade with staff).

OrgSlot.path: string[]   THE ONLY structural truth — ['1ABCT','2-8 CAV','A CO']
OrgSlot.cmd: string      the formation that commands it, STAMPED BY THE BUILDER
                         (knows path AND rung, so a fact not a positional guess)
    bde / bn / co are DELETED. They were right by coincidence.

Unit.cmd (was Unit.bn)   denormalised on the FIELDED unit only — read every
                         frame by underPlayerCommand, answers one question
GameState.chair (was playerBn)
```

Replacements for the deleted fields:
- `sl.bn === X` → `sl.cmd === X`
- `sl.bde === 'ATT'` → `sl.path[0] === 'ATT'`
- `sl.co` → last path element
- budgets/garrisons → `sl.path.includes(formation)` (works at any rung)

### DONE so far
- types.ts: FormationNode, EchelonDef, walkFormation, chairRung, playableBns
- orgquery.ts: echelonAt/echelonMark/rungOf/markOf, formationOptions, orgTree,
  patchOf, armsOf, defaultStructureLabel, slotBudget, formationSlots — all
  walk the tree; `Echelon` is now a string
- symbols.ts: takes the MARK to draw, not an echelon name (ECHELON_MARK gone)
- MapView / SheetCanvas: `markOf`
- OrgPicker: TONE indexed by RUNG not by echelon name
- PackViewer / PackBuilder / BnHeader / S1Console: walk instead of `.bdes`
- GameState.ts: OrgSlot.path + cmd; Unit.cmd; GameState.chair
- org.ts: recursive `walk`, builder stamps path + cmd
- 1cd/pack.json: `bdes`→`under`, `bns`→`under`, `hq`→`kind`, echelon ladder added

### LEFT TO DO  (resume here — tsc is RED, nothing committed)

**1. `src/ui/S1Console.tsx` — 28 errors, THE ONLY FILE LEFT.** Every other
file is done. All mechanical, same four substitutions:

```
sl.bn            ->  sl.cmd
sl.bde === 'ATT' ->  sl.path[0] === 'ATT'
sl.bde           ->  sl.path[0]
sl.co            ->  ownerOf(sl)          // already imported? add from packs/orgquery
formation?.playerBn -> formation?.chair
S.playerBn       ->  S.chair
```
`ownerOf` is exported from `packs/orgquery` (added today). `walkFormation` is
already imported into S1Console.

**2. `src/packs/1cd/pack.json`** — one rename: `"playerBn": "2-8 CAV"` →
`"chair": "2-8 CAV"`. (`bdes`→`under`, `bns`→`under`, `hq`→`kind`, and the
`top`/`echelons`/`chairRung` ladder are ALREADY done.)

**3. Verify in browser** (`http://localhost:5187`, hard-reload — Vite serves
stale modules): build the org and check 331 slots / ~5.4k soldiers, every slot
has a `path` and a `cmd`, `cmd` is '2-8 CAV' for the chair's own elements,
attachments still sit under `path[0] === 'ATT'`, and the S1 tree renders.

**4. Commit.** Explicit paths only — the user's own training-day scenario edits
must not be swept in.

### THEN — Pack.side must go (user, and correct)
`Pack.side: 'friend'|'hostile'` is baked in. `ScenarioSpec.sides` ALREADY
assigns packs to sides. A pack is an army; who it fights for is the scenario's
call. `activePack(side)` should resolve from the installed lineup, which the
scenario/skirmish sets. BLUEFOR/OPFOR are roles, not properties of a pack.

---

## Then the packs

**Mobile Infantry first** — it needs no new engine features and every hardcode
it hits is a DISCOVERED one on ground we understand. (Earlier I sequenced by
engineering risk and started on swarm groundwork; that was wrong and the work
was reverted — it was speculative capability for content that did not exist.)

**Arachnids second**, once there is a working faction to fight.

## Still open before bugs are affordable

- **Elements that are not people.** Every element is named soldiers with
  billets, ranks, wounds, awards, XP and a replacement pipeline. Right for MI,
  nonsense and expensive for ten thousand warriors. A troop kind (or a unit
  type) needs to say "not individuals". FIRST ATTEMPT WAS REVERTED — the design
  is a guess until bugs exist to test it against.
- **Swarm-scale AI.** The OPFOR commander reasons about battlegroups of
  platoons on a decision cycle. Thousands of warriors at a perimeter is flow
  fields, not utility scoring. Real engineering.
- **Structures by capability, not key.** `StructureType` is already a parameter
  bag and facilities are already effect specs — what is left is `modes.ts`
  deciding victory on `kind === 'HQ' || kind === 'FOB'` and `friendlyFob`. Ask
  "is it a deploy point" / "does it hold stock".
- **Mobility classes as pack data.** AMPHIBIOUS earns its place on both sides.
- **Delivery verbs** — an asset arrives exactly one way today (convoy, road
  net, ambushable). Generalise to *where from, how it travels, what can stop
  it, how long until useful*: convoy / air assault / orbital drop / bug
  emergence. Gives the classic army air assault and aerial resupply too.
- **The supply economy** assumes the enemy has logistics; bugs need none.
- **Balance is invention.** No numbers to look up.

## Decisions log

- 2026-08-03 · the game is a BATTALION TOC; the architecture asserts no echelon
  and 1CD's `chairRung` is what makes it one.
- 2026-08-03 · burrowing is not a mobility class — structure + concealed
  contact + DIG IN, all of which exist.
- 2026-08-03 · the enemy is drawn in OUR symbology; the pack supplies what goes
  inside the frame, never the frame.
- 2026-08-03 · canon is a BLEND, novel for organisation and film for tone.
- 2026-08-03 · `OrgSlot.path` is the only structural truth; `bde`/`bn`/`co`
  deleted rather than kept denormalised — they were right by coincidence and
  would silently lie for any army that is not three rungs deep.
- 2026-08-03 · MI first, bugs second — sequence by FEEDBACK, not by engineering
  risk.

## Standing rules (bitten by these today)

- **Never edit source with sed/python/node.** Use Edit. Broke this three times.
- **`git add` explicit paths** — `-u` and `-A` sweep in the user's own work.
- Bash cwd resets between calls: `cd /t/Dev/war-of-dots &&` first.
- `npx tsc --noEmit` and CHECK THE EXIT CODE (`| head` eats it).
- The user runs play-tests. Do not launch one unless asked.
