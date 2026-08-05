// Shared chrome for the side rails, JBC-P style: a vertical tab strip that is
// ALWAYS visible and is the panel's only toggle. Collapsed = just the strip;
// expanded = strip + the panel beside it (strip on the screen-edge side, so the
// tabs hold their positions). No title bar inside the panel — the strip IS the
// title. Hand-rolled rather than Mantine's AppShell so the map column stays a
// plain flex child we control.
import type { ReactNode } from 'react'
import { Box, Group, Stack, Text, ScrollArea, UnstyledButton, Tooltip } from '@mantine/core'
import { RAIL_W } from './styles'
import { useUI } from './store'

// The tab itself — exported so FeedsPanel (custom width/resize) can share it.
export function RailStrip({ side, title, open, onToggle, tut }: {
  side: 'left' | 'right'
  title: string
  open: boolean
  onToggle: () => void
  tut?: string    // the strip is ALWAYS on screen, so it is the tutorial's
}) {             // only reliable handle on a rail that is tucked away
  const icon = side === 'left' ? (open ? '◀' : '▶') : (open ? '▶' : '◀')
  return (
    <Tooltip label={`${open ? 'Hide' : 'Show'} ${title.toLowerCase()}`}
      position={side === 'left' ? 'right' : 'left'} withArrow>
      <UnstyledButton data-tut={tut} onClick={onToggle} w={RAIL_W.strip}
        style={{
          flex: '0 0 auto', paddingBottom: 10, borderRadius: 2,
          // A TAB HAS TO LOOK LIKE ITS OWN TARGET. Two of these sit against
          // each other on the same edge, and drawn as flush panes of the same
          // colour they read as one strip with two words on it — which is
          // exactly how you end up opening COMMAND when you meant FORCES.
          background: open ? 'var(--mantine-color-dark-8)' : 'var(--mantine-color-dark-7)',
          border: `1px solid ${open ? 'var(--mantine-color-toc-7)' : 'var(--mantine-color-dark-5)'}`,
          borderLeftWidth: side === 'left' ? 0 : 1,
          borderRightWidth: side === 'left' ? 1 : 0,
        }}>
        <Stack gap="xs" align="center" pt="xs">
          <Text span fz={11} c={open ? 'toc.3' : 'dark.2'}>{icon}</Text>
          <Text span fz="lg" fw={700} c={open ? 'toc.3' : 'dark.3'}
            style={{ writingMode: 'vertical-rl', letterSpacing: 2 }}>
            {title}
          </Text>
        </Stack>
      </UnstyledButton>
    </Tooltip>
  )
}

/** THE TAB COLUMN — pinned to the screen edge, and it never moves.
 *
 *  The tabs used to ride each panel's INBOARD edge, on the theory that the
 *  handle you pulled should stay on the hand that pulled it. It does not: two
 *  rails share this edge, so opening COMMAND inserted its panel ahead of both
 *  tabs and slid FORCES two hundred and seventy pixels to the right. The tab
 *  you were aiming at moved because you opened the one next to it.
 *
 *  A drawer handle that relocates when you pull it is broken. So every tab for
 *  a side lives in one fixed column against the screen edge, and the panels
 *  open inboard of it. Nothing a player can do moves a tab now, which is the
 *  whole point of a tab.
 *
 *  It reads the store itself rather than taking props: the app shell would
 *  otherwise re-render at the UI pump's 10 Hz just to keep two chevrons right. */
export function RailTabs({ side }: { side: 'left' | 'right' }) {
  const ui = useUI()
  const tabs = side === 'left'
    ? [
        { title: 'COMMAND', open: ui.leftOpen, onToggle: ui.toggleLeft },
        { title: 'FORCES', open: ui.bgOpen, onToggle: ui.toggleBg },
      ]
    : [
        { title: `FEEDS${ui.feeds.length ? ` (${ui.feeds.length})` : ''}`, open: ui.feedsOpen, onToggle: ui.toggleFeeds },
        { title: 'JBC-P NET', open: ui.netOpen, onToggle: ui.toggleNet },
      ]
  return (
    <Box style={{
      flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 6,
      minHeight: 0, background: 'var(--mantine-color-dark-9)',
    }}>
      {tabs.map(t => (
        <RailStrip key={t.title} side={side} title={t.title}
          open={t.open} onToggle={t.onToggle} />
      ))}
    </Box>
  )
}

export default function Rail({ side, title, width, open, onToggle, footer, tut, children }: {
  side: 'left' | 'right'
  title: string
  width: number
  open: boolean
  onToggle: () => void
  footer?: ReactNode
  tut?: string
  children?: ReactNode
}) {
  // The tab lives in the edge column (RailTabs) — a rail that is shut renders
  // nothing at all now, because its handle is not its own to draw.
  void title; void onToggle; void tut
  if (!open) return null

  const panel = (
    <Box w={width} style={{
      flex: '0 0 auto', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      background: 'var(--mantine-color-dark-7)',
      [side === 'left' ? 'borderRight' : 'borderLeft']: '1px solid var(--mantine-color-dark-4)',
    }}>
      <ScrollArea style={{ flex: 1, minHeight: 0 }} scrollbarSize={6} type="hover">
        {children}
      </ScrollArea>

      {footer && (
        <Box px="xs" py={6} style={{
          flex: '0 0 auto', borderTop: '1px solid var(--mantine-color-dark-5)',
          background: 'var(--mantine-color-dark-8)',
        }}>{footer}</Box>
      )}
    </Box>
  )

  return panel
}

// Section label used inside a rail: caption plus a fading rule.
export function RailSection({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <Box>
      <Group gap={6} wrap="nowrap" align="center" mt={9} mb={3} mx="xs">
        <Text span fz={9.5} c="dark.3" tt="uppercase" style={{ letterSpacing: 1.8 }}>{label}</Text>
        <Box style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,var(--mantine-color-dark-4),transparent)' }} />
      </Group>
      {children}
    </Box>
  )
}
