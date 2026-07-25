# Division Asset Requests — settled design (2026-07-25)

> The build spec for the request-up-the-chain system. Decided with the user in
> session; implement in the order at the bottom. Companion: MODES.md (shipped
> systems), ROADMAP.md.

## Doctrine

The TOC does not BUY capability. Anything the battalion doesn't organically own
is REQUESTED up the chain; higher allocates from what actually exists. Supply
points survive only as internal plumbing until the materiel ledger replaces
them (S4). "How would it happen in a real TOC?" governs everything here.

## The model

1. **Division asset registry** (campaign state): a real list of allocatable
   assets — e.g. 3× C-RAM sections, 1× aerostat system (PGSS), 1× ALO team,
   2× Shadow orbits, N× MEDEVAC lines. Each: `available | allocated(to) |
   refit/destroyed`. Campaign scripting pre-allocates pieces to sister
   brigades so scarcity is real from mission one, and releases them as the
   operation progresses (net traffic announces it).
2. **Request pipeline**: `relevance check → availability check → approve /
   approve-degraded / deny(reason) / queue`. All deterministic — the player
   learns the staff system, never gambles with it. Denials state the failing
   factor in milspeak from day one.
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
   - Air Force items (CAS/lift) are cycle-based (sortie windows per ATO day),
     never pooled hulls — we don't track Air Force iron.
3. **Approved = physically arrives**: a C-RAM section convoys in; the aerostat
   det stands up; a sortie window opens. ETA varies by outcome tier.

## Generated attachments (outside the pack)

The pack is PURE 1CD. Non-1CD attachments are generated ON THE FLY at approval
(`packs/attachments.ts` factory — deterministic, named, slotted into S.org
under ATT so S1 shows them immediately):
- **C-RAM section** — from 2-44 ADA: mil crew + **2-3 civilian FSR
  contractors** (that's how C-RAM actually runs).
- **Aerostat det** — PGSS is contractor-operated: mostly CIV crew.
- **ALO team** — USAF CPT + TACP NCO, TACON to the player (S1-visible); their
  aircraft stay untracked.
- Contractors: noncombatant casualty rules; wounded contractors get the
  **Defense of Freedom Medal**, NOT the Purple Heart (real rule — second entry
  for packs/awards.ts).

## Materiel ledger (S4, later)

Replaces supply points. CL V posture rolls up from real stowage (already
tracked per AmmoKey). CL VII authorized-vs-on-hand rolls up from the org's
per-hull records (already tracked, Bradleys through Chinooks); losses create
deficiencies, requests replenish with delivery delay. CL I/III abstract.
S4 console = LOGSTATS tab (PERSTATS pattern), request board, vehicle OR rates.

## Build order

1. Asset registry + request service (relevance, availability, queue, release,
   deterministic outcomes, radio traffic). Registry visible in request UI
   ("C-RAM: 1/3 AVAILABLE").
2. Generated-attachment factory (C-RAM section w/ contractors, aerostat det,
   ALO team) + Defense of Freedom Medal.
3. Convert C-RAM/aerostat/airfield-UAS acquisition from purchase → request.
   (WIP note: CRAM currently exists as a purchasable FACILITY — catalog entry
   `CRAM` in installations/catalog.ts + palette/orders HQ-buy path — that was
   the pre-design stopgap and gets replaced by the request flow. Keep the
   facility EFFECT (intercept coverage) — the request delivers the section
   that mans it.)
4. **#14 base-under-fire lands on top**: `public/audio/incoming.mp3` (already
   imported) alarm when indirect is inbound on the commander's CP, subtle red
   TOC flash, C-RAM intercepts with a SYNTHESIZED burst (procedural, like the
   voice factory), proximity-scaled muffled impact booms + 300-500 ms screen
   shake (harder when closer). Bus events sim→UI; deterministic hash rolls for
   intercepts (no rng stream).
