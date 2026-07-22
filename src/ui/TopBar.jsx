// Top status/control bar. Sits above the three-column body (command rail / map / net rail).
import { Box, Group, Text, Button, Divider, Tooltip } from '@mantine/core'
import { S, incomePerMin, upkeepPerMin, UPKEEP_DIVISOR } from '../game/sim.js'
import { setMuted as audioSetMuted } from '../game/audio.js'
import { useUI } from './store.js'
import { fmtClock, TOPBAR_H } from './styles.js'

const SPEEDS = [[0, '⏸'], [1, '1×'], [4, '4×']]

// Supply, with the economy that drives it: gross resupply against the running upkeep of
// everything fielded. The net is what the player actually plans against, so it leads.
// One readout style for the whole left cluster: a small muted caption over a value, so
// supply / net / upkeep / clock read as one instrument panel rather than loose spans.
function Stat({ label, value, color = 'dark.0', title }) {
  const body = (
    <Box style={{ lineHeight: 1.1 }}>
      <Text fz={8} c="dark.3" style={{ letterSpacing: 1.5 }}>{label}</Text>
      <Text fz={12} fw={700} c={color} style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: 0.5 }}>
        {value}
      </Text>
    </Box>
  )
  return title ? <Tooltip withArrow multiline w={230} label={title}>{body}</Tooltip> : body
}

function SupplyReadout() {
  const gross = incomePerMin()
  const upkeep = Math.round(upkeepPerMin())
  const net = Math.round(gross - upkeep)
  const fielded = S.units.filter(u => u.side === 'friend' && u.strength > 0).length
  return (
    <>
      <Stat label="SUPPLY" value={Math.floor(S.resources).toLocaleString()} color="yellow.4"
        title={`Resupply +${Math.round(gross)}/min against −${upkeep}/min upkeep from ${fielded} units. A unit costs about ${UPKEEP_DIVISOR} minutes of its own price to keep in the field.`} />
      <Stat label="NET/MIN" value={`${net >= 0 ? '+' : '−'}${Math.abs(net)}`}
        color={net > 0 ? 'teal.5' : net < 0 ? 'red.5' : 'dark.2'} />
      <Stat label="UPKEEP" value={`−${upkeep}`} color="dark.1" />
    </>
  )
}

export default function TopBar() {
  const ui = useUI()
  return (
    <Group h={TOPBAR_H} px="xs" gap={18} wrap="nowrap" align="center" pos="relative"
      style={{
        flex: '0 0 auto', background: 'var(--mantine-color-dark-8)',
        borderBottom: '1px solid var(--mantine-color-dark-4)',
      }}>
      {/* title is centred on the bar itself, independent of how wide either cluster gets */}
      <Text span fw={700} c="toc.3" fz="sm" pos="absolute" left="50%"
        style={{ transform: 'translateX(-50%)', letterSpacing: 3, pointerEvents: 'none' }}>
        TOC // C2
      </Text>

      <SupplyReadout />
      <Stat label="MISSION" value={fmtClock(S.t)} color="dark.1" />

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
