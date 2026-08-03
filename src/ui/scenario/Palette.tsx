// The entity palette: pick a side, arm a structure kind or a unit type, click
// the sheet to place. Unit rows come from THAT SIDE'S pack catalog — sides
// are packs (SCENARIO-BUILDER.md), so a faction pack's palette is its own.
import { useState } from 'react'
import { Box, Button, SegmentedControl, Text } from '@mantine/core'
import { STRUCTURES, type StructureTypeKey } from '../../domains/installations/catalog'
import type { UnitType } from '../../domains/forces/catalog'
import { PACKS } from '../../packs'
import { slotStrength } from '../../packs/org'
import { capabilityGroups, formationSlots } from '../../packs/orgquery'
import OrgPicker from '../OrgPicker'
import { DrillRow, TreeLeaf } from '../tree'
import type { ScenarioSide } from '../../scenario/types'

export type Armed =
  | { ent: 'structure'; kind: StructureTypeKey }
  | { ent: 'unit'; type: string }
  | { ent: 'place'; zone: boolean }
  | null

const MONO = 'Consolas, monospace'

export default function Palette({
  side, sidePacks, armed, formation, placedByType, playerFormation,
  onSide, onArm, onFormation,
}: {
  side: ScenarioSide
  /** which installed pack plays each side (scenario meta) */
  sidePacks: { friend: string; hostile: string }
  armed: Armed
  /** PLACING AS — the formation new entities are stamped with */
  formation: string
  /** how many of each type this formation already has on the sheet */
  placedByType: Record<string, number>
  /** the scenario's player chair — what "yours" means on this sheet */
  playerFormation: string
  onSide: (s: ScenarioSide) => void
  onArm: (a: Armed) => void
  onFormation: (f: string) => void
}) {
  const packId = sidePacks[side]
  const pack = PACKS[packId]
  const units = (PACKS[packId]?.catalogs.units ?? {}) as Record<string, UnitType>
  const structKinds = Object.keys(STRUCTURES) as StructureTypeKey[]
  // the pack's real division drives the picker; OPFOR has no shipped org yet
  // (P4), so its palette stays formation-free and lists bare types
  const orgOk = side === 'friend' && !!pack?.formation
  const mine = formation === playerFormation
  const caps = orgOk && pack ? capabilityGroups(pack, formation) : []
  const [openCat, setOpenCat] = useState<string | null>(null)

  const row = (key: string, label: string, sub: string, a: Armed, disabled = false) => {
    const active = JSON.stringify(armed) === JSON.stringify(a)
    return (
      <Button key={key} size="compact-sm" fullWidth justify="flex-start" mb={3}
        variant={active ? 'filled' : 'default'} disabled={disabled}
        title={disabled ? `${formation} fields no ${label}` : undefined}
        onClick={() => onArm(active ? null : a)}
        styles={{ label: { fontFamily: MONO, fontSize: 11 } }}>
        {label}
        <Text span fz={9} c={active ? 'dark.1' : 'dark.3'} ml={6}>{sub}</Text>
      </Button>
    )
  }

  return (
    <Box w={210} p="xs" style={{ borderRight: '1px solid #22303d', overflowY: 'auto' }}>
      <Text fz={9} c="dark.3" mb={4} style={{ letterSpacing: 1.5 }}>
        CONTROL MEASURES
      </Text>
      {row('p:point', 'PT', 'named point', { ent: 'place', zone: false })}
      {row('p:zone', 'ZONE', 'named area', { ent: 'place', zone: true })}
      <SegmentedControl fullWidth size="xs" mt="sm" mb="xs" value={side}
        onChange={v => onSide(v as ScenarioSide)}
        data={[
          { value: 'friend', label: 'BLUFOR' },
          { value: 'hostile', label: 'OPFOR' },
        ]} />
      {/* PLACING AS — whose troops these are, chosen from the REAL division
          tree (the same hierarchy the S1's DIVISION view walks). Command
          derives from it: your own battalion is yours to order, a sister
          formation fights beside you under its own commander. */}
      {pack && orgOk && (
        <>
          <Text fz={9} c="dark.3" mb={4} style={{ letterSpacing: 1.5 }}>
            PLACING AS {mine
              ? <Text span fz={8.5} c="#7ec8ff">· YOUR COMMAND</Text>
              : <Text span fz={8.5} c="#e0b34e">· ALLIED (AI)</Text>}
          </Text>
          <Box mb="sm" style={{ border: '1px solid #1c2833', borderRadius: 3 }}>
            <OrgPicker pack={pack} value={formation} onChange={onFormation}
              right={n => {
                const n2 = formationSlots(pack, n.desig).length
                return n2
                  ? <Text span fz={8.5} c="dark.3" style={{ flex: '0 0 auto' }}>{n2}</Text>
                  : null
              }} />
          </Box>
        </>
      )}
      <Text fz={9} c="dark.3" mb={4} style={{ letterSpacing: 1.5 }}>
        INSTALLATIONS
      </Text>
      {structKinds.map(k =>
        row(`s:${k}`, k, STRUCTURES[k].name ?? '', { ent: 'structure', kind: k }))}
      <Text fz={9} c="dark.3" mt="sm" mb={4} style={{ letterSpacing: 1.5 }}>
        {orgOk ? `GARRISON · ${formation}` : `UNITS · ${PACKS[packId]?.abbr ?? packId}`}
      </Text>
      {/* THE GARRISON, BY CAPABILITY — the same drill the CALL UP flyout runs
          ("what kills that tank?"), with the formation's real elements and
          strength. Placing from it is authoring against troops that exist. */}
      {orgOk && pack ? (
        <>
          {caps.length === 0 && (
            <Text fz={9} c="dark.3" mb={4}>{formation} FIELDS NO GROUND ELEMENTS</Text>
          )}
          {caps.map(g => {
            const isOpen = openCat === g.cat
            return (
              <Box key={g.cat}>
                <DrillRow depth={1} label={g.cat} n={g.slots.length}
                  str={slotStrength(g.slots)} open={isOpen}
                  onClick={() => setOpenCat(isOpen ? null : g.cat)} />
                {isOpen && g.types.map(t => {
                  const budget = g.slots.filter(sl => sl.type === t).length
                  const left = Math.max(0, budget - (placedByType[t] ?? 0))
                  const a: Armed = { ent: 'unit', type: t }
                  return (
                    <TreeLeaf key={t} depth={2}
                      label={units[t]?.name ?? t}
                      note={`${left}/${budget}`}
                      disabled={left === 0}
                      active={JSON.stringify(armed) === JSON.stringify(a)}
                      onClick={() => onArm(JSON.stringify(armed) === JSON.stringify(a) ? null : a)} />
                  )
                })}
              </Box>
            )
          })}
        </>
      ) : (
        Object.values(units).map(u =>
          row(`u:${u.key}`, u.abbr, u.name, { ent: 'unit', type: u.key }))
      )}
    </Box>
  )
}
