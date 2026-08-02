// MAP CONTROL primitives — the corner button stack every map surface shares.
// The GAME's BFT and the SCENARIO BUILDER's sheet compose their own stacks
// from these (one look, one behavior, zero copies); which buttons appear is
// each surface's business — a control only exists where its semantics do.
import type { CSSProperties, ReactNode } from 'react'

export const mapCtl = (active: boolean): CSSProperties => ({
  width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 0, fontSize: 16, lineHeight: 1, cursor: 'pointer',
  background: active ? '#1d3a55' : 'rgba(16,26,36,0.9)',
  color: active ? '#dceeff' : '#9ab8d0',
  border: `1px solid ${active ? '#5a86b0' : '#35506a'}`, borderRadius: 3,
})

export function MapButton({ active = false, title, onClick, small = false, children }: {
  active?: boolean
  title: string
  onClick: () => void
  /** text buttons (SAT, LOCK…) render smaller with letterspacing */
  small?: boolean
  children: ReactNode
}) {
  return (
    <button title={title} onClick={onClick}
      style={{ ...mapCtl(active), ...(small ? { fontSize: 7.5, letterSpacing: 0.5 } : {}) }}>
      {children}
    </button>
  )
}

/** The stack itself: bottom-right of whatever map surface hosts it. */
export function MapControlStack({ children }: { children: ReactNode }) {
  return (
    <div style={{
      position: 'absolute', right: 10, bottom: 10, zIndex: 16,
      display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      {children}
    </div>
  )
}
