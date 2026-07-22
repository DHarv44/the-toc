// Shared HUD styling primitives. Lives apart from HUD.jsx so the side panels can
// use them without importing HUD (which imports the panels back).
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export const panel = {
  background: 'rgba(12,18,24,0.92)', border: '1px solid #2a3a48',
  color: '#c8d8e8', padding: 8, fontSize: 11, borderRadius: 3,
}

export const btn = (active) => ({
  background: active ? '#2a5a8a' : '#16222e', color: active ? '#fff' : '#9ab8d0',
  border: '1px solid #35506a', padding: '4px 8px', cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 11, borderRadius: 2,
})

// rail geometry, shared so map-column overlays can work out how much room they have
export const RAIL_W = { left: 232, net: 310, strip: 22 }
export const TOPBAR_H = 34

// width of the map column for a given rail state — overlays inside it (context
// menus, feed windows) clamp against this rather than the viewport
export const mapColumnSize = (leftOpen, netOpen) => ({
  w: window.innerWidth - (leftOpen ? RAIL_W.left : RAIL_W.strip) - (netOpen ? RAIL_W.net : RAIL_W.strip),
  h: window.innerHeight - TOPBAR_H,
})

export function fmtClock(t) {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}Z`
}

export const NET_COLORS = {
  move: '#8fb0c8', arrive: '#7ec87e', contact: '#ff9e6a', spot: '#ffd67e',
  damage: '#ff7a6a', request: '#ffe97a', fires: '#c0a8f0', loss: '#ff5a5a', struct: '#ff9e6a',
}
