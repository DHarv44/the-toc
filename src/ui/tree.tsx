// The rail TREE — shared chrome for every drill-down in the side rails (CALL
// UP's garrison, COMMAND's installations). One grammar everywhere: depth is
// INDENT, the toggle sits in a fixed cell so labels line up down the column,
// hairline rules separate rows, nothing is filled. Sized to be READ ACROSS THE
// ROOM — these are calls a commander makes under contact, not a spreadsheet.
import { Box, Text } from '@mantine/core'
import type { ReactNode } from 'react'
import type { SlotStr } from '../packs/org'

// S1's org tree is 10 + depth*24; this is the same shape scaled to a rail
export const TREE_PAD = (depth: number) => 8 + depth * 12

// rung styling by depth: a PLACE, then a CAPABILITY, then who OWNS it
const RUNG = [
  { fz: 14, ls: 1.4, c: '#9fd0f5' },  // 0 base / garrison
  { fz: 14, ls: 0.8, c: '#dceeff' },  // 1 capability / group
  { fz: 13, ls: 0.6, c: '#9ab8d0' },  // 2 company
] as const

// STR as the S1 briefs it — fit over assigned, colored by how much of the
// element is actually there. The same number at every level of the drill, so a
// company and a platoon can be compared without doing arithmetic.
export function Str({ s }: { s: SlotStr }) {
  const pct = Math.round(s.pct)
  const c = pct >= 95 ? '#7ec87e' : pct >= 85 ? '#e8c547' : '#e8524a'
  return (
    <Text span fz={11} fw={600} c={c} style={{ flex: '0 0 auto', letterSpacing: 0.5 }}>
      STR {pct}%
    </Text>
  )
}

// One rung of a drill. Everything starts SHUT. `n`/`str` are the garrison
// grammar (how many elements, how full); a tree with nothing to count passes
// `note` instead (what the rung is holding right now).
export function DrillRow({ label, n, str, note, open, depth = 0, onClick, tut }: {
  label: string
  n?: number
  str?: SlotStr
  note?: ReactNode
  open: boolean
  depth?: 0 | 1 | 2
  onClick: () => void
  tut?: string
}) {
  const r = RUNG[depth]!
  return (
    <Box data-tut={tut} onClick={onClick} pr="xs" py={4} pl={TREE_PAD(depth)}
      style={{
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
        borderTop: '1px solid #141e28',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#101a24' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
      <Text span fz={11} c="dark.3" style={{ flex: '0 0 auto', width: 12 }}>
        {open ? '▾' : '▸'}
      </Text>
      <Text fz={r.fz} fw={600} c={r.c} truncate
        style={{ flex: 1, minWidth: 0, letterSpacing: r.ls }}>{label}</Text>
      {n != null && (
        <Text span fz={10} c="dark.3" style={{ flex: '0 0 auto' }}>{n} ELM</Text>
      )}
      {note != null && (
        <Text span fz={10} c="dark.3" style={{ flex: '0 0 auto', letterSpacing: 0.5 }}>{note}</Text>
      )}
      {str && <Str s={str} />}
    </Box>
  )
}

// The LEAF of a tree — the thing itself, and the only rung that DOES anything.
// Symbol and name ride one line with status on the right; the qualifier sits on
// its own line beneath, right-aligned under the status it explains, so the rail
// never squeezes two facts onto one line. The row IS the button — no ⊕, nothing
// to aim at but the row.
export function TreeLeaf({ icon, label, note, tag, disabled, active, depth = 3, onClick, tut }: {
  icon?: ReactNode
  label: string
  note?: ReactNode
  tag?: string | null
  disabled?: boolean
  active?: boolean
  depth?: number
  onClick?: () => void
  tut?: string
}) {
  const off = disabled
  return (
    <Box data-tut={tut} onClick={off ? undefined : onClick}
      pl={TREE_PAD(depth)} pr="xs" py={4}
      style={{
        borderTop: '1px solid #141e28', opacity: off ? 0.45 : 1,
        background: active ? '#101a24' : 'transparent',
        borderLeft: active ? '2px solid #4a90c2' : '2px solid transparent',
        cursor: off ? 'not-allowed' : onClick ? 'pointer' : 'default',
      }}
      onMouseEnter={e => { if (!off && onClick) e.currentTarget.style.background = '#101a24' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
      <Box style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon}
        <Text fz={14} lh={1.2} c="dark.0" truncate style={{ flex: 1, minWidth: 0 }}>{label}</Text>
        {note != null && (
          <Text span fz={10} c={off ? 'orange.5' : 'dark.2'}
            style={{ flex: '0 0 auto', letterSpacing: 0.5 }}>{note}</Text>
        )}
      </Box>
      {tag && (
        <Text fz={10} c="dark.3" truncate ta="right" style={{ letterSpacing: 0.5 }}>{tag}</Text>
      )}
    </Box>
  )
}
