// EVERY WAY THIS DOCUMENT IS WRONG, in one list.
//
// Validation was two truncating chips in the toolbar and one inline warning on
// place fields. Everything else failed silently and then failed at PLAY time,
// which is the worst place to learn it: a mission that spawns nothing looks
// exactly like a mission whose trigger has not fired yet.
//
// The rules that matter most are the SILENT ones — the mistakes that produce a
// playable-looking scenario that does not work:
//
//   · a `units` list is free text. Type MECH into a Mobile Infantry scenario
//     and the engine spawns NOTHING, with no error anywhere.
//   · a defeat-group objective waits on a tag no effect ever spawns, so the
//     mission can never be completed.
//   · a ruleset judges on a structure the situation never placed. CAMP CURRIE
//     shipped like that and was won at 00:00:00Z.
//
// Each problem carries the Sel it belongs to, so the list is a set of jumps
// into the document rather than a set of complaints about it.
import { MODES } from '../../engine/modes'
import { PACKS } from '../../packs'
import { slotBudget } from '../../packs/orgquery'
import { isBuiltinPlace, referencedPlaces } from '../../scenario/content'
import type { Doc, Sel } from '../../scenario/edit'
import type { WorldMap } from '../../world/WorldMap'
import type { MissionEffect, TutCondition } from '../../packs/types'
import { UNIT_TYPES } from '../../domains/forces/catalog'
import { isTutTarget } from '../tutTargets'
import { refPlaceName } from './scriptFields'

export interface Problem {
  /** 'error' breaks the scenario; 'warn' is a judgement call the author owns */
  level: 'error' | 'warn'
  text: string
  /** where to go to fix it */
  at?: Sel
  /** short group label for the list */
  where: string
}

/** which side's catalog a verb draws its unit keys from — the engine's own
 *  answer (effects.ts): garrisons and groups are spawned as ENEMIES, columns
 *  and placed forces are DEPLOYED as friendlies, and set-roe filters friendly
 *  units by type. Getting this backwards would flag every correct scenario. */
const unitSideOf = (kind: MissionEffect['kind']): 'friend' | 'hostile' | null => {
  switch (kind) {
    case 'spawn-garrison':
    case 'spawn-group': return 'hostile'
    case 'place-force':
    case 'deploy-column':
    case 'set-roe': return 'friend'
    default: return null
  }
}

export function findProblems(doc: Doc, map: WorldMap | null): Problem[] {
  const out: Problem[] = []
  const add = (level: Problem['level'], where: string, text: string, at?: Sel) =>
    out.push({ level, where, text, at })

  // ---- the gazetteer a script may name --------------------------------
  // Four sources, and ANCHORS are the one that is easy to forget: a campaign
  // anchor is a named point resolved ONCE at start from a query against the
  // terrain ('strongpoint' = the town nearest the player HQ). It is authored —
  // it just is not a pin on the sheet, and treating it as dangling flagged six
  // correct references in the only campaign that ships.
  const authored = doc.entities.filter(e => e.ent === 'place')
  const known = new Set<string>([
    ...authored.map(e => (e.ent === 'place' ? e.name : '')),
    ...Object.keys(doc.extras.anchors ?? {}),
    ...(map ? map.towns.map(t => t.name) : []),
    ...(map ? map.features.map(f => f.name) : []),
  ])

  // ---- the SITUATION ---------------------------------------------------
  // what the chosen ruleset needs on the board. The MODE owns this rule.
  const sit = {
    structures: doc.entities.filter(e => e.ent === 'structure') as never[],
    units: doc.entities.filter(e => e.ent === 'unit') as never[],
  }
  for (const t of MODES[doc.type]?.requires?.(sit) ?? []) {
    add('error', 'Situation', t)
  }

  if (doc.type === 'campaign' && doc.missions.length === 0) {
    add('error', 'Situation', 'A campaign gets its rules from its missions, and this one has none')
  }

  // duplicate place names: the script resolves by NAME, so two places called
  // the same thing means one of them can never be referenced
  const seenPlace = new Set<string>()
  for (const e of authored) {
    if (e.ent !== 'place') continue
    if (!e.name.trim()) {
      add('error', 'Situation', 'An unnamed control measure — nothing can reference it',
        { k: 'entity', ids: [e.id] })
    } else if (seenPlace.has(e.name)) {
      add('error', 'Situation', `Two places named ${e.name} — a script can only reach one`,
        { k: 'entity', ids: [e.id] })
    }
    seenPlace.add(e.name)
  }

  // over-strength: a formation placed beyond what it actually holds
  const friendPack = PACKS[doc.sides.friend]
  if (friendPack) {
    const counts = new Map<string, number>()
    for (const e of doc.entities) {
      if (e.ent !== 'unit' || e.side !== 'friend') continue
      const key = `${e.formation ?? doc.player}|${e.type}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    for (const [key, n] of counts) {
      const [fm, type] = key.split('|') as [string, string]
      const budget = slotBudget(friendPack, fm, type as never)
      if (n > budget) {
        add('warn', 'Task org',
          `${fm} has ${n} × ${UNIT_TYPES[type]?.abbr ?? type} placed but holds ${budget}`)
      }
    }
    if (doc.player && !friendPack.formation) {
      // nothing to check against
    }
  } else if (doc.sides.friend) {
    add('warn', 'Sides', `${doc.sides.friend.toUpperCase()} is not installed — its content cannot be checked`)
  }

  // a hostile unit tagged for a battlegroup the script never judges is fine;
  // the reverse is not, and is checked with the objectives below
  const liveTags = new Set(
    doc.entities.filter(e => e.ent === 'unit' && e.side === 'hostile' && e.tag)
      .map(e => (e.ent === 'unit' ? e.tag! : '')))

  // ---- the SCRIPT -------------------------------------------------------
  doc.missions.forEach((m, mi) => {
    const objectives = m.objectives ?? []
    const triggers = m.triggers ?? []
    const where = `${String(mi + 1).padStart(2, '0')} ${m.name || m.id}`
    const objIds = new Set(objectives.map(o => o.id))

    if (!objectives.length && !triggers.length) {
      add('warn', where, 'This mission scripts nothing', { k: 'mission', m: mi })
    }

    const seenObj = new Set<string>()
    objectives.forEach((o, i) => {
      const at: Sel = { k: 'objective', m: mi, i }
      if (!o.id.trim()) add('error', where, 'An objective with no id', at)
      else if (seenObj.has(o.id)) {
        add('error', where, `Two objectives share the id ${o.id}`, at)
      }
      seenObj.add(o.id)

      if ('zone' in o && o.zone) {
        const name = refPlaceName(o.zone.place)
        if (!name) {
          add('error', where, `${o.label || o.id} has no zone — it can never be reached`, at)
        } else if (!known.has(name) && !isBuiltinPlace(name)) {
          add('error', where, `${o.label || o.id} names a place nobody authored: ${name}`, at)
        }
      }
      // A DEFEAT-GROUP OBJECTIVE WAITS ON A TAG. If nothing spawns that tag
      // and no placed hostile carries it, the mission can never be completed —
      // and at play time it just sits there looking unfinished.
      if (o.kind === 'defeat-group') {
        const tag = o.groupTag
        const spawned = doc.missions.some(mm => (mm.triggers ?? []).some(t =>
          t.do.some(e => e.kind === 'spawn-group' && e.tag === tag)))
        if (!tag) add('error', where, `${o.label || o.id} has no group tag`, at)
        else if (!spawned && !liveTags.has(tag)) {
          add('error', where,
            `${o.label || o.id} waits on the group "${tag}", which nothing spawns or carries`, at)
        }
      }
    })

    const seenTrig = new Set<string>()
    triggers.forEach((t, i) => {
      const at: Sel = { k: 'trigger', m: mi, i }
      if (!t.id.trim()) add('error', where, 'A trigger with no id', at)
      else if (seenTrig.has(t.id)) add('error', where, `Two triggers share the id ${t.id}`, at)
      seenTrig.add(t.id)

      if (t.do.length === 0) add('warn', where, `${t.id} does nothing`, at)

      // conditions that name an objective this mission does not have
      const walk = (c: typeof t.when) => {
        if (c.kind === 'all' || c.kind === 'any') { c.of.forEach(walk); return }
        if (c.kind === 'objective-active' || c.kind === 'objective-complete') {
          if (!c.objective) add('error', where, `${t.id} waits on no objective`, at)
          else if (!objIds.has(c.objective)) {
            add('error', where, `${t.id} waits on objective "${c.objective}", which is not in this mission`, at)
          }
        }
      }
      walk(t.when)

      t.do.forEach((e, j) => {
        const eat: Sel = { k: 'effect', m: mi, i, j }
        // every place a verb names must resolve
        for (const key of ['at', 'place', 'near'] as const) {
          const raw = (e as Record<string, unknown>)[key]
          if (raw === undefined || raw === null) continue
          const name = refPlaceName(raw)
          if (!name) {
            add('error', where, `${t.id} · ${e.kind} names no place`, eat)
          } else if (!known.has(name) && !isBuiltinPlace(name)) {
            add('error', where, `${t.id} · ${e.kind} names a place nobody authored: ${name}`, eat)
          }
        }
        // THE FREE-TEXT UNIT LIST, checked against the catalog it draws from
        const side = unitSideOf(e.kind)
        if (side) {
          const pack = PACKS[doc.sides[side]]
          const cat = pack?.catalogs?.units ?? {}
          const keys = e.kind === 'set-roe'
            ? [(e as { type?: string }).type ?? '']
            : ((e as { units?: string[] }).units ?? [])
          if (pack) {
            for (const k of keys) {
              if (!k) continue
              if (!(k in cat)) {
                add('error', where,
                  `${t.id} · ${e.kind} asks for "${k}", which ${pack.abbr ?? pack.id} does not field`,
                  eat)
              }
            }
          }
          if (e.kind !== 'set-roe' && keys.length === 0) {
            add('warn', where, `${t.id} · ${e.kind} names no units`, eat)
          }
        }
      })
    })
  })

  // ---- the CURRICULUM ---------------------------------------------------
  // A tutorial fails silently in the worst way: the lesson simply never
  // advances, and the player cannot tell a broken step from one they have not
  // worked out yet.
  const friendTypes = new Set(Object.keys(PACKS[doc.sides.friend]?.catalogs?.units ?? {}))
  doc.missions.forEach((m, mi) => {
    const steps = m.tutorial?.steps ?? []
    if (!steps.length) return
    const where = `${String(mi + 1).padStart(2, '0')} tutorial`
    const seen = new Set<string>()

    steps.forEach((st, s) => {
      const at: Sel = { k: 'tutStep', m: mi, s }
      if (!st.id?.trim()) add('error', where, 'A lesson with no id', at)
      else if (seen.has(st.id)) add('error', where, `Two lessons share the id ${st.id}`, at)
      seen.add(st.id)

      const hints = st.hints ?? []
      if (!hints.length) {
        add('error', where, `${st.id} says nothing — the player is given no cue`, at)
      }
      // A HINT LIST IS A DECISION TABLE — the first match renders — BUT an
      // unconditional hint is only a dead end if it also never yields. `next`
      // and `dwell` both hand control on, which is exactly how a lesson opens
      // with two pages the player reads and clicks through. Only a hint with
      // no condition AND no way out blocks the ones below it.
      const terminal = hints.findIndex(h => !h.when && !h.next && !h.dwell && !h.hide)
      if (terminal >= 0 && terminal < hints.length - 1) {
        add('warn', where,
          `${st.id}: hint ${terminal + 1} has no condition and never yields, so the ${hints.length - terminal - 1} after it can never render`,
          at)
      }

      // every unit type a condition names must be one this army fields
      const walkTypes = (c: TutCondition | undefined) => {
        if (!c) return
        if (c.kind === 'not') { walkTypes(c.of); return }
        if (c.kind === 'all') { c.of.forEach(walkTypes); return }
        const one = (c as { type?: string }).type
        const many = (c as { types?: string[] }).types ?? []
        for (const t of [one, ...many]) {
          if (!t) continue
          if (!friendTypes.has(t)) {
            add('error', where,
              `${st.id} waits on "${t}", which ${doc.sides.friend.toUpperCase()} does not field`, at)
          }
        }
      }
      walkTypes(st.done)

      hints.forEach((h, i) => {
        const hat: Sel = { k: 'tutHint', m: mi, s, h: i }
        if (!h.text && !h.hide) {
          add('error', where, `${st.id} hint ${i + 1} renders an empty card`, hat)
        }
        if (h.next && h.dwell != null) {
          add('warn', where,
            `${st.id} hint ${i + 1} sets both a dwell and a NEXT button — NEXT wins`, hat)
        }
        walkTypes(h.when)
        const a = h.anchor
        if (!a) return
        if (a.kind === 'ui') {
          // THE TYPO THAT POINTED AT NOTHING. The overlay resolves this with
          // querySelector; a wrong id produced an unanchored card and no error
          // anywhere.
          if (!a.sel) add('error', where, `${st.id} hint ${i + 1} has an empty UI target`, hat)
          else if (!isTutTarget(a.sel, [...friendTypes])) {
            add('error', where,
              `${st.id} hint ${i + 1} points at "${a.sel}", which the interface does not publish`, hat)
          }
        } else if (a.kind === 'unit') {
          if (!friendTypes.has(a.type)) {
            add('error', where,
              `${st.id} hint ${i + 1} rings a "${a.type}", which ${doc.sides.friend.toUpperCase()} does not field`, hat)
          }
        } else if (a.kind === 'point' || a.kind === 'box') {
          const n = refPlaceName(a.place)
          if (!n) add('error', where, `${st.id} hint ${i + 1} points at no place`, hat)
          else if (!known.has(n) && !isBuiltinPlace(n)) {
            add('error', where, `${st.id} hint ${i + 1} points at an unauthored place: ${n}`, hat)
          }
        } else if (a.kind === 'pan-to') {
          if (!known.has(a.place) && !isBuiltinPlace(a.place)) {
            add('error', where, `${st.id} hint ${i + 1} pans to an unauthored place: ${a.place}`, hat)
          }
        }
      })
    })
  })

  // dangling place names anywhere in the script that the walks above missed
  // (nested params the descriptors reach but this does not)
  for (const n of referencedPlaces(doc.missions)) {
    if (known.has(n) || isBuiltinPlace(n)) continue
    if (out.some(p => p.text.includes(n))) continue
    add('error', 'Script', `Nothing authored a place called ${n}`)
  }

  return out
}
