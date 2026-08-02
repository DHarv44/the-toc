// Top status/control bar. Sits above the three-column body (command rail / map / net rail).
// Ported verbatim from src/ui/TopBar.jsx.
import type { ReactNode } from 'react'
import { Box, Group, Text, Button, Divider, NativeSelect, Tooltip } from '@mantine/core'
import { S } from '../engine/state'
import { devIncomingStrike } from '../devtools/incoming'
import { initDevGame } from '../engine/scenario'
import { buildGameMap } from '../world/mapref'
import { playerPack } from '../packs'
import { packMaps } from '../packs/map-files'
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
          {/* the shop tabs are built from the PACK's staff section data —
              a different army's staff, different tabs. Only shops with a
              console today render (s1-s4; s6 stands up with EW). */}
          {(['s1', 's2', 's3', 's4'] as const).map((k) => {
            const info = playerPack().staff?.[k]
            return (
              <Tooltip key={k} label={`${info?.full ?? k.toUpperCase()} — ${info?.desc ?? ''}`} withArrow>
                <Button size="sm" variant={ui.console === k ? 'filled' : 'default'}
                  style={{ position: 'relative', overflow: 'visible' }}
                  onClick={() => {
                    // unread S1 traffic routes straight to what the alert is for
                    if (k === 's1' && unreadReports(S, 's1') > 0) ui.openS1('perstats')
                    else ui.setConsole(ui.console === k ? null : k)
                  }}>
                  {info?.label ?? k.toUpperCase()}
                  <UnreadDot n={unreadReports(S, k)} />
                </Button>
              </Tooltip>
            )
          })}
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
            <Button size="sm" variant={ui.console === 'packs' ? 'filled' : 'default'}
              onClick={() => ui.setConsole(ui.console === 'packs' ? null : 'packs')}>PACK</Button>
            <Button size="sm" variant="default" title="Dev: drop an IDF strike on the CP"
              onClick={() => devIncomingStrike()}>IDF</Button>
            {/* swap the ground under the sandbox: any map from any installed
                pack. Rebuilds the dev scenario on it and remounts the layout
                (App listens for toc-remap) so the baked sheet re-bakes. */}
            {packMaps().length > 0 && (
              <NativeSelect size="xs" w={170} title="Dev: switch the sandbox map"
                value={S.map?.ref ? `${S.map.ref.packId}/${S.map.ref.mapId}` : ''}
                data={packMaps().map(m => ({
                  value: `${m.packId}/${m.mapId}`, label: `${m.packId} · ${m.name}`,
                }))}
                onChange={(e) => {
                  const v = e.currentTarget.value
                  if (!v) return
                  const [packId, mapId] = v.split('/') as [string, string]
                  void buildGameMap({ kind: 'pack', packId, mapId }).then(map => {
                    initDevGame(map)
                    window.dispatchEvent(new Event('toc-remap'))
                  }).catch(err => console.error('map switch failed', err))
                }} />
            )}
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
