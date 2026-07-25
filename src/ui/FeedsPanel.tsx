// FEEDS rail (P5): a right-side flyout panel where the drone feeds STACK —
// no more floating windows over the map. Width-resizable by dragging its
// inboard edge; each feed's min/max controls are PANEL-relative (min = a title
// row in the stack, max = fills the panel). Collapses to a strip like the
// other rails; opening a feed auto-opens the panel.
import { useRef } from 'react'
import { Box, Group, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { useUI } from './store'
import { RAIL_W } from './styles'
import { FeedWindow } from './HUD'

export default function FeedsPanel() {
  const ui = useUI()
  const dragging = useRef(false)

  if (!ui.feedsOpen) {
    return (
      <Tooltip label="Show feeds" position="left" withArrow>
        <UnstyledButton onClick={ui.toggleFeeds} w={RAIL_W.strip}
          style={{
            flex: '0 0 auto', background: 'var(--mantine-color-dark-7)',
            borderLeft: '1px solid var(--mantine-color-dark-4)',
          }}>
          <Stack gap="xs" align="center" pt="xs">
            <Text span fz={11} c="dark.2">◀</Text>
            <Text span fz={10} c="dark.3" style={{ writingMode: 'vertical-rl', letterSpacing: 2 }}>
              FEEDS{ui.feeds.length ? ` (${ui.feeds.length})` : ''}
            </Text>
          </Stack>
        </UnstyledButton>
      </Tooltip>
    )
  }

  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    dragging.current = true
    const startX = e.clientX, startW = ui.feedsW
    const move = (ev: PointerEvent) => {
      if (!dragging.current) return
      // the panel sits on the right: dragging LEFT grows it
      ui.setFeedsW(startW + (startX - ev.clientX))
    }
    const up = () => {
      dragging.current = false
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <Box w={ui.feedsW} style={{
      flex: '0 0 auto', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      background: 'var(--mantine-color-dark-7)', borderLeft: '1px solid var(--mantine-color-dark-4)',
      position: 'relative',
    }}>
      {/* resize handle on the inboard (map-side) edge */}
      <div onPointerDown={startResize}
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, cursor: 'ew-resize',
          zIndex: 50,
        }} />
      <Group px="xs" py={6} gap="xs" wrap="nowrap" justify="space-between"
        style={{
          flex: '0 0 auto', background: 'var(--mantine-color-dark-8)',
          borderBottom: '1px solid var(--mantine-color-dark-5)',
        }}>
        <Text span fz={10} c="toc.3" style={{ letterSpacing: 1.5 }}>
          FEEDS ({ui.feeds.length}/4)
        </Text>
        <Group gap={8} wrap="nowrap">
          <UnstyledButton onClick={() => ui.addFeed()} disabled={ui.feeds.length >= 4}>
            <Text span fz={11} c={ui.feeds.length >= 4 ? 'dark.4' : 'dark.2'}>+ FEED</Text>
          </UnstyledButton>
          <Tooltip label="Hide feeds" withArrow>
            <UnstyledButton onClick={ui.toggleFeeds}>
              <Text span fz={11} c="dark.2">▶</Text>
            </UnstyledButton>
          </Tooltip>
        </Group>
      </Group>

      {/* the stack — position:relative so a maximized feed fills THIS panel */}
      <Box style={{ flex: 1, minHeight: 0, overflowY: 'auto', position: 'relative', padding: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ui.feeds.length === 0 && (
          <Text fz={10} c="dark.3" ta="center" pt="lg">
            NO FEEDS OPEN — DEPLOY A UAS OR CLICK + FEED
          </Text>
        )}
        {ui.feeds.map((f, i) => <FeedWindow key={f.id} feed={f} index={i} docked />)}
      </Box>
    </Box>
  )
}
