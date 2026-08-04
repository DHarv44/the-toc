// EDITOR STATE — the builder's DOCUMENT as pure operations.
//
// Eden's grammar (SCENARIO-BUILDER.md E1): place / select / update / move /
// delete / undo / redo. Pure functions returning new state so the UI stays a
// dumb shell and the behavior is testable. Entities are edited in WORLD
// metres (canvas math stays simple); the load/save seam converts to the
// scenario's pack-norm coords through the map frame.
//
// THE UNDOABLE UNIT IS THE WHOLE DOCUMENT, not the entity list. Missions used
// to live in their own useState beside this, which meant deleting a mission
// — the largest thing an author can destroy in one click — was the one edit
// Ctrl+Z could not take back, while nudging a tank 3 metres was. Everything a
// keystroke can change now lives in Doc, so undo, redo and DIRTY all fall out
// of one place and cannot disagree with each other.
import type { ModeId } from '../engine/modes'
import type {
  MissionScript, ScenarioPlace, ScenarioSide, ScenarioSpec,
  ScenarioStructure, ScenarioUnit,
} from './types'

// `ent` is the discriminant (a structure entity keeps its catalog `kind`)
export type Entity =
  | ({ id: number; ent: 'structure' } & Omit<ScenarioStructure, 'x' | 'y'> & { x: number; y: number })
  | ({ id: number; ent: 'unit' } & Omit<ScenarioUnit, 'x' | 'y'> & { x: number; y: number })
  // a named place/zone — sideless; the scenario's authored gazetteer entry
  | ({ id: number; ent: 'place' } & Omit<ScenarioPlace, 'x' | 'y'> & { x: number; y: number })

/** Campaign dressing the sheet and the script panel do not edit — carried
 *  through load → save verbatim so opening a campaign to move one tank never
 *  drops its anchors. */
export type Extras = Pick<ScenarioSpec,
  'operation' | 'hqLabel' | 'airfieldLabel' | 'divHq' | 'anchors' | 'preAllocations'>

/** THE DOCUMENT — everything an edit can change, in one object. */
export interface Doc {
  name: string
  /** AUTHORED type: the menu door, the rules, the badge */
  type: ModeId
  /** WHICH ARMY FIGHTS FOR WHICH SIDE, by pack id. A SCENARIO property (the
   *  model's headline rule — "sides are packs"), so it is loaded from the
   *  file and written back from the file. Reading it off whatever lineup
   *  happened to be installed meant saving an MI scenario while 1CD was
   *  loaded silently converted it into a 1CD scenario. */
  sides: { friend: string; hostile: string }
  /** THE CHAIR — the battalion this scenario is written for */
  player: string
  /** fog of war (absent = the engine's default, which is on) */
  fog?: boolean
  entities: Entity[]
  missions: MissionScript[]
  extras: Extras
  /** EVERY KEY OF THE LOADED FILE THIS TOOL DOES NOT MODEL, carried through
   *  untouched. The builder rebuilds the spec from the fields it knows, so
   *  anything else in the file — the MI scenario's hand-written `_doc`
   *  paragraphs explaining why it is authored the way it is — used to be
   *  erased the first time an author opened it and pressed SAVE. A tool that
   *  eats what it does not understand cannot be trusted with a file. */
  carry: Record<string, unknown>
  /** the loaded file's KEY ORDER. A scenario written by hand interleaves its
   *  documentation with the sections it documents — each `_doc` paragraph
   *  sits directly above its subject — and preserving those keys without
   *  their PLACES just collects the prose into a block at the top, away from
   *  everything it explains. Empty for a new document. */
  keyOrder: string[]
}

/** The keys the builder writes itself. Anything else in a loaded spec is
 *  somebody's and rides in `carry`. */
export const MODELLED_KEYS: readonly string[] = [
  'type', 'name', 'map', 'sides', 'player', 'fog', 'situation', 'missions',
  'operation', 'hqLabel', 'airfieldLabel', 'divHq', 'anchors', 'preAllocations',
]

/** Split a loaded spec's unmodelled keys out for safekeeping. */
export function carryOf(spec: object): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(spec)) {
    if (!MODELLED_KEYS.includes(k)) out[k] = v
  }
  return out
}

/** Rebuild an object in the loaded file's key order; keys the file did not
 *  have are appended in the order they were written. */
export function inKeyOrder<T extends object>(spec: T, order: readonly string[]): T {
  if (order.length === 0) return spec
  const src = spec as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of order) if (k in src) out[k] = src[k]
  for (const k of Object.keys(src)) if (!(k in out)) out[k] = src[k]
  return out as T
}

/** WHAT IS ON THE INSPECTOR'S BENCH. One selection for the whole document,
 *  not one for the map and another for the script: a mission's objective is
 *  as selectable as a tank, and both are edited in the same panel. That is
 *  Eden's grammar — select a thing, edit its attributes — and it is what lets
 *  the outline be a single tree instead of two disconnected lists. */
export type Sel =
  // ONE OR MANY. Selection is a set because every scene editor's is: you
  // marquee six platoons and set them all dug-in, you shift-click three more
  // and drag the lot. A single-id selection made the inspector a one-at-a-time
  // form, which is why placing a defence in depth took twelve trips through it.
  | { k: 'entity'; ids: number[] }
  | { k: 'mission'; m: number }
  | { k: 'objective'; m: number; i: number }
  | { k: 'trigger'; m: number; i: number }
  | { k: 'effect'; m: number; i: number; j: number }

/** every entity id on the bench — what the sheet highlights */
export const selIds = (sel: Sel | null): number[] =>
  (sel?.k === 'entity' ? sel.ids : [])

/** the ONE entity on the bench, or null when none or many */
export const selEntity = (sel: Sel | null): number | null =>
  (sel?.k === 'entity' && sel.ids.length === 1 ? sel.ids[0]! : null)

export const oneEntity = (id: number): Sel => ({ k: 'entity', ids: [id] })

/** shift-click semantics: in the set, out of it */
export function toggleId(sel: Sel | null, id: number): Sel {
  const ids = selIds(sel)
  return { k: 'entity', ids: ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id] }
}

/** which mission the bench is inside, or null — what the sheet GHOSTS */
export const selMission = (sel: Sel | null): number | null =>
  (sel && sel.k !== 'entity' ? sel.m : null)

export interface EditorState {
  doc: Doc
  sel: Sel | null
  past: Doc[]
  future: Doc[]
  /** the document AS LAST SAVED. Dirty is `doc !== saved` — a comparison,
   *  never a flag that can drift out of step with the truth. Undoing back to
   *  the save point restores that exact object, so the dot goes out again. */
  saved: Doc
}

export const emptyDoc = (): Doc => ({
  name: 'NEW SCENARIO', type: 'attack-defend',
  sides: { friend: '', hostile: '' }, player: '',
  entities: [], missions: [], extras: {}, carry: {}, keyOrder: [],
})

/** Open a document on the bench: clean history, nothing dirty. */
export const openEditor = (doc: Doc): EditorState =>
  ({ doc, sel: null, past: [], future: [], saved: doc })

export const emptyEditor = (): EditorState => openEditor(emptyDoc())

let nextId = 1
export const freshId = (): number => nextId++

export const dirty = (s: EditorState): boolean => s.doc !== s.saved

/** every mutating op snapshots first — one undo step per discrete action */
const push = (s: EditorState, doc: Doc): EditorState => ({
  ...s, doc, past: [...s.past.slice(-63), s.doc], future: [],
})

const withEntities = (s: EditorState, entities: Entity[]): EditorState =>
  push(s, { ...s.doc, entities })

// --- document-level edits ---------------------------------------------------

/** Edit the scenario's own properties (name, type, sides, chair, fog). */
export function setDoc(s: EditorState, patch: Partial<Doc>): EditorState {
  return push(s, { ...s.doc, ...patch })
}

/** Edit the mission list. Deleting one is now an ordinary undoable edit. */
export function setMissions(
  s: EditorState, f: (ms: MissionScript[]) => MissionScript[],
): EditorState {
  return push(s, { ...s.doc, missions: f(s.doc.missions) })
}

/** The document was written to disk: this is the new clean state. */
export function markSaved(s: EditorState): EditorState {
  return { ...s, saved: s.doc }
}

// --- entity edits -----------------------------------------------------------

export function place(s: EditorState, e: Entity): EditorState {
  return { ...withEntities(s, [...s.doc.entities, e]), sel: oneEntity(e.id) }
}

/** Patch EVERY selected entity. A patch that does not apply to a kind is
 *  simply not written to it — ticking DUG IN over a mixed selection digs the
 *  units in and leaves the FOB alone, rather than refusing the whole edit. */
export function update(s: EditorState, ids: number[], patch: Partial<Entity>): EditorState {
  const set = new Set(ids)
  return withEntities(s, s.doc.entities.map(e =>
    (set.has(e.id) ? { ...e, ...patch, id: e.id, ent: e.ent } as Entity : e)))
}

/** Move the whole selection WITHOUT an undo snapshot — drags stream through
 *  here; the drag START takes the snapshot (beginDrag) so one drag = one step. */
export function moveLive(
  s: EditorState, ids: number[], dx: number, dy: number,
): EditorState {
  const set = new Set(ids)
  return {
    ...s,
    doc: {
      ...s.doc,
      entities: s.doc.entities.map(e => (set.has(e.id) ? { ...e, x: e.x + dx, y: e.y + dy } : e)),
    },
  }
}

export function beginDrag(s: EditorState): EditorState {
  return { ...s, past: [...s.past.slice(-63), s.doc], future: [] }
}

export function remove(s: EditorState, ids: number[]): EditorState {
  const set = new Set(ids)
  return {
    ...withEntities(s, s.doc.entities.filter(e => !set.has(e.id))),
    sel: null,
  }
}

/** Ctrl+D — a copy of the selection, nudged clear of the originals and left
 *  selected so the very next drag positions it. The move every scene editor
 *  makes cheap, and the one this tool made twelve clicks. */
export function duplicate(s: EditorState, ids: number[], offset = 120): EditorState {
  const set = new Set(ids)
  const copies: Entity[] = []
  for (const e of s.doc.entities) {
    if (!set.has(e.id)) continue
    copies.push({ ...e, id: freshId(), x: e.x + offset, y: e.y + offset } as Entity)
  }
  if (!copies.length) return s
  return {
    ...withEntities(s, [...s.doc.entities, ...copies]),
    sel: { k: 'entity', ids: copies.map(c => c.id) },
  }
}

export function select(s: EditorState, sel: Sel | null): EditorState {
  return { ...s, sel }
}

// --- history ----------------------------------------------------------------

/** Undo can delete whatever was on the bench. Rather than leave the inspector
 *  pointed at an objective that no longer exists, drop the selection. */
function alive(doc: Doc, sel: Sel | null): Sel | null {
  if (!sel) return null
  if (sel.k === 'entity') {
    const ids = sel.ids.filter(id => doc.entities.some(e => e.id === id))
    return ids.length ? { k: 'entity', ids } : null
  }
  const m = doc.missions[sel.m]
  if (!m) return null
  if (sel.k === 'mission') return sel
  if (sel.k === 'objective') return (m.objectives?.[sel.i] ? sel : { k: 'mission', m: sel.m })
  const t = m.triggers?.[sel.i]
  if (!t) return { k: 'mission', m: sel.m }
  if (sel.k === 'trigger') return sel
  return t.do[sel.j] ? sel : { k: 'trigger', m: sel.m, i: sel.i }
}

export function undo(s: EditorState): EditorState {
  const prev = s.past[s.past.length - 1]
  if (!prev) return s
  return {
    ...s, doc: prev, sel: alive(prev, s.sel),
    past: s.past.slice(0, -1), future: [s.doc, ...s.future.slice(0, 63)],
  }
}

export function redo(s: EditorState): EditorState {
  const next = s.future[0]
  if (!next) return s
  return {
    ...s, doc: next, sel: alive(next, s.sel),
    past: [...s.past.slice(-63), s.doc], future: s.future.slice(1),
  }
}

export function selected(s: EditorState): Entity | undefined {
  const id = selEntity(s.sel)
  return id == null ? undefined : s.doc.entities.find(e => e.id === id)
}

export type { ScenarioSide }
