# Hardcode audit — content still living in the engine (2026-07-25)

> User directive: "identify all the other shit that we are hardcoding like
> that." Doctrine: engine = verbs, packs = nouns. Everything below is CONTENT
> currently baked into engine/UI code that should be pack data (or spec-driven
> like the facility effects). Work the list top-down; each item is small.

## Personnel & identity
1. ~~**Billet titles + rank tables**~~ — DONE (2026-08-03). `Pack.billets`
   names every job and who holds it; `dismountBillet`/`crewBillet` keep only
   the STRUCTURE (a group's last entries are its leadership because rosters
   are in casualty order; armed vehicles are commanded from seat 0, seats fill
   in order, the last seat repeats).
2. ~~**Junior-enlisted rank spread** + officer picks~~ — DONE with #1: a rank
   is either fixed or a hash-drawn list, and every list is pack data.
2b. **Battalion templates + element rosters** — DONE (2026-08-03), was not on
   this list: `bnTemplate` was a switch of US Army companies in engine code
   and `BnKind` an engine union. Now `Pack.bnKinds` + `Pack.rosters`, with
   `BnKind` a key into the pack's own table.
3. ~~**Friendly callsign pool**~~ — DONE (2026-08-03). `Pack.callsigns`: a pool
   cycled and numbered, or a prefix and a count. Deliberately NOT inherited
   from the canonical pack — the opposition answering to ALPHA is worse than
   no style at all — so OPFOR declares its own E##.
4. ~~**Awards catalog**~~ — DONE (2026-08-03). `Pack.awards` holds the
   decorations; each names the criterion it answers (`on: 'wound'` /
   `'wound-civ'`). The engine knows only that a casualty EARNS the wound
   decoration and that a civilian earns their own — casualties.ts no longer
   names a medal, and the PERSTAT counts the award rather than the Purple
   Heart by name.
5. ~~**Rank insignia tables**~~ — DONE (2026-08-03). `Pack.ranks` is ONE
   ordered ladder, junior first: order IS seniority (no hand-written weights,
   and a rank cannot be added without being placed), each entry naming its
   device from the engine's procedural vocabulary. Killed the separate
   `RANK_W` table in ui/staff.tsx and `rankStyle` entirely. Unknown ranks now
   answer -1 rather than silently sorting mid-ladder. Gaps this closed: CW4,
   CW5 and CIV existed in rosters but in neither table.

## Radio & voice
6. ~~**Net phrasing**~~ — DONE (2026-08-03). `Pack.net` holds the higher
   stations, the closing prowords, and the SENTENCES themselves as templates
   ({higher} {callsign} {msg} {range} {closing}). radio.ts keeps the shape —
   who is speaking, to whom, whether a range is worth saying — and no words.
   Not inherited: a pack with no voice is not heard, so the OPFOR net cannot
   sound like Fort Cavazos by default.
7. **PARTLY DONE** (2026-08-03) — the STAFF REPORTS are pack data now:
   `Pack.reports` holds each desk's form (heading, numbered paragraphs,
   sign-off) plus the alternative `phrases` a paragraph needs; the composers
   in engine/campaign.ts count and fill, and no longer contain a sentence.
   Campaign FRAGOs already moved with missions-in-packs. STILL ENGINE-SIDE:
   the asset desk names (DIV G3 / CORPS G3 / ASOC) in domains/assets, and the
   personnel-recovery FRAGO prose in campaign.ts runCampaign.

## Force lists & missions
8. **Campaign mission content** — `engine/campaign.ts` OPERATION table,
   M1_FORCE/M1_GARRISON/M1_REINFORCE unit lists, CAMPAIGN_LAYOUT towns,
   brief/FRAGO text. Covered by the roadmap item "maps + missions in packs"
   — a campaign is CONTENT and should ship with (or alongside) a pack.
9. **Dev-sandbox BLUE/RED spawn lists** — `engine/scenario.ts` should derive
   from the installed packs' fieldable types, not literal arrays.
10. **Difficulty start forces** — `economy/difficulty.ts` `startForce` unit
    lists are pack-relative content on an engine table.
11. **Base Defense wave comps + division pushes** — `engine/modes.ts`
    WAVE_COMPS / WAVE_PUSHES reference unit keys; OPFOR waves belong to the
    OPFOR pack, pushes to the player pack.
12. **Base names** — 'HQ COBALT', 'COBALT STRIP', 'CP GARRYOWEN',
    'GARRYOWEN STRIP' in scenario/campaign: pack naming pools.

## Ammo natures (user directive 2026-07-25 — top of the list)
0. **Ammo carries no properties** — `AmmoType` is identity only (key/name/class);
   the terminal effects live everywhere BUT the ammo: a mortar/howitzer's
   dmg/blast/flight/scatter on the unit type's `IndirectSpec`, the HE vs ICM vs
   SMOKE differences hardcoded in `domains/fires` (ShellKind switch), AP on the
   weapon. Fix: enrich the pack's ammo table so each NATURE is a full spec —
   `{ dmg, blast, ap, flight/speed, scatter, effect: 'he'|'icm'|'smoke'|…,
   sound params }` — weapons declare which natures they fire, fire missions pick
   a nature from stowage, and the engine's gunnery reads the nature's numbers.
   One tube, many natures (M252 firing HE/ICM/SMOKE/ILLUM = four ammo entries,
   one weapon). Golden-affecting; do as its own gated step.
   **Sound split (decided 2026-07-25):** the AMMO NATURE owns the terminal
   sound profile (explosion synth params — size/depth/character: 155 HE vs
   81mm vs ICM ripple); the WEAPON owns the firing signature + cadence
   (report params + rof/burst pacing, like the intercept spec's burstRof);
   the engine owns the synth that reads both. No baked clips.

## Platform behavior constants
13. **Aerostat scan rate** — `air/orders.ts` AEROSTAT_SCAN_RATE is platform
    data → DroneType field.
14. **MED treatment rates** — `forces/update.ts` 0.7 (MED nearby) / 0.35
    (dug-in medic) are unit capabilities → unit-type/pack fields (the aid
    facility rate already moved to specs).
15. **Crew-billet vehicle fallback** — `crewBillet(veh ?? 'HMMWV')` default
    references a US vehicle key.
16. **Asset service fallbacks** — DEFAULT_SETUP/DEFAULT_WINDOW/
    DEFAULT_ATO_LEAD/REFIT_TIME in `assets/service.ts` are acceptable as
    fallbacks but every 1CD asset should carry explicit values (CRAM +
    SPECTRE do; fill in the rest).

## Audio (rule set by user)
17. **Any future system sound = spec params, never a hardcoded clip choice**
    — the intercept spec's `sound` block is the pattern; #14's synthesized
    C-RAM burst must read it. `incoming.mp3`-style ASSET references should
    be pack-declared paths, with engine synth/playback as the verb, plus
    user-tweakable overrides later.

## Already fixed (pattern references)
- Platform catalogs → packs/lib (stage 2, commit 706c65b)
- Facility rates/radii/intercept params → effect specs (efcc6d2)
- Name pools → Pack.names + neutral fallback; people pins
- Asset timers → PackAsset fields
- OPFOR as its own pack
