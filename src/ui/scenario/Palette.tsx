// The entity palette: pick a side, arm a structure kind or a unit type, click
// the sheet to place. Unit rows come from THAT SIDE'S pack catalog — sides
// are packs (SCENARIO-BUILDER.md), so a faction pack's palette is its own.
import { Box, Button, SegmentedControl, Text } from '@mantine/core'
import { STRUCTURES, type StructureTypeKey } from '../../domains/installations/catalog'
import type { UnitType } from '../../domains/forces/catalog'
import { PACKS } from '../../packs'
import type { ScenarioSide } from '../../scenario/types'

export type Armed =
  | { ent: 'structure'; kind: StructureTypeKey }
  | { ent: 'unit'; type: string }
  | null

const MONO = 'Consolas, monospace'

export default function Palette({ side, sidePacks, armed, onSide, onArm }: {
  side: ScenarioSide
  /** which installed pack plays each side (scenario meta) */
  sidePacks: { friend: string; hostile: string }
  armed: Armed
  onSide: (s: ScenarioSide) => void
  onArm: (a: Armed) => void
}) {
  const packId = sidePacks[side]
  const units = (PACKS[packId]?.catalogs.units ?? {}) as Record<string, UnitType>
  const structKinds = Object.keys(STRUCTURES) as StructureTypeKey[]

  const row = (key: string, label: string, sub: string, a: Armed) => {
    const active = JSON.stringify(armed) === JSON.stringify(a)
    return (
      <Button key={key} size="compact-sm" fullWidth justify="flex-start" mb={3}
        variant={active ? 'filled' : 'default'}
        onClick={() => onArm(active ? null : a)}
        styles={{ label: { fontFamily: MONO, fontSize: 11 } }}>
        {label}
        <Text span fz={9} c={active ? 'dark.1' : 'dark.3'} ml={6}>{sub}</Text>
      </Button>
    )
  }

  return (
    <Box w={210} p="xs" style={{ borderRight: '1px solid #22303d', overflowY: 'auto' }}>
      <SegmentedControl fullWidth size="xs" mb="xs" value={side}
        onChange={v => onSide(v as ScenarioSide)}
        data={[
          { value: 'friend', label: 'BLUFOR' },
          { value: 'hostile', label: 'OPFOR' },
        ]} />
      <Text fz={9} c="dark.3" mb={4} style={{ letterSpacing: 1.5 }}>
        INSTALLATIONS
      </Text>
      {structKinds.map(k =>
        row(`s:${k}`, k, STRUCTURES[k].name ?? '', { ent: 'structure', kind: k }))}
      <Text fz={9} c="dark.3" mt="sm" mb={4} style={{ letterSpacing: 1.5 }}>
        UNITS · {PACKS[packId]?.abbr ?? packId}
      </Text>
      {Object.values(units).map(u =>
        row(`u:${u.key}`, u.abbr, u.name, { ent: 'unit', type: u.key }))}
    </Box>
  )
}
