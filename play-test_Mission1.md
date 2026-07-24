# Play-test — Mission 1 (LODGMENT)

Findings from playing M1 on **Recruit** (easiest; `damageMul 0.55`), fixed campaign
map (Chorwon, seed 1). Force: MECH (GOLF-7) · INF (HOTEL-8) · INF (INDIA-9) · SCT
(JULIET-10). Garrison: 2× INF in the town (DORAN), sitting in urban terrain.

## Run 1 — following the tutorial exactly (frontal group-assault)
- The tutorial's GROUP → ATTACK → right-click-enemy sends the whole force charging
  across open ground into the urban garrison.
- **Both rifle platoons were destroyed** (INDIA-9, HOTEL-8). Only the MECH and the
  SCT survived, at 100% — the recon hung back, and the mounted MECH shrugged it off
  initially.
- **Then the mission DEADLOCKED:** one garrison INF was left alive; the surviving
  MECH finished its attack order and **halted ~1018 m away, idle**. Urban concealment
  drops its effective sight to ~405 m, and a passive (non-firing) INF is invisible
  beyond that, so it never re-engaged. `await-clear` waits forever → tutorial can't
  progress. **Unwinnable on the easiest setting, by following the tutorial.**

## Run 2 — Standard (no tutorial), "MECH leads, rifles hold back"
- Single MECH set to PUSH, ordered into the town center; both INF held back safe.
- MECH reached the town center (35 m), engaged both garrison INF... and was
  **DESTROYED**, having dealt only ~14% total damage (garrison left at 92% / 94%).
- **Enemy killed: 0.** Two urban INF platoons beat one MECH decisively while taking
  ~8% each.

## Root cause — it's munitions/lethality, not tactics
- Infantry deal **continuous, unlimited hard-target damage** (`dpsHard`) — there is
  **no anti-armor munition count**. Real rifle platoons carry only a handful of AT
  rounds (a few AT4/LAW + maybe 1–2 attached Javelins with a few missiles) — call it
  **~4–8 effective anti-armor shots**, enough to kill 2–4 AFVs before they're
  winchester on AT and can only harass armor with small arms.
- On top of that, urban defenders get cover (`COVER_DEF urban ×0.5`) and concealment
  (~0.45, cutting attacker sight), so they're both hard to hit AND hard to see.
- Net: dug-in urban infantry are near-unkillable by a direct assault and can destroy
  armor indefinitely. Any tutorial tactic that ends in "assault the town" bleeds the
  attacker dry.

## Secondary (real bug, independent of balance)
- `await-clear` / the attack follow-through can **deadlock** on a lone out-of-range,
  concealed survivor: attacking units complete their order and go idle instead of
  finishing the garrison. Needs a fix regardless of the munitions change (e.g. units
  keep pursuing until the objective zone is clear).

## Proposed direction (to discuss)
- **Give infantry a limited AT munition load** (like the indirect `load`/ammo already
  added for MOR/ARTY): a small count of anti-armor shots; once expended, `dpsHard`
  drops to ~0 so small arms can't kill armor. Makes infantry a burst anti-armor
  threat, not a bottomless one — and makes armor viable to lead an assault.
- Revisit urban cover/concealment vs. attackers so a supported assault is costly but
  not suicidal.
- Fix the clear-the-town deadlock.

*(Open: exact AT round counts per infantry type, small-arms residual vs armor, and how
this interacts with the M1 garrison strength so the mission is winnable on Recruit
with all/most platoons surviving.)*

---

## UPDATE 2026-07-24 — after FORCE-MODEL Phase 3 (derived combat + munitions)

The munitions model is IN (finite AT, winchester, resupply — golden `2409198223`).
Open-ground mechanics verified: infantry spend their AT4 volley in ~15 s and their
Javelins over ~75 s against armor, then their small arms can't kill it (damage rate
collapses to <35%). The infinite-AT disease is cured.

**But M1 re-runs on the real map still lose** — and the trace shows why, precisely:
- Urban concealment means the garrison is INVISIBLE until it opens fire at its own
  chosen range (~550 m). There is no standoff gunnery against concealed urban
  infantry — by design.
- The halt drill stops attacking armor INSIDE the 400 m close-ambush band (×2.2).
- The garrison digs in while fighting (damage taken → ×0.45 over 90 s).
- Results: MECH vs the 2×INF garrison → MECH destroyed, garrison 89/87%. Even a
  TANK platoon vs a 1×INF garrison → all 4 tanks lost (garrison 70%), the
  garrison's entire Javelin load expended. The tanks died during the AT window
  because the fight happened at 362 m.

**Conclusion: this is now mission CONTENT tuning, not engine work.** The doctrinal
counter to concealed urban defenders is prep fires — which M1's design withholds.
Adjustment options for the discussion:
1. Garrison = 1×INF **without Javelins** (second-line troops with AT4s only) and/or
   no dig-in — the 3-platoon group assault then wins with acceptable losses.
2. Give the M1 fixed force an organic MOR section + a prep-fires tutorial beat
   ("suppress the town before the assault") — teaches the real lesson.
3. Keep 2×INF but make the counterattack the main event (garrison token).

---

## TUNING APPLIED 2026-07-24 — option 1 + recon screens

Decision: **option 1** (mortars/prep-fires deferred to M3's fires introduction), plus:
because the garrison is hidden until it fires, **the recon platoon now starts on
BREAK ROE** — a concealed garrison springing on the scouts triggers a break-contact
drill instead of a stand-and-die. (M1 tutorial instructions will be reworked for
the recon-screen flow — pending.)

Changes (engine/campaign.ts M1 setup): garrison `['INF','INF']` → `['INF']` with
`stowage.M_JAVELIN = 0` (second-line troops, AT4s only); friendly SCT `roe='break'`.

**Verified (phase3-check 13/13, campaign-check 27/27, golden unchanged
`2409198223`):** the WORST case — a lone MECH platoon pushing frontally into the
town with zero support — now survives at **38%** (2 of 4 Bradleys lost) and clears
the garrison in ~6 min. The tutorial's 3-platoon group assault is strictly easier;
losses should be light on Recruit. Counterattack (MECH+INF vs the player's force in
urban cover) remains the real fight, as intended.

**FULL-MISSION ACCEPTANCE (`.tmp-mig/m1-final`, Recruit, tutorial flow — recon
screens forward, 3-platoon group assault, hold the town):** garrison cleared,
counterattack defeated, **all 4 friendly units survive, 0 lost**. End strengths:
MECH 54 · INF 9 · INF 100 · SCT 100 — the assault-lead INF survives but is mauled
(the future WIA/CASEVAC systems make that platoon the story). Note: the sim is
fully seeded, so repeated identical scripts give identical outcomes — this
certifies the tutorial play pattern, not outcome variance.
