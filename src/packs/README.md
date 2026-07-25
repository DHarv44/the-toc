# PACKS ARE SELF-CONTAINED MODS. NO EXCEPTIONS.

The entire point of packs is MODABILITY. A pack is a folder that contains
EVERYTHING the pack is. Someone should be able to copy `src/packs/1cd/`,
rename it, edit JSON, and have a total conversion — different army, different
names, different campaign, different war — without touching engine code.

## The law

- **ALL of a pack's content lives under `src/packs/<id>/`.** Catalogs, names,
  staff sections, audio declarations, assets, formation — and CAMPAIGNS, which
  own their MAPS and MISSIONS (objectives, triggers, briefs/FRAGO text,
  tutorial curriculum). If the player reads it, hears it, or fights it, it
  comes from the pack folder.
- **Engine = verbs, packs = nouns.** The engine ships kind-keyed registries
  (objective kinds, trigger conditions, effects, spatial queries, tutorial
  anchors). Packs compose them in JSON. The engine NEVER knows a system name,
  a place name, a person's name, or a story beat.
- **JSON only.** No TS in packs, no code in packs, ever. If a pack needs
  something the vocabulary can't express, the engine grows a new verb
  (the MLRS-dump-truck rule) — content never leaks into engine files.
- **IDs, not names**, for every cross-reference.
- **1CD is the canonical fallback pack** for FUNCTIONAL content (catalogs,
  names, audio, staff). IDENTITY content (formation, mottos, patch, assets,
  organic, campaigns) never falls back.

## Layout

```
src/packs/
  README.md            ← this file
  lib/                 ← shared platform libraries packs may extend (us-platforms)
  index.ts, types.ts, install.ts, org.ts, personnel.ts   ← LOADER machinery (engine-side plumbing, not content)
  1cd/
    pack.json          ← identity, catalogs ref, staff, assets, audio, formation
    names.json
    campaigns/
      iron-triangle/
        campaign.json  ← manifest: map ref, anchors, mainline order, side-mission pool
        map.json       ← theater + seed + authored layout (towns/MSR/features = the gazetteer)
        missions/
          lodgment.json     ← brief, objectives, triggers, tutorial
          fob-keaton.json
          side/             ← repeatable side-mission templates
  opfor/
    pack.json
    names.json
```

Design contract for campaigns/missions/triggers/tutorial: `src/PACK-MISSIONS.md`.

## If the pack route gets hard

DO NOT fall back to hardcoding content in engine files "for now." That
decision belongs to the user — stop and discuss.
