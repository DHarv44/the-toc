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
