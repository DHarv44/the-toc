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
import { useState } from 'react'
import { Badge, Box, Button, Group, Text, UnstyledButton } from '@mantine/core'
import { installedPacks, type Pack } from '../packs'
import { PACK_TABS, PackContent, type PackTab } from './PackViewer'
import { PatchIcon } from './insignia'

const MONO = 'Consolas, monospace'

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
  const [tab, setTab] = useState<PackTab>('UNITS')
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
              {PACK_TABS.map(t => (
                <UnstyledButton key={t} onClick={() => setTab(t)} px={10} py={5}
                  style={{ borderBottom: `2px solid ${t === tab ? '#7ec8ff' : 'transparent'}` }}>
                  <Text fz={11} fw={700} c={t === tab ? '#dceeff' : 'dark.3'}
                    style={{ letterSpacing: 1 }}>{t}</Text>
                </UnstyledButton>
              ))}
            </Group>

            <Box mt="md">
              <PackContent p={p} tab={tab} />
            </Box>
          </Box>
        )}
      </Group>
    </Box>
  )
}
