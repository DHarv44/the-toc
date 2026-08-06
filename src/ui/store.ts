// UI-only state. Sim state lives in engine/state (module singleton `S`).
// Ported verbatim from src/ui/store.js.
import { create } from 'zustand'
import type { ShellKind } from '../engine/GameState'
import type { Sheaf } from '../domains/fires/orders'

// mode: 'select' | 'deploy:<TYPE>' | 'deploy:DRONE' | 'build:<KIND>' | 'target' | 'bridge'
// `measure:<kind>` is a DRAW mode — a phase line is dragged across the axis, a
// checkpoint and an objective are clicked down. Control measures are the one
// thing the player puts on the map that is neither a unit nor an order: they
// are how a commander writes coordination down.
export type UiMode = 'select' | 'target' | 'bridge' | 'garrison'
  | `measure:${string}` | `deploy:${string}` | `build:${string}`
export type CmdMode = 'move' | 'attack'
/** The left wall's pages: the commander's own console, the staff's four, and
 *  the dev pack viewer. */
export type ConsoleId = 'cmd' | 's1' | 's2' | 's3' | 's4' | 'packs' | null
export type CmdTab = 'overview' | 'installations' | 'garrison' | 'actions'

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

export interface UIState {
  selectedIds: number[]
  mode: UiMode
  cmdMode: CmdMode          // what a ground/target click means
  setCmdMode: (cmdMode: CmdMode) => void
  ctxMenu: CtxMenu | null   // screen coords
  feeds: Feed[]             // no feed shown until the player opens one (or deploys a drone)
  night: boolean
  // map overlays (map-corner toggles): each layer draws what its name says —
  // fires = indirect max-range rings (the call-for-fire picture), snsr =
  // recon/drone/DF coverage, wpn = direct-fire range of the SELECTED units
  overlays: { fires: boolean; snsr: boolean; wpn: boolean }
  toggleOverlay: (k: 'fires' | 'snsr' | 'wpn') => void
  // camera lock: keep the selected unit/group centered as it moves (zoom is
  // yours; the center is theirs). A manual map pan breaks the lock.
  track: boolean
  toggleTrack: () => void
  // satellite underlay: the BFT sheet swaps for orthoimagery of the same box
  // (fetched on first toggle, session-cached; symbology stays on top)
  sat: boolean
  toggleSat: () => void
  overlayAlpha: number      // commander's overlay intensity (1 → 0.7 → 0.45, cycles)
  cycleOverlayAlpha: () => void
  rangeUnits: Record<number, true> // per-unit range ring, independent of the layers
  // GARRISON drill-down state: lives in the store so the tutorial's
  // UI conditions can see it — the curriculum has to teach the drill-down, and
  // it can only teach what it can read. The tree is an accordion, one rung open
  // at a time: base = the open GARRISON, cat = the open CAPABILITY inside it.
  // null at either level means that rung is shut (nothing below it is showing).
  // Companies are the exception — several can stand open at once, so that rung
  // is a list of `${cat}|${bn}:${co}` keys (namespaced by category because one
  // HHC owns platoons under three different capabilities).
  callupBase: number | null
  callupCat: string | null
  callupCos: string[]
  // COMMAND rail tree: which rungs are open, as an open-set of keys
  // (`base:12`, `base:12|FACILITIES`, `qrf-add:12`, `qrf-cat:12|INFANTRY`…).
  // One list rather than a field per rung — the tree is content-shaped, so a
  // new section must not need a new store field.
  cmdOpen: string[]
  toggleCmd: (key: string) => void
  // has the player paged the VTC deck THEMSELVES this call? The deck walks
  // itself on a timer, so only a manual page proves the habit was learned.
  vtcPaged: boolean
  qrfWarnOff: boolean       // "don't warn me again" for deploying a dedicated QRF
  netOpen: boolean
  feedsOpen: boolean        // FEEDS rail (right, inboard of the net) — feeds stack here
  feedsW: number            // feeds rail width (drag-resizable)
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
  console: ConsoleId
  setConsole: (c: ConsoleId) => void
  // WHICH PAGE OF THE COMMAND CONSOLE. Remembered, because folding GARRISON
  // into a console only works if reaching it stays one click — a page that
  // reset to OVERVIEW every time would make the deliberate act two.
  cmdTab: CmdTab
  setCmdTab: (t: CmdTab) => void
  // A CONSOLE IS A WALL, NOT A TAKEOVER. It docks as a left column at this
  // width and the map narrows; FULL gives it the whole viewport for when the
  // document is the work. See ui/console/ConsolePanel.
  consoleW: number
  setConsoleW: (w: number) => void
  consoleFull: boolean
  setConsoleFull: (b: boolean) => void
  s1Nav: string | null      // one-shot tab request for the S1 console ('perstats'…)
  openS1: (tab: string) => void
  clearS1Nav: () => void
  // TEAM STATIONS — the right wall. One full-height column per open team, in
  // the order they were opened: the newest sits against the tab column it was
  // opened from, and older ones are pushed inboard. Ids, not objects, because a
  // team that is destroyed simply stops matching and its column goes with it.
  stations: number[]
  toggleStation: (teamId: number) => void
  closeStation: (teamId: number) => void
  // ONE WIDTH FOR ALL OF THEM. A station is always the same kind of object —
  // a column you read top to bottom — so the width that makes one comfortable
  // is the width that makes all of them comfortable, and a rail where every
  // column is a different size is a rail nobody can scan.
  stationW: number
  setStationW: (w: number) => void
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
  ctxMenu: null,
  feeds: [],
  night: false,
  overlays: { fires: false, snsr: false, wpn: false },
  toggleOverlay: (k) => set((s) => ({ overlays: { ...s.overlays, [k]: !s.overlays[k] } })),
  track: false,
  toggleTrack: () => set((s) => ({ track: !s.track })),
  sat: false,
  toggleSat: () => set((s) => ({ sat: !s.sat })),
  overlayAlpha: 1,
  cycleOverlayAlpha: () => set((s) => ({ overlayAlpha: s.overlayAlpha > 0.85 ? 0.7 : s.overlayAlpha > 0.6 ? 0.45 : 1 })),
  rangeUnits: {},
  // A TOC COMES UP WITH A CLEAN MAP. Every panel starts shut — the commander
  // opens the one they need rather than clearing the ones they don't.
  callupBase: null,
  callupCat: null,
  callupCos: [],
  cmdOpen: [],
  toggleCmd: (key) => set((s) => ({
    cmdOpen: s.cmdOpen.includes(key) ? s.cmdOpen.filter(k => k !== key) : [...s.cmdOpen, key],
  })),
  vtcPaged: false,
  qrfWarnOff: false,
  netOpen: false,
  feedsOpen: false,
  feedsW: 400,
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
  cmdTab: 'overview',
  setCmdTab: (cmdTab) => set({ cmdTab }),
  // TWICE A TEAM STATION. A staff board is a document and needs room — the
  // S3's task force table is six columns and the PERSTAT and LOGSTAT are worse
  // — but 720 is enough for all of them, and it is a width the commander can
  // trade against the map rather than a takeover.
  consoleW: 720,
  setConsoleW: (w) => set({ consoleW: Math.max(420, Math.min(1400, w)) }),
  // DOCKED BY DEFAULT, which revises the earlier call.
  //
  // These opened FULL because at 420-760 the tables were crushed and a table
  // you cannot read is a wasted click on the way to maximising anyway. That was
  // true when the choice was a narrow wall or the whole screen. It stopped
  // being true when the right wall grew team stations: a board over the whole
  // viewport hides the stations you opened to watch the fight you are reading
  // about, which is the single most un-TOC thing an interface can do.
  //
  // So: a real column at a real width, and FULL still one button away for when
  // the document IS the work.
  consoleFull: false,
  setConsoleFull: (b) => set({ consoleFull: b }),
  s1Nav: null,
  openS1: (tab) => set({ console: 's1', s1Nav: tab }),
  clearS1Nav: () => set({ s1Nav: null }),
  stations: [],
  toggleStation: (teamId) => set((s) => ({
    stations: s.stations.includes(teamId)
      ? s.stations.filter(id => id !== teamId)
      // appended, so the column opens against the tab that opened it
      : [...s.stations, teamId],
  })),
  closeStation: (teamId) => set((s) => ({ stations: s.stations.filter(id => id !== teamId) })),
  // 360 shows the march list without eliding a callsign; two of these still
  // leave most of a 1600 px screen to the COP, which is the trade the commander
  // is making and should be able to feel.
  stationW: 360,
  setStationW: (w) => set({ stationW: Math.max(300, Math.min(620, w)) }),
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
