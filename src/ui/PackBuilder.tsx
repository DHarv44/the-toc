// PACK BUILDER — a top-level tool, not an in-game console. Opened from the
// main menu; no map, no sim, no game running behind it.
//
// A pack is a FOLDER of JSON (src/packs/<id>/ — see packs/README.md) plus its
// binaries. Today those folders are STATIC IMPORTS resolved at build time, so
// this screen can show you exactly what the engine resolved and let you work
// on it, but it cannot yet write back to disk from the browser. Every edit
// lives in memory and leaves as a downloaded file until a pack I/O story is
// agreed — the alternative is a builder that silently loses your work, which
// is worse than one that is honest about the boundary.
//
// Content browsing reuses PackViewer's tables (PackContent): one description
// of what a pack contains, whichever door you came in through.
import { useMemo, useState } from 'react'
import { Badge, Box, Button, Group, Table, Text, UnstyledButton } from '@mantine/core'
import { installedPacks, type Pack } from '../packs'
import { isPlayableBn, playableBns, type PackAsset } from '../packs/types'
import { StaffTable, Td, Th } from './staff'
import { buildDivisionOrg } from '../packs/org'
import type { OrgSlot } from '../engine/GameState'
import { PACK_TABS, PackContent, type PackTab } from './PackViewer'
import { PatchIcon } from './insignia'

const MONO = 'Consolas, monospace'
const OK_C = '#7ec87e'
const WARN_C = '#e8c547'

// The builder's own tab strip: the pack's content views plus ECHELON, which is
// a builder-only thing (see EchelonTree).
const BUILDER_TABS = ['ECHELON', ...PACK_TABS, 'ASSETS', 'MODELS'] as const
type BuilderTab = (typeof BUILDER_TABS)[number]

// ---------------------------------------------------------------------------
// MODELS — the pack's 3D art (models/ folder), and which platform wears what.
//
// The useful half of this board is the GAPS: a pack author needs to see which
// vehicles still have no model far more than they need to admire the ones that
// do, so unmapped platforms are listed, not hidden.
// ---------------------------------------------------------------------------
function ModelsTable({ p }: { p: Pack }) {
  const map = p.models?.vehicles ?? {}
  const vehicles = Object.values(p.catalogs.vehicles ?? {})
  const mapped = vehicles.filter(v => map[v.key])
  const missing = vehicles.filter(v => !map[v.key])

  // distinct source files, and how many platforms draw from each — a single
  // multi-vehicle GLB and one-file-per-vehicle both read correctly here
  const files = new Map<string, number>()
  for (const v of vehicles) {
    const m = map[v.key]
    if (m) files.set(m.file, (files.get(m.file) ?? 0) + 1)
  }
  const base = (f: string) => f.split('/').pop() ?? f

  if (!Object.keys(map).length) {
    return (
      <Text fz="sm" c="dark.3" p="md">
        NO MODELS DECLARED — this pack renders with the engine's procedural shapes.
      </Text>
    )
  }
  return (
    <>
      <Text fz={9} c="dark.3" mt="xs" mb={6} style={{ letterSpacing: 2 }}>
        SOURCES — {files.size} FILE(S) IN models/
      </Text>
      {[...files.entries()].map(([f, n]) => (
        <Text key={f} fz={11} c="dark.1" mb={2}>
          <Text span c="#7ec8ff">{base(f)}</Text>
          <Text span c="dark.3" fz={10}> · {f} · {n} platform(s)</Text>
        </Text>
      ))}

      <Text fz={9} c="dark.3" mt="lg" mb={4} style={{ letterSpacing: 2 }}>
        PLATFORM → MODEL · {mapped.length} OF {vehicles.length} MAPPED
      </Text>
      <StaffTable minWidth={760} head={
        <><Th>KEY</Th><Th>PLATFORM</Th><Th>FILE</Th><Th>NODE</Th><Th>STATUS</Th></>
      }>
        {mapped.map(v => {
          const m = map[v.key]!
          return (
            <Table.Tr key={v.key}>
              <Td c="#7ec8ff">{v.key}</Td>
              <Td>{v.name}</Td>
              <Td c="dark.2">{base(m.file)}</Td>
              <Td c={m.node ? '#e8c547' : 'dark.3'}>{m.node ?? 'WHOLE FILE'}</Td>
              <Td c={OK_C}>MAPPED</Td>
            </Table.Tr>
          )
        })}
        {missing.map(v => (
          <Table.Tr key={v.key}>
            <Td c="#7ec8ff">{v.key}</Td>
            <Td>{v.name}</Td>
            <Td c="dark.3">—</Td>
            <Td c="dark.3">—</Td>
            <Td c={WARN_C}>NO MODEL</Td>
          </Table.Tr>
        ))}
      </StaffTable>
    </>
  )
}

// ---------------------------------------------------------------------------
// ASSETS — the requestable division/corps/USAF pool (ASSET-REQUESTS.md).
//
// NOTE the name clash: `pack.assets` is CAPABILITY the TOC requests up the
// chain, which is what this tab shows. The pack's assets/ FOLDER on disk is
// ART (the vehicle GLB) and has no schema yet — a different thing wearing the
// same word, still to be resolved.
// ---------------------------------------------------------------------------
function AssetsTable({ p }: { p: Pack }) {
  const rows = Object.entries(p.assets ?? {})
  if (!rows.length) {
    return <Text fz="sm" c="dark.3" p="md">NO REQUESTABLE ASSETS — this pack calls nothing up the chain.</Text>
  }
  // what an approved request physically hands you, in the order the delivery
  // record declares it
  const deliversOf = (a: PackAsset): string => {
    const d = a.delivers ?? {}
    const out: string[] = []
    if (d.facility) out.push(`FACILITY ${d.facility}`)
    if (d.tether) out.push(`TETHER ${d.tether}`)
    if (d.orbit) out.push(`+1 ORBIT ${d.orbit}`)
    if (d.window) out.push(`ATO WINDOW ${d.window}`)
    if (d.unlock) out.push(`UNLOCK ${d.unlock}`)
    if (d.airdrop) out.push('AIRDROP')
    return out.join(' · ') || '—'
  }
  const mins = (s?: number) => (s ? `${Math.round(s / 60)} MIN` : '—')
  return (
    <StaffTable minWidth={900} head={
      <>
        <Th>KEY</Th><Th>ASSET</Th><Th>FROM</Th><Th>ECHELON</Th>
        <Th ta="right">POOL</Th><Th ta="right">SETUP</Th><Th ta="right">REFIT</Th>
        <Th ta="right">CREW</Th><Th>DELIVERS</Th>
      </>
    }>
      {rows.map(([k, a]) => (
        <Table.Tr key={k}>
          <Td c="#7ec8ff">{k}</Td>
          <Td>{a.name}</Td>
          <Td c="dark.2">{a.from}</Td>
          <Td c="dark.3">{a.echelon}</Td>
          {/* a sortie asset has no pool — it has an ATO cycle */}
          <Td ta="right" c={a.sortie ? '#e8c547' : 'dark.1'}>
            {a.sortie ? 'SORTIE' : (a.count ?? '—')}
          </Td>
          <Td ta="right">{mins(a.setupTime)}</Td>
          <Td ta="right">{mins(a.refitTime)}</Td>
          <Td ta="right">{a.crew ? a.crew.billets.length + (a.crew.civ ?? 0) : '—'}</Td>
          <Td c="dark.2">{deliversOf(a)}</Td>
        </Table.Tr>
      ))}
    </StaffTable>
  )
}

// ---------------------------------------------------------------------------
// ECHELON — the whole formation, five levels deep
//
// pack.json only DECLARES down to battalion (formation.bdes[].bns[]). Companies
// and platoons are GENERATED from that plus organic/attached by
// packs/org.ts::buildDivisionOrg, which is a pure Pack -> DivOrg function — so
// the builder can run it with no game in memory and show the author exactly
// what their manifest expands into. The FORMATION tab is what you wrote; this
// is what the engine makes of it.
//
// Row scale follows S1's page tree (10 + depth*24), not the rails' — this is a
// full-width page, and tree.tsx's DrillRow only goes three rungs deep.
// ---------------------------------------------------------------------------
const PAD = (d: number) => 10 + d * 24

// The tree's COLUMN GRID. Every row, at every depth, lays out the same way:
//
//   [indent][toggle] LABEL  sub …………… | badges | SUBS | VIC | BILLETS |
//
// Fixed widths on the right-hand cells are the whole point — a division, a
// battalion and a platoon are meant to be read down the column and compared
// without hunting. Indent alone carries depth.
const COL_BADGE = 200
const COL_NUM = 92

const Cell = ({ children, w = COL_NUM }: { children?: React.ReactNode; w?: number }) => (
  <Text span fz={10} c="dark.3" w={w} ta="right"
    style={{ flex: '0 0 auto', fontVariantNumeric: 'tabular-nums' }}>{children}</Text>
)

// a count reads as nothing when there is nothing to count — an empty cell holds
// the column without adding a "0 VIC" that means less than silence
const num = (n: number, unit: string) => (n ? `${n} ${unit}` : '')

function Row({ depth = 0, open, label, sub, badges, subs, vic, pax, head, onClick }: {
  depth?: number
  open?: boolean
  label: string
  sub?: string
  badges?: React.ReactNode
  subs?: string        // subordinate echelons ('6 BN', '4 CO', '3 ELM')
  vic?: string
  pax?: string
  head?: boolean       // the column header strip
  onClick?: () => void
}) {
  const lead: Record<number, { fz: number; c: string; fw: number }> = {
    0: { fz: 15, c: '#dceeff', fw: 700 },
    1: { fz: 14, c: '#9fd0f5', fw: 700 },
    2: { fz: 13, c: '#dceeff', fw: 600 },
    3: { fz: 12, c: '#9ab8d0', fw: 600 },
    4: { fz: 12, c: '#c8d8e8', fw: 400 },
  }
  const s = lead[depth] ?? lead[4]!
  return (
    <Box onClick={onClick} pl={head ? 10 : PAD(depth)} pr="md" py={head ? 3 : 5}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        borderTop: head ? 'none' : '1px solid #141e28',
        cursor: onClick ? 'pointer' : 'default',
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.background = '#101a24' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
      <Text span fz={11} c="dark.3" w={12} style={{ flex: '0 0 auto' }}>
        {onClick ? (open ? '▾' : '▸') : ''}
      </Text>
      {head
        ? <Text span fz={9} c="dark.3" style={{ flex: 1, minWidth: 0, letterSpacing: 1.5 }}>{label}</Text>
        : <>
            <Text span fz={s.fz} fw={s.fw} c={s.c} style={{ flex: '0 0 auto' }}>{label}</Text>
            <Text span fz={10} c="dark.3" truncate style={{ flex: 1, minWidth: 0 }}>{sub ?? ''}</Text>
          </>}
      <Group gap={6} w={COL_BADGE} justify="flex-end" wrap="nowrap"
        style={{ flex: '0 0 auto' }}>{badges}</Group>
      <Cell>{subs}</Cell>
      <Cell>{vic}</Cell>
      <Cell>{pax}</Cell>
    </Box>
  )
}

function EchelonTree({ p }: { p: Pack }) {
  // generated once per pack — buildDivisionOrg walks the whole formation and
  // names every soldier, so it is not something to redo on each render
  const org = useMemo(() => buildDivisionOrg(p), [p])
  const [open, setOpen] = useState<Set<string>>(() => new Set(['div']))
  const toggle = (k: string) => setOpen(prev => {
    const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n
  })

  if (!org) {
    return (
      <Text fz="sm" c="dark.3" p="md">
        NO FORMATION IN THIS PACK — nothing to expand. A pack without
        `formation` ships catalogs only.
      </Text>
    )
  }

  // group the flat slot list back into its echelons, preserving generation order
  const bdes: { desig: string; bns: { desig: string; cos: { co: string; slots: OrgSlot[] }[] }[] }[] = []
  for (const sl of org.slots) {
    let bde = bdes.find(b => b.desig === sl.bde)
    if (!bde) { bde = { desig: sl.bde, bns: [] }; bdes.push(bde) }
    let bn = bde.bns.find(b => b.desig === sl.bn)
    if (!bn) { bn = { desig: sl.bn, cos: [] }; bde.bns.push(bn) }
    let co = bn.cos.find(c => c.co === sl.co)
    if (!co) { co = { co: sl.co, slots: [] }; bn.cos.push(co) }
    co.slots.push(sl)
  }

  const f = p.formation
  const nick = (d: string) => p.nicks?.[d]
  // A slice the brigade task-organized to us carries its OWN battalion in
  // `from` — that mark belongs on the element, not the parent row, and nothing
  // is attached from itself. Only a real donor reads as an attachment. (Same
  // rule as S1Console's donorOf.)
  const donorOf = (sl: OrgSlot) => (sl.from && sl.from !== sl.bn ? sl.from : null)
  const billets = (slots: OrgSlot[]) => slots.reduce((n, s) => n + s.soldiers.length, 0)
  const vics = (slots: OrgSlot[]) => slots.reduce((n, s) => n + s.vehicles.length, 0)
  const allSlots = org.slots

  return (
    <Box>
      <Row head label="ELEMENT" subs="SUBORDINATE" vic="VEHICLES" pax="BILLETS" />

      <Row depth={0} open={open.has('div')} onClick={() => toggle('div')}
        label={p.name.toUpperCase()} sub={p.motto ?? undefined}
        subs={num(bdes.length, 'BDE')} vic={num(vics(allSlots), 'VIC')}
        pax={num(billets(allSlots), 'BILLETS')} />

      {open.has('div') && bdes.map(bde => {
        const bdeSlots = bde.bns.flatMap(b => b.cos.flatMap(c => c.slots))
        const bk = `b:${bde.desig}`
        return (
          <Box key={bde.desig}>
            <Row depth={1} open={open.has(bk)} onClick={() => toggle(bk)}
              label={bde.desig} sub={nick(bde.desig)}
              subs={num(bde.bns.length, 'BN')} vic={num(vics(bdeSlots), 'VIC')}
              pax={num(billets(bdeSlots), 'BILLETS')} />
            {open.has(bk) && bde.bns.map(bn => {
              const bnSlots = bn.cos.flatMap(c => c.slots)
              const nk = `n:${bde.desig}:${bn.desig}`
              // PLAYABLE is what the PACK allows; CAMPAIGN is which one this
              // pack's campaign happens to be about. Two different statements.
              const canPlay = isPlayableBn(f, bn.desig)
              const isCampaign = bn.desig === f?.playerBn
              const donor = bnSlots.map(donorOf).find(Boolean) ?? null
              return (
                <Box key={bn.desig}>
                  <Row depth={2} open={open.has(nk)} onClick={() => toggle(nk)}
                    label={bn.desig} sub={nick(bn.desig)}
                    badges={<>
                      {canPlay && <Badge size="xs" variant="light" color="lime">PLAYABLE</Badge>}
                      {isCampaign && <Badge size="xs" variant="light" color="yellow">CAMPAIGN</Badge>}
                      {donor && <Badge size="xs" variant="outline" color="grape">ATT {donor}</Badge>}
                    </>}
                    subs={num(bn.cos.length, 'CO')} vic={num(vics(bnSlots), 'VIC')}
                    pax={num(billets(bnSlots), 'BILLETS')} />
                  {open.has(nk) && bn.cos.map(co => {
                    const ck = `c:${bde.desig}:${bn.desig}:${co.co}`
                    return (
                      <Box key={co.co}>
                        <Row depth={3} open={open.has(ck)} onClick={() => toggle(ck)}
                          label={co.co}
                          subs={num(co.slots.length, 'ELM')} vic={num(vics(co.slots), 'VIC')}
                          pax={num(billets(co.slots), 'BILLETS')} />
                        {open.has(ck) && co.slots.map(sl => (
                          <Row key={sl.id} depth={4} label={sl.name} sub={sl.lin}
                            badges={<>
                              {sl.type
                                ? <Badge size="xs" variant="light" color="blue">{sl.type}</Badge>
                                : <Badge size="xs" variant="outline" color="gray">STAFF</Badge>}
                              {sl.tf && <Badge size="xs" variant="light" color="teal">TF</Badge>}
                              {donorOf(sl) && (
                                <Badge size="xs" variant="outline" color="grape">{donorOf(sl)}</Badge>
                              )}
                            </>}
                            vic={num(sl.vehicles.length, 'VIC')}
                            pax={num(sl.soldiers.length, 'BILLETS')} />
                        ))}
                      </Box>
                    )
                  })}
                </Box>
              )
            })}
          </Box>
        )
      })}
    </Box>
  )
}

// what the pack actually ships, counted — the honest size of a content package
function inventory(p: Pack): { label: string; n: number }[] {
  const c = p.catalogs
  const f = p.formation
  const bns = f ? f.bdes.reduce((n, b) => n + b.bns.length, 0) : 0
  return [
    { label: 'UNIT TYPES', n: Object.keys(c.units ?? {}).length },
    { label: 'VEHICLES', n: Object.keys(c.vehicles ?? {}).length },
    { label: 'WEAPONS', n: Object.keys(c.weapons ?? {}).length },
    { label: 'AMMO', n: Object.keys(c.ammo ?? {}).length },
    { label: 'EXPENDABLES', n: Object.keys(c.expendables ?? {}).length },
    { label: 'TROOPS', n: Object.keys(c.troops ?? {}).length },
    { label: 'AIR', n: Object.keys(c.drones ?? {}).length },
    { label: 'FACILITIES', n: Object.keys(c.facilities ?? {}).length },
    { label: 'BRIGADES', n: f?.bdes.length ?? 0 },
    { label: 'BATTALIONS', n: bns },
    { label: 'PLAYABLE', n: playableBns(f).length },
    { label: 'CAMPAIGNS', n: p.campaigns?.length ?? 0 },
    { label: 'DIV ASSETS', n: Object.keys(p.assets ?? {}).length },
  ]
}

// The inventory strip is ONE row — it is a glance, and a glance that wraps
// stops being one. Each stat flexes to an even share of the width rather than
// carrying a min width that forces a second line.
function Stat({ label, n }: { label: string; n: number }) {
  return (
    <Box style={{ flex: 1, minWidth: 0 }}>
      <Text fz={19} fw={700} lh={1.1} c={n ? '#dceeff' : 'dark.4'}
        style={{ fontVariantNumeric: 'tabular-nums' }}>{n}</Text>
      <Text fz={8.5} c="dark.3" truncate style={{ letterSpacing: 1 }}>{label}</Text>
    </Box>
  )
}

export default function PackBuilder({ onExit }: { onExit: () => void }) {
  const packs = installedPacks()
  const [idx, setIdx] = useState(0)
  const [tab, setTab] = useState<BuilderTab>('ECHELON')
  const p = packs[Math.min(idx, packs.length - 1)]

  return (
    <Box pos="fixed" inset={0} p="lg" bg="#05080b"
      style={{ zIndex: 100, overflow: 'auto', fontFamily: MONO, userSelect: 'none' }}>
      {/* title bar */}
      <Group gap="md" align="center" pb={12} style={{ borderBottom: '2px solid #2a3a48' }}>
        <Box style={{ flex: 1 }}>
          <Text fz={26} fw={700} c="#dceeff" lh={1.1} style={{ letterSpacing: 3 }}>PACK BUILDER</Text>
          <Text fz="xs" c="dark.3" style={{ letterSpacing: 1.5 }}>
            CONTENT PACKAGES · {packs.length} INSTALLED
          </Text>
        </Box>
        <Button size="sm" variant="default" onClick={onExit}>◀ MAIN MENU</Button>
      </Group>

      <Group align="flex-start" gap="lg" mt="md" wrap="nowrap">
        {/* installed packs */}
        <Box w={230} style={{ flex: '0 0 auto' }}>
          <Text fz={9} c="dark.3" mb={6} style={{ letterSpacing: 2 }}>INSTALLED</Text>
          {packs.map((pk, i) => (
            <UnstyledButton key={pk.id} w="100%" onClick={() => setIdx(i)} mb={6}>
              <Group gap={10} wrap="nowrap" p={10}
                style={{
                  border: `1px solid ${i === idx ? '#7ec8ff' : '#22303d'}`, borderRadius: 4,
                  background: i === idx ? '#14202c' : '#0d141c',
                }}>
                {pk.patch && <PatchIcon id={pk.patch} h={26} />}
                <Box miw={0}>
                  <Text fz={13} fw={700} c={i === idx ? '#dceeff' : 'dark.1'}>{pk.abbr}</Text>
                  <Text fz={9} c={pk.side === 'friend' ? '#7ec8ff' : '#ff8a7e'}
                    style={{ letterSpacing: 1 }}>
                    {pk.side === 'friend' ? 'BLUFOR' : 'OPFOR'} · {pk.id}
                  </Text>
                </Box>
              </Group>
            </UnstyledButton>
          ))}
          <Text fz={9} c="dark.4" mt={10} style={{ lineHeight: 1.6 }}>
            Packs load from src/packs/&lt;id&gt;/ as static imports. Adding or removing one is a
            code change today.
          </Text>
        </Box>

        {/* the selected pack */}
        {p && (
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Group gap="md" align="center">
              {p.patch && <PatchIcon id={p.patch} h={40} />}
              <Box>
                <Group gap={8} align="baseline">
                  <Text fz={20} fw={700} c="#dceeff">{p.name}</Text>
                  {p.nick && <Text fz={12} c="#e8c547">“{p.nick}”</Text>}
                </Group>
                <Text fz={10} c="dark.3">
                  {p.motto ? `${p.motto} · ` : ''}{p.id} · {p.side === 'friend' ? 'BLUFOR' : 'OPFOR'}
                </Text>
              </Box>
              <Badge size="sm" variant="outline" color="gray" ml="auto">READ ONLY</Badge>
            </Group>

            <Group gap="sm" mt="lg" wrap="nowrap" align="flex-start">
              {inventory(p).map(s => <Stat key={s.label} {...s} />)}
            </Group>

            <Group gap={4} mt="lg" style={{ borderBottom: '1px solid #22303d' }}>
              {BUILDER_TABS.map(t => (
                <UnstyledButton key={t} onClick={() => setTab(t)} px={10} py={5}
                  style={{ borderBottom: `2px solid ${t === tab ? '#7ec8ff' : 'transparent'}` }}>
                  <Text fz={11} fw={700} c={t === tab ? '#dceeff' : 'dark.3'}
                    style={{ letterSpacing: 1 }}>{t}</Text>
                </UnstyledButton>
              ))}
            </Group>

            <Box mt="md">
              {tab === 'ECHELON' ? <EchelonTree p={p} />
                : tab === 'ASSETS' ? <AssetsTable p={p} />
                  : tab === 'MODELS' ? <ModelsTable p={p} />
                    : <PackContent p={p} tab={tab as PackTab} />}
            </Box>
          </Box>
        )}
      </Group>
    </Box>
  )
}
