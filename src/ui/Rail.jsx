// Shared chrome for the two side rails: a full-height column with a title bar and a
// scrolling body, collapsing to a thin strip on its own edge. Hand-rolled rather than
// Mantine's AppShell so the map column stays a plain flex child we control.
import { Box, Group, Stack, Text, ScrollArea, UnstyledButton, Tooltip } from '@mantine/core'
import { RAIL_W } from './styles.js'

export default function Rail({ side, title, width, open, onToggle, footer, children }) {
  const collapseIcon = side === 'left' ? '◀' : '▶'
  const expandIcon = side === 'left' ? '▶' : '◀'

  if (!open) {
    return (
      <Tooltip label={`Show ${title.toLowerCase()}`} position={side === 'left' ? 'right' : 'left'} withArrow>
        <UnstyledButton onClick={onToggle} w={RAIL_W.strip}
          style={{
            flex: '0 0 auto', background: 'var(--mantine-color-dark-7)',
            [side === 'left' ? 'borderRight' : 'borderLeft']: '1px solid var(--mantine-color-dark-4)',
          }}>
          <Stack gap="xs" align="center" pt="xs">
            <Text span fz={11} c="dark.2">{expandIcon}</Text>
            <Text span fz={10} c="dark.3" style={{ writingMode: 'vertical-rl', letterSpacing: 2 }}>
              {title}
            </Text>
          </Stack>
        </UnstyledButton>
      </Tooltip>
    )
  }

  return (
    <Box w={width} style={{
      flex: '0 0 auto', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      background: 'var(--mantine-color-dark-7)',
      [side === 'left' ? 'borderRight' : 'borderLeft']: '1px solid var(--mantine-color-dark-4)',
    }}>
      <Group px="xs" py={6} gap="xs" wrap="nowrap" justify="space-between"
        style={{
          flex: '0 0 auto', background: 'var(--mantine-color-dark-8)',
          borderBottom: '1px solid var(--mantine-color-dark-5)',
        }}>
        <Text span fz={10} c="toc.3" style={{ letterSpacing: 1.5 }}>{title}</Text>
        <Tooltip label={`Hide ${title.toLowerCase()}`} withArrow>
          <UnstyledButton onClick={onToggle}>
            <Text span fz={11} c="dark.2">{collapseIcon}</Text>
          </UnstyledButton>
        </Tooltip>
      </Group>

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
}

// Section label used inside a rail: caption plus a fading rule.
export function RailSection({ label, children }) {
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
