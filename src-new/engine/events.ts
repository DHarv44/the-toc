// The sim's only outward edges, as a deliberately narrow typed event bus.
// In the old sim these were direct calls out of sim.js: radio() → audio's
// radioMsg() (the one sim→DOM edge), toasts pushed for the HUD, and won/lost
// flags flipped mid-tick. The new sim emits; presentation/audio subscribe.
// Everything else stays polling-off-GameState — do not grow this into a
// general message bus (orders are typed function calls, not events).

// payload mirrors radioMsg(full, callsign, priority) — the audio layer's needs
export interface RadioTrafficEvent {
  text: string        // fully-phrased transmission (addressee, report, closing)
  callsign: string
  priority: number    // 2 contact/loss/fires · 1 spot/struct · 0 routine
}

export interface ToastEvent {
  msg: string
  t: number
}

export interface GameOverEvent {
  result: 'won' | 'lost'
}

export interface EventMap {
  radio: RadioTrafficEvent
  toast: ToastEvent
  gameover: GameOverEvent
}

export type EventName = keyof EventMap

export interface EventBus {
  on<K extends EventName>(name: K, fn: (e: EventMap[K]) => void): () => void
  emit<K extends EventName>(name: K, e: EventMap[K]): void
}

export function createBus(): EventBus {
  // internal store is erased to a common handler shape — TS can't relate a
  // per-key handler to EventMap[K] through a generic key, so the one cast lives
  // here at the boundary; the public surface stays fully typed
  type AnyHandler = (e: EventMap[EventName]) => void
  const subs = new Map<EventName, AnyHandler[]>()
  return {
    on(name, fn) {
      let list = subs.get(name)
      if (!list) subs.set(name, list = [])
      const h = fn as unknown as AnyHandler
      list.push(h)
      return () => {
        const i = list.indexOf(h)
        if (i >= 0) list.splice(i, 1)
      }
    },
    emit(name, e) {
      const list = subs.get(name)
      if (!list) return
      // snapshot so a handler unsubscribing mid-emit can't skip a neighbor
      for (const fn of [...list]) fn(e)
    },
  }
}
