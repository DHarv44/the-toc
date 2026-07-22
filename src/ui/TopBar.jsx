// Top status/control bar. Sits above the three-column body (command rail / map / net rail).
import { Group, Text, Button, Divider, Tooltip } from '@mantine/core'
import { S, incomePerMin, upkeepPerMin, UPKEEP_DIVISOR } from '../game/sim.js'
import { setMuted as audioSetMuted } from '../game/audio.js'
import { useUI } from './store.js'
import { fmtClock, TOPBAR_H } from './styles.js'

const SPEEDS = [[0, '⏸'], [1, '1×'], [4, '4×']]

// Supply, with the economy that drives it: gross resupply against the running upkeep of
// everything fielded. The net is what the player actually plans against, so it leads.
function SupplyReadout() {
  const gross = incomePerMin()
  const upkeep = upkeepPerMin()
  const net = Math.round(gross - upkeep)
  return (
    <Tooltip withArrow multiline w={230}
      label={`Resupply +${Math.round(gross)}/min · upkeep −${Math.round(upkeep)}/min from ${S.units.filter(u => u.side === 'friend' && u.strength > 0).length} units. Every unit costs roughly ${UPKEEP_DIVISOR} minutes of its own price to keep in the field.`}>
      <Group gap={6} wrap="nowrap" align="baseline">
        <Text span fz="xs" c="dark.1">
          SUPPLY <Text span fw={700} c="yellow.4">{Math.floor(S.resources)}</Text>
        </Text>
        <Text span fz={9.5} c={net > 0 ? 'teal.5' : net < 0 ? 'red.5' : 'dark.3'}
          style={{ fontVariantNumeric: 'tabular-nums' }}>
          {net >= 0 ? '+' : '−'}{Math.abs(net)}/MIN
        </Text>
        <Text span fz={9} c="dark.3" style={{ fontVariantNumeric: 'tabular-nums' }}>
          UPKEEP −{Math.round(upkeep)}
        </Text>
      </Group>
    </Tooltip>
  )
}

export default function TopBar() {
  const ui = useUI()
  return (
    <Group h={TOPBAR_H} px="xs" gap="md" wrap="nowrap" align="center"
      style={{
        flex: '0 0 auto', background: 'var(--mantine-color-dark-8)',
        borderBottom: '1px solid var(--mantine-color-dark-4)',
      }}>
      <Text span fw={700} c="toc.3" fz="sm" style={{ letterSpacing: 2 }}>TOC // C2</Text>

      <SupplyReadout />
      <Text span fz="xs" c="dark.1" ff="monospace">{fmtClock(S.t)}</Text>

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

        {/* dev cheats belong to the sandbox, not a real game */}
        {S.devMode && (
          <>
            <Divider orientation="vertical" color="dark.4" style={{ height: 18, alignSelf: 'center' }} />
            <Text span fz={10} c="dark.3">DEV</Text>
            <Button variant={S.fogEnabled ? 'default' : 'filled'}
              onClick={() => { S.fogEnabled = !S.fogEnabled }}>FOG</Button>
            <Button variant="default" onClick={() => { S.resources += 10000 }}>+10K</Button>
          </>
        )}

        {/* time controls sit last, hard right */}
        <Divider orientation="vertical" color="dark.4" style={{ height: 18, alignSelf: 'center' }} />
        <Button.Group>
          {SPEEDS.map(([sp, label]) => (
            <Button key={sp} variant={S.speed === sp ? 'filled' : 'default'}
              onClick={() => { S.speed = sp }}>{label}</Button>
          ))}
        </Button.Group>
      </Group>
    </Group>
  )
}
