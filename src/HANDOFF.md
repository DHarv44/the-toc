# HANDOFF — 2026-07-25 (compact anchor; Fable 5 → Opus)

## ⚓ COMPACT ANCHOR — state as of commit `016db98` (all pushed, tree clean)

**Latest (past 45fc459):** #32 proud-headers rework ✅ (`016db98`) — shop
subtitles end at the division name; shop charter (desc/detail) moved to a
HoverCard on the big shop plate itself (hover S1/S2/... — no icon); BnHeader
generalized (dark/paper tones, `division` identity via new pack root fields
`nick`/`motto` in 1cd/pack.json); report documents carry the producing shop's
letterhead (frago state gained `shop`); DIV HQ masthead above the VTC slide
deck. Verified live: S1/S2 subtitles + S2 hover charter. EYES ONLY remaining
(PLAYTEST.md "Proud headers rework"): paper letterhead on an opened report,
DIV HQ deck masthead on a FRAGO.

**In flight next: CAMPAIGN TUTORIAL rework (Dave, end of Fable session).**
No design settled yet — read the existing tutorial code (grep `tutorial` /
Splash "TUTORIAL HINTS" toggle) before proposing. Everything else below is
stable ground.

Everything below "VERIFIED" is DONE and green. Late-session additions past the
original handoff, all verified (tsc clean · golden 3077619369 · campaign 37/37):

- **#29 verify** ✅ — JSON packs proven (golden ×2, six-harness battery, boot:
  234 org slots, Dave's names live, OPFOR pools separate).
- **#30 QRF** ✅ — palette toggle at HQ/FOB (garrisoned only), auto-launch on
  IDF/attack, knowledge-honest targeting (live track vs shell back-azimuth
  bounded move), 120 s stand-down. Verified live (bearing response + radio).
- **#31 S-shops** ✅ — S2 INTSUM / S3 OPSUM / S4 LOGSTAT consoles; PARALLEL
  reports pipeline (one pending per shop, all four desks auto post-mission,
  per-shop badges); **Pack.staff** section (label/name/full/report/desc/
  detail) drives tabs, tooltips, headers, report names; shared proud
  battalion header (BnHeader.tsx). S6 described in pack data, console
  deferred to the EW layer.

**Open tasks:** #26 attack aviation (design settled in ROADMAP/#26) ·
#28 hardcode audit (ammo natures item 0 first — golden-affecting, own gated
step) · #10 P4 OPFOR faction pack (JSON loader ready for it) · #15
architecture pass. **Owed to Dave:** the sandbox show-off demo / playtest
session (PLAYTEST.md is the script). Eyes-only checks pending: female-name
portraits, mute-mid-alarm, S2/S3/S4 visual pass (rendered but only
text-probed).

> Dave's directive: no more test runs this session — MARK what needs testing.
> This doc is the jump start: exact state, unverified work, and fleshed-out
> designs for the next builds. Read PLAYTEST.md alongside it.

## ✅ VERIFIED (task #29, 2026-07-25 late session)

The JSON pack conversion checked out completely: tsc clean · golden
**3077619369 unchanged ×2** · battery green (campaign 37 · casualty 22 ·
asset 32 · pipeline 12 · roster 8 · phase3 14) · browser boot clean — 234 org
slots (229 + 5 asset crews), blue roster on Dave's dump (uppercased in code),
OPFOR on its own pools. Remaining eyes-only checks live in PLAYTEST.md
(female-name portraits, mute-mid-alarm by ear, pack viewer NAMES tab).

## What landed this session (all committed/pushed through `654f353` + the
final commit carrying this doc)

- Campaign airfield = H-hour infrastructure (167d3b9)
- Stage 2: packs own all platform data; OPFOR its own pack (706c65b)
- Dev-sandbox pack viewer (2244822)
- Purchase economy killed; Base Defense → division priority (9456eb4)
- Division asset requests: registry, staff decisions, REAL ambushable convoys,
  emplacement, orbit/window authority, favor + salvage, crews as org slots,
  division rebuilds through the shared pipeline, DoF medal (efcc6d2…4f353e5)
- Roadmap re-audit (bab8bd0); HARDCODE-AUDIT.md created
- Base under fire (#14): intercept verb (spec-driven), radar-loop alarm,
  INCOMING banner (map-pane overlay), strobe, shake, power flicker, dev IDF
  walking-barrage button, pack-declared alarm audio (d134f16…654f353)
- **JSON packs**: `src/packs/1cd/{pack,names}.json`,
  `src/packs/opfor/{pack,names}.json`, `src/packs/lib/us-platforms.json`;
  TS data files deleted; loader in `packs/index.ts` (extends/subset/fallback);
  IDs-not-names contract documented in the lib `_doc`. Dave's name dump is in
  1cd/names.json (author-cased; app uppercases; male-heavy ~88/12).
- Mute fix: master mute now stops the looping alarm element (UNVERIFIED).

## Outstanding interrupted work

- The **sandbox show-off demo** Dave asked for ("watch in the preview, click
  around like a commander") — postponed until mid-flight work landed; still
  owed after verification passes.
- `packs/awards.ts` is still TS content in pack-land (HARDCODE-AUDIT #4);
  DoF/PH data should eventually move into pack JSON.
- PLAYTEST.md checklist has never been exercised.

## DESIGN: QRF (new feature, Dave 2026-07-25)

Commander assigns garrisoned units at an HQ/FOB as the Quick Reaction Force:

- **Assignment**: only units GARRISONED at that base (within its radius,
  resting) are eligible. UI: a QRF section in the base's palette/panel —
  toggle per garrisoned unit ("ASSIGN TO QRF"). State: `Structure.qrfIds:
  number[]` (serializable) or `Unit.qrfHome?: number` — prefer the unit flag
  (survives structure edits, easy to render a QRF chip on the unit card).
- **Trigger**: IDF impacting inside the base's alert radius OR direct attack
  (hostiles engaging the structure / friendlies at the base). Auto-deploy:
  QRF units get weapons free + a move order — no player click needed; radio
  "QRF LAUNCHING — CONTACT AT <ref>".
- **KNOWLEDGE HONESTY (the core rule)**: the QRF responds to what the TOC
  actually knows, same contact rules as everything else:
  - **Sensor track live** (aerostat/drone/friendly eyes on the shooter or
    attackers): QRF moves on the actual POI.
  - **No track**: radar/crater analysis gives a BEARING only (shells carry
    fromX/fromY — the back-azimuth is honestly derivable). QRF moves a
    bounded distance (~1-1.5 km) along that azimuth and hunts with its own
    sensors from there. They know what they can see + what's on the net —
    nothing more.
- **Stand-down**: no contact for ~120 s → QRF returns to garrison (rally at
  the base), radio "QRF RETURNING TO BASE".
- **Files**: `domains/defense/qrf.ts` (assignment orders + tick), SimLoop
  slot after interceptUpdate (it can read the same inbound-shell scan),
  palette/CommandPanel UI section, radio traffic. Deterministic: no rng.
- Design law 4 check: automation adds a seat (the QRF SOP), the commander
  still owns assignment and can re-task mid-response.

## DESIGN: S-shop consoles jump start (S2/S4 first, then S3/S6)

Pattern to copy: S1Console + the reports pipeline (queueReport/deliverReports/
openReport in engine/campaign.ts) + UnreadDot badges + `ui.console` union +
TopBar buttons (S2/S3/S4 buttons already render disabled — wire them).

**Widen the reports type**: `CampaignState.reports.pending.shop` and log
entries from `'s1'` to `'s1'|'s2'|'s3'|'s4'|'s6'`; per-shop composers.

- **S4 — LOGSTAT (build first; data all exists)**:
  - Motorpool: DAMAGED/DESTROYED vics per unit (u.vehicles), repair queue
    (repT), OR-rate rollup.
  - CL V posture: stowage rollup per AmmoKey across the TF (real data),
    indirect basic loads (u.ammo vs type.indirect.load), winchester calls.
  - Forward stock: FOB stock tonnage, convoy status (u.convoy phases).
  - Asset/request board: S.assets pool states, queue, windows, favor.
  - LOGSTAT report (request + post-mission auto, VTC-then-document, S4
    officer speaker from org: pos 'S4 — Logistics').
- **S2 — INTSUM**:
  - Contact table: live/stale ages, assessed vs `unknown` composition, DF
    fixes (SIG), last-seen grid refs; kill/BDA counts (S.stats.enemyDestroyed).
  - ISR status: drones aloft/endurance, aerostat coverage, orbit authorities.
  - INTSUM report; S2 officer speaker. NAIs are roadmap (needs symmetric fog
    to matter).
- **S3 — current ops**: objective stream + FRAGO log (exists), battle group
  roster (S.enemyGroups is OPFOR — for friendly, group memberships from
  groupId), ROE/posture/weapons summary per unit, DUSTWUN/recovery board.
  Mostly aggregation; no new sim data.
- **S6 — net status (stub)**: SIG coverage (df radius units on map),
  retrans positions; jamming placeholder until EW exists.

## Cleanup / changeover checklist

- [ ] Verification battery (top of this doc) green → commit "verified" note
- [ ] PLAYTEST.md session with Dave (the show-off demo doubles as it)
- [ ] Mute-during-alarm behavior confirmed by ear
- [ ] Task list: #29 (verify), #30 (QRF), #31 (S-shops) created this session;
      #26 attack aviation, #28 hardcode audit, #10 P4, #15 architecture pass
      remain open
- [ ] MODES.md needs a dated block for the JSON-packs conversion once verified
