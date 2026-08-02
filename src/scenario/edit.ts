// EDITOR STATE — the builder's entity workspace as pure operations.
//
// Eden's grammar (SCENARIO-BUILDER.md E1): place / select / update / move /
// delete / undo / redo over a flat entity list. Pure functions returning new
// state so the UI stays a dumb shell and the behavior is testable. Entities
// are edited in WORLD metres (canvas math stays simple); the load/save seam
// converts to the scenario's pack-norm coords through the map frame.
import type { ScenarioPlace, ScenarioSide, ScenarioStructure, ScenarioUnit } from './types'

// `ent` is the discriminant (a structure entity keeps its catalog `kind`)
export type Entity =
  | ({ id: number; ent: 'structure' } & Omit<ScenarioStructure, 'x' | 'y'> & { x: number; y: number })
  | ({ id: number; ent: 'unit' } & Omit<ScenarioUnit, 'x' | 'y'> & { x: number; y: number })
  // a named place/zone — sideless; the scenario's authored gazetteer entry
  | ({ id: number; ent: 'place' } & Omit<ScenarioPlace, 'x' | 'y'> & { x: number; y: number })

export interface EditorState {
  entities: Entity[]
  sel: number | null
  past: Entity[][]
  future: Entity[][]
}

export const emptyEditor = (): EditorState => ({ entities: [], sel: null, past: [], future: [] })

let nextId = 1
export const freshId = (): number => nextId++

// every mutating op snapshots first — one undo step per discrete action
const push = (s: EditorState, entities: Entity[]): EditorState => ({
  entities,
  sel: s.sel,
  past: [...s.past.slice(-63), s.entities],
  future: [],
})

export function place(s: EditorState, e: Entity): EditorState {
  return { ...push(s, [...s.entities, e]), sel: e.id }
}

export function update(s: EditorState, id: number, patch: Partial<Entity>): EditorState {
  return push(s, s.entities.map(e => (e.id === id ? { ...e, ...patch, id: e.id, ent: e.ent } as Entity : e)))
}

/** Move WITHOUT an undo snapshot — drags stream through here; the drag START
 *  takes the snapshot (beginDrag) so one drag = one undo step. */
export function moveLive(s: EditorState, id: number, x: number, y: number): EditorState {
  return { ...s, entities: s.entities.map(e => (e.id === id ? { ...e, x, y } : e)) }
}

export function beginDrag(s: EditorState): EditorState {
  return { ...s, past: [...s.past.slice(-63), s.entities], future: [] }
}

export function remove(s: EditorState, id: number): EditorState {
  return { ...push(s, s.entities.filter(e => e.id !== id)), sel: s.sel === id ? null : s.sel }
}

export function select(s: EditorState, id: number | null): EditorState {
  return { ...s, sel: id }
}

export function undo(s: EditorState): EditorState {
  const prev = s.past[s.past.length - 1]
  if (!prev) return s
  return {
    entities: prev,
    sel: prev.some(e => e.id === s.sel) ? s.sel : null,
    past: s.past.slice(0, -1),
    future: [s.entities, ...s.future.slice(0, 63)],
  }
}

export function redo(s: EditorState): EditorState {
  const next = s.future[0]
  if (!next) return s
  return {
    entities: next,
    sel: next.some(e => e.id === s.sel) ? s.sel : null,
    past: [...s.past.slice(-63), s.entities],
    future: s.future.slice(1),
  }
}

export const selected = (s: EditorState): Entity | undefined =>
  s.entities.find(e => e.id === s.sel)
