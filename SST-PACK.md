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

# DONE — the formation refactor (0af31c2) and the nouns pass (48c3fc4)

Both shipped and pushed on 2026-08-03. tsc green, verified in the sandbox.

**What the nouns pass added**, since the SST packs will lean on it hard:

```
BnSlotPlan.role     'command' | 'staff'   what an element is to its formation
StaffSection.desks  ['S1','G1']           every name one desk goes by
packs/ranks.ts      rankDef / rankW / seniorOf
packs/orgquery.ts   commandSlot, staffSlots, staffOf, commanderOf,
                    topCommander, deskNames, deskOf, formationsWithDesk
```

`seniorOf` is the load-bearing one: WHO LEADS an element is the senior
soldier in it and, among equals, the one listed last (rosters run in
casualty order). No army has to tell us its leaders' job titles — which is
what makes a Mobile Infantry platoon led by a Third Lieutenant work.

Still an engine literal with no home: **COBALT** (`scenario.ts` base names).
It wants `ScenarioSpec.tf` — a task force's name and its commander's
callsign are the scenario's to give. S1's TF row now reads `TF <chair>`.

**`Pack.side` is gone** (7fce220). The assignment lives with the installed
lineup — `installLineup({friend, hostile})`, `playerPack() = activePack
('friend')`, and `initGame` takes `spec.sides`. A scenario can now put the
player in command of the OPFOR army, and one army can hold both sides.
personnel.ts takes a `Pack` instead of a side, killing the Pack→side→Pack
round trip `buildDivisionOrg` used to make.

---

## NEXT — the packs

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
- 2026-08-03 · a pack DECLARES which elements command and which staff
  (`BnSlotPlan.role`) and what each desk is called at each rung
  (`StaffSection.desks`). Finding a commander by the words 'CMD GRP' was
  already broken inside 1CD itself, whose division says COMMAND GROUP.
- 2026-08-03 · WHO LEADS an element is seniority, not a job title: senior
  first, and among equals the one listed LAST (rosters run in casualty order).
  The engine keeps that rule and no billet vocabulary at all.
- 2026-08-03 · a pack is an ARMY and holds no side. BLUEFOR/OPFOR are roles a
  SCENARIO assigns, held by the installed lineup. This is what lets the MI and
  the Arachnids each be authored once and pointed at each other — or at
  anybody — by the scenario that fields them.

## Standing rules (bitten by these today)

- **Never edit source with sed/python/node.** Use Edit. Broke this three times.
- **`git add` explicit paths** — `-u` and `-A` sweep in the user's own work.
- Bash cwd resets between calls: `cd /t/Dev/war-of-dots &&` first.
- `npx tsc --noEmit` and CHECK THE EXIT CODE (`| head` eats it).
- The user runs play-tests. Do not launch one unless asked.
