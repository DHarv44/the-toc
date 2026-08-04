// RIGHT-CLICK ON THE SHEET.
//
// There was no context menu anywhere in this tool, because the right button
// was spent on panning the camera. Every editor it takes after puts per-object
// verbs here — it is where you look for "duplicate" without knowing where the
// duplicate button lives — so the camera moved to the middle button and to
// Space+drag, and the right button got its job back.
import { useEffect, useRef } from 'react'
import { Box, Text } from '@mantine/core'
import { INK, UI_FONT } from './panel'

export interface MenuItem {
  label: string
  /** the shortcut that does the same thing, so the menu teaches the keyboard */
  key?: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

export default function ContextMenu({ x, y, items, onClose }: {
  x: number
  y: number
  items: (MenuItem | 'sep')[]
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const away = (ev: MouseEvent) => {
      if (!ref.current?.contains(ev.target as Node)) onClose()
    }
    // a frame's delay, or the very click that opened the menu closes it
    const t = setTimeout(() => window.addEventListener('pointerdown', away), 0)
    return () => { clearTimeout(t); window.removeEventListener('pointerdown', away) }
  }, [onClose])

  // keep it on screen — a menu opened near the right edge must not run off it
  const w = 190
  const left = Math.min(x, window.innerWidth - w - 8)
  const top = Math.min(y, window.innerHeight - items.length * 26 - 16)

  return (
    <Box ref={ref} style={{
      position: 'fixed', left, top, width: w, zIndex: 400,
      background: INK.bg, border: `1px solid ${INK.line}`, borderRadius: 3,
      boxShadow: '0 8px 24px rgba(0,0,0,0.55)', padding: '4px 0',
    }}>
      {items.map((it, i) => it === 'sep' ? (
        <Box key={i} style={{ height: 1, background: INK.line, margin: '4px 0' }} />
      ) : (
        <Box key={i}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px',
            cursor: it.disabled ? 'default' : 'pointer',
            opacity: it.disabled ? 0.4 : 1,
          }}
          onMouseEnter={ev => {
            if (!it.disabled) ev.currentTarget.style.background = '#1b2530'
          }}
          onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent' }}
          onClick={() => { if (!it.disabled) { it.onClick(); onClose() } }}>
          <Text style={{
            fontFamily: UI_FONT, fontSize: 12.5, flex: 1,
            color: it.danger ? INK.bad : INK.value,
          }}>
            {it.label}
          </Text>
          {it.key && (
            <Text style={{ fontFamily: UI_FONT, fontSize: 11.5, color: INK.dim }}>
              {it.key}
            </Text>
          )}
        </Box>
      ))}
    </Box>
  )
}
