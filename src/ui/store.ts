// UI-only state. Sim state lives in engine/state (module singleton `S`).
// Ported verbatim from src/ui/store.js.
import { create } from 'zustand'
import type { PathOpts } from '../world/pathfinding'
import type { ShellKind } from '../engine/GameState'
import type { Sheaf } from '../domains/fires/orders'

// mode: 'select' | 'deploy:<TYPE>' | 'deploy:DRONE' | 'build:<KIND>' | 'target' | 'bridge'
export type UiMode = 'select' | 'target' | 'bridge' | 'garrison' | `deploy:${string}` | `build:${string}`
export type CmdMode = 'move' | 'attack'
export type RouteModeKey = 'auto' | 'roads' | 'noroads' | 'fastest'

export interface Feed {
  id: number
  droneId: number | null
  x: number | null
  y: number | null
  w: number
  h: number
  gx: number   // sensor gimbal: look offset (m)
  gy: number
  fov: number  // zoom
  muted: boolean // per-feed audio, layered under the global mute
  winMode?: 'win' | 'max' | 'min' // draggable window / fill screen / title only
}

// unit right-click carries unitId; empty-handed structure right-click carries structId
export interface CtxMenu {
  x: number
  y: number
  unitId?: number
  structId?: number
}

export interface FireOpts {
  shell: ShellKind
  rounds: number // 0 = battery default
  sheaf: Sheaf
}

let feedSeq = 1
const newFeed = (droneId: number | null = null): Feed => ({
  id: feedSeq++, droneId, x: null, y: null, w: 460, h: 330,
  gx: 0, gy: 0, fov: 38,
  muted: false,
})

// pathfinding opts for each routing mode. 'auto' passes nothing so orderMove infers
// intent from the click; the others bypass that inference.
export const ROUTE_OPTS: Record<RouteModeKey, PathOpts> = {
  auto: {},
  roads: { roadsOnly: true },
  noroads: { offRoad: true },
  fastest: { roadBias: 1 },   // no bias either way — pure cheapest terrain cost
}

export const ROUTE_MODES: ReadonlyArray<{ val: RouteModeKey; label: string; hint: string }> = [
  { val: 'auto', label: 'AUTO', hint: 'Click a road to use it, open ground to go direct' },
  { val: 'roads', label: 'ROADS ONLY', hint: 'Hold the road network the whole way' },
  { val: 'noroads', label: 'NO ROADS', hint: 'Stay off the network — move cross-country' },
  { val: 'fastest', label: 'FASTEST', hint: 'Cheapest route by terrain, roads or not' },
]

export interface UIState {
  selectedIds: number[]
  mode: UiMode
  cmdMode: CmdMode          // what a ground/target click means
  setCmdMode: (cmdMode: CmdMode) => void
  // how move orders route: 'auto' reads intent from where you clicked (on a road =
  // use the network, open ground = go direct); the rest are explicit overrides
  routeMode: RouteModeKey
  setRouteMode: (routeMode: RouteModeKey) => void
  ctxMenu: CtxMenu | null   // screen coords
  feeds: Feed[]             // no feed shown until the player opens one (or deploys a drone)
  night: boolean
  // map overlays (map-corner toggles): each layer draws what its name says —
  // fires = indirect max-range rings (the call-for-fire picture), snsr =
  // recon/drone/DF coverage, wpn = direct-fire range of the SELECTED units
  overlays: { fires: boolean; snsr: boolean; wpn: boolean }
  toggleOverlay: (k: 'fires' | 'snsr' | 'wpn') => void
  overlayAlpha: number      // commander's overlay intensity (1 → 0.7 → 0.45, cycles)
  cycleOverlayAlpha: () => void
  rangeUnits: Record<number, true> // per-unit range ring, independent of the layers
  leftOpen: boolean         // side rails: collapse to their own edge, independently
  bgOpen: boolean           // BATTLE GROUPS rail (left, beside installations)
  netOpen: boolean
  feedsOpen: boolean        // FEEDS rail (right, inboard of the net) — feeds stack here
  feedsW: number            // feeds rail width (drag-resizable)
  toggleBg: () => void
  toggleFeeds: () => void
  setFeedsW: (w: number) => void
  muted: boolean
  setMuted: (m: boolean) => void
  fireOpts: FireOpts
  droneModes: Record<number, string> // droneId -> camera mode; rides with the aircraft
  tick: number
  rosterId: number | null   // unit whose personnel roster panel is open (null = closed)
  openRoster: (id: number) => void
  closeRoster: () => void
  console: 's1' | 's2' | 's3' | 's4' | 'dash' | 'packs' | null // console replacing the map column (null = map)
  setConsole: (c: 's1' | 's2' | 's3' | 's4' | 'dash' | 'packs' | null) => void
  s1Nav: string | null      // one-shot tab request for the S1 console ('perstats'…)
  openS1: (tab: string) => void
  clearS1Nav: () => void
  setDroneMode: (droneId: number, mode: string) => void
  setFireOpts: (patch: Partial<FireOpts>) => void
  select: (id: number | null) => void
  setSelected: (ids: number[]) => void
  toggleSelect: (id: number) => void
  setMode: (mode: UiMode) => void
  openMenu: (m: CtxMenu) => void
  closeMenu: () => void
  toggleNight: () => void
  toggleUnitRange: (id: number) => void
  toggleNet: () => void
  toggleLeft: () => void
  addFeed: (droneId?: number | null) => void
  closeFeed: (id: number) => void
  setFeed: (id: number, patch: Partial<Feed>) => void
  bindDrone: (droneId: number) => void
  showDrone: (droneId: number) => void
}

export const useUI = create<UIState>()((set, get) => ({
  selectedIds: [],
  mode: 'select',
  cmdMode: 'move',
  setCmdMode: (cmdMode) => set({ cmdMode }),
  routeMode: 'auto',
  setRouteMode: (routeMode) => set({ routeMode }),
  ctxMenu: null,
  feeds: [],
  night: false,
  overlays: { fires: false, snsr: false, wpn: false },
  toggleOverlay: (k) => set((s) => ({ overlays: { ...s.overlays, [k]: !s.overlays[k] } })),
  overlayAlpha: 1,
  cycleOverlayAlpha: () => set((s) => ({ overlayAlpha: s.overlayAlpha > 0.85 ? 0.7 : s.overlayAlpha > 0.6 ? 0.45 : 1 })),
  rangeUnits: {},
  // default rail state: everything tucked away except the fielded force
  leftOpen: false,
  bgOpen: true,
  netOpen: false,
  feedsOpen: false,
  feedsW: 400,
  toggleBg: () => set((s) => ({ bgOpen: !s.bgOpen })),
  toggleFeeds: () => set((s) => ({ feedsOpen: !s.feedsOpen })),
  setFeedsW: (w) => set({ feedsW: Math.max(300, Math.min(680, w)) }),
  muted: false,
  setMuted: (m) => set({ muted: m }),
  fireOpts: { shell: 'HE', rounds: 0, sheaf: 'STD' },
  droneModes: {},
  tick: 0,
  rosterId: null,
  // "PERSONNEL ROSTER…" from the map: the S1 console owns rosters — open it
  // focused on that unit (the console expands + scrolls, then clears the id)
  openRoster: (id) => set({ rosterId: id, console: 's1', ctxMenu: null }),
  closeRoster: () => set({ rosterId: null }),
  console: null,
  setConsole: (c) => set({ console: c }),
  s1Nav: null,
  openS1: (tab) => set({ console: 's1', s1Nav: tab }),
  clearS1Nav: () => set({ s1Nav: null }),
  setDroneMode: (droneId, mode) => set((s) => ({ droneModes: { ...s.droneModes, [droneId]: mode } })),
  setFireOpts: (patch) => set((s) => ({ fireOpts: { ...s.fireOpts, ...patch } })),
  select: (id) => set({ selectedIds: id == null ? [] : [id], mode: 'select' }),
  setSelected: (ids) => set({ selectedIds: ids, mode: 'select' }),
  toggleSelect: (id) => set((s) => ({
    selectedIds: s.selectedIds.includes(id)
      ? s.selectedIds.filter(x => x !== id)
      : [...s.selectedIds, id],
  })),
  setMode: (mode) => set({ mode }),
  openMenu: (m) => set({ ctxMenu: m }),
  closeMenu: () => set({ ctxMenu: null }),
  toggleNight: () => set((s) => ({ night: !s.night })),
  toggleUnitRange: (id) => set((s) => {
    const r = { ...s.rangeUnits }
    if (r[id]) delete r[id]; else r[id] = true
    return { rangeUnits: r }
  }),
  toggleNet: () => set((s) => ({ netOpen: !s.netOpen })),
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  addFeed: (droneId = null) => {
    const { feeds } = get()
    if (feeds.length >= 4) return
    set({ feeds: [...feeds, newFeed(droneId)], feedsOpen: true })
  },
  closeFeed: (id) => set((s) => ({ feeds: s.feeds.filter(f => f.id !== id) })),
  setFeed: (id, patch) => set((s) => ({
    feeds: s.feeds.map(f => (f.id === id ? { ...f, ...patch } : f)),
  })),
  bindDrone: (droneId) => {
    const { feeds } = get()
    const open = feeds.find(f => f.droneId == null)
    if (open) {
      set({ feeds: feeds.map(f => (f.id === open.id ? { ...f, droneId } : f)) })
    } else if (feeds.length < 4) {
      set({ feeds: [...feeds, newFeed(droneId)] })
    }
  },
  // Show a just-deployed drone: already up in a feed → leave it; an empty feed open →
  // fill it; room for another → pop a NEW window; at max with all bound → take over the
  // first feed. So deploying always lands you looking at it.
  showDrone: (droneId) => set((s) => {
    if (s.feeds.some(f => f.droneId === droneId)) return { feedsOpen: true }
    const empty = s.feeds.find(f => f.droneId == null)
    if (empty) return { feeds: s.feeds.map(f => (f.id === empty.id ? { ...f, droneId } : f)), feedsOpen: true }
    if (s.feeds.length < 4) return { feeds: [...s.feeds, newFeed(droneId)], feedsOpen: true }
    return { feeds: s.feeds.map((f, i) => (i === 0 ? { ...f, droneId } : f)), feedsOpen: true }
  }),
}))

// HUD refresh pump (10 Hz) — decoupled from render loops. Stashed on globalThis
// so an HMR re-execution of this module replaces the old interval instead of
// stacking a second one (the stale pump would keep ticking a dead store).
const gPump = globalThis as typeof globalThis & { __WOD2_UI_PUMP?: ReturnType<typeof setInterval> }
if (gPump.__WOD2_UI_PUMP) clearInterval(gPump.__WOD2_UI_PUMP)
gPump.__WOD2_UI_PUMP = setInterval(() => useUI.setState((s) => ({ tick: s.tick + 1 })), 100)

// dev hook: reach the UI store from the console (mirrors window.__game)
if (typeof window !== 'undefined') {
  ;(window as unknown as { __ui?: unknown }).__ui = useUI
}
