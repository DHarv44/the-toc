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
import { Badge, Box, Button, Group, Text, UnstyledButton } from '@mantine/core'
import { installedPacks, type Pack } from '../packs'
import { buildDivisionOrg } from '../packs/org'
import type { OrgSlot } from '../engine/GameState'
import { PACK_TABS, PackContent, type PackTab } from './PackViewer'
import { PatchIcon } from './insignia'

const MONO = 'Consolas, monospace'

// The builder's own tab strip: the pack's content views plus ECHELON, which is
// a builder-only thing (see EchelonTree).
const BUILDER_TABS = ['ECHELON', ...PACK_TABS] as const
type BuilderTab = (typeof BUILDER_TABS)[number]

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

function Row({ depth, open, label, sub, right, onClick }: {
  depth: number
  open?: boolean
  label: string
  sub?: string
  right?: React.ReactNode
  onClick?: () => void
}) {
  const lead: Record<number, { fz: number; c: string; fw: number }> = {
    0: { fz: 15, c: '#dceeff', fw: 700 },
    1: { fz: 14, c: '#9fd0f5', fw: 700 },
    2: { fz: 13, c: '#dceeff', fw: 600 },
    3: { fz: 12, c: '#9ab8d0', fw: 600 },
    4: { fz: 12, c: 'var(--mantine-color-dark-1)', fw: 400 },
  }
  const s = lead[depth] ?? lead[4]!
  return (
    <Box onClick={onClick} pl={PAD(depth)} pr="md" py={5}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        borderTop: '1px solid #141e28', cursor: onClick ? 'pointer' : 'default',
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.background = '#101a24' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
      <Text span fz={11} c="dark.3" w={12} style={{ flex: '0 0 auto' }}>
        {onClick ? (open ? '▾' : '▸') : ''}
      </Text>
      <Text span fz={s.fz} fw={s.fw} c={s.c} style={{ flex: '0 0 auto' }}>{label}</Text>
      {sub && <Text span fz={10} c="dark.3" truncate style={{ flex: 1, minWidth: 0 }}>{sub}</Text>}
      <Group gap={8} ml="auto" style={{ flex: '0 0 auto' }}>{right}</Group>
    </Box>
  )
}

const Count = ({ n, unit }: { n: number; unit: string }) => (
  <Text span fz={10} c="dark.3" style={{ fontVariantNumeric: 'tabular-nums' }}>{n} {unit}</Text>
)

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
      <Row depth={0} open={open.has('div')} onClick={() => toggle('div')}
        label={p.name.toUpperCase()} sub={p.motto ?? undefined}
        right={<>
          <Count n={bdes.length} unit="BDE" />
          <Count n={allSlots.length} unit="SLOTS" />
          <Count n={billets(allSlots)} unit="BILLETS" />
        </>} />

      {open.has('div') && bdes.map(bde => {
        const bdeSlots = bde.bns.flatMap(b => b.cos.flatMap(c => c.slots))
        const bk = `b:${bde.desig}`
        return (
          <Box key={bde.desig}>
            <Row depth={1} open={open.has(bk)} onClick={() => toggle(bk)}
              label={bde.desig} sub={nick(bde.desig)}
              right={<>
                <Count n={bde.bns.length} unit="BN" />
                <Count n={billets(bdeSlots)} unit="BILLETS" />
              </>} />
            {open.has(bk) && bde.bns.map(bn => {
              const bnSlots = bn.cos.flatMap(c => c.slots)
              const nk = `n:${bde.desig}:${bn.desig}`
              const isPlayer = bn.desig === f?.playerBn
              const donor = bnSlots.map(donorOf).find(Boolean) ?? null
              return (
                <Box key={bn.desig}>
                  <Row depth={2} open={open.has(nk)} onClick={() => toggle(nk)}
                    label={bn.desig} sub={nick(bn.desig)}
                    right={<>
                      {isPlayer && <Badge size="xs" variant="light" color="yellow">PLAYER</Badge>}
                      {donor && <Badge size="xs" variant="outline" color="grape">ATT {donor}</Badge>}
                      <Count n={bn.cos.length} unit="CO" />
                      <Count n={vics(bnSlots)} unit="VIC" />
                      <Count n={billets(bnSlots)} unit="BILLETS" />
                    </>} />
                  {open.has(nk) && bn.cos.map(co => {
                    const ck = `c:${bde.desig}:${bn.desig}:${co.co}`
                    return (
                      <Box key={co.co}>
                        <Row depth={3} open={open.has(ck)} onClick={() => toggle(ck)}
                          label={co.co}
                          right={<>
                            <Count n={co.slots.length} unit="ELM" />
                            <Count n={billets(co.slots)} unit="BILLETS" />
                          </>} />
                        {open.has(ck) && co.slots.map(sl => (
                          <Row key={sl.id} depth={4} label={sl.name} sub={sl.lin}
                            right={<>
                              {sl.type
                                ? <Badge size="xs" variant="light" color="blue">{sl.type}</Badge>
                                : <Badge size="xs" variant="outline" color="gray">STAFF</Badge>}
                              {sl.tf && <Badge size="xs" variant="light" color="teal">TF</Badge>}
                              {donorOf(sl) && (
                                <Badge size="xs" variant="outline" color="grape">{donorOf(sl)}</Badge>
                              )}
                              <Count n={sl.vehicles.length} unit="VIC" />
                              <Count n={sl.soldiers.length} unit="PAX" />
                            </>} />
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
    { label: 'CAMPAIGNS', n: p.campaigns?.length ?? 0 },
    { label: 'DIV ASSETS', n: Object.keys(p.assets ?? {}).length },
  ]
}

function Stat({ label, n }: { label: string; n: number }) {
  return (
    <Box miw={92}>
      <Text fz={22} fw={700} lh={1.1} c={n ? '#dceeff' : 'dark.4'}
        style={{ fontVariantNumeric: 'tabular-nums' }}>{n}</Text>
      <Text fz={9} c="dark.3" style={{ letterSpacing: 1.4 }}>{label}</Text>
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

            <Group gap="lg" mt="lg" wrap="wrap">
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
              {tab === 'ECHELON'
                ? <EchelonTree p={p} />
                : <PackContent p={p} tab={tab as PackTab} />}
            </Box>
          </Box>
        )}
      </Group>
    </Box>
  )
}
