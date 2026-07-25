// Shared chrome for the side rails, JBC-P style: a vertical tab strip that is
// ALWAYS visible and is the panel's only toggle. Collapsed = just the strip;
// expanded = strip + the panel beside it (strip on the screen-edge side, so the
// tabs hold their positions). No title bar inside the panel — the strip IS the
// title. Hand-rolled rather than Mantine's AppShell so the map column stays a
// plain flex child we control.
import type { ReactNode } from 'react'
import { Box, Group, Stack, Text, ScrollArea, UnstyledButton, Tooltip } from '@mantine/core'
import { RAIL_W } from './styles'

// The tab itself — exported so FeedsPanel (custom width/resize) can share it.
export function RailStrip({ side, title, open, onToggle }: {
  side: 'left' | 'right'
  title: string
  open: boolean
  onToggle: () => void
}) {
  const icon = side === 'left' ? (open ? '◀' : '▶') : (open ? '▶' : '◀')
  return (
    <Tooltip label={`${open ? 'Hide' : 'Show'} ${title.toLowerCase()}`}
      position={side === 'left' ? 'right' : 'left'} withArrow>
      <UnstyledButton onClick={onToggle} w={RAIL_W.strip}
        style={{
          flex: '0 0 auto',
          background: open ? 'var(--mantine-color-dark-8)' : 'var(--mantine-color-dark-7)',
          [side === 'left' ? 'borderRight' : 'borderLeft']: '1px solid var(--mantine-color-dark-4)',
        }}>
        <Stack gap="xs" align="center" pt="xs">
          <Text span fz={11} c="dark.2">{icon}</Text>
          <Text span fz="lg" fw={700} c={open ? 'toc.3' : 'dark.3'}
            style={{ writingMode: 'vertical-rl', letterSpacing: 2 }}>
            {title}
          </Text>
        </Stack>
      </UnstyledButton>
    </Tooltip>
  )
}

export default function Rail({ side, title, width, open, onToggle, footer, children }: {
  side: 'left' | 'right'
  title: string
  width: number
  open: boolean
  onToggle: () => void
  footer?: ReactNode
  children?: ReactNode
}) {
  const strip = <RailStrip side={side} title={title} open={open} onToggle={onToggle} />
  if (!open) return strip

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

  // the tab rides the panel's RIGHT edge — a drawer handle: left rails push it
  // out toward the map, right rails keep it on the screen edge
  return (
    <Box style={{ flex: '0 0 auto', display: 'flex', minHeight: 0 }}>
      {panel}{strip}
    </Box>
  )
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
