# Playtest checklist — needs eyes, not harnesses (2026-07-25)

> Per the user: no more test-writing for this feature line — the big playtest is
> the validation. Everything below is HEADLESS-VERIFIED but has never been
> watched in real play. Check items off (or file findings) during the
> sandbox/campaign playtest sessions.

## Asset requests (task #21 — shipped)
- [ ] Palette request rows read clearly at a glance (x/N AVAIL → REQ WITH
      HIGHER → ON THE LIST → CONVOY ENROUTE → EMPLACING → ✓ OPERATIONAL)
- [ ] Radio pacing: staff decisions, denials in milspeak, approval → convoy
      traffic → emplacement → OPERATIONAL feel like a TOC, not a vending log
- [ ] Delivery convoy drives sensible roads from DIVISION MAIN; watchable;
      escort feels worth doing
- [ ] Convoy ambush → "DIVISION CONVOY DOWN" FRAGO (optional framing reads
      right) → secure → favor radio + salvage outcome lands emotionally
- [ ] Favor visibly speeds later requests (repeat asks same session)
- [ ] Aerostat flow: request → convoy → emplace → balloon up at the right
      base; winch-down + re-raise; "DET EMPLACED ELSEWHERE" lockout
- [ ] Airfield rows: orbit authority counts, SPECTRE ATO window (does the
      open window need a countdown on the row? currently radio-only)
- [ ] Release-back flow (only exists in code — NO UI BUTTON yet; playtest
      decides where it lives: palette row context? dashboard?)
- [ ] Campaign scarcity: 1/3 CRAM at H-hour, releases after obj 2/3 announce

## Division org depth
- [ ] S1 console: asset crew slots visible under ATT (2-44 ADA / PGSS / 3
      ASOS groupings); CIV contractors render sanely — **the 'CIV' rank has
      NO insignia glyph; verify RankIcon fallback doesn't break the row**
- [ ] Defense of Freedom ribbon renders on a wounded contractor's card
- [ ] Crew regeneration: mil billets refill via rear-det packets, CIV seats
      refill fast; instance stands back up (hull + crew) with radio beats
- [ ] PERSTAT: does the report need an attached-crews paragraph? (currently
      excluded — decide in play)

## No-purchase world
- [ ] Palette without prices anywhere; FOB stock reads as materiel; dashboard
      SUSTAINMENT tile (forward stock / convoys / motorpool queue) is enough
- [ ] Campaign M2 FRAGO text (no allocation mention) still reads right
- [ ] Base Defense: cap growth + DIVISION MAIN pushes on waves 2/4/6/8 —
      pacing, radio, and whether pushes should also include assets
- [ ] GARRYOWEN STRIP at H-hour; AFLD absent from campaign engineer palette

## Packs
- [ ] Pack viewer (dev PACK button): tabs, OPFOR switcher, formation tree
- [ ] OPFOR names (Korean-flavor) appearing on hostile troop cards as before

## Known not-built (don't file as bugs)
- Intercept verb / base-under-fire (#14 — next up)
- Release-asset UI button (code path only)
- Attack aviation (#26), name pool expansion (#27)
- Sortie-window row countdown; favor indicator anywhere in UI

## JSON pack conversion (2026-07-25 — UNVERIFIED, see HANDOFF.md)
- [ ] Golden 3077619369 unchanged; full battery green (task #29 — run FIRST)
- [ ] S1 roster shows the user's name dump (uppercased in code; ~12% female mix —
      check female names don't clash with portrait rendering)
- [ ] Pack viewer NAMES tab (male/female/last counts + truncated previews)
- [ ] OPFOR troops still Korean-flavored names
- [ ] Alarm: master mute (🔊 button) kills a LOOPING siren mid-attack
- [ ] Aerostat endurance still infinite (JSON null→Infinity conversion)

## Proud headers rework (2026-07-25 late)
- [ ] Shop subtitles end at "· 1ST CAVALRY DIVISION" (no desc/clock junk) — VERIFIED S1/S2
- [ ] Hover the big shop plate (S1/S2/S3/S4) → charter card (full name, short
      desc in gold, detail paragraph) — VERIFIED S2
- [ ] EYES ONLY: open a PERSTAT/INTSUM document — the producing shop's
      letterhead on the paper (paper tone: dark ink, muted gold motto)
- [x] DIV HQ VTC deck masthead — VERIFIED on the campaign opener (1CD patch,
      DIV HQ plate, FIRST TEAM, "America's First Team", DIVISION MAIN sub)

## COMMAND rail rework (2026-07-25 late — task #34)
- [x] Rail renamed COMMAND; garrison by warfighting function (MANEUVER/RECON/
      FIRES/SUPPORT); rows are REAL elements ("1st PLT · A CO", "SCT PLT ·
      HHC"); only 2-8 CAV + ATT shown — VERIFIED live incl. fieldSlot ⊕
      (row → ✓ FIELDED, ECHO-5 in Battle Groups with true lineage)
- [ ] EYES ONLY: Battle Groups ＋ ADD UNIT — attach an independent to a formed
      group; CANCEL row; group membership updates
- [ ] EYES ONLY: DIVISION — REQUESTS section at the CP (all asset kinds,
      one-stop) — request flow unchanged from palette rows elsewhere
- [ ] NOTE behavior change: FOBs no longer field ground units (no garrison
      there — the CP is the motor pool); confirm this feels right in play
- [ ] Cold-start tutorial full run: select CP → field SCT PLT → BREAK SOP →
      field 3+ → screen/Raven/contact → battle group → attack → occupy → dig in

## Garrison states + FORCES rail (2026-07-25 latest)
- [x] FORCES rail (renamed): INDEPENDENT + GARRISON by function w/ base tags,
      ⊕ fields from home base; fielded slots leave the garrison list; tutorial
      ring + auto-center/zoom on map cues — VERIFIED live
- [x] Command = base management only (no garrison tree; S1 = deep dive)
- [ ] EYES ONLY: RTB button — unit drives to ITS assigned garrison, stands
      down on arrival (radio "IN GARRISON — STANDING DOWN"), slot returns to
      FORCES garrison list with the base tag
- [ ] EYES ONLY: GARRISON → mode — click a FOB: unit reassigns home, stands
      down there; FOB gains a garrison; fielding it later stages from the FOB
- [ ] EYES ONLY: ADD UNIT picker now offers FROM GARRISON rows (fields +
      joins the group in one click)
- [ ] EDGE: garrison a unit with its Raven still aloft (drone ownership)
- [ ] QRF interplay: QRF assignment uses FIELDED units near a base; a
      de-fielded garrison can't be QRF'd yet — decide if QRF should draw
      from the garrison state (realistic) in a follow-up

## CALL UP picker + dedicated QRF + no unit cooldowns (2026-07-25 latest)
- [x] FORCES rail: garrison hidden until ＋ CALL UP; in-rail picker (base
      chips when >1 garrison, type icon tabs w/ counts, DONE); tutorial
      follows the flow (call-up ring → SCT PLT ring) — VERIFIED live
- [ ] EYES ONLY: QRF section in Command now lists GARRISONED slots homed at
      the base (DEDICATE AS QRF / ✓ QRF), multiple allowed, responders show
      as ⚡ RESPONDING; QRF launch now FIELDS the garrison slot itself and
      returns to garrison (keeping the duty) on stand-down
- [ ] EYES ONLY: deploying a ✓ QRF slot from CALL UP / ADD UNIT raises the
      in-rail amber warning (DEPLOY ANYWAY releases the duty; DON'T WARN ME
      AGAIN checkbox holds for the session)
- [x] Unit cooldowns REMOVED (org roster is the limiter; force cap stays;
      C-130/drone/asset turnarounds untouched on the air side)

## VTC real avatars (2026-07-25 latest)
- [x] Opener VTC: CG tile = the ACTUAL Commanding General (MG, named) with
      his DA photo; attendees XO/S3/CSM + COBALT 6 (you) all real portraits
      — VERIFIED live
- [ ] EYES ONLY: report call (open a PERSTAT first time) — the S1 officer's
      photo on the speaker tile
