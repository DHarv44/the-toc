# HANDOFF — session end 2026-07-25 (Fable 5 → Opus)

> Dave's directive: no more test runs this session — MARK what needs testing.
> This doc is the jump start: exact state, unverified work, and fleshed-out
> designs for the next builds. Read PLAYTEST.md alongside it.

## ⚠ UNVERIFIED WORK — run this FIRST, before building anything

The **JSON pack conversion** (last commits) is code-complete but the
verification battery was NOT run after the final edits (1CD-fallback logic,
name pools, mute fix). First actions next session:

1. `npx tsc --noEmit` (last full pass was clean, but 1CD-fallback + mute edits
   came after).
2. Rebuild + run golden ×2 — expected **3077619369 UNCHANGED** (names are
   digest-invisible; platform data byte-identical through JSON).
3. Battery: campaign-check 37 · casualty 22 · asset-check 32 · pipeline 12 ·
   roster 8 · phase3 14 (esbuild each `.tmp-mig/*.entry.mjs`; phase3 needs
   `--platform=node`).
4. Full browser reload → sandbox boots, S1 shows the NEW names (uppercased in
   code from author-cased pools, ~12% female), pack viewer NAMES tab, OPFOR
   names still Korean-flavored.
5. Known risk spots: loader `table()` fallback chain; identity-merge (both
   packs must share library object references — normalizeDrones mutates the
   lib IN PLACE for this); `resolveJsonModule` newly enabled in tsconfig.

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
