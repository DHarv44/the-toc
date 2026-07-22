// Top status/control bar. Sits above the three-column body (command rail / map / net rail).
import { Group, Text, Button, Divider, Tooltip } from '@mantine/core'
import { S } from '../game/sim.js'
import { setMuted as audioSetMuted } from '../game/audio.js'
import { useUI } from './store.js'
import { fmtClock, TOPBAR_H } from './styles.js'

const SPEEDS = [[0, '⏸'], [1, '1×'], [4, '4×']]

export default function TopBar() {
  const ui = useUI()
  return (
    <Group h={TOPBAR_H} px="xs" gap="md" wrap="nowrap" align="center"
      style={{
        flex: '0 0 auto', background: 'var(--mantine-color-dark-8)',
        borderBottom: '1px solid var(--mantine-color-dark-4)',
      }}>
      <Text span fw={700} c="toc.3" fz="sm" style={{ letterSpacing: 2 }}>TOC // C2</Text>

      <Text span fz="xs" c="dark.1">
        SUPPLY <Text span fw={700} c="yellow.4">{Math.floor(S.resources)}</Text>
      </Text>
      <Text span fz="xs" c="dark.1" ff="monospace">{fmtClock(S.t)}</Text>

      <Button.Group>
        {SPEEDS.map(([sp, label]) => (
          <Button key={sp} variant={S.speed === sp ? 'filled' : 'default'}
            onClick={() => { S.speed = sp }}>{label}</Button>
        ))}
      </Button.Group>

      <Group gap={6} wrap="nowrap" ml="auto">
        <Tooltip label="Command panel" withArrow>
          <Button variant={ui.leftOpen ? 'filled' : 'default'} onClick={ui.toggleLeft}>▤</Button>
        </Tooltip>
        <Button variant={ui.night ? 'filled' : 'default'} onClick={ui.toggleNight}>
          {ui.night ? '☾ NIGHT' : '☀ DAY'}
        </Button>
        <Tooltip label="Radio net" withArrow>
          <Button variant={ui.netOpen ? 'filled' : 'default'} onClick={ui.toggleNet}>NET</Button>
        </Tooltip>
        <Tooltip label={ui.muted ? 'Feed audio muted' : 'Feed audio on'} withArrow>
          <Button variant={ui.muted ? 'default' : 'filled'}
            onClick={() => { const m = !ui.muted; ui.setMuted(m); audioSetMuted(m) }}>
            {ui.muted ? '🔇' : '🔊'}
          </Button>
        </Tooltip>
        <Button variant="default" onClick={() => ui.addFeed()} disabled={ui.feeds.length >= 4}>
          + FEED ({ui.feeds.length}/4)
        </Button>

        <Divider orientation="vertical" color="dark.4" style={{ height: 18, alignSelf: 'center' }} />

        <Text span fz={10} c="dark.3">DEV</Text>
        <Button variant={S.fogEnabled ? 'default' : 'filled'}
          onClick={() => { S.fogEnabled = !S.fogEnabled }}>
          {S.fogEnabled ? 'FOG ON' : 'FOG OFF'}
        </Button>
        <Button variant="default" onClick={() => { S.resources += 10000 }}>+10K</Button>
      </Group>
    </Group>
  )
}
