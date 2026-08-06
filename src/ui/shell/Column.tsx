// A COLUMN BESIDE THE MAP — the geometry every side panel in this console
// shares, written once.
//
// There were three of these. `Rail` was a fixed-width flex child with a border
// on its inboard edge. `ConsolePanel` was the same thing at a dragged width,
// with its own pointer-capture code. The team station was the same thing again
// at a different dragged width, with a third copy of the same pointer code and
// the sign flipped because it opens from the other edge.
//
// Three implementations of one idea is how "resizable" comes to mean three
// different things depending on which edge the player grabbed, and how a fix
// to one of them silently misses the other two. This is the part they actually
// shared: a fixed-width flex child, a border facing the map, and — if it is
// resizable — a drag handle on that same inboard edge.
//
// It deliberately owns NOTHING else. No header, no scrolling, no title: a rail
// is titled by its tab, a console by its own bar, a station by the team. A
// shell that guessed at those would be a fourth opinion rather than a shared
// one.
import type { CSSProperties, ReactNode } from 'react'

export default function Column({ side, width, setWidth, style, children, resizeTitle }: {
  /** which screen edge this column belongs to — decides which edge is inboard */
  side: 'left' | 'right'
  width: number
  /** omit for a fixed column: no handle is drawn and nothing can drag it */
  setWidth?: (w: number) => void
  style?: CSSProperties
  children: ReactNode
  resizeTitle?: string
}) {
  // THE INBOARD EDGE IS THE ONE YOU DRAG, because it is the edge whose position
  // the commander is actually trading against the map. A left column grows to
  // the right; a right column grows to the left, so the delta is signed by side.
  const start = (e: React.PointerEvent) => {
    if (e.button !== 0 || !setWidth) return
    e.preventDefault()
    const x0 = e.clientX, w0 = width
    const move = (ev: PointerEvent) =>
      setWidth(w0 + (side === 'left' ? ev.clientX - x0 : x0 - ev.clientX))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div style={{
      flex: '0 0 auto', width, position: 'relative', minHeight: 0,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      [side === 'left' ? 'borderRight' : 'borderLeft']: '1px solid var(--mantine-color-dark-4)',
      ...style,
    }}>
      {children}
      {setWidth && (
        <div onPointerDown={start} title={resizeTitle ?? 'Drag to resize'}
          style={{
            position: 'absolute', top: 0, bottom: 0, width: 5, zIndex: 5,
            [side === 'left' ? 'right' : 'left']: 0, cursor: 'ew-resize',
          }} />
      )}
    </div>
  )
}
