// Pack loader + registry. PACKS ARE JSON (modability): each pack is a FOLDER
// (src/packs/1cd/, src/packs/opfor/, tomorrow src/packs/4id/) holding a
// pack.json manifest + names.json (+ its crests/audio under public/ until the
// P4 runtime loader serves pack folders directly). Shared platform libraries
// live in src/packs/lib/*.json; a manifest's `catalogs.extends` names one and
// may subset its tables by ID list. This module is MACHINERY, not content —
// it resolves manifests into Pack objects and installs them.
//
// JSON boundary notes:
// - `endurance: null` in drone data means Infinity (JSON has no Infinity)
// - JSON types are wide (string, number[]); the single `as` cast per pack at
//   the bottom of buildPack is the documented boundary — the P4 runtime
//   validator replaces it with real checks + readable errors for mod packs.
import type { Pack, PackCatalogs, NamePools } from './types'
import type { DroneType } from '../domains/air/catalog'
import { activePack, installLineup, type Lineup } from './install'
import usPlatforms from './lib/us-platforms.json'

export { lineageFor } from './types'
export type { Pack } from './types'
export { activePack, installedPacks, type Lineup, type Side } from './install'

type AnyTable = Record<string, unknown>
interface RawLib { [table: string]: AnyTable | string }

// JSON has no Infinity: normalize `endurance: null` -> Infinity IN PLACE,
// once, so every pack drawing a library entry shares the SAME object (the
// installer's collision check merges by identity)
function normalizeDrones(drones: AnyTable | undefined): void {
  for (const v of Object.values(drones ?? {})) {
    const d = v as { endurance?: number | null }
    if (d.endurance == null) d.endurance = Infinity
  }
}

const LIBS: Record<string, RawLib> = {
  'us-platforms': usPlatforms as unknown as RawLib,
}
for (const lib of Object.values(LIBS)) normalizeDrones(lib.drones as AnyTable)

// subset a library table by ID list — entries stay SHARED BY REFERENCE, so
// two packs drawing the same library entry satisfy the installer's
// identity-based collision check
const pickIds = (table: AnyTable, ids: readonly string[]): AnyTable =>
  Object.fromEntries(ids.map(k => [k, table[k]]))

// resolve one catalog table: an ID array subsets the extended library, an
// object is the pack's own table, absence inherits the library table — and
// failing all of that, the 1CD FALLBACK (the canonical, locked-in pack: any
// pack missing functional content gets 1CD's version of it)
function table(
  man: { id: string; catalogs?: Record<string, unknown> }, lib: RawLib | null,
  name: string, fallback?: Pack,
): AnyTable {
  const v = man.catalogs?.[name]
  if (Array.isArray(v)) {
    if (!lib) throw new Error(`pack '${man.id}': catalogs.${name} subsets but no 'extends' library named`)
    return pickIds(lib[name] as AnyTable ?? {}, v as string[])
  }
  if (v && typeof v === 'object') return v as AnyTable
  const inherited = lib?.[name] as AnyTable | undefined
  if (inherited && Object.keys(inherited).length) return inherited
  return (fallback?.catalogs as unknown as Record<string, AnyTable> | undefined)?.[name] ?? {}
}

function resolveCatalogs(
  man: { id: string; catalogs?: Record<string, unknown> }, fallback?: Pack,
): PackCatalogs {
  const ext = man.catalogs?.extends as string | undefined
  const lib = ext ? LIBS[ext] ?? null : null
  if (ext && !lib) throw new Error(`pack '${man.id}' extends unknown library '${ext}'`)
  const drones = table(man, lib, 'drones', fallback)
  normalizeDrones(drones) // idempotent — covers a pack shipping its OWN table
  return {
    units: table(man, lib, 'units', fallback),
    ammo: table(man, lib, 'ammo', fallback),
    weapons: table(man, lib, 'weapons', fallback),
    expendables: table(man, lib, 'expendables', fallback),
    troops: table(man, lib, 'troops', fallback),
    vehicles: table(man, lib, 'vehicles', fallback),
    comps: table(man, lib, 'comps', fallback),
    drones,
    facilities: table(man, lib, 'facilities', fallback),
  } as unknown as PackCatalogs
}

// names.json (author-cased, gendered) -> the resolved pools the engine reads
function resolveNames(n?: {
  first_names?: { male?: string[]; female?: string[] }
  last_names?: string[]
}): NamePools | undefined {
  if (!n) return undefined
  return {
    male: n.first_names?.male ?? [],
    female: n.first_names?.female ?? [],
    last: n.last_names ?? [],
  }
}

// FALLBACK RULE: 1CD is the canonical, locked-in pack. Packs missing
// FUNCTIONAL content (catalog tables, names, audio) inherit 1CD's; IDENTITY
// content (formation, mottos, nicks, patch, assets, organic/attached) never
// falls back — absence there is meaningful, not an omission.
function buildPack(
  man: Record<string, unknown>, names?: Parameters<typeof resolveNames>[0], fallback?: Pack,
): Pack {
  const m = man as { id: string; catalogs?: Record<string, unknown> }
  return {
    id: m.id,
    name: man.name,
    abbr: man.abbr,
    nick: man.nick,
    motto: man.motto,
    inherits: man.inherits,
    startForce: man.startForce ?? fallback?.startForce,
    patch: man.patch,
    catalogs: resolveCatalogs(m, fallback),
    // capability groups follow the catalog: a pack that inherits 1CD's
    // platforms inherits the briefing order they were grouped in
    cats: man.cats ?? fallback?.cats,
    organic: man.organic ?? {},
    attached: man.attached ?? {},
    // element rosters + battalion templates. A pack that ships none falls back
    // to the canonical pack's, exactly like the platform catalogs above: a
    // variant pack that only re-designates battalions should not have to
    // restate what a command group is.
    rosters: man.rosters ?? fallback?.rosters,
    bnKinds: man.bnKinds ?? fallback?.bnKinds,
    billets: man.billets ?? fallback?.billets,
    // NO FALLBACK for callsigns: inheriting the canonical pack's would have
    // the opposition answering to ALPHA and BRAVO. A pack that declares none
    // gets a plain count, which reads as unset rather than as somebody else.
    callsigns: man.callsigns,
    ranks: man.ranks ?? fallback?.ranks,
    awards: man.awards ?? fallback?.awards,
    // net voice is IDENTITY, like callsigns: an opposing force inheriting this
    // one's procedure would sign off the same way, which is the thing the
    // split exists to prevent. A pack with none is simply not heard on the net
    // (only friendly elements transmit today — see comms/radio.ts).
    net: man.net,
    reports: man.reports ?? fallback?.reports,
    formation: man.formation,
    mottos: man.mottos,
    nicks: man.nicks,
    assets: man.assets,
    // ART is identity content — a pack's models are its own, never 1CD's
    models: man.models,
    audio: man.audio ?? fallback?.audio,
    names: resolveNames(names) ?? fallback?.names,
    staff: man.staff ?? fallback?.staff,
    people: man.people,
    // the ONE json->typed boundary cast (see header note)
  } as Pack
}

// --- discovery --------------------------------------------------------------
// PACKS ARE FOUND, NOT LISTED. Every other kind of content already works this
// way — drop a scenario in and it exists, drop a map in and it exists — but
// packs were hand-imported here, which meant an army could sit complete on
// disk and be invisible to the whole app because nobody edited this file.
// A folder under packs/ with a pack.json IS an army.
const MANIFESTS = import.meta.glob('./*/pack.json', {
  import: 'default', eager: true,
}) as Record<string, Record<string, unknown>>

const NAME_POOLS = import.meta.glob('./*/names.json', {
  import: 'default', eager: true,
}) as Record<string, Parameters<typeof resolveNames>[0]>

const folderOf = (path: string): string => path.split('/')[1] ?? ''

/** INHERITANCE, declared by the pack that wants it (`"inherits": "1cd"`).
 *  A pack that names no parent gets none — which is what a whole army of its
 *  own needs, since inheriting somebody else's rifles and rank ladder would
 *  quietly paper over everything it does not actually ship. The loader used to
 *  decide this, and decided it the same way for everyone. */
function buildAll(): Record<string, Pack> {
  const raw = new Map<string, { man: Record<string, unknown>; names?: Parameters<typeof resolveNames>[0] }>()
  for (const [path, man] of Object.entries(MANIFESTS)) {
    const dir = folderOf(path)
    raw.set(String(man.id ?? dir), { man, names: NAME_POOLS[`./${dir}/names.json`] })
  }
  const out: Record<string, Pack> = {}
  const building = new Set<string>()
  const build = (id: string): Pack | undefined => {
    if (out[id]) return out[id]
    const e = raw.get(id)
    if (!e) return undefined
    if (building.has(id)) throw new Error(`pack '${id}': inheritance cycle`)
    building.add(id)
    const parentId = e.man.inherits as string | undefined
    const parent = parentId ? build(parentId) : undefined
    if (parentId && !parent) throw new Error(`pack '${id}' inherits '${parentId}', which does not exist`)
    building.delete(id)
    return (out[id] = buildPack(e.man, e.names, parent))
  }
  for (const id of raw.keys()) build(id)
  return out
}

export const PACKS: Record<string, Pack> = buildAll()

/** EVERY ARMY THIS BUILD KNOWS ABOUT — what the content tools browse. This is
 *  a different question from who is fighting (that is the lineup, below), and
 *  conflating the two is what made an authored army invisible. */
export const allPacks = (): readonly Pack[] => Object.values(PACKS)

// the canonical pack: the one every other may inherit from, and the fallback
// when a lineup names nothing
export const PACK_1CD: Pack = PACKS['1cd']!

// THE BOOTSTRAP LINEUP — for menu screens and the dev sandbox, which have no
// scenario to ask. Every real scenario names its own sides, so this decides
// nothing about any army; it is only what gets loaded before anybody has said
// otherwise. Written out by id ON PURPOSE: "the first army along" reads as
// principled and is really just glob order, so adding a pack would silently
// change who the sandbox fights. A default has to be chosen somewhere, and
// choosing it visibly is better than deriving it from an accident.
const DEFAULT_SIDES = { friend: '1cd', hostile: 'opfor' }

const DEFAULT_LINEUP: Lineup = {
  friend: PACKS[DEFAULT_SIDES.friend] ?? allPacks()[0]!,
  hostile: PACKS[DEFAULT_SIDES.hostile] ?? allPacks()[0]!,
}

/** THE ARMY THE PLAYER IS COMMANDING — whichever pack the scenario put on the
 *  friendly side. Not a property of any pack; a pack does not know whose war
 *  it is. */
export function playerPack(): Pack {
  return activePack('friend') ?? PACK_1CD
}

/** (Re)install a lineup into the engine registries. `sides` is the scenario's
 *  assignment by pack id; anything it leaves out keeps the default. initGame
 *  calls this; the module-load call below covers pre-init reads (menu
 *  screens). Throws on a pack id nobody ships — a scenario naming an army
 *  that is not installed is a content error, and silently fielding 1CD in its
 *  place would hide it. */
export function installActivePacks(sides?: { friend?: string; hostile?: string }): void {
  const pick = (id: string | undefined, fallback: Pack): Pack => {
    if (!id) return fallback
    const p = PACKS[id]
    if (!p) throw new Error(`scenario names pack '${id}', which is not installed`)
    return p
  }
  installLineup({
    friend: pick(sides?.friend, DEFAULT_LINEUP.friend),
    hostile: pick(sides?.hostile, DEFAULT_LINEUP.hostile),
  }, allPacks())
}

installActivePacks()
