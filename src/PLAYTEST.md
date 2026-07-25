# Playtest checklist — needs eyes, not harnesses (2026-07-25)

> Per Dave: no more test-writing for this feature line — the big playtest is
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
- [ ] S1 roster shows Dave's name dump (uppercased in code; ~12% female mix —
      check female names don't clash with portrait rendering)
- [ ] Pack viewer NAMES tab (male/female/last counts + truncated previews)
- [ ] OPFOR troops still Korean-flavored names
- [ ] Alarm: master mute (🔊 button) kills a LOOPING siren mid-attack
- [ ] Aerostat endurance still infinite (JSON null→Infinity conversion)
