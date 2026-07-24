# Force Composition Model — working doc / handoff

> Living document for the force-model refactor. **Keep it updated as phases land** —
> it's the pickup point if a fresh session (or a different model) takes over.
> Companion docs: ROADMAP.md (product intent: Battalion Roster, Ammo & Fuel),
> src/MIGRATION.md (golden baseline history), play-test_Mission1.md (the playtest
> that triggered this).

## Why (decided 2026-07-24, playtest findings)

M1 playtesting exposed that infantry deal **unlimited** anti-armor damage: two
urban rifle platoons destroyed a MECH platoon while taking ~8% losses, and the
mission deadlocked. Infinite AT is a **symptom** — the disease is that the sim
models units as aggregate DPS blobs (`dpsSoft/dpsHard` + a strength %), so there
is no object that IS an AT round, a Javelin gunner, or a named soldier. Nothing
to run out, nothing to wound, nothing to put on a roster.

The Battalion Roster roadmap item (named soldiers, WIA/KIA, CASEVAC, MIA/POW,
S1 view, campaign persistence) needs the same fix: **individuals as the source
of truth**.

## Decisions (locked)

1. **Composition, not inheritance.** No `class Infantry extends Unit`. A unit
   type differs only in what it's MADE OF — vehicles + troops + weapons + ammo —
   which is data. Where behavior varies by kind, use discriminated unions.
2. **Plain serializable data + systems stays.** The GameState doctrine (no
   entity classes, JSON round-trip, golden determinism, HMR) is preserved. The
   composition model deepens it; it does not replace it.
3. **The unit remains the command/movement/AI entity.** Soldiers/vehicles live
   INSIDE units. We never pathfind or AI individual soldiers.
4. **Strength inverts: derived, not authoritative.** Today `strength` drives
   element deaths (`syncElements`). Target: casualties happen to individual
   soldiers/vehicles and `strength` is computed from them.
5. **Firepower derives from the roster.** A unit's dps vs soft/hard = the sum of
   its alive shooters' weapons THAT STILL HAVE AMMO. Winchester, casualty
   degradation, and mounted/dismounted firepower all become emergent.
6. **Vehicles can mount multiple weapon systems** (Bradley: 25mm + coax + TOW).
   Ammo is stowed per AMMO TYPE on the vehicle; weapons draw from stowage.
   Troops likewise (AT gunner: Javelin + carbine).
7. **No database.** Single-player client sim; whole state is one JSON-able
   object; roster scale is ~1–2k records. Save/Continue = JSON snapshot. A DB
   only enters if a server-authoritative feature (cloud saves, multiplayer)
   ever ships, and would live behind the Express server, not in the sim.

## Target model

Static catalog (immutable templates, literal-union keys — same idiom as
`UNIT_TYPES`):

```
AmmoType     key, name, class ('SMALL'|'AT'|'CANNON'|'INDIRECT'|...)
WeaponType   key, name, ammo: AmmoKey, range, dpsSoft, dpsHard, load (basic load per shooter)
TroopKind    key, name, weapons: WeaponKey[]
VehicleType  key, name, crew, pax, weapons: WeaponKey[], soft, mob, speed
UnitTemplate key → vehicles: {type, n}[], dismounts: {kind, n}[] (+ doctrine kept
             hand-tuned: sight, def posture, cost, glyph, indirect, logi...)
```

Runtime instances (plain data on `Unit`, serializable):

```
Soldier  id, name, kind, status FIT|WIA|KIA|MIA, vehicleId? (crew/pax slot),
         ammo: Record<AmmoKey, n>
Vehicle  id, bumper, type, status OK|DAMAGED|DESTROYED, ammo: Record<AmmoKey, n>
Unit     ...command fields unchanged... + soldiers: Soldier[], vehicles: Vehicle[]
         strength/dps/AT capability → DERIVED
```

## Phases (each gated: typecheck clean + golden run + doc update)

- [x] **Phase 1 — Catalog model (additive, golden-neutral).** Define the five
      template types; re-express all 12 unit types as compositions; derivation
      function computes aggregate stats from composition; headless comparison
      report vs today's hand-tuned numbers. Nothing imports it into the sim yet.
      *Landed 2026-07-24: `domains/forces/composition.ts` + `.tmp-mig/composition-check` —
      see the drift table below.*
- [x] **Phase 2 — Roster instantiation (REFINED: golden-neutral scaffolding).**
      *Landed 2026-07-24.* Units spawn with real `Soldier[]`/`UnitVehicle[]`
      built from the compositions (`buildRoster` — deterministic, rng-free;
      crews are CREWMAN soldiers assigned to their vic). The strength INVERSION
      originally planned here moved into Phase 3 (one re-baseline instead of
      two): for now elements/strength stay authoritative and `rosterSync`
      (elements.ts, called from attritionSync) mirrors element fates onto the
      roster — veh element[i] ↔ vehicles[i] (destroyed vic takes its crew),
      troop elements partition the dismounts (≈fire teams of 4), both
      directions so reconstitution revives. The golden digest hashes only
      id/side/type/x/y/strength, so added fields are digest-invisible.
      **Verified:** golden `289931028` ×2 (unchanged, deterministic) ·
      `.tmp-mig/roster-check` 8/8 (construction counts, deterministic build,
      mounted-INF vic+crew losses, dismounted-INF fire-team losses, tank
      platoon 2 tanks + 8 crew KIA at 45%) · campaign-check 26/26 · browser
      boot clean, all live units carry rosters. Typecheck clean.
- [x] **Phase 3 — Derived combat + munitions.** *Landed 2026-07-24; golden
      re-baselined `2409198223` (×2 deterministic).* Direct-fire dps now derives
      from the LIVE roster (`forces/firepower.ts → unitFirepower`): alive
      shooters whose weapons still have ammo, exposure mirroring the element
      rules (mounted → vehicle weapon systems — the fireMul fudge is GONE;
      dismounted → foot soldiers; integral → both; crews serve vics, not
      rifles). The old `× strength/100` damage scaling is removed — fewer live
      shooters already means less fire, stepwise as the roster dies. Consumable
      munitions (`Unit.stowage`, pooled per AmmoKey; weapons with `shotTime`)
      deplete while firing — AT-class weapons only engage targets with a real
      hard fraction — with a WINCHESTER net call at zero and fraction-based
      trickle resupply near a base (~8 min) / LOG truck (~4 min), sharing the
      indirect-load rules. Structures take derived fire too (read half-hard).
      **Verified `.tmp-mig/phase3-check` 12/12:** AT4 volley spends in ~15 s,
      Javelins over ~75 s, winchester radio fires, post-winchester damage vs
      armor collapses to <35% of armed rate; casualty ORDER works (composition
      arrays are listed riflemen-first, leaders/medic last — at 40% the AT4
      carriers are KIA but the Javelin teams still answer with ≥1.0 hard dps);
      resupply refills and clears winchester. roster-check 8/8,
      campaign-check 26/26, typecheck clean, browser clean.
      **Strength inversion deferred to Phase 4**: `strength` stays the damage
      ledger (roster mirrors it); flipping to per-soldier damage allocation
      pays off only with WIA/KIA rolls, so it lands with them.
      **M1 playtest finding (needs a design decision — mission CONTENT, not model):**
      even proper tactics lose to the current M1 garrison. Urban concealment
      means defenders open the fight at their chosen range (~550 m), the halt
      drill stops armor inside the 400 m close-ambush band (×2.2), and the
      garrison digs while it fights: MECH vs 2×INF garrison → MECH dead,
      garrison 89/87%; even a TANK platoon vs a 1×INF garrison → tanks dead
      (garrison 70%), Javelins fully expended. Standoff gunnery vs concealed
      urban infantry doesn't exist by design, and M1 withholds the doctrinal
      counter (prep fires). **RESOLVED same day (option 1 chosen):** M1 garrison
      is now 1×INF with Javelins stripped (AT4s only) and the recon platoon
      starts on BREAK (screens the hidden garrison instead of dying to it);
      worst-case lone-MECH frontal assault survives at 38% and clears in ~6 min
      (phase3-check 13/13). Mortars/prep-fires deferred to M3's fires intro;
      the M1 tutorial gets a recon-screen rework later. See
      play-test_Mission1.md.
- [ ] **Phase 4 — Roster surfaces.** Names, S1 view, campaign persistence,
      CASEVAC/WIA/KIA/MIA states. The Battalion Roster roadmap item lands here —
      including per-troop BIOS (clickable backstory, WIA/KIA reflected; see
      ROADMAP → Battalion Roster).

## Phase 1 results — derived vs hand-tuned aggregates

Run: `node_modules/.bin/esbuild .tmp-mig/composition-check.entry.mjs --bundle
--format=esm --platform=node --outfile=.tmp-mig/composition-check.mjs` then
`node -e "import('./.tmp-mig/composition-check.mjs').then(m=>{for(const r of m.run())console.log(JSON.stringify(r))})"`.

Format: `derived vs catalog (drift%)`. Carrier units compare dismounted (dis) and
mounted (mtd) separately; integral units compare COMBINED (crew-served + foot)
against the catalog's single pool. Golden `289931028` unchanged (file not in the
sim import graph). Typecheck clean.

| unit | veh | troops | soft dps | hard dps | AT rds |
|------|-----|--------|----------|----------|--------|
| INF  | 4/4 | 32/32 | dis 3.42 vs 3.4 (+1%) · mtd 1.8 vs 1.7 (+6%) | dis 1.6 vs 1.5 (+7%) · mtd 0.68 vs 0.75 (−9%) | 10 |
| STRY | 4/4 | 36/36 | dis 3.66 vs 3.8 (−4%) · mtd 1.8 vs 3.04 (**−41%**) | dis 1.85 vs 1.8 (+3%) · mtd 0.68 vs 1.44 (**−53%**) | 12 |
| MECH | 4/4 | 24/24 | dis 2.64 vs 4.6 (**−43%**) · mtd 6.68 vs 4.6 (**+45%**) | dis 2.08 vs 2.4 (−13%) · mtd 5.88 vs 2.4 (**+145%**) | 45 |
| ARM  | 4/4 | 0/0   | 5.4 vs 3.6 (**+50%**) | 6.26 vs 5.5 (+14%) | 0 |
| AT   | 0/0 | 8/8   | 0.48 vs 0.6 (−20%) | 4.4 vs 4.6 (−4%) | 32 |
| SCT  | 3/3 | 0/6*  | 1.35 vs 1.6 (−16%) | 0.51 vs 0.5 (+2%) | 0 |
| CAV  | 4/4 | 6/6   | 6.9 vs 3.0 (**+130%**) | 1.48 vs 2.6 (**−43%**) | 0 |
| MOR  | 0/0 | 9/9   | 1.41 vs 1.4 (+1%) | 0.4 vs 0.4 (0%) | 0 |
| ARTY | 3/3 | 0/0   | 0.99 vs 1.0 (−1%) | 0.39 vs 0.4 (−3%) | 0 |
| ENG  | 3/3 | 16/16 | 2.23 vs 2.2 (+1%) | 1.01 vs 1.0 (+1%) | 4 |
| SIG  | 2/2 | 8/8   | 0.4 vs 1.0 (**−60%**) | 0 vs 0.3 (**−100%**) | 0 |
| LOG  | 5/5 | 0/8*  | 0 vs 0.8 (**−100%**) | 0 vs 0.2 (**−100%**) | 0 |

\* SCT/LOG catalog "troops" are actually vehicle crews (semantics drift, expected).

**Reading it:** 7 of 12 units derive within ~±10% straight from real weapon
compositions — the model reproduces the hand-tune where the hand-tune was
honest. Every bold drift is a deliberate Phase 3 decision, not noise:
- **MECH/STRY/ARM/CAV combat power**: the composition reveals what the fudges
  hid — Bradleys/25mm/coax are genuinely stronger than the mounted `fireMul`
  approximations, and MECH's dismounted 4.6 was inflated to compensate. Phase 3
  will adopt the derived values and rebalance encounters (this is the point:
  vehicle firepower becomes real, and killing the vehicles removes it).
- **CAV hard −43%**: M3 CFVs carry TOW in reality; deliberately left off v1 so
  recon doesn't out-gun tank platoons — revisit with recon-employment rules.
- **SIG/LOG soft**: unarmed-truck units' catalog dps is crew self-defense with
  small arms; crews' personal weapons currently don't count toward unit dps.
  Phase 2/3 decision: crews contribute M4 defense when their vic is static.

## Open questions / deliberate drift

- Some catalog aggregates were never composition-consistent (they were game-feel
  tunes). Known cases to re-decide in Phase 3, when derived numbers become live:
  - **MECH dismounted 4.6 soft** is inflated (the IFVs are the real punch;
    24 dismounts realistically produce ~2.6–3.0).
  - **Mounted fireMul fudges** (INF ×0.5 etc.) get replaced by actual vehicle
    weapons — Bradley-mounted MECH derives HIGHER than today.
  - **CAV/ARM soft dps** derive higher than tuned once coax/.50 are modeled.
  - **`troops` count semantics**: catalog `troops` mixes dismounts and crews per
    type (LOG "8", SCT "6" are crews). Composition makes crews explicit
    (VehicleType.crew); comparison reports both dismounts and total pax.
- Indirect fire (`IndirectSpec` + the existing 48-round `ammo`) stays as-is
  through Phase 3, then folds into the weapon/ammo layer.
- AT basic loads (rough): rifle plt ~4×AT4 + 2 Javelin gunners ×3 msl;
  ATGM team 4×TOW×8; tank 40×120mm. Tune in Phase 3 playtests.
