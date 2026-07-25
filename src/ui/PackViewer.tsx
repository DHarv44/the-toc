// PACK VIEWER — dev-sandbox console for inspecting the installed packs: what
// each side's content package actually ships (platform catalogs, formation,
// name pools, heraldry). Read-only; rendered over the map column like the
// other consoles. Dev tooling: the button lives in the top bar's DEV cluster.
import { useState } from 'react'
import { Box, Group, Table, Text, UnstyledButton } from '@mantine/core'
import { useUI } from './store'
import { installedPacks, type Pack } from '../packs'
import { PaletteIcon } from './palette'
import { PatchIcon } from './insignia'

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
  <Table.Th><Text fz={10} c="dark.3" style={{ letterSpacing: 1 }}>{children}</Text></Table.Th>
)
const Td = ({ children, c = 'dark.1' }: { children?: React.ReactNode; c?: string }) => (
  <Table.Td><Text fz={11} c={c} style={{ fontVariantNumeric: 'tabular-nums' }}>{children}</Text></Table.Td>
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

function VehiclesTable({ p }: { p: Pack }) {
  return (
    <Table withRowBorders={false} verticalSpacing={2}>
      <Table.Thead><Table.Tr>
        <Th>KEY</Th><Th>NAME</Th><Th>CREW</Th><Th>PAX</Th><Th>MOB</Th><Th>WEAPONS</Th>
      </Table.Tr></Table.Thead>
      <Table.Tbody>
        {Object.values(p.catalogs.vehicles).map(v => (
          <Table.Tr key={v.key}>
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
  if (!drones.length) return <Text fz={11} c="dark.3" mt={6}>No air platforms in this pack.</Text>
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
  if (!f) return <Text fz={11} c="dark.3" mt={6}>No formation tree (placeholder pack).</Text>
  return (
    <Group gap="lg" align="flex-start" mt={6} wrap="wrap">
      {f.bdes.map(bde => (
        <Box key={bde.desig} miw={170}>
          <Text fz={12} fw={700} c="#dceeff">{bde.desig}{bde.nick ? ` — ${bde.nick}` : ''}</Text>
          {bde.bns.map(bn => {
            const player = bn.desig === f.playerBn
            return (
              <Text key={bn.desig} fz={11} c={player ? '#e8c547' : 'dark.1'} pl={10}>
                {bn.desig} <Text span fz={9} c="dark.3">({bn.kind}{player ? ' · PLAYER' : bn.tfCos ? ` · TF: ${bn.tfCos.join(', ')}` : ''})</Text>
                {p.nicks?.[bn.desig] && <Text span fz={9} c="dark.2"> “{p.nicks[bn.desig]}”</Text>}
              </Text>
            )
          })}
        </Box>
      ))}
    </Group>
  )
}

function Names({ p }: { p: Pack }) {
  if (!p.names) return <Text fz={11} c="dark.3" mt={6}>No name pools — generation uses the neutral default.</Text>
  return (
    <Box mt={6}>
      <Text fz={11} c="dark.1"><Text span c="dark.3" fz={10}>FIRST ({p.names.first.length}) </Text>{p.names.first.join(', ')}</Text>
      <Text fz={11} c="dark.1" mt={4}><Text span c="dark.3" fz={10}>LAST ({p.names.last.length}) </Text>{p.names.last.join(', ')}</Text>
      {p.people && Object.keys(p.people).length > 0 && (
        <Text fz={11} c="#e8c547" mt={4}>{Object.keys(p.people).length} explicit roster pin(s)</Text>
      )}
    </Box>
  )
}

const TABS = ['UNITS', 'VEHICLES', 'WEAPONS', 'AIR', 'FORMATION', 'NAMES'] as const

export default function PackViewer() {
  useUI((st) => st.tick)
  const ui = useUI()
  const [packIdx, setPackIdx] = useState(0)
  const [tab, setTab] = useState<(typeof TABS)[number]>('UNITS')
  if (ui.console !== 'packs') return null

  const packs = installedPacks()
  const p = packs[Math.min(packIdx, packs.length - 1)]
  if (!p) return null

  return (
    <Box pos="absolute" inset={0} p="lg"
      style={{ zIndex: 40, overflow: 'auto', background: 'rgba(8,11,15,0.985)', userSelect: 'none', ...MONO }}>
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
              <Text fz={13} fw={700} c={i === packIdx ? '#dceeff' : 'dark.2'}>
                {pk.abbr} <Text span fz={9} c={pk.side === 'friend' ? '#7ec8ff' : '#ff8a7e'}>{pk.side === 'friend' ? 'BLUFOR' : 'OPFOR'}</Text>
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
            <Text fz={11} fw={700} c={t === tab ? '#dceeff' : 'dark.3'} style={{ letterSpacing: 1 }}>{t}</Text>
          </UnstyledButton>
        ))}
      </Group>

      <Section title={`${p.name.toUpperCase()} — ${tab}`}>
        {tab === 'UNITS' && <UnitsTable p={p} />}
        {tab === 'VEHICLES' && <VehiclesTable p={p} />}
        {tab === 'WEAPONS' && <WeaponsTable p={p} />}
        {tab === 'AIR' && <DronesTable p={p} />}
        {tab === 'FORMATION' && <Formation p={p} />}
        {tab === 'NAMES' && <Names p={p} />}
      </Section>
    </Box>
  )
}
