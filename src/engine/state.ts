// The live singleton: one GameState instance plus the event bus, HMR-stashed so
// editing sim code doesn't reset a session. Deliberately keeps the old sim's
// singleton pattern (UI polls S directly; domain functions close over it) —
// threading state through every call was considered and rejected as a behavior
// risk for a parity port.
//
// Stashed under NEW keys (__WOD2_*): during the migration the old sim's
// __WOD_STATE coexists in the same page (?golden loads both), and the shapes
// differ (counters live in state here).
import { createInitialState, type GameState } from './GameState'
import { createBus, type EventBus } from './events'

const g = globalThis as typeof globalThis & {
  __WOD2_STATE?: GameState
  __WOD2_BUS?: EventBus
}

export const S: GameState = g.__WOD2_STATE || (g.__WOD2_STATE = createInitialState())
export const bus: EventBus = g.__WOD2_BUS || (g.__WOD2_BUS = createBus())
