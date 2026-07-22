import { create } from 'zustand'

// UI-only state. Sim state lives in game/sim.js (module singleton `S`).
// mode: 'select' | 'deploy:<TYPE>' | 'deploy:DRONE' | 'build:<KIND>' | 'target' | 'bridge'
let feedSeq = 1
const newFeed = (droneId = null) => ({
  id: feedSeq++, droneId, x: null, y: null, w: 460, h: 330,
  gx: 0, gy: 0, fov: 38, // sensor gimbal: look offset (m) + zoom
})

export const useUI = create((set, get) => ({
  selectedIds: [],
  mode: 'select',
  cmdMode: 'move',         // 'move' | 'attack' — what a ground/target click means
  setCmdMode: (cmdMode) => set({ cmdMode }),
  ctxMenu: null,           // {x, y, unitId} — screen coords
  feeds: [],               // no feed shown until the player opens one (or deploys a drone)
  night: false,
  showNet: true,
  muted: false,
  setMuted: (m) => set({ muted: m }),
  fireOpts: { shell: 'HE', rounds: 0, sheaf: 'STD' }, // rounds 0 = battery default
  droneModes: {},          // droneId -> camera mode; the sensor setting rides with the aircraft
  netSize: { w: 310, h: 280 },
  tick: 0,
  setDroneMode: (droneId, mode) => set((s) => ({ droneModes: { ...s.droneModes, [droneId]: mode } })),
  setNetSize: (patch) => set((s) => ({ netSize: { ...s.netSize, ...patch } })),
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
  toggleNet: () => set((s) => ({ showNet: !s.showNet })),
  addFeed: (droneId = null) => {
    const { feeds } = get()
    if (feeds.length >= 4) return
    set({ feeds: [...feeds, newFeed(droneId)] })
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
}))

// HUD refresh pump (10 Hz) — decoupled from render loops
setInterval(() => useUI.setState((s) => ({ tick: s.tick + 1 })), 100)

// dev hook: reach the UI store from the console (mirrors window.__game)
if (typeof window !== 'undefined') window.__ui = useUI
