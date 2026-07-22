// Persistent right rail: the JBC-P radio net. Full height, collapsible to the right
// edge. Replaces the free-floating, hand-resized net box that used to sit over the map.
import { Box, Group, Text, UnstyledButton } from '@mantine/core'
import { S } from '../game/sim.js'
import { useUI } from './store.js'
import { fmtClock, NET_COLORS, RAIL_W } from './styles.js'
import Rail from './Rail.jsx'

export default function NetPanel() {
  const ui = useUI()
  // newest first; entries carry a grid so clicking one slews the map to it
  const log = [...S.radio].reverse()

  return (
    <Rail side="right" title="JBC-P NET" width={RAIL_W.net} open={ui.netOpen} onToggle={ui.toggleNet}>
      <Text fz={8.5} c="dark.3" px="xs" py={3} style={{
        letterSpacing: 1.5, borderBottom: '1px solid var(--mantine-color-dark-6)',
      }}>CLICK A MESSAGE TO CENTER THE MAP</Text>

      {log.length === 0 && <Text fz={10} c="dark.3" px="xs" py="xs">NET QUIET</Text>}
      {log.map((e, i) => <NetRow key={S.radio.length - i} entry={e} />)}
    </Rail>
  )
}

// One transmission: fixed-width timestamp gutter, then the message, so the log reads
// as aligned columns rather than a ragged stack. Urgent traffic gets a colour bar.
function NetRow({ entry }) {
  const color = NET_COLORS[entry.kind] || 'var(--mantine-color-dark-0)'
  const urgent = entry.kind === 'contact' || entry.kind === 'loss' || entry.kind === 'damage'
  const locatable = entry.x != null
  return (
    <UnstyledButton
      component="div"
      onClick={() => {
        const v = window.__view
        if (v && locatable) { v.cx = entry.x; v.cy = entry.y }
      }}
      title={locatable ? 'Center the map on this transmission' : undefined}
      style={{
        display: 'block', width: '100%', cursor: locatable ? 'pointer' : 'default',
        borderBottom: '1px solid var(--mantine-color-dark-6)',
        borderLeft: `2px solid ${urgent ? color : 'transparent'}`,
        background: urgent ? 'rgba(255,120,90,0.05)' : undefined,
      }}>
      <Group gap={7} wrap="nowrap" align="baseline" px="xs" py={3}>
        <Text span fz={9} c="dark.4" style={{ flex: '0 0 auto', fontVariantNumeric: 'tabular-nums' }}>
          {fmtClock(entry.t).slice(3, 8)}
        </Text>
        <Text span fz={9.5} lh={1.45} fw={urgent ? 700 : 400}
          style={{ color, flex: 1, minWidth: 0 }}>{entry.msg}</Text>
      </Group>
    </UnstyledButton>
  )
}
