# THE STAFF — what each shop is, and which ones a battalion actually has

> Reference + design contract for the S-shop consoles. The realism litmus for
> this whole file: **would a real battalion TOC have this seat, and would that
> seat produce this product?** If the answer is no, it does not ship, however
> convenient the button would be.

## Where the numbers come from

The numbered staff is the **continental staff system**, inherited from the
French *état-major* by way of every NATO army. One number, one functional area,
regardless of echelon or nation. The letter in front says which echelon:

| Prefix | Echelon | Example |
|---|---|---|
| **S** | Battalion / squadron / regiment / brigade | 2-8 CAV's S3 |
| **G** | Division / corps / army (general officer command) | 1CD's G3 |
| **J** | Joint force / combatant command | a JTF's J3 |
| **N / A** | Naval / air component | a wing's A4 |

Same job, different letter. The G3 of a division and the S3 of a battalion do
the same *function* at wildly different scale. That is the point of the system:
a staff officer can walk into any headquarters in the alliance and know where
to find the person who owns ammunition.

Two more groupings matter, because they explain who is on the TOC floor:

- **Coordinating staff** — the numbered shops. They act with the commander's
  authority within their functional area.
- **Special staff** — technical experts who advise and are usually attached
  rather than organic (engineer, fire support, CBRN, air liaison, surgeon).
- **Personal staff** — work directly for the commander, not through the XO
  (Command Sergeant Major, chaplain, and at higher echelons the SJA, IG, PAO).

The **XO** is the battalion's chief of staff: the staff works for the XO, the
XO works for the commander. At division that role is a full colonel Chief of
Staff.

## G1–G9 — the full general staff

| # | US Army title | Owns |
|---|---|---|
| **G1** | Personnel | Strength, casualties, replacements, awards, postal, morale/welfare |
| **G2** | Intelligence | Enemy, terrain, weather; collection management; IPB; PIR |
| **G3** | Operations | Current fight, plans, training, task organization, orders |
| **G4** | Logistics / Sustainment | Supply CL I–IX, maintenance, transport, field services |
| **G5** | Plans | Future operations — the next order, not this one |
| **G6** | Signal / Network | Communications, mission-command systems, COMSEC, spectrum |
| **G7** | Information Operations | The information environment; messaging, deception, EW effects |
| **G8** | Financial Management | Budget, comptroller, contracting authority |
| **G9** | Civil Affairs | Civil-military operations, the population, host-nation |

**Watch the divergence.** The numbers are not universal past 6:

- **US G7 = Information Operations. NATO J7 = Training & Exercises.** Same
  digit, unrelated jobs.
- **US G9 = Civil Affairs. NATO J9 = CIMIC.** Same domain, different label.
- **G5** is Plans in current US doctrine; in older US usage and in several
  allied armies it is Civil-Military Operations. If a document says "G5" you
  check the flag on the shoulder before you assume.

A useful way to hold it: **1 through 4 are the classic four** (men, enemy,
mission, materiel) and exist at every echelon down to battalion. **5 through 9
are echelon-above enrichments** that appear as the headquarters gets big enough
to afford dedicated cells.

---

## What a BATTALION actually has

A US maneuver battalion — which 2-8 CAV is — staffs **S1, S2, S3, S4, S6**.
That is the whole coordinating staff. The rest do not exist at this echelon,
and the reasons are worth writing down because they are also the design
rationale for the consoles.

### Organic — these are real seats in the TOC

| Shop | Why it exists at battalion |
|---|---|
| **S1 · Personnel** | A battalion is ~600–800 people. Somebody accounts for every one of them, every day, and pushes replacements. |
| **S2 · Intelligence** | The battalion owns organic recon (scouts, Raven). Someone has to turn what they see into what the commander believes. |
| **S3 · Operations** | The largest shop, and the one that runs the TOC floor. Current fight AND the next one. |
| **S4 · Logistics** | Fuel, ammunition, and broken vehicles are what stop a battalion, far more often than the enemy. |
| **S6 · Signal** | If the net is down the battalion is a collection of platoons. |

### Not at battalion — and why

- **S5 (Plans)** — a battalion does not have the officers to split current ops
  from future ops. **Planning is the S3's job**, done by the same people who
  are fighting today's fight. That is exactly why battalion planning is rushed
  and why the XO exists to protect it. A dedicated plans cell starts at
  brigade, and is properly resourced at division.
- **S7 (Information Operations)** — IO is a division-and-above capability. A
  battalion *receives* IO effects; it does not staff them.
- **S8 (Financial Management)** — battalions do not hold budget authority in
  combat. Money is a brigade/division function. (An S8 exists in some
  institutional and allied battalion structures, but not a US maneuver
  battalion in the field.)
- **S9 (Civil Affairs)** — a CA team may be *attached* to a battalion in a
  stability fight, and when it is, it works for the S3. It is not an organic
  shop.

### Special and personal staff — the other people on the floor

These are not numbered, but a real TOC is full of them, and several are far
more present in a firefight than the S1 is:

| Seat | Job | Present in TOC? |
|---|---|---|
| **XO** | Chief of staff; runs the staff, owns the battle rhythm | Yes — owns the floor |
| **CSM** | Personal staff; the commander's eyes on the formations | Roams, not a desk |
| **FSO / FSE** | Fire support officer + fires cell — clears and coordinates ALL indirect | **Yes — sits beside the S3** |
| **Battalion Surgeon / PA** | Medical planning, MEDEVAC, the casualty flow | Yes — or forward at the aid station |
| **BMO** | Battalion Maintenance Officer — works for/with the S4 | Usually at the field trains |
| **CBRN NCO** | Chemical defence | Yes, part-time |
| **ALO / JTAC** | Air liaison — CAS and airspace | When air is allocated |
| **Engineer LNO** | When engineers are attached | When attached |

**The fires cell is the important one for this game.** Doctrinally the FSO is
special staff, not a numbered shop — but physically, in every real TOC, the
fires cell is a manned station right next to the S3, and it is one of the
busiest seats in a fight. A TOC game that models indirect fire and has no fires
seat is missing a chair that genuinely exists.

---

## What TOC ships today

`packs/1cd/pack.json → staff` currently defines five shops. This is
doctrinally correct for a battalion and should not grow numbered shops:

| Shop | Report | Console state |
|---|---|---|
| S1 · Personnel | **PERSTAT** | Built — div/TF/bn/shop rosters + PERSTATS tab |
| S2 · Intelligence | **INTSUM** | Built |
| S3 · Operations | **OPSUM** | Built |
| S4 · Logistics | **LOGSTAT** | Built |
| S6 · Signal | **COMSTAT** | Declared, stands up with the EW layer |

Each shop's product is a real report with a real name. That naming is load
bearing — a PERSTAT is a specific document a real S1 sends on a schedule, and
the game's report pipeline (`queueReport` → prep delay → alert →
`openReport`) is modelling exactly that: staff work takes time, and the
commander reads it when it lands.

---

## Per-shop design spec

For each shop: the real job, the product, what the sim already knows, and what
the console owes the commander.

### S1 — PERSONNEL · *PERSTAT*

**Real job.** Strength accounting, casualty reporting, replacement operations,
awards and promotions, postal, legal, and the grim administrative work behind
every name.

**Sim data that exists.** Full division org with named soldiers and status
(FIT / WIA / KIA / MIA), the replacement pipeline (`replT`), rear detachment,
DUSTWUN sites, combat experience and battlefield promotions.

**The console owes.** Assigned vs present strength by element; who is hurt and
where they are in the pipeline; the DUSTWUN board; what replacements are
inbound and when. **The honest number, including the ones nobody wants.**

### S2 — INTELLIGENCE · *INTSUM*

**Real job.** Own the enemy picture. Run collection. Say what is known, what is
assessed, and what is a guess — and never blur the three.

**Sim data that exists.** `S.contacts` with live / stale / unknown states,
sensing model, drone feeds, the FLOT / control field, OPFOR composition.

**The console owes.** The enemy as the COP actually knows it, with the
confidence honestly marked. Last-known vs live. **A PIR / collection board is
the obvious gap** — real S2 work is deciding what you need to find out and
which sensor answers it, and the game has organic recon to task.

### S3 — OPERATIONS · *OPSUM*

**Real job.** The biggest shop. Current operations, future planning, task
organization, orders production, battle rhythm, rehearsals. The battle captain
runs the floor; the S3 owns the fight.

**Sim data that exists.** Campaign objectives and status, the orders log,
battle groups / task organization, unit states and ROE, open incidents.

**The console owes.** The fight as it stands. Objective board, task org, what
is committed and what is in reserve, open incidents. **The gap: the player only
ever RECEIVES orders.** A real S3 *produces* them — a WARNO to the companies, a
FRAGO shifting a boundary. That is the most doctrinally interesting unbuilt
thing in the game.

### S4 — LOGISTICS · *LOGSTAT*

**Real job.** Keep the battalion able to fight tomorrow. Classes of supply,
maintenance and recovery, transport, distribution, the MSR (with the S3).

**Sim data that exists.** Per-vehicle status and repair queue, ammunition
stowage by class including expendables, FOB stock, convoys, the division asset
pool and request queue.

**The console owes.** Operational-readiness rate and the motorpool queue, CL V
posture across the tubes, forward stock, convoys on the road, the asset board.
**Gap: fuel (CL III) is not modelled separately** — for a mechanised battalion,
fuel is the single most common reason a plan fails.

### S6 — SIGNAL · *COMSTAT*

**Real job.** The network. Retrans, COMSEC, mission-command systems, spectrum
management, and increasingly electronic protection.

**Sim data that exists.** Nothing yet.

**The console owes.** Net health, retrans coverage, and — once the EW layer
exists — jamming, degradation, and what the commander loses when it lands.
**This shop is only worth building alongside EW**, because a comms console with
nothing that can break comms is a dashboard of green lights.

---

## Calls I need from you

These are design decisions, not doctrine questions, so they are yours:

1. **Does the fires cell get a seat?** Doctrinally it is special staff, not a
   numbered shop — but it is a real, manned, busy station in every TOC, and
   this game models indirect fire. My recommendation: **yes, as FSE, not as a
   fake S-number.** It would own fire missions, the fire support plan, and
   clearance of fires.
2. **Does the commander ever issue orders down?** The S3 currently only
   receives FRAGOs from division. Letting the player push a WARNO/FRAGO to
   companies is the most realistic unbuilt mechanic on the board.
3. **A medical seat?** The bn surgeon/PA runs casualty flow and MEDEVAC from
   the TOC. Casualties, DUSTWUN and recovery already exist in the sim — the
   9-line is a natural fit. Own seat, or folded into S1?
4. **S6 timing** — hold it for EW as the pack comment says, or build a thin
   retrans/coverage version earlier?
5. **CL III fuel** — worth modelling for the S4, or is generic supply enough?

## The rule this file exists to protect

**Numbered shops stop at S6 for a battalion.** If the game later wants a civil
affairs or information mechanic, it arrives the way it really would: as an
*attached* team or a *division effect*, working through the S3 — never as a
newly invented S7 on the top bar.
