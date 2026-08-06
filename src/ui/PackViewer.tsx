// PACK VIEWER — dev-sandbox console for inspecting the installed packs: what
// each side's content package actually ships (platform catalogs, formation,
// name pools, heraldry). Read-only; rendered over the map column like the
// other consoles. Dev tooling: the button lives in the top bar's DEV cluster.
import { useState } from 'react'
import { Box, Group, Table, Text, UnstyledButton } from '@mantine/core'
import { useUI } from './store'
import { allPacks, type Pack } from '../packs'
import { walkFormation } from '../packs/types'
import { PaletteIcon } from './palette'
import { PatchIcon } from './insignia'
import ConsolePanel from './console/ConsolePanel'

const MONO: React.CSSProperties = { fontFamily: 'Consolas, monospace' }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box mt="md">
      <Text fz="xs" c="dark.3" pb={4} style={{ letterSpacing: 2, borderBottom: '1px solid #22303d' }}>
        {title}
      </Text>
      {children}
    </Box>
  )
}

const Th = ({ children }: { children?: React.ReactNode }) => (
  <Table.Th><Text fz={15} c="dark.3" style={{ letterSpacing: 1 }}>{children}</Text></Table.Th>
)
const Td = ({ children, c = 'dark.1' }: { children?: React.ReactNode; c?: string }) => (
  <Table.Td><Text fz={15} c={c} style={{ fontVariantNumeric: 'tabular-nums' }}>{children}</Text></Table.Td>
)

function UnitsTable({ p }: { p: Pack }) {
  return (
    <Table withRowBorders={false} verticalSpacing={2}>
      <Table.Thead><Table.Tr>
        <Th /><Th>KEY</Th><Th>NAME</Th><Th>CAT</Th><Th>SPD</Th><Th>SIGHT</Th>
        <Th>RNG</Th><Th>DPS S/H</Th><Th>COMP</Th>
      </Table.Tr></Table.Thead>
      <Table.Tbody>
        {Object.values(p.catalogs.units).map(t => {
          const comp = p.catalogs.comps[t.key]
          const vics = comp?.vehicles.map(v => `${v.n}× ${v.type}`).join(', ') || '—'
          const dis = comp?.dismounts.reduce((n, d) => n + d.n, 0) ?? 0
          return (
            <Table.Tr key={t.key}>
              <Table.Td w={46}><PaletteIcon unit={t} w={40} h={24} /></Table.Td>
              <Td c="#7ec8ff">{t.key}</Td>
              <Td>{t.name}</Td>
              <Td c="dark.3">{t.cat}</Td>
              <Td>{t.carrier ? `${t.speed}/${t.carrier.speed}` : t.speed}</Td>
              <Td>{t.sight}</Td>
              <Td>{t.indirect ? `${t.range} (${t.indirect.range} IDF)` : t.range}</Td>
              <Td>{t.dpsSoft}/{t.dpsHard}</Td>
              <Td c="dark.2">{vics}{dis ? ` + ${dis} dismounts` : ''}</Td>
            </Table.Tr>
          )
        })}
      </Table.Tbody>
    </Table>
  )
}

// `extra` appends a trailing column — the read-only console passes nothing;
// the PACK BUILDER passes a model picker, so assignment happens where you are
// already looking at vehicles rather than somewhere else.
export interface ExtraCol {
  head: React.ReactNode
  cell: (vehicleKey: string) => React.ReactNode
}

// `lead` puts a column BEFORE the key, the way the units table leads with its
// symbol. The read-only console passes none; the PACK BUILDER passes the model
// cell, which is both the picture and the control for changing it.
function VehiclesTable({ p, lead }: { p: Pack; lead?: ExtraCol }) {
  return (
    <Table withRowBorders={false} verticalSpacing={2}>
      <Table.Thead><Table.Tr>
        {lead && <Th>{lead.head}</Th>}
        <Th>KEY</Th><Th>NAME</Th><Th>CREW</Th><Th>PAX</Th><Th>MOB</Th><Th>WEAPONS</Th>
      </Table.Tr></Table.Thead>
      <Table.Tbody>
        {Object.values(p.catalogs.vehicles).map(v => (
          <Table.Tr key={v.key}>
            {lead && <Table.Td w={78}>{lead.cell(v.key)}</Table.Td>}
            <Td c="#7ec8ff">{v.key}</Td><Td>{v.name}</Td><Td>{v.crew}</Td><Td>{v.pax || '—'}</Td>
            <Td c="dark.3">{v.mob}</Td>
            <Td c="dark.2">{v.weapons.map(w => p.catalogs.weapons[w]?.name ?? w).join(', ') || 'unarmed'}</Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}

function WeaponsTable({ p }: { p: Pack }) {
  return (
    <Table withRowBorders={false} verticalSpacing={2}>
      <Table.Thead><Table.Tr>
        <Th>KEY</Th><Th>NAME</Th><Th>AMMO</Th><Th>RNG</Th><Th>DPS S/H</Th><Th>LOAD</Th>
      </Table.Tr></Table.Thead>
      <Table.Tbody>
        {Object.values(p.catalogs.weapons).map(w => (
          <Table.Tr key={w.key}>
            <Td c="#7ec8ff">{w.key}</Td><Td>{w.name}</Td>
            <Td c="dark.2">{p.catalogs.ammo[w.ammo]?.name ?? w.ammo}</Td>
            <Td>{w.range}</Td><Td>{w.dpsSoft}/{w.dpsHard}</Td>
            <Td>{w.load}{w.shotTime != null ? ` (${w.shotTime}s/rd)` : ''}</Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}

function DronesTable({ p }: { p: Pack }) {
  const drones = Object.values(p.catalogs.drones ?? {})
  if (!drones.length) return <Text fz={15} c="dark.3" mt={6}>No air platforms in this pack.</Text>
  return (
    <Table withRowBorders={false} verticalSpacing={2}>
      <Table.Thead><Table.Tr>
        <Th /><Th>KEY</Th><Th>NAME</Th><Th>SRC</Th><Th>ALT</Th><Th>SIGHT</Th><Th>ENDUR</Th><Th>ARMED</Th>
      </Table.Tr></Table.Thead>
      <Table.Tbody>
        {drones.map(d => (
          <Table.Tr key={d.key}>
            <Table.Td w={46}><PaletteIcon drone={d} w={40} h={24} /></Table.Td>
            <Td c="#7ec8ff">{d.key}</Td><Td>{d.name}</Td><Td c="dark.3">{d.src}</Td>
            <Td>{d.alt}</Td><Td>{d.sight}</Td>
            <Td>{isFinite(d.endurance) ? `${d.endurance}s` : '∞'}</Td>
            <Td c="dark.2">{d.gunship ? 'GUNSHIP' : d.kamikaze ? 'KAMIKAZE' : d.weapons ? `${d.weapons.ammo}× AGM` : '—'}</Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}

function Formation({ p }: { p: Pack }) {
  const f = p.formation
  if (!f) return <Text fz={15} c="dark.3" mt={6}>No formation tree (placeholder pack).</Text>
  return (
    <Group gap="lg" align="flex-start" mt={6} wrap="wrap">
      {/* the tree at whatever depth the pack declares — each top-level
          formation gets a column, everything under it indents by its rung */}
      {f.under.map(top => (
        <Box key={top.desig} miw={170}>
          <Text fz={16} fw={700} c="#dceeff">{top.desig}{top.nick ? ` — ${top.nick}` : ''}</Text>
          {walkFormation({ ...f, under: top.under ?? [] }).map(w => {
            const n = w.node
            const player = n.desig === f.chair
            return (
              <Text key={w.path.join('/')} fz={15} c={player ? '#e8c547' : 'dark.1'} pl={10 + w.rung * 10}>
                {n.desig} <Text span fz={14} c="dark.3">({n.kind ?? '—'}{player ? ' · PLAYER' : n.tfCos ? ` · TF: ${n.tfCos.join(', ')}` : ''})</Text>
                {p.nicks?.[n.desig] && <Text span fz={14} c="dark.2"> “{p.nicks[n.desig]}”</Text>}
              </Text>
            )
          })}
        </Box>
      ))}
    </Group>
  )
}

function Names({ p }: { p: Pack }) {
  if (!p.names) return <Text fz={15} c="dark.3" mt={6}>No name pools — generation uses the neutral default.</Text>
  return (
    <Box mt={6}>
      <Text fz={15} c="dark.1"><Text span c="dark.3" fz={15}>MALE ({p.names.male.length}) </Text>{p.names.male.slice(0, 60).join(', ')}{p.names.male.length > 60 ? ' …' : ''}</Text>
      <Text fz={15} c="dark.1" mt={4}><Text span c="dark.3" fz={15}>FEMALE ({p.names.female.length}) </Text>{p.names.female.slice(0, 60).join(', ')}{p.names.female.length > 60 ? ' …' : ''}</Text>
      <Text fz={15} c="dark.1" mt={4}><Text span c="dark.3" fz={15}>LAST ({p.names.last.length}) </Text>{p.names.last.slice(0, 80).join(', ')}{p.names.last.length > 80 ? ' …' : ''}</Text>
      {p.people && Object.keys(p.people).length > 0 && (
        <Text fz={15} c="#e8c547" mt={4}>{Object.keys(p.people).length} explicit roster pin(s)</Text>
      )}
    </Box>
  )
}

// The pack's content views. Shared with the PACK BUILDER (ui/PackBuilder) so
// the builder browses a pack through exactly the same tables the dev console
// does — one description of what a pack contains, two places to look at it.
export const PACK_TABS = ['UNITS', 'VEHICLES', 'WEAPONS', 'AIR', 'FORMATION', 'NAMES'] as const
export type PackTab = (typeof PACK_TABS)[number]

export function PackContent({ p, tab, vehicleLead }: {
  p: Pack; tab: PackTab; vehicleLead?: ExtraCol
}) {
  return (
    <>
      {tab === 'UNITS' && <UnitsTable p={p} />}
      {tab === 'VEHICLES' && <VehiclesTable p={p} lead={vehicleLead} />}
      {tab === 'WEAPONS' && <WeaponsTable p={p} />}
      {tab === 'AIR' && <DronesTable p={p} />}
      {tab === 'FORMATION' && <Formation p={p} />}
      {tab === 'NAMES' && <Names p={p} />}
    </>
  )
}

const TABS = PACK_TABS

export default function PackViewer() {
  useUI((st) => st.tick)
  const ui = useUI()
  const [packIdx, setPackIdx] = useState(0)
  const [tab, setTab] = useState<(typeof TABS)[number]>('UNITS')
  if (ui.console !== 'packs') return null

  const packs = allPacks()
  const p = packs[Math.min(packIdx, packs.length - 1)]
  if (!p) return null

  return (
    <ConsolePanel title="PACK VIEWER">
      <Group gap="md" align="center" pb={12} style={{ borderBottom: '2px solid #2a3a48' }}>
        {p.patch && <PatchIcon id={p.patch} h={44} />}
        <Box style={{ flex: 1 }}>
          <Text fz={26} fw={700} c="#dceeff" lh={1.1} style={{ letterSpacing: 3 }}>PACK VIEWER</Text>
          <Text fz="xs" c="dark.3" style={{ letterSpacing: 1.5 }}>
            INSTALLED CONTENT PACKAGES · DEV
          </Text>
        </Box>
        <Group gap={6}>
          {packs.map((pk, i) => (
            <UnstyledButton key={pk.id} onClick={() => setPackIdx(i)}
              px={12} py={6}
              style={{
                border: `1px solid ${i === packIdx ? '#7ec8ff' : '#22303d'}`, borderRadius: 4,
                background: i === packIdx ? '#14202c' : '#0d141c',
              }}>
              <Text fz={18} fw={700} c={i === packIdx ? '#dceeff' : 'dark.2'}>
                {pk.abbr} <Text span fz={14} c="dark.2">{pk.nick ?? pk.id}</Text>
              </Text>
            </UnstyledButton>
          ))}
        </Group>
      </Group>

      <Group gap={4} mt="md">
        {TABS.map(t => (
          <UnstyledButton key={t} onClick={() => setTab(t)} px={10} py={4}
            style={{
              borderBottom: `2px solid ${t === tab ? '#7ec8ff' : 'transparent'}`,
            }}>
            <Text fz={15} fw={700} c={t === tab ? '#dceeff' : 'dark.3'} style={{ letterSpacing: 1 }}>{t}</Text>
          </UnstyledButton>
        ))}
      </Group>

      <Section title={`${p.name.toUpperCase()} — ${tab}`}>
        <PackContent p={p} tab={tab} />
      </Section>
    </ConsolePanel>
  )
}
