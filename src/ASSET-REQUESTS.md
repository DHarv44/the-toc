# Division Asset Requests — settled design (rev 2, 2026-07-25)

> The build spec for the request-up-the-chain system. Rev 2 supersedes rev 1's
> "generated attachments outside the pack": since stage 2 (pack-owned
> catalogs), the PACK ships its habitual enablers too — see "Pack-owned
> assets". Companion: MODES.md (shipped systems), ROADMAP.md.

## Doctrine

The TOC does not BUY capability. Anything the battalion doesn't organically own
is REQUESTED up the chain; higher allocates from what actually exists. Supply
points survive only as internal plumbing until the materiel ledger replaces
them (S4). "How would it happen in a real TOC?" governs everything here.

## Pack-owned assets (stage 2 decision)

The pack is the player's ENTIRE force experience — the division AND the
habitual enablers around it. `Pack.assets` declares every requestable asset:
key, name, real parent formation (`from: '2-44 ADA'`), echelon
(`DIV | CORPS | USAF`), pooled `count` OR `sortie: true`, delivery effect, and
a `crew` recipe (mil billets + CIV contractor count).

- **Attach-and-live-here assets** (C-RAM, aerostat det, ALO team): crews are
  materialized EAGERLY by buildDivisionOrg as ATT org slots — named people,
  garrisoned at division, `tf: false` until an approval attaches them. S1 sees
  them the moment they arrive. Contractors are noncombatants; wounded
  contractors get the **Defense of Freedom Medal**, NOT the Purple Heart.
- **Sortie assets** (C-130 airlift, CAS): capability entries with a squadron
  name and a callsign pool ("REACH", "HERKY") — crews exist as radio traffic
  only, never org slots. We don't do the Air Force's PERSTAT for them.

## The model

1. **Division asset registry** (S.assets, built from Pack.assets at init):
   each pooled asset instance is `available | allocated(to) | enroute |
   refit`. Campaign scripting pre-allocates pieces to sister brigades so
   scarcity is real from mission one, and releases them as the operation
   progresses (net traffic announces it).
2. **Request pipeline**: `relevance check → availability check → approve /
   approve-degraded / deny(reason) / queue`. All deterministic (hashStr, no
   rng draws) — the player learns the staff system, never gambles with it.
   Denials state the failing factor in milspeak from day one.
   - **Phase relevance** (per asset kind, reads the objective + the COP):
     C-RAM = phase-agnostic, fast-tracked by recent indirect near the base.
     Aerostat = relevant once you HOLD ground (defend/FOB/supply phases).
     Shadow = broadly relevant, bumped in recon/deep phases. CAS = needs
     painted targets + active contact ("no picture, no bombs" — S2 work is
     currency). C-130 airdrop = only when the ground LOC can't do it (MSR cut,
     isolated FOB); else "MSR OPEN — GROUND RESUPPLY DIRECTED. DENIED", even
     if a bird is available. MEDEVAC = standing capability; launches justify
     by casualties existing.
   - **Availability**: pool empty → denied + FIFO **waiting list**; when an
     asset frees, the queue head auto-approves with radio traffic. The player
     can RELEASE an asset back to division.
   - Destroyed assets leave the pool on a long CL VII replacement timer.
   - USAF items are ATO-cycle **sortie windows**, never pooled hulls.
3. **Approved = a REAL convoy on the map** (decided 2026-07-25): iron assets
   (C-RAM, aerostat det, ALO team) spawn a delivery convoy at DIVISION MAIN
   in the deep rear (map edge outside campaign) that drives the road net to
   the requesting base — watchable, escortable, ambushable. Convoy destroyed
   = asset lost to the CL VII timer. On arrival the section EMPLACES (setup
   dwell — approval during an IDF attack does nothing for that attack), THEN
   the effect goes live and the crew slots attach. Orbit/window authority is
   paperwork, not iron — no convoy, just staff delay.

## Airfields

Division-echelon infrastructure, pre-existing on the campaign map (GARRYOWEN
STRIP at H-hour — shipped 2026-07-25). Never player-built in campaign;
standing one up is its own scripted tasking. Sortie windows land at an
airfield that exists — they don't conjure one.

## Materiel ledger (S4, later)

Replaces supply points. CL V posture rolls up from real stowage (already
tracked per AmmoKey). CL VII authorized-vs-on-hand rolls up from the org's
per-hull records; losses create deficiencies, requests replenish with delivery
delay. CL I/III abstract. S4 console = LOGSTATS tab (PERSTATS pattern),
request board, vehicle OR rates.

## Build order

1. `Pack.assets` schema + 1CD assets table (C-RAM ×3 from 2-44 ADA w/ FSR
   contractors, PGSS aerostat det, ALO team, Shadow orbits, C-130 sortie
   line) + S.assets registry + request service (relevance, availability,
   queue, release, deterministic outcomes, radio traffic). Registry visible
   in request UI ("C-RAM: 1/3 AVAILABLE").
2. Asset crews materialized in buildDivisionOrg (ATT slots, CIV contractors,
   Defense of Freedom Medal in packs/awards.ts).
3. Convert C-RAM/aerostat/airfield-UAS acquisition from purchase → request.
   (The CRAM purchasable-facility stopgap — catalog entry + HQ-buy path —
   dies here; the facility EFFECT stays, the request delivers the section
   that mans it. Drone launches stop drawing supply; allocation + cooldowns
   are the limiter.)
4. **#14 base-under-fire lands on top**: `public/audio/incoming.mp3` (already
   imported) alarm when indirect is inbound on the commander's CP, subtle red
   TOC flash, C-RAM intercepts with a SYNTHESIZED burst (procedural, like the
   voice factory), proximity-scaled muffled impact booms + 300-500 ms screen
   shake (harder when closer). Bus events sim→UI; deterministic hash rolls for
   intercepts (no rng stream).
