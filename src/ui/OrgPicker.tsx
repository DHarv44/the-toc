// FORMATION PICKER — the division as a tree you choose from.
//
// The same grammar as every other drill in this game (ui/tree.tsx: depth is
// indent, the toggle sits in a fixed cell, nothing is filled, hairlines
// separate rows), over the same hierarchy the S1's DIVISION view walks
// (packs/orgquery.ts orgTree). A flat dropdown of designations threw away the
// only thing that makes a division legible — which brigade owns whom.
//
// Interaction: the TOGGLE opens a formation, the ROW selects it. A brigade is
// both a place you look inside and a formation that can own a FOB, so it has
// to be both — the two targets never overlap.
import { Box, Text } from '@mantine/core'
import { useState, type ReactNode } from 'react'
import type { Pack } from '../packs/types'
import { orgTree, type OrgTreeNode } from '../packs/orgquery'
import { TREE_PAD } from './tree'

// Styling by RUNG, coarse → fine (matches the rails' RUNG ramp). Indexed by
// depth rather than by an echelon's name: a regiment and a brigade sit at the
// same rung and should read the same weight whatever they are called, and a
// tree deeper than the ramp simply holds at the finest step.
const TONE = [
  { fz: 13, ls: 1.4, c: '#dceeff' },   // the top formation
  { fz: 13, ls: 0.9, c: '#9fd0f5' },
  { fz: 12, ls: 0.6, c: '#9ab8d0' },
  { fz: 12, ls: 0.4, c: '#8098ac' },
] as const
const toneAt = (rung: number): (typeof TONE)[number] =>
  TONE[Math.min(rung + 1, TONE.length - 1)] ?? TONE[TONE.length - 1]!

function Row({ node, depth, open, selected, onToggle, onPick, right }: {
  node: OrgTreeNode
  depth: number
  open: boolean
  selected: boolean
  onToggle: () => void
  onPick: () => void
  right?: ReactNode
}) {
  const t = toneAt(node.rung)
  const kids = node.children.length > 0
  return (
    <Box onClick={onPick} pr={6} py={3} pl={TREE_PAD(depth)}
      style={{
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
        borderTop: '1px solid #141e28',
        background: selected ? '#10202e' : 'transparent',
        borderLeft: selected ? '2px solid #4a90c2' : '2px solid transparent',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = '#101a24' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}>
      <Text span fz={10} c="dark.3" style={{ flex: '0 0 auto', width: 11, cursor: kids ? 'pointer' : 'default' }}
        onClick={e => { if (kids) { e.stopPropagation(); onToggle() } }}>
        {kids ? (open ? '▾' : '▸') : ''}
      </Text>
      <Text fz={t.fz} fw={600} c={node.donor ? '#c8a25f' : t.c} truncate
        style={{ flex: 1, minWidth: 0, letterSpacing: t.ls }}>
        {node.label}
      </Text>
      {node.donor && (
        <Text span fz={8.5} c="#c8a25f" style={{ flex: '0 0 auto' }}>ATT · {node.donor}</Text>
      )}
      {node.nick && !node.donor && (
        <Text span fz={8.5} c="dark.3" truncate style={{ flex: '0 0 auto', maxWidth: 70 }}>{node.nick}</Text>
      )}
      {right}
    </Box>
  )
}

export default function OrgPicker({ pack, value, onChange, right, openKeys }: {
  pack: Pack
  /** selected formation designation */
  value: string
  onChange: (desig: string) => void
  /** optional per-formation trailing content (counts, budgets) */
  right?: (node: OrgTreeNode) => ReactNode
  /** keys open on first render (the selection's ancestors are added anyway) */
  openKeys?: string[]
}) {
  const root = orgTree(pack)
  // the branch holding the current selection is always open — you can see
  // where you are without hunting for it
  const [open, setOpen] = useState<Set<string>>(() => {
    const s = new Set<string>(['div', ...(openKeys ?? [])])
    for (const bde of root.children) {
      if (bde.desig === value || bde.children.some(bn => bn.desig === value)) s.add(bde.key)
    }
    return s
  })
  const toggle = (k: string) => setOpen(s => {
    const n = new Set(s)
    if (n.has(k)) n.delete(k); else n.add(k)
    return n
  })

  const render = (node: OrgTreeNode, depth: number): ReactNode => (
    <Box key={node.key}>
      <Row node={node} depth={depth} open={open.has(node.key)}
        selected={node.desig === value}
        onToggle={() => toggle(node.key)}
        onPick={() => onChange(node.desig)}
        right={right?.(node)} />
      {open.has(node.key) && node.children.map(c => render(c, depth + 1))}
    </Box>
  )

  return <Box>{render(root, 0)}</Box>
}
