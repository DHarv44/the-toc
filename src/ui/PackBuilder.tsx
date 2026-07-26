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
import { useEffect, useMemo, useState } from 'react'
import { Badge, Box, Button, Checkbox, Group, Menu, Table, Text, UnstyledButton } from '@mantine/core'
import { installedPacks, type Pack } from '../packs'
import { isPlayableBn, playableBns, type PackAsset } from '../packs/types'
import { StaffTable, Td, Th } from './staff'
import { buildDivisionOrg } from '../packs/org'
import { readGlb, type GlbInfo } from '../packs/glb'
import ModelPreview from './ModelPreview'
import type { OrgSlot } from '../engine/GameState'
import { PACK_TABS, PackContent, type PackTab } from './PackViewer'
import { PatchIcon } from './insignia'

const MONO = 'Consolas, monospace'
const WARN_C = '#e8c547'
const BAD_C = '#e8524a'

// The builder's own tab strip: the pack's content views plus ECHELON, which is
// a builder-only thing (see EchelonTree).
// The pack's own content views. MODELS is NOT here — art is a section of the
// builder in its own right (left nav), not one more table about the pack.
const BUILDER_TABS = ['ECHELON', ...PACK_TABS, 'ASSETS'] as const
type BuilderTab = (typeof BUILDER_TABS)[number]

// ---------------------------------------------------------------------------
// MODELS — a browser for the art in a pack's models/ folder. What is IN the
// folder, full stop: nothing here cares whether a model is assigned to a
// platform, or whether the pack even has a manifest entry for it. Drop a GLB
// in and it shows up.
//
// Files are discovered with import.meta.glob, so this is the folder itself
// rather than a list someone remembered to update, and Vite emits each one as
// a real served asset (hashed in a build). readGlb then reads each file's
// glTF table of contents — no renderer involved.
// ---------------------------------------------------------------------------
const MODEL_FILES = import.meta.glob('../packs/*/models/**/*.glb', {
  query: '?url', import: 'default', eager: true,
}) as Record<string, string>

const kb = (n: number) => `${Math.round(n / 1024)} KB`

// The model a platform wears, and the control for changing it — the picture IS
// the picker. Click the box and choose from the pack's models, each shown as
// what it looks like rather than as a filename.
function ModelCell({ value, options, urlFor, onPick }: {
  value: string
  options: { value: string; label: string }[]
  urlFor: (rel: string) => string | undefined
  onPick: (value: string) => void
}) {
  const thumb = (v: string, h: number) => {
    const [file, node] = v.split('|')
    const url = file ? urlFor(file) : undefined
    return url ? <ModelPreview url={url} node={node || undefined} h={h} /> : null
  }
  const label = options.find(o => o.value === value)?.label
  return (
    <Menu shadow="md" width={280} position="bottom-start" withinPortal>
      <Menu.Target>
        <UnstyledButton w={64}>
          {thumb(value, 42) ?? (
            <Box h={42} style={{
              border: '1px dashed #22303d', borderRadius: 3,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Text fz={8} c="dark.4">SET</Text>
            </Box>
          )}
          <Text fz={8.5} c={label ? '#9ab8d0' : 'dark.4'} ta="center" truncate>
            {label ?? 'none'}
          </Text>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={() => onPick('')}>
          <Text fz={11} c="dark.3">— no model —</Text>
        </Menu.Item>
        {options.map(o => (
          <Menu.Item key={o.value} onClick={() => onPick(o.value)}
            leftSection={<Box w={44}>{thumb(o.value, 30)}</Box>}>
            <Text fz={11} c="#dceeff">{o.label}</Text>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  )
}

// Find and read this pack's model files. Shared: the MODELS page browses them,
// the VEHICLES tab assigns from them, and neither should discover them twice.
function usePackModels(p: Pack) {
  const files = useMemo(
    () => Object.entries(MODEL_FILES)
      .filter(([path]) => path.startsWith(`../packs/${p.id}/models/`))
      .map(([path, url]) => ({ path: path.replace('../packs/', ''), url }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    [p.id],
  )
  const [info, setInfo] = useState<Record<string, GlbInfo | { error: string }>>({})

  useEffect(() => {
    let live = true
    setInfo({})
    for (const f of files) {
      readGlb(f.url)
        .then(i => { if (live) setInfo(s => ({ ...s, [f.url]: i })) })
        .catch(e => { if (live) setInfo(s => ({ ...s, [f.url]: { error: String(e.message ?? e) } })) })
    }
    return () => { live = false }
  }, [files])

  // picker options. Value is `file|node` with the PACK-RELATIVE path — exactly
  // what goes in the manifest. The LABEL is just the model's name: you are
  // picking a Tiger, not a filename. The file only shows up when two models
  // share a name and the name alone would not tell them apart.
  const options = useMemo(() => {
    const raw: { value: string; label: string; file: string }[] = []
    for (const f of files) {
      const i = info[f.url]
      if (!i || 'error' in i) continue
      const rel = f.path.replace(new RegExp(`^${p.id}/`), '')
      const base = f.path.split('/').pop() ?? f.path
      for (const m of i.models) {
        if (m.part) continue // you assign an ASSET, not a road wheel
        raw.push({ value: `${rel}|${m.node ?? ''}`, label: m.name, file: base })
      }
    }
    const dupes = new Set(
      raw.map(o => o.label).filter((l, k, all) => all.indexOf(l) !== k),
    )
    return raw.map(o => ({
      value: o.value,
      label: dupes.has(o.label) ? `${o.label} · ${o.file}` : o.label,
    }))
  }, [p.id, files, info])

  // a manifest holds PACK-RELATIVE paths ('models/vehicles/x.glb'); the browser
  // needs the served URL Vite emitted for that file
  const urlFor = useMemo(() => {
    const m = new Map<string, string>()
    for (const f of files) m.set(f.path.replace(new RegExp(`^${p.id}/`), ''), f.url)
    return (rel: string) => m.get(rel)
  }, [p.id, files])

  return { files, info, options, urlFor }
}

function ModelsSection({ p }: { p: Pack }) {
  const { files, info } = usePackModels(p)
  const [showParts, setShowParts] = useState(false)

  if (!files.length) {
    return (
      <Text fz="sm" c="dark.3" p="md">
        NOTHING IN models/ — drop a .glb under src/packs/{p.id}/models/ and it appears here.
      </Text>
    )
  }

  // parts are off by default: the page is a catalogue of ASSETS, and a tank's
  // road wheels are not one. They are one checkbox away when you want them.
  const partCount = Object.values(info)
    .reduce((n, i) => n + (i && !('error' in i) ? i.models.filter(m => m.part).length : 0), 0)

  return (
    <>
      <Group gap="md" mt="xs" mb={8} align="center">
        <Text fz={9} c="dark.3" style={{ letterSpacing: 2 }}>
          {files.length} FILE(S) IN models/
        </Text>
        <Checkbox size="xs" checked={showParts} onChange={e => setShowParts(e.currentTarget.checked)}
          label={`SHOW PARTS${partCount ? ` (${partCount})` : ''}`}
          disabled={!partCount}
          styles={{ label: { fontSize: 9, letterSpacing: 1.5, color: '#54708a' } }} />
      </Group>
      {files.map(f => {
        const i = info[f.url]
        const err = i && 'error' in i ? i.error : null
        const g = i && !('error' in i) ? i : null
        return (
          <Box key={f.url} mb="lg">
            <Group gap={10} align="baseline" wrap="wrap">
              <Text fz={14} fw={700} c="#7ec8ff">{f.path.split('/').pop()}</Text>
              <Text fz={10} c="dark.3">{f.path}</Text>
            </Group>
            {!i && <Text fz={11} c="dark.3" mt={4}>reading…</Text>}
            {err && <Text fz={11} c={BAD_C} mt={4}>{err}</Text>}
            {g && (
              <>
                <Group gap="lg" mt={2} wrap="wrap">
                  <Text fz={10} c="dark.3">{kb(g.bytes)}</Text>
                  <Text fz={10} c="dark.3">{g.tris.toLocaleString()} TRIS</Text>
                  <Text fz={10} c="dark.3">{g.materials} MAT · {g.textures} TEX</Text>
                  {/* compression is the thing an author needs to see at a glance */}
                  <Text fz={10} c={g.extensions.length ? WARN_C : 'dark.4'}>
                    {g.extensions.length ? g.extensions.join(', ') : 'NO COMPRESSION'}
                  </Text>
                </Group>

                {/* One card per MODEL — the art, its size, and the string you
                    would paste into a manifest to point at it. A file's models
                    run along ONE row that scrolls sideways: a part-heavy file
                    would otherwise push every file below it off the page. */}
                <Box mt="sm" pb={6}
                  style={{ display: 'flex', gap: 14, overflowX: 'auto', overflowY: 'hidden' }}>
                  {g.models.filter(m => showParts || !m.part).map(m => (
                    <Box key={m.name} w={190} style={{ flex: '0 0 auto' }}>
                      <ModelPreview url={f.url} node={m.node} />
                      <Group gap={6} wrap="nowrap" align="baseline" mt={4}>
                        <Text fz={12} fw={700} c={m.part ? 'dark.1' : '#dceeff'} truncate>{m.name}</Text>
                        {m.part && <Text fz={8} c="dark.3" style={{ flex: '0 0 auto' }}>PART</Text>}
                      </Group>
                      <Text fz={9.5} c="dark.3">{m.tris.toLocaleString()} tris</Text>
                      <Text fz={9.5} c={WARN_C} truncate>
                        {m.node ? `node: "${m.node}"` : 'whole file'}
                      </Text>
                    </Box>
                  ))}
                </Box>
              </>
            )}
          </Box>
        )
      })}

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
  // left nav: the PACK (its content tabs) or its MODELS (the art browser)
  const [view, setView] = useState<'pack' | 'models'>('pack')
  const p = packs[Math.min(idx, packs.length - 1)]

  // MODEL ASSIGNMENT lives on the VEHICLES tab — you assign a model where you
  // are already looking at the platform, not in the art browser. Writing goes
  // through the dev-only pack-io middleware: the manifest is re-read from DISK
  // first, so a save only ever touches models.vehicles and passes the rest of
  // the file through untouched.
  const { options, urlFor } = usePackModels(p!)
  const assigned = useMemo(() => {
    const out: Record<string, string> = {}
    for (const [k, m] of Object.entries(p?.models?.vehicles ?? {})) out[k] = `${m.file}|${m.node ?? ''}`
    return out
  }, [p])
  const [edit, setEdit] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { setEdit({}); setMsg(null) }, [p?.id])

  const valueOf = (k: string) => edit[k] ?? assigned[k] ?? ''
  const dirty = Object.keys(edit).some(k => (edit[k] ?? '') !== (assigned[k] ?? ''))

  const save = async () => {
    if (!p) return
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(`/__pack?id=${p.id}`)
      if (!res.ok) throw new Error(`read failed: HTTP ${res.status}`)
      const manifest = await res.json() as Record<string, unknown>
      const merged = { ...assigned, ...edit }
      const out: Record<string, { file: string; node?: string }> = {}
      for (const [k, v] of Object.entries(merged)) {
        if (!v) continue // '' = deliberately unassigned
        const [file, node] = v.split('|')
        out[k] = node ? { file: file!, node } : { file: file! }
      }
      manifest.models = { ...(manifest.models as object ?? {}), vehicles: out }
      const put = await fetch(`/__pack?id=${p.id}`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(manifest),
      })
      const body = await put.json()
      if (!put.ok) throw new Error(body.error ?? `HTTP ${put.status}`)
      setMsg('SAVED to pack.json')
      setEdit({})
    } catch (e) {
      setMsg(`FAILED: ${String((e as Error).message ?? e)}`)
    } finally { setBusy(false) }
  }

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
            <UnstyledButton key={pk.id} w="100%" onClick={() => { setIdx(i); setView('pack') }} mb={6}>
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
          {/* sections of the SELECTED pack that are not one of its data tables */}
          <Text fz={9} c="dark.3" mt="lg" mb={6} style={{ letterSpacing: 2 }}>SECTIONS</Text>
          <UnstyledButton w="100%" onClick={() => setView('models')}>
            <Group gap={10} wrap="nowrap" p={10}
              style={{
                border: `1px solid ${view === 'models' ? '#7ec8ff' : '#22303d'}`, borderRadius: 4,
                background: view === 'models' ? '#14202c' : '#0d141c',
              }}>
              <Text fz={13} fw={700} c={view === 'models' ? '#dceeff' : 'dark.1'}>MODELS</Text>
              <Text fz={9} c="dark.3" style={{ letterSpacing: 1 }}>ART · ASSIGNMENT</Text>
            </Group>
          </UnstyledButton>

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
              {view === 'pack' && (
                <Badge size="sm" variant="outline" color="gray" ml="auto">READ ONLY</Badge>
              )}
            </Group>

            {view === 'models' ? (
              <Box mt="lg"><ModelsSection p={p} /></Box>
            ) : (
              <>
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

                {/* the VEHICLES tab is where a platform gets its model */}
                {tab === 'VEHICLES' && (
                  <Group gap="md" align="center" mt="sm">
                    <Text fz={9} c="dark.3" style={{ letterSpacing: 2 }}>
                      MODELS ASSIGNED — {Object.values(p.catalogs.vehicles ?? {})
                        .filter(v => valueOf(v.key)).length} OF {Object.keys(p.catalogs.vehicles ?? {}).length}
                    </Text>
                    <Button size="xs" variant={dirty ? 'filled' : 'default'}
                      disabled={!dirty || busy} onClick={save}>
                      {busy ? 'SAVING…' : 'SAVE TO pack.json'}
                    </Button>
                    {msg && <Text fz={10} c={msg.startsWith('FAILED') ? BAD_C : '#7ec87e'}>{msg}</Text>}
                  </Group>
                )}

                <Box mt="md">
                  {tab === 'ECHELON' ? <EchelonTree p={p} />
                    : tab === 'ASSETS' ? <AssetsTable p={p} />
                      : (
                        <PackContent p={p} tab={tab as PackTab}
                          vehicleLead={{
                            head: 'MODEL',
                            cell: (key) => (
                              <ModelCell value={valueOf(key)} options={options} urlFor={urlFor}
                                onPick={v => setEdit(s => ({ ...s, [key]: v }))} />
                            ),
                          }} />
                      )}
                </Box>
              </>
            )}
          </Box>
        )}
      </Group>
    </Box>
  )
}
