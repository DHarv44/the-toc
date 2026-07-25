// Top status/control bar. Sits above the three-column body (command rail / map / net rail).
// Ported verbatim from src/ui/TopBar.jsx.
import type { ReactNode } from 'react'
import { Box, Group, Text, Button, Divider, Tooltip } from '@mantine/core'
import { S } from '../engine/state'
import { setMuted as audioSetMuted } from '../audio/audio'
import { unreadReports } from '../engine/campaign'
import { UnreadDot } from './S1Console'
import { useUI } from './store'
import { fmtClock, TOPBAR_H } from './styles'

const SPEEDS: ReadonlyArray<readonly [number, string]> = [[0, '⏸'], [1, '1×'], [4, '4×']]

// Supply, with the economy that drives it: gross resupply against the running upkeep of
// everything fielded. The net is what the player actually plans against, so it leads.
// One readout style for the whole left cluster: a small muted caption over a value, so
// supply / net / upkeep / clock read as one instrument panel rather than loose spans.
function Stat({ label, value, color = 'dark.0', title }: {
  label: string
  value: ReactNode
  color?: string
  title?: string
}) {
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

export default function TopBar() {
  const ui = useUI()
  return (
    <Group h={TOPBAR_H} px="xs" gap={18} wrap="nowrap" align="center" pos="relative"
      style={{
        flex: '0 0 auto', background: 'var(--mantine-color-dark-8)',
        borderBottom: '1px solid var(--mantine-color-dark-4)',
      }}>
      {/* the plate: same style as the staff-console headers */}
      <Text span fw={700} c="#ffffff" fz={32} lh={1} pl="md" style={{ letterSpacing: 4 }}>
        TOC
      </Text>

      {S.waves && (
        <Stat label={`WAVE ${Math.min(S.waves.n, S.waves.target)}/${S.waves.target}`}
          value={S.waves.phase === 'intermission'
            ? `NEXT ${Math.max(0, Math.ceil(S.waves.interT))}S`
            : 'ASSAULT'}
          color={S.waves.phase === 'assault' ? 'orange.5' : 'teal.5'}
          title="Base Defense: survive every wave. Supply does not regenerate — repelled waves pay out." />
      )}

      <Group gap={6} wrap="nowrap" ml="auto">
        {/* map view: icon button, lit when a console is covering the map */}
        <Tooltip label="Map — common operational picture" withArrow>
          <Button size="sm" variant={ui.console === null ? 'filled' : 'default'} px={12}
            onClick={() => ui.setConsole(null)} aria-label="Map">
            <svg width="18" height="18" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M 1 3 L 5 1.5 L 9 3 L 13 1.5 V 11 L 9 12.5 L 5 11 L 1 12.5 Z" />
              <path d="M 5 1.5 V 11 M 9 3 V 12.5" />
            </svg>
          </Button>
        </Tooltip>
        <Divider orientation="vertical" color="dark.4" style={{ height: 18, alignSelf: 'center' }} />
        {/* staff shops: each opens its section's console over the map column.
            S2-S4 stand up as their data gets moving parts. */}
        <Button.Group>
          <Tooltip label="S1 — Personnel (PERSTAT, rosters, replacements)" withArrow>
            <Button size="sm" variant={ui.console === 's1' ? 'filled' : 'default'}
              style={{ position: 'relative', overflow: 'visible' }}
              onClick={() => {
                // unread traffic routes straight to what the alert is for
                if (unreadReports(S) > 0) ui.openS1('perstats')
                else ui.setConsole(ui.console === 's1' ? null : 's1')
              }}>
              S1
              <UnreadDot n={unreadReports(S)} />
            </Button>
          </Tooltip>
          <Tooltip label="S2 — Intelligence (soon)" withArrow><Button size="sm" variant="default" disabled>S2</Button></Tooltip>
          <Tooltip label="S3 — Operations (soon)" withArrow><Button size="sm" variant="default" disabled>S3</Button></Tooltip>
          <Tooltip label="S4 — Logistics (soon)" withArrow><Button size="sm" variant="default" disabled>S4</Button></Tooltip>
        </Button.Group>
        <Divider orientation="vertical" color="dark.4" style={{ height: 18, alignSelf: 'center' }} />
        <Tooltip label="Command dashboard" withArrow>
          <Button size="sm" variant={ui.console === 'dash' ? 'filled' : 'default'}
            onClick={() => ui.setConsole(ui.console === 'dash' ? null : 'dash')}>▤</Button>
        </Tooltip>
        <Divider orientation="vertical" color="dark.4" style={{ height: 18, alignSelf: 'center' }} />
        <Tooltip label="Radio net" withArrow>
          <Button size="sm" variant={ui.netOpen ? 'filled' : 'default'} onClick={ui.toggleNet}>NET</Button>
        </Tooltip>
        <Tooltip label={ui.muted ? 'Feed audio muted' : 'Feed audio on'} withArrow>
          <Button size="sm" variant={ui.muted ? 'default' : 'filled'}
            onClick={() => { const m = !ui.muted; ui.setMuted(m); audioSetMuted(m) }}>
            {ui.muted ? '🔇' : '🔊'}
          </Button>
        </Tooltip>

        {/* dev cheats belong to the sandbox, not a real game */}
        {S.devMode && (
          <>
            <Divider orientation="vertical" color="dark.4" style={{ height: 18, alignSelf: 'center' }} />
            <Text span fz={10} c="dark.3">DEV</Text>
            <Button size="sm" variant={S.fogEnabled ? 'default' : 'filled'}
              onClick={() => { S.fogEnabled = !S.fogEnabled }}>FOG</Button>
            <Button size="sm" variant="default" onClick={() => { S.resources += 10000 }}>+10K</Button>
            <Button size="sm" variant={ui.console === 'packs' ? 'filled' : 'default'}
              onClick={() => ui.setConsole(ui.console === 'packs' ? null : 'packs')}>PACK</Button>
          </>
        )}

        {/* time controls sit last, the mission clock hard right beside them */}
        <Divider orientation="vertical" color="dark.4" style={{ height: 18, alignSelf: 'center' }} />
        <Button.Group>
          {SPEEDS.map(([sp, label]) => (
            <Button size="sm" key={sp} variant={S.speed === sp ? 'filled' : 'default'}
              onClick={() => { S.speed = sp }}>{label}</Button>
          ))}
        </Button.Group>
        <Text span fz="lg" fw={700} c="dark.1" pr={4}
          style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: 1 }}>
          {fmtClock(S.t)}
        </Text>
      </Group>
    </Group>
  )
}
